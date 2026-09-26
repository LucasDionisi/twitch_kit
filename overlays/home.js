/* Page d'accueil : état des comptes (sondé sur /status), saisie des clés, liste des
 * fonctionnalités (features.js). JS natif, aucun framework. */
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

function setPill(card, level, text) {
  const pill = $('.pill', card);
  pill.dataset.level = level;
  $('.pill-text', pill).textContent = text;
}

function setAuthButton(name, enabled, label) {
  const btn = $('[data-auth="' + name + '"]');
  btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  btn.textContent = label;
}

/* ===================== état des comptes ===================== */

// Le même raisonnement pour les trois comptes : ce qui manque, dans l'ordre où il faut le faire.
function accountState(configured, account, keysMissing) {
  if (!configured) return { level: 'off', text: keysMissing };
  if (!account.authorized) return { level: 'warn', text: 'À autoriser' };
  if (account.erreur || account.scopesManquants) return { level: 'bad', text: 'Autorisation à refaire' };
  const name = account.displayName || account.login;
  return { level: 'ok', text: name ? 'Connecté : ' + name : 'Connecté' };
}

function renderTwitch(s) {
  const card = $('#card-twitch');
  const st = accountState(s.twitch.configured, s.comptes.principal, 'Clés à saisir');
  setPill(card, st.level, st.text);
  setAuthButton('twitch', s.twitch.configured,
                st.level === 'ok' ? 'Autoriser un autre compte' : 'Autoriser ma chaîne');
  $('[data-auth="twitch"]').classList.toggle('secondary', st.level === 'ok');
  setField('twitch-redirect', s.twitch.redirect);
  fillKeys('twitch', s.twitch);
}

function renderBot(s) {
  const card = $('#card-bot');
  const bot = s.comptes.bot;
  card.classList.toggle('disabled', !s.twitch.configured);

  let st;
  if (!s.twitch.configured) st = { level: 'off', text: 'Chaîne d\'abord' };
  else if (!bot.pseudoAttendu && !bot.authorized) st = { level: 'off', text: 'Non utilisé' };
  else st = accountState(true, bot, '');
  setPill(card, st.level, st.text);

  setField('bot-auth', location.origin + '/auth/bot');
  const input = $('form[data-setup="bot"] input[name="login"]');
  if (document.activeElement !== input && !input.dataset.touched) input.value = bot.pseudoAttendu || '';
  openKeysOnce('bot', s.twitch.configured && !bot.pseudoAttendu);
}

function renderSpotify(s) {
  const card = $('#card-spotify');
  const st = accountState(s.spotify.configured, s.comptes.spotify, 'Non utilisé');
  setPill(card, st.level, st.text);
  const btn = $('[data-auth="spotify"]');
  btn.hidden = !s.spotify.configured;
  setAuthButton('spotify', s.spotify.configured,
                st.level === 'ok' ? 'Autoriser à nouveau' : 'Autoriser Spotify');
  btn.classList.toggle('secondary', st.level === 'ok');
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

const ACCOUNT_NAMES = { twitch: 'ta chaîne', bot: 'le bot', spotify: 'Spotify' };

function accountReady(s, name) {
  if (name === 'twitch') return s.comptes.principal.authorized;
  if (name === 'bot') return s.comptes.bot.authorized;
  if (name === 'spotify') return s.comptes.spotify.authorized;
  return false;
}

function renderFeatures(s) {
  const root = $('#features');
  const list = window.FEATURES || [];
  root.textContent = '';

  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'empty muted';
    empty.textContent = 'Aucune fonctionnalité pour l\'instant. Elles apparaîtront ici au fil des mises à jour.';
    root.appendChild(empty);
    return;
  }

  list.forEach((f) => {
    const card = document.createElement('article');
    card.className = 'card feature';

    const title = document.createElement('h3');
    title.textContent = f.nom;
    const desc = document.createElement('p');
    desc.className = 'muted';
    desc.textContent = f.description || '';
    card.append(title, desc);

    const missing = (f.comptes || []).filter((c) => !s || !accountReady(s, c));
    if (missing.length) {
      const needs = document.createElement('p');
      needs.className = 'needs muted';
      needs.textContent = 'À connecter d\'abord : ' + missing.map((c) => ACCOUNT_NAMES[c] || c).join(', ');
      card.appendChild(needs);
    }

    if (f.url) {
      const row = document.createElement('div');
      row.className = 'copy-row';
      const code = document.createElement('code');
      code.textContent = location.origin + f.url;
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'ghost';
      copy.textContent = 'Copier';
      copy.addEventListener('click', () => copyText(code.textContent));
      row.append(code, copy);
      card.appendChild(row);
      if (f.taille) {
        const size = document.createElement('p');
        size.className = 'needs muted';
        size.textContent = 'Source OBS : Navigateur, ' + f.taille[0] + ' × ' + f.taille[1];
        card.appendChild(size);
      }
    }
    root.appendChild(card);
  });
}

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

startPolling();
