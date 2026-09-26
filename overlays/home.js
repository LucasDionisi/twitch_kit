/* Page d'accueil : des tuiles (comptes et fonctionnalités de features.js) avec leur état,
 * sondé sur /status ; chaque tuile ouvre la page de sa section (#nom) pour la saisie des
 * clés et les réglages. JS natif, aucun framework. */
'use strict';

const POLL_MS = 5000;   // /status sondé seulement quand l'onglet est visible

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

let status = null;
let pollTimer = null;

/* ===================== utilitaires ===================== */

function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('on'), 2600);
}

function setField(name, value) {
  $$('[data-field="' + name + '"]').forEach((el) => { el.textContent = value; });
}

// une même section a sa pastille sur la tuile de l'accueil et sur sa page
function setPill(name, level, text) {
  $$('.pill[data-state="' + name + '"]').forEach((pill) => {
    pill.dataset.level = level;
    $('.pill-text', pill).textContent = text;
  });
}

function setAuthButton(name, enabled, label) {
  const btn = $('[data-auth="' + name + '"]');
  btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  btn.textContent = label;
}

/* ===================== état des comptes ===================== */
// Le calcul des états vit dans etat.js, partagé avec le dock OBS.

const Etat = window.TwitchKitEtat;

function renderTwitch(s) {
  const st = Etat.twitch(s);
  setPill('twitch', st.niveau, st.texte);
  setAuthButton('twitch', s.twitch.configured,
                st.niveau === 'ok' ? 'Autoriser un autre compte' : 'Autoriser ma chaîne');
  $('[data-auth="twitch"]').classList.toggle('secondary', st.niveau === 'ok');
  setField('twitch-redirect', s.twitch.redirect);
  fillKeys('twitch', s.twitch);
}

function renderBot(s) {
  const card = $('#card-bot');
  const bot = s.comptes.bot;
  card.classList.toggle('disabled', !s.twitch.configured);

  const st = Etat.bot(s);
  setPill('bot', st.niveau, st.texte);

  setField('bot-auth', location.origin + '/auth/bot');
  // commande à taper dans le chat pour que le bot puisse faire des annonces
  setField('bot-mod', '/mod ' + (bot.login || bot.pseudoAttendu || 'pseudo_du_bot'));
  const input = $('form[data-setup="bot"] input[name="login"]');
  if (document.activeElement !== input && !input.dataset.touched) input.value = bot.pseudoAttendu || '';
  openKeysOnce('bot', s.twitch.configured && !bot.pseudoAttendu);
}

function renderSpotify(s) {
  const st = Etat.spotify(s);
  setPill('spotify', st.niveau, st.texte);
  const btn = $('[data-auth="spotify"]');
  btn.hidden = !s.spotify.configured;
  setAuthButton('spotify', s.spotify.configured,
                st.niveau === 'ok' ? 'Autoriser à nouveau' : 'Autoriser Spotify');
  btn.classList.toggle('secondary', st.niveau === 'ok');
  setField('spotify-redirect', s.spotify.redirect);
  fillKeys('spotify', s.spotify);
}

// Le secret n'est jamais renvoyé par le serveur : on indique seulement qu'il est enregistré.
function fillKeys(name, info) {
  const form = $('form[data-setup="' + name + '"]');
  const id = $('input[name="client_id"]', form);
  const secret = $('input[name="client_secret"]', form);
  id.placeholder = info.clientId ? 'Enregistré : ' + info.clientId : 'ex. abcd1234…';
  secret.placeholder = info.configured ? 'Enregistré — laisse vide pour le garder' : '';
  // les clés à saisir sont dépliées d'office, une seule fois (sinon on replierait sous les doigts)
  openKeysOnce(name, name === 'twitch' && !info.configured);
}

function openKeysOnce(name, open) {
  const details = $('#keys-' + name);
  if (details.dataset.initialized) return;
  details.dataset.initialized = '1';
  details.open = open;
}

/* ===================== fonctionnalités ===================== */

// constructeurs des formulaires de réglages, par valeur de « reglages » dans features.js
const SETTINGS_BUILDERS = {
  messages: (root, f) => window.buildMessageSettings(root, f.id),
  apparence: (root, f) => window.buildOverlaySettings(root, f)
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function pillNode(name) {
  const pill = el('span', 'pill');
  pill.dataset.state = name;
  pill.dataset.level = 'off';
  pill.append(el('span', 'dot'), el('span', 'pill-text', '…'));
  return pill;
}

// Chaque fonctionnalité a une tuile sur l'accueil et sa page (#<id>). Les deux sont
// construites une seule fois au chargement, puis seulement mises à jour : un formulaire
// en cours de saisie ne doit pas disparaître au sondage suivant de /status.
const featureCards = new Map();

function buildFeatureTile(f) {
  const tile = el('a', 'tile');
  tile.href = '#' + f.id;
  tile.append(pillNode(f.id), el('h3', null, f.nom), el('p', 'muted', f.description || ''));
  return tile;
}

function buildFeatureView(f) {
  const view = el('div', 'view');
  view.id = 'view-' + f.id;
  view.hidden = true;
  const back = el('a', 'back', '← Accueil');
  back.href = '#';
  view.appendChild(back);

  const card = el('article', 'card feature');
  const head = el('div', 'card-head');
  const text = el('div');
  text.append(el('h3', null, f.nom), el('p', 'muted', f.description || ''));
  head.append(text, pillNode(f.id));
  card.appendChild(head);

  card.needs = el('p', 'needs muted');
  card.detail = el('p', 'detail');
  card.append(card.needs, card.detail);

  if (f.url) {
    const row = el('div', 'copy-row');
    const code = el('code', null, location.origin + f.url);
    const copy = el('button', 'ghost', 'Copier');
    copy.type = 'button';
    copy.addEventListener('click', () => copyText(code.textContent));
    row.append(code, copy);
    card.appendChild(row);
    if (f.taille) {
      card.appendChild(el('p', 'needs muted', 'Source OBS : Navigateur, ' + f.taille[0] + ' × ' + f.taille[1]));
    }
  }
  if (f.obs) card.appendChild(el('p', 'needs muted obs', f.obs));
  view.appendChild(card);

  const build = SETTINGS_BUILDERS[f.reglages];
  if (build) {
    const settings = el('article', 'card');
    settings.appendChild(el('h3', 'card-title', 'Réglages'));
    view.appendChild(settings);
    build(settings, f);
  }
  featureCards.set(f.id, card);
  return view;
}

function tileSection(title) {
  const section = el('section');
  const tiles = el('div', 'tiles');
  section.append(el('h2', null, title), tiles);
  $('#features').appendChild(section);
  return tiles;
}

// Une section par groupe (overlays, bot…), dans l'ordre de FEATURE_GROUPS.
function buildFeatures() {
  const views = $('#feature-views');
  const list = window.FEATURES || [];
  const groups = window.FEATURE_GROUPS || [];
  if (!list.length) {
    tileSection('Fonctionnalités').appendChild(el('div', 'empty muted',
      'Aucune fonctionnalité pour l\'instant. Elles apparaîtront ici au fil des mises à jour.'));
    return;
  }
  const known = groups.map((g) => g.id);
  const last = known[known.length - 1];
  groups.forEach((g) => {
    const members = list.filter((f) => (known.includes(f.groupe) ? f.groupe : last) === g.id);
    if (!members.length) return;
    const tiles = tileSection(g.nom);
    members.forEach((f) => {
      tiles.appendChild(buildFeatureTile(f));
      views.appendChild(buildFeatureView(f));
    });
  });
}

function updateFeature(f, s) {
  const card = featureCards.get(f.id);
  const st = Etat.feature(f, s);
  const missing = st.manquants;

  // chaque compte manquant mène à sa page
  card.needs.hidden = !missing.length;
  card.needs.textContent = 'À connecter d\'abord : ';
  missing.forEach((c, i) => {
    if (i) card.needs.append(', ');
    const link = el('a', null, Etat.ACCOUNT_NAMES[c] || c);
    link.href = '#' + c;
    card.needs.appendChild(link);
  });

  // l'état détaillé vient du serveur (sans comptes connectés, etat.js s'arrête avant)
  setPill(f.id, st.niveau, st.texte);
  card.detail.hidden = !st.detail;
  card.detail.textContent = st.detail || '';
  card.detail.dataset.level = st.niveau;
}

function renderFeatures(s) {
  (window.FEATURES || []).forEach((f) => updateFeature(f, s));
}

/* ===================== navigation ===================== */
// Une seule page, une vue par section : #twitch, #bot, #spotify, #<id de fonctionnalité>.
// Le bouton Retour du navigateur ramène à l'accueil.

function route() {
  const name = decodeURIComponent(location.hash.slice(1));
  const target = (name && document.getElementById('view-' + name)) || $('#view-home');
  $$('.view').forEach((view) => { view.hidden = view !== target; });
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);

/* ===================== sondage de /status ===================== */

async function refresh() {
  try {
    const res = await fetch('/status', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    status = await res.json();
    $('#offline').hidden = true;
  } catch (err) {
    $('#offline').hidden = false;
    return;
  }
  setField('version', status.version);
  setField('home', 'http://127.0.0.1:' + status.port + '/');
  renderTwitch(status);
  renderBot(status);
  renderSpotify(status);
  renderFeatures(status);
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
  if (document.hidden) return;
  refresh();
  pollTimer = setInterval(refresh, POLL_MS);
}

document.addEventListener('visibilitychange', startPolling);

/* ===================== copier ===================== */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copié');
  } catch (err) {
    toast('Copie impossible : sélectionne le texte et fais Ctrl+C');
  }
}

$$('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const field = $('[data-field="' + btn.dataset.copy + '"]');
    copyText(field.textContent);
  });
});

/* ===================== formulaires de clés ===================== */

$$('form[data-setup]').forEach((form) => {
  const msg = $('.form-msg', form);

  $$('input', form).forEach((input) => {
    input.addEventListener('input', () => { input.dataset.touched = '1'; });
  });

  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    const data = {};
    $$('input', form).forEach((input) => { data[input.name] = input.value.trim(); });
    msg.dataset.level = '';
    msg.textContent = 'Enregistrement…';

    try {
      const res = await fetch('/setup/' + form.dataset.setup, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.erreur || 'erreur ' + res.status);
      msg.dataset.level = 'ok';
      msg.textContent = 'Enregistré';
      // le secret n'est jamais réaffiché : on vide le champ une fois enregistré
      $$('input[type="password"]', form).forEach((input) => { input.value = ''; });
      $$('input', form).forEach((input) => { delete input.dataset.touched; });
      if (form.dataset.setup !== 'bot') {
        $('input[name="client_id"]', form).value = '';
      }
      await refresh();
    } catch (err) {
      msg.dataset.level = 'bad';
      msg.textContent = err.message;
    }
  });
});

/* ===================== retour d'autorisation ===================== */

(function afterAuth() {
  const params = new URLSearchParams(location.search);
  const who = params.get('connecte');
  if (!who) return;
  const names = { twitch: 'Chaîne Twitch connectée', bot: 'Bot connecté', spotify: 'Spotify connecté' };
  toast((names[who] || 'Compte connecté') + ' 👍');
  history.replaceState(null, '', '/');
})();

buildFeatures();
route();
startPolling();
