/* Sondages et prédictions annoncés dans le chat par le bot.
 *
 * Reçoit les événements EventSub de la chaîne (server.js les branche depuis eventsub.js)
 * et fait écrire le bot au lancement, à la fermeture des mises et au résultat. Chaque
 * message est un modèle réglé sur la page d'accueil, avec des variables entre accolades :
 * {titre}, {choix}…
 *
 * Ce module n'importe rien du serveur : il reçoit la fonction d'envoi (chat.say) et
 * ses réglages (config/settings.json, section « polls »).
 */
'use strict';

const TEXT_MAX = 450;       // un modèle ; le message final est coupé à 500 par chat.js
const ENDED_MAX = 20;       // derniers sondages terminés, pour ne pas les annoncer deux fois
const TEST_COOLDOWN_MS = 3000;

const STYLES = ['message', 'annonce'];
const COULEURS = {
  primary: 'Couleur de la chaîne',
  purple: 'Violet',
  blue: 'Bleu',
  green: 'Vert',
  orange: 'Orange'
};

const VARIABLES = {
  titre: 'la question',
  choix: 'les choix, ex. « Pizza ou Burger »',
  duree: 'le temps laissé, ex. « 2 min »',
  gagnant: 'le choix gagnant',
  pourcentage: 'son score, ex. « 62 % »',
  total: 'le nombre de votes, ex. « 200 votes »',
  resultats: 'tous les choix avec leur score',
  issues: 'les issues, ex. « Oui ou Non »',
  repartition: 'les points misés sur chaque issue',
  points: 'le total misé, ex. « 17 700 points »',
  participants: 'le nombre de parieurs, ex. « 30 parieurs »',
  gagnants: 'le nombre de gagnants, ex. « 18 gagnants »',
  meilleur: 'le plus gros gain, ex. « Viewer42 (+3 200 points) »'
};

// L'ordre est celui de la page d'accueil.
const MESSAGES = [
  {
    id: 'sondage_debut', groupe: 'Sondages', nom: 'Lancement',
    variables: ['titre', 'choix', 'duree'],
    defaut: '📊 Sondage : {titre} ({choix}) — vous avez {duree} pour voter !'
  },
  {
    id: 'sondage_fin', groupe: 'Sondages', nom: 'Résultat',
    variables: ['titre', 'gagnant', 'pourcentage', 'total', 'resultats'],
    defaut: '📊 « {titre} » : {gagnant} l\'emporte ! {resultats}'
  },
  {
    id: 'sondage_annule', groupe: 'Sondages', nom: 'Annulation',
    variables: ['titre'],
    defaut: '📊 Le sondage « {titre} » a été annulé.'
  },
  {
    id: 'prediction_debut', groupe: 'Prédictions', nom: 'Lancement',
    variables: ['titre', 'issues', 'duree'],
    defaut: '🔮 Prédiction : {titre} ({issues}) — misez vos points, vous avez {duree} !'
  },
  {
    id: 'prediction_verrou', groupe: 'Prédictions', nom: 'Mises fermées',
    variables: ['titre', 'repartition', 'points', 'participants'],
    defaut: '🔒 Les jeux sont faits ! {repartition}'
  },
  {
    id: 'prediction_fin', groupe: 'Prédictions', nom: 'Résultat',
    variables: ['titre', 'gagnant', 'gagnants', 'participants', 'points', 'meilleur'],
    defaut: '🔮 « {titre} » : c\'est « {gagnant} » ! {gagnants} sur {participants}, {points} en jeu.'
  },
  {
    id: 'prediction_annulee', groupe: 'Prédictions', nom: 'Annulation',
    variables: ['titre'],
    defaut: '🔮 La prédiction « {titre} » est annulée, les points sont remboursés.'
  }
];

const state = {
  send: null,
  settings: null,
  ended: [],
  lastTest: 0
};

/* ===================== réglages ===================== */

function cleanText(value) {
  const chars = Array.from(String(value || '').replace(/\s+/g, ' ').trim());
  return chars.slice(0, TEXT_MAX).join('');
}

// Tout ce qui vient du fichier ou de la page passe par ici : valeurs inconnues écartées,
// texte borné, modèle vide = texte par défaut.
function normalize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const messages = src.messages && typeof src.messages === 'object' ? src.messages : {};
  const out = {
    actif: src.actif !== false,
    style: STYLES.includes(src.style) ? src.style : 'message',
    couleur: Object.prototype.hasOwnProperty.call(COULEURS, src.couleur) ? src.couleur : 'primary',
    messages: {}
  };
  MESSAGES.forEach((m) => {
    const r = messages[m.id] && typeof messages[m.id] === 'object' ? messages[m.id] : {};
    out.messages[m.id] = { actif: r.actif !== false, texte: cleanText(r.texte) || m.defaut };
  });
  return out;
}

function setSettings(settings) {
  state.settings = normalize(settings);
}

function getSettings() {
  return state.settings || normalize({});
}

// ce qu'il faut à la page d'accueil pour construire le formulaire
function describe() {
  return {
    messages: MESSAGES.map((m) => ({
      id: m.id,
      groupe: m.groupe,
      nom: m.nom,
      defaut: m.defaut,
      variables: m.variables.map((v) => ({ nom: v, description: VARIABLES[v] }))
    })),
    couleurs: Object.keys(COULEURS).map((id) => ({ id: id, nom: COULEURS[id] })),
    texteMax: TEXT_MAX
  };
}

/* ===================== mise en forme ===================== */

const nombre = (n) => Number(n || 0).toLocaleString('fr-FR');

// 0 et 1 au singulier, comme en français
function compte(n, mot) {
  return nombre(n) + ' ' + mot + (Math.abs(n) >= 2 ? 's' : '');
}

function pourcent(part, total) {
  return (total ? Math.round(part * 100 / total) : 0) + ' %';
}

function duree(debut, fin) {
  const s = Math.max(0, Math.round((Date.parse(fin) - Date.parse(debut)) / 1000)) || 0;
  const min = Math.floor(s / 60);
  const sec = s % 60;
  if (!min) return sec + ' s';
  return sec ? min + ' min ' + sec + ' s' : min + ' min';
}

// « A », « A ou B », « A, B ou C »
function enumerer(items, mot) {
  if (items.length < 2) return items[0] || '';
  return items.slice(0, -1).join(', ') + ' ' + mot + ' ' + items[items.length - 1];
}

function pollResult(e) {
  const choix = (e.choices || [])
    .map((c) => ({ titre: c.title, votes: Number(c.votes) || 0 }))
    .sort((a, b) => b.votes - a.votes);
  const total = choix.reduce((sum, c) => sum + c.votes, 0);
  const top = choix.length ? choix[0].votes : 0;
  // ex æquo : « Pizza et Burger »
  const gagnants = total ? choix.filter((c) => c.votes === top).map((c) => c.titre) : [];
  return {
    titre: e.title,
    gagnant: gagnants.length ? enumerer(gagnants, 'et') : 'personne',
    pourcentage: pourcent(top, total),
    total: compte(total, 'vote'),
    resultats: choix.map((c) => c.titre + ' ' + pourcent(c.votes, total) + ' (' + nombre(c.votes) + ')')
      .join(' · ')
  };
}

function predictionSpread(e) {
  const issues = (e.outcomes || []).map((o) => ({
    titre: o.title,
    points: Number(o.channel_points) || 0,
    users: Number(o.users) || 0
  }));
  const points = issues.reduce((sum, o) => sum + o.points, 0);
  const users = issues.reduce((sum, o) => sum + o.users, 0);
  return {
    titre: e.title,
    repartition: issues.map((o) => o.titre + ' ' + pourcent(o.points, points) + ' (' + compte(o.points, 'point') + ')')
      .join(' · '),
    points: compte(points, 'point'),
    participants: compte(users, 'parieur')
  };
}

function predictionResult(e) {
  const spread = predictionSpread(e);
  const win = (e.outcomes || []).find((o) => o.id === e.winning_outcome_id) || {};
  const best = (win.top_predictors || [])
    .map((p) => ({ nom: p.user_name || p.user_login, gain: Number(p.channel_points_won) || 0 }))
    .sort((a, b) => b.gain - a.gain)[0];
  return {
    titre: e.title,
    gagnant: win.title || '?',
    gagnants: compte(Number(win.users) || 0, 'gagnant'),
    participants: spread.participants,
    points: spread.points,
    meilleur: best && best.gain ? best.nom + ' (+' + compte(best.gain, 'point') + ')' : ''
  };
}

const VARS = {
  sondage_debut: (e) => ({
    titre: e.title,
    choix: enumerer((e.choices || []).map((c) => c.title), 'ou'),
    duree: duree(e.started_at, e.ends_at)
  }),
  sondage_fin: pollResult,
  sondage_annule: (e) => ({ titre: e.title }),
  prediction_debut: (e) => ({
    titre: e.title,
    issues: enumerer((e.outcomes || []).map((o) => o.title), 'ou'),
    duree: duree(e.started_at, e.locks_at)
  }),
  prediction_verrou: predictionSpread,
  prediction_fin: predictionResult,
  prediction_annulee: (e) => ({ titre: e.title })
};

// variable inconnue laissée telle quelle : le streamer voit sa faute de frappe au test
function render(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match);
}

/* ===================== envoi ===================== */

async function announce(id, event) {
  const settings = getSettings();
  if (!settings.actif || !settings.messages[id].actif) return;
  const text = render(settings.messages[id].texte, VARS[id](event));
  try {
    await state.send(text, { annonce: settings.style === 'annonce', couleur: settings.couleur });
    console.log('Chat : message « ' + id + ' » envoyé.');
  } catch (err) {
    console.warn('Chat : message « ' + id + ' » non envoyé : ' + err.message);
  }
}

function rememberEnded(id) {
  state.ended.push(id);
  if (state.ended.length > ENDED_MAX) state.ended.shift();
}

// type EventSub → handler (tous en version 1)
const events = {
  'channel.poll.begin': (e) => announce('sondage_debut', e),
  'channel.poll.end': (e) => {
    const status = String(e.status || '').toLowerCase();
    // completed : arrivé à son terme ; terminated : arrêté plus tôt, résultat valable
    if (status === 'completed' || status === 'terminated') {
      rememberEnded(e.id);
      return announce('sondage_fin', e);
    }
    // archived après un résultat : le sondage quitte juste l'écran, déjà annoncé
    if (state.ended.includes(e.id)) return;
    rememberEnded(e.id);
    return announce('sondage_annule', e);
  },
  'channel.prediction.begin': (e) => announce('prediction_debut', e),
  'channel.prediction.lock': (e) => announce('prediction_verrou', e),
  'channel.prediction.end': (e) => announce(
    String(e.status || '').toLowerCase() === 'resolved' ? 'prediction_fin' : 'prediction_annulee', e)
};

/* ===================== test depuis la page d'accueil ===================== */

function sampleEvent(id) {
  const now = Date.now();
  if (id.startsWith('sondage')) {
    return {
      id: 'demo',
      title: 'Pizza ou burger ce soir ?',
      started_at: new Date(now).toISOString(),
      ends_at: new Date(now + 120 * 1000).toISOString(),
      choices: [{ title: 'Pizza', votes: 124 }, { title: 'Burger', votes: 76 }]
    };
  }
  return {
    title: 'Je gagne cette partie ?',
    started_at: new Date(now).toISOString(),
    locks_at: new Date(now + 180 * 1000).toISOString(),
    winning_outcome_id: 'oui',
    outcomes: [
      { id: 'oui', title: 'Oui', users: 18, channel_points: 12400,
        top_predictors: [{ user_name: 'Viewer42', channel_points_won: 3200 }] },
      { id: 'non', title: 'Non', users: 12, channel_points: 5300 }
    ]
  };
}

// Envoie un exemple avec ce qui est dans le formulaire, même pas encore enregistré.
// raw : { id, texte, style, couleur }
async function test(raw) {
  const meta = MESSAGES.find((m) => m.id === raw.id);
  if (!meta) throw new Error('Message inconnu.');
  if (Date.now() - state.lastTest < TEST_COOLDOWN_MS) {
    throw new Error('Doucement : attends quelques secondes entre deux essais.');
  }
  state.lastTest = Date.now();

  const draft = normalize({ style: raw.style, couleur: raw.couleur, messages: { [meta.id]: { texte: raw.texte } } });
  const text = render(draft.messages[meta.id].texte, VARS[meta.id](sampleEvent(meta.id)));
  const mode = await state.send(text, { annonce: draft.style === 'annonce', couleur: draft.couleur });
  return { texte: text, mode: mode };
}

function init(options) {
  state.send = options.send;
}

module.exports = { init, normalize, setSettings, getSettings, describe, events, test };
