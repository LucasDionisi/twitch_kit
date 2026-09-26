/* Overlays sondage et prédiction : état en direct et réglages d'apparence.
 *
 * L'état vit en mémoire (progress tombe à chaque vote ou mise, rien n'est écrit sur le
 * disque) et part aux overlays par WebSocket (server.js le branche sur live.js). Une
 * page qui se connecte reçoit l'état en cours avec le temps restant recalculé.
 *
 * Pas de minuterie ici : un résultat porte son heure de fin (hideAtMs), la page se
 * retire seule, et le serveur l'oublie paresseusement au premier accès suivant.
 *
 * Porté de twitch_tools (normalizePoll, normalizePrediction, seed*). Ce module n'importe
 * rien du serveur : il reçoit la fonction de diffusion et la durée d'affichage du résultat.
 */
'use strict';

const KINDS = ['poll', 'prediction'];

/* ===================== réglages d'apparence ===================== */

// deux thèmes, chacun avec ses couleurs d'origine ; on garde les couleurs de chaque
// thème séparément, pour que passer de l'un à l'autre ne perde rien
const THEMES = {
  circuit: { nom: 'Néon circuit', couleurs: { c1: '#35cdff', c2: '#ff2f8e', titres: '#58d6ff' } },
  crt: { nom: 'Néon CRT', couleurs: { c1: '#38d9ff', c2: '#ff4f7b', titres: '#ffd23f' } }
};

const COULEURS = {
  poll: [
    { id: 'c1', nom: 'Couleur 1', aide: 'choix 1, 3, 5…' },
    { id: 'c2', nom: 'Couleur 2', aide: 'choix 2, 4…' },
    { id: 'titres', nom: 'Titres', aide: 'SONDAGE, RÉSULTAT' }
  ],
  prediction: [
    { id: 'c1', nom: 'Couleur 1', aide: 'première issue' },
    { id: 'c2', nom: 'Couleur 2', aide: 'deuxième issue' },
    { id: 'titres', nom: 'Titres', aide: 'PRÉDICTION, RÉSULTAT' }
  ]
};

const ELEMENTS = {
  poll: [
    { id: 'chrono', nom: 'Chrono' },
    { id: 'stats', nom: 'Nombre de votes par choix' },
    { id: 'pied', nom: 'Pied (total et message)' }
  ],
  prediction: [
    { id: 'chrono', nom: 'Chrono' },
    { id: 'stats', nom: 'Points et parieurs par issue' },
    { id: 'pied', nom: 'Pied (total et message)' }
  ]
};

const TEXTES = {
  poll: [
    { id: 'encours', nom: 'Message pendant le vote', defaut: 'Votez maintenant !' },
    { id: 'fin', nom: 'Message au résultat', defaut: 'Merci d\'avoir voté !' }
  ],
  prediction: [
    { id: 'encours', nom: 'Message pendant les mises', defaut: 'Misez vos points !' },
    { id: 'verrou', nom: 'Message mises fermées', defaut: 'Résultat bientôt…' },
    { id: 'annule', nom: 'Message d\'annulation', defaut: 'Points remboursés' }
  ]
};

const TAILLE = { min: 0.75, max: 1.3, pas: 0.05, defaut: 1 };
const RESULTAT = { min: 5, max: 120, defaut: 15 };   // secondes d'affichage du résultat
const TEXTE_MAX = 40;
const COLOR = /^#[0-9a-f]{6}$/i;

function borne(value, b) {
  const n = Number(value);
  if (!Number.isFinite(n)) return b.defaut;
  return Math.min(b.max, Math.max(b.min, n));
}

// Tout ce qui vient du fichier ou de la page passe par ici : valeurs inconnues écartées,
// nombres bornés, couleurs vérifiées, défaut partout où il manque quelque chose.
function normalizeStyle(kind, raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const obj = (v) => (v && typeof v === 'object' ? v : {});

  const couleurs = {};
  Object.keys(THEMES).forEach((theme) => {
    const given = obj(obj(src.couleurs)[theme]);
    couleurs[theme] = {};
    Object.keys(THEMES[theme].couleurs).forEach((id) => {
      couleurs[theme][id] = COLOR.test(given[id]) ? given[id].toLowerCase() : THEMES[theme].couleurs[id];
    });
  });

  const elements = {};
  ELEMENTS[kind].forEach((e) => { elements[e.id] = obj(src.elements)[e.id] !== false; });

  const textes = {};
  TEXTES[kind].forEach((t) => {
    const value = Array.from(String(obj(src.textes)[t.id] || '').replace(/\s+/g, ' ').trim())
      .slice(0, TEXTE_MAX).join('');
    textes[t.id] = value || t.defaut;
  });

  return {
    theme: Object.prototype.hasOwnProperty.call(THEMES, src.theme) ? src.theme : 'circuit',
    couleurs: couleurs,
    // arrondi au pas du curseur : pas de 1.0500000001 dans le fichier
    taille: Math.round(borne(src.taille, TAILLE) / TAILLE.pas) * TAILLE.pas,
    resultat: Math.round(borne(src.resultat, RESULTAT)),
    elements: elements,
    textes: textes
  };
}

// ce qu'il faut à la page d'accueil pour construire le formulaire
function describeStyle(kind) {
  return {
    themes: Object.keys(THEMES).map((id) => ({ id: id, nom: THEMES[id].nom, couleurs: THEMES[id].couleurs })),
    couleurs: COULEURS[kind],
    elements: ELEMENTS[kind],
    textes: TEXTES[kind],
    texteMax: TEXTE_MAX,
    taille: TAILLE,
    resultat: RESULTAT
  };
}

/* ===================== état en direct ===================== */

const state = {
  broadcast: null,   // (kind, payload) → envoi aux overlays
  holdMs: null,      // kind → durée d'affichage du résultat, lue à la fin de l'événement
  current: { poll: null, prediction: null }
};

function init(options) {
  state.broadcast = options.broadcast;
  state.holdMs = options.holdMs;
}

// startedAt/endsAt sont passés en argument : EventSub et Helix ne décrivent pas la fin
// du sondage de la même façon
function normalizePoll(source, phase, startedAt, endsAt) {
  const raw = Array.isArray(source.choices) ? source.choices : [];
  // channel.poll.begin ne renvoie pas encore de votes : 0 par défaut
  const choices = raw.map((c) => ({
    id: c.id,
    title: typeof c.title === 'string' ? c.title : '',
    votes: typeof c.votes === 'number' ? c.votes : 0
  }));
  const totalVotes = choices.reduce((sum, c) => sum + c.votes, 0);
  const best = choices.reduce((max, c) => Math.max(max, c.votes), 0);
  choices.forEach((c) => {
    c.percent = totalVotes > 0 ? Math.round(c.votes * 100 / totalVotes) : 0;
  });
  const start = Date.parse(startedAt);
  const end = Date.parse(endsAt);

  return {
    phase: phase,
    id: source.id,
    title: typeof source.title === 'string' ? source.title : '',
    choices: choices,
    totalVotes: totalVotes,
    // en tête pendant le vote, gagnants au résultat ; ex æquo possible, d'où une liste
    leaderIds: totalVotes > 0 ? choices.filter((c) => c.votes === best).map((c) => c.id) : [],
    durationMs: Number.isFinite(start) && Number.isFinite(end) ? Math.max(end - start, 0) : 0,
    endsAtMs: Number.isFinite(end) ? end : Date.now(),
    hideAtMs: null
  };
}

function normalizePrediction(source, phase, startedAt, locksAt) {
  const raw = Array.isArray(source.outcomes) ? source.outcomes : [];
  // begin ne renvoie ni mises ni parieurs : 0 par défaut
  const outcomes = raw.map((o) => ({
    id: o.id,
    title: typeof o.title === 'string' ? o.title : '',
    points: typeof o.channel_points === 'number' ? o.channel_points : 0,
    users: typeof o.users === 'number' ? o.users : 0
  }));
  const totalPoints = outcomes.reduce((sum, o) => sum + o.points, 0);
  const totalUsers = outcomes.reduce((sum, o) => sum + o.users, 0);
  const best = outcomes.reduce((max, o) => Math.max(max, o.points), 0);
  outcomes.forEach((o) => {
    o.percent = totalPoints > 0 ? Math.round(o.points * 100 / totalPoints) : 0;
  });
  const start = Date.parse(startedAt);
  const lock = Date.parse(locksAt);

  return {
    phase: phase,
    id: source.id,
    title: typeof source.title === 'string' ? source.title : '',
    outcomes: outcomes,
    totalPoints: totalPoints,
    totalUsers: totalUsers,
    // le camp qui a le plus misé ; remplacé par le vrai gagnant au résultat
    leaderIds: totalPoints > 0 ? outcomes.filter((o) => o.points === best).map((o) => o.id) : [],
    durationMs: Number.isFinite(start) && Number.isFinite(lock) ? Math.max(lock - start, 0) : 0,
    endsAtMs: Number.isFinite(lock) ? lock : Date.now(),
    hideAtMs: null
  };
}

// Recalcule ce qui dépend de l'horloge : une page qui se connecte en plein vote doit
// recevoir le temps réellement restant. Un résultat dont l'heure est passée est oublié.
function payload(kind) {
  const cur = state.current[kind];
  if (!cur) return null;
  const now = Date.now();
  if (cur.hideAtMs && now >= cur.hideAtMs) {
    state.current[kind] = null;
    return null;
  }
  return Object.assign({}, cur, {
    remainingMs: cur.phase === 'active' ? Math.max(cur.endsAtMs - now, 0) : 0,
    holdMs: cur.hideAtMs ? cur.hideAtMs - now : 0
  });
}

function push(kind) {
  const p = payload(kind);
  state.broadcast(kind, p || { phase: 'gone' });
}

// pour la page d'accueil : 'active', 'locked'… ou null
function phase(kind) {
  const p = payload(kind);
  return p ? p.phase : null;
}

function endPoll(event) {
  const status = String(event.status || '').toLowerCase();
  const cur = state.current.poll;
  // « archived » après un résultat : le sondage quitte juste l'écran de Twitch, on
  // laisse le résultat jusqu'au bout. Sans résultat : supprimé par le streamer.
  if (status === 'archived' || status === 'moderated' || status === 'invalid') {
    if (cur && cur.id === event.id && cur.phase === 'ended') return;
    state.current.poll = null;
    push('poll');
    return;
  }
  state.current.poll = normalizePoll(event, 'ended', event.started_at, event.ended_at || event.ends_at);
  state.current.poll.hideAtMs = Date.now() + state.holdMs('poll');
  push('poll');
}

function endPrediction(event) {
  const status = String(event.status || '').toLowerCase();
  // « canceled » : mises remboursées, affiché aussi, sans gagnant
  const ph = status === 'canceled' ? 'canceled' : 'ended';
  const cur = normalizePrediction(event, ph, event.started_at, event.locked_at || event.ended_at);
  cur.leaderIds = ph === 'ended' && event.winning_outcome_id ? [event.winning_outcome_id] : [];
  cur.hideAtMs = Date.now() + state.holdMs('prediction');
  state.current.prediction = cur;
  push('prediction');
}

// type EventSub → handler (tous en version 1)
const events = {
  'channel.poll.begin': (e) => {
    state.current.poll = normalizePoll(e, 'active', e.started_at, e.ends_at);
    push('poll');
  },
  'channel.poll.progress': (e) => {
    state.current.poll = normalizePoll(e, 'active', e.started_at, e.ends_at);
    push('poll');
  },
  'channel.poll.end': endPoll,
  'channel.prediction.begin': (e) => {
    state.current.prediction = normalizePrediction(e, 'active', e.started_at, e.locks_at);
    push('prediction');
  },
  'channel.prediction.progress': (e) => {
    state.current.prediction = normalizePrediction(e, 'active', e.started_at, e.locks_at);
    push('prediction');
  },
  // mises fermées : la carte reste à l'écran jusqu'au résultat, sans chrono
  'channel.prediction.lock': (e) => {
    state.current.prediction = normalizePrediction(e, 'locked', e.started_at, e.locked_at);
    push('prediction');
  },
  'channel.prediction.end': endPrediction
};

// Si le serveur démarre (ou redémarre) en plein sondage ou en pleine prédiction,
// l'overlay doit les voir sans attendre le vote suivant.
async function seed(account) {
  const id = account.tokens && account.tokens.user_id;
  if (!id) return;
  try {
    const res = await account.helix('/polls?first=1&broadcaster_id=' + id);
    const poll = res.data && res.data[0];
    if (poll && String(poll.status).toUpperCase() === 'ACTIVE') {
      // Helix donne une durée en secondes là où EventSub donne une date de fin
      const endsAt = new Date(Date.parse(poll.started_at) + (poll.duration || 0) * 1000).toISOString();
      state.current.poll = normalizePoll(poll, 'active', poll.started_at, endsAt);
      push('poll');
      console.log('Sondage en cours repris : ' + state.current.poll.title);
    }
  } catch (err) {
    console.warn('Sondage en cours indisponible : ' + err.message);
  }
  try {
    const res = await account.helix('/predictions?first=1&broadcaster_id=' + id);
    const pred = res.data && res.data[0];
    const status = pred ? String(pred.status).toUpperCase() : '';
    if (status === 'ACTIVE' || status === 'LOCKED') {
      // Helix donne une fenêtre en secondes là où EventSub donne une date de verrouillage
      const locksAt = new Date(Date.parse(pred.created_at) + (pred.prediction_window || 0) * 1000).toISOString();
      state.current.prediction = normalizePrediction(pred, status === 'LOCKED' ? 'locked' : 'active',
                                                     pred.created_at, locksAt);
      push('prediction');
      console.log('Prédiction en cours reprise : ' + state.current.prediction.title);
    }
  } catch (err) {
    console.warn('Prédiction en cours indisponible : ' + err.message);
  }
}

module.exports = { KINDS, init, normalizeStyle, describeStyle, events, payload, phase, seed };
