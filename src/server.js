'use strict';

/**
 * Serveur local de Twitch Kit.
 *
 *  - sert la page d'accueil et les pages de overlays/ en http://127.0.0.1:PORT
 *  - enregistre les clés saisies sur la page d'accueil (config/credentials.json)
 *  - gère l'OAuth Twitch (chaîne + bot) et Spotify, refresh automatique compris
 *  - expose l'état des autorisations sur /status
 *
 * Aucune dépendance npm : Node 18+ fournit fetch, Node 22+ fournit WebSocket.
 * Le zip de release embarque son propre node.exe dans runtime/.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const spotify = require('./spotify.js');
const eventsub = require('./eventsub.js');
const chat = require('./chat.js');
const polls = require('./polls.js');
const votes = require('./votes.js');
const live = require('./live.js');

const ROOT = path.join(__dirname, '..');       // le code vit dans src/
const WEB_ROOT = path.join(ROOT, 'overlays');  // seul dossier exposé en HTTP
const CONFIG_DIR = path.join(ROOT, 'config');  // écrit par la page d'accueil
const DATA_DIR = path.join(ROOT, 'data');      // ce que le serveur génère

const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json');
// réglages des fonctionnalités, écrits par la page d'accueil (rien de secret)
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');
const BOT_TOKENS_FILE = path.join(DATA_DIR, 'tokens_bot.json');
const SPOTIFY_TOKENS_FILE = path.join(DATA_DIR, 'tokens_spotify.json');
// écrit au démarrage, lu par obs_twitch_kit.lua pour arrêter la bonne instance
const PID_FILE = path.join(DATA_DIR, 'server.pid');
// écrit par le workflow de release (numéro du tag), absent en développement
const VERSION_FILE = path.join(ROOT, 'VERSION');

// tout ce qui suit écrit dans data/ et config/ : ils doivent exister avant la première écriture
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(CONFIG_DIR, { recursive: true });

// Permissions demandées à la chaîne. Chaque fonctionnalité ajoute ici les siens ;
// checkScopes() signale ensuite sur la page d'accueil qu'il faut réautoriser.
const SCOPES = [
  'channel:read:polls',         // sondages annoncés dans le chat
  'channel:read:predictions'    // prédictions annoncées dans le chat
];
// le bot écrit dans le chat, en message normal ou en annonce (s'il est modérateur)
const BOT_SCOPES = ['user:write:chat', 'user:bot', 'moderator:manage:announcements'];

const VERSION = (() => {
  try {
    return fs.readFileSync(VERSION_FILE, 'utf8').trim() || 'dev';
  } catch (err) {
    return 'dev';
  }
})();

/* ===================== identifiants ===================== */
// Le streamer ne touche jamais ce fichier : il est écrit par les formulaires de la page
// d'accueil (/setup/*). Absent ou incomplet, le serveur démarre quand même, et la page
// affiche ce qui manque.

const CREDENTIALS_TEMPLATE = {
  client_id: '',
  client_secret: '',
  port: 8787,
  bot: { login: '' },
  spotify: { client_id: '', client_secret: '' }
};

function normalizeCredentials(raw) {
  const cred = Object.assign({}, CREDENTIALS_TEMPLATE, raw);
  cred.client_id = String(cred.client_id || '').trim();
  cred.client_secret = String(cred.client_secret || '').trim();
  const port = Number(cred.port);
  cred.port = Number.isInteger(port) && port > 1024 && port < 65536 ? port : CREDENTIALS_TEMPLATE.port;
  cred.bot = Object.assign({ login: '' }, cred.bot);
  cred.bot.login = String(cred.bot.login || '').trim().replace(/^@/, '').toLowerCase();
  cred.spotify = Object.assign({ client_id: '', client_secret: '' }, cred.spotify);
  cred.spotify.client_id = String(cred.spotify.client_id || '').trim();
  cred.spotify.client_secret = String(cred.spotify.client_secret || '').trim();
  return cred;
}

// previous : ce qu'on garde si le fichier est illisible (écrit à moitié, édité à la main)
function loadCredentials(previous) {
  if (!fs.existsSync(CREDENTIALS_FILE)) return normalizeCredentials({});
  try {
    return normalizeCredentials(JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8')));
  } catch (err) {
    console.warn('credentials.json illisible, valeurs précédentes gardées : ' + err.message);
    return previous || normalizeCredentials({});
  }
}

let credentials = loadCredentials(null);
// le port est lu une fois : le changer demande un redémarrage (et de nouvelles URL chez Twitch)
const PORT = credentials.port;
const REDIRECT_URI = 'http://localhost:' + PORT + '/auth/callback';
// Spotify refuse « localhost » : il veut l'IP de bouclage explicite
const SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:' + PORT + '/auth/spotify/callback';

function twitchConfigured() {
  return Boolean(credentials.client_id && credentials.client_secret);
}

// le Client ID n'est pas un secret, mais inutile de l'afficher en entier
function masked(id) {
  if (!id) return null;
  return id.length <= 8 ? '…' : id.slice(0, 4) + '…' + id.slice(-4);
}

/* ===================== comptes Twitch ===================== */
// Deux comptes autorisés séparément : la chaîne (events, API) et le bot (envoi
// dans le chat). Même logique OAuth pour les deux, donc une seule fabrique.

async function idRequest(params) {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(10000)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error('OAuth ' + res.status + ' : ' + (body.message || JSON.stringify(body)));
  }
  return body;
}

function makeAccount(name, file, scopes, authPath, expectedLogin) {
  const account = {
    name: name,
    scopes: scopes,
    authPath: authPath,
    // pseudo attendu (saisi sur la page d'accueil) : garde-fou contre une autorisation
    // faite avec le mauvais compte Twitch. Vide = aucune vérification.
    expectedLogin: expectedLogin || '',
    tokens: null,       // { access_token, refresh_token, expires_at, user_id, login }
    refreshing: null,
    missingScopes: [],  // rempli par checkScopes()
    lastError: ''       // token refusé par Twitch : il faut réautoriser
  };

  account.load = function () {
    if (!fs.existsSync(file)) return null;
    try {
      account.tokens = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      console.warn(path.basename(file) + ' illisible :', err.message);
    }
    return account.tokens;
  };

  account.save = function () {
    fs.writeFileSync(file, JSON.stringify(account.tokens, null, 2) + '\n');
  };

  // les tokens sont liés à l'application Twitch : on les jette quand ses clés changent
  account.forget = function () {
    account.tokens = null;
    account.missingScopes = [];
    account.lastError = '';
    try { fs.unlinkSync(file); } catch (err) { /* rien à supprimer */ }
  };

  account.authorized = function () {
    return Boolean(account.tokens && account.tokens.refresh_token);
  };

  account.storeGrant = function (grant) {
    account.tokens = Object.assign({}, account.tokens, {
      access_token: grant.access_token,
      refresh_token: grant.refresh_token || (account.tokens && account.tokens.refresh_token),
      // marge de 60 s pour ne jamais utiliser un token qui expire pendant la requête
      expires_at: Date.now() + (grant.expires_in - 60) * 1000
    });
    account.save();
  };

  account.exchangeCode = async function (code) {
    const previous = account.tokens;
    account.storeGrant(await idRequest({
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI
    }));
    await account.identify();

    if (account.expectedLogin && account.tokens.login.toLowerCase() !== account.expectedLogin) {
      // mauvais compte (Twitch réutilise volontiers la session en cours) :
      // on remet les tokens précédents plutôt que d'écraser silencieusement
      const wrong = account.tokens.login;
      account.tokens = previous;
      if (previous) account.save();
      else { try { fs.unlinkSync(file); } catch (err) { /* rien à nettoyer */ } }
      throw new Error('tu t\'es connecté avec « ' + wrong + ' » alors que le bot est « ' +
                      account.expectedLogin + ' ». Rien n\'a été enregistré : ouvre une fenêtre ' +
                      'de navigation privée, connecte-toi au compte du bot, et recommence.');
    }
    account.lastError = '';
    account.save();
  };

  account.refresh = function () {
    // une seule requête de refresh à la fois, même si plusieurs appels tombent en 401 ensemble
    if (account.refreshing) return account.refreshing;
    account.refreshing = (async () => {
      console.log('Rafraîchissement du token Twitch (' + name + ')…');
      account.storeGrant(await idRequest({
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        refresh_token: account.tokens.refresh_token,
        grant_type: 'refresh_token'
      }));
    })().finally(() => { account.refreshing = null; });
    return account.refreshing;
  };

  account.ensureToken = async function () {
    if (!account.authorized()) {
      throw new Error('compte ' + name + ' non autorisé — ouvre http://127.0.0.1:' + PORT + '/');
    }
    // rafraîchit 10 minutes avant l'expiration pour ne pas lâcher en plein live
    if (Date.now() > account.tokens.expires_at - 10 * 60 * 1000) await account.refresh();
    return account.tokens.access_token;
  };

  account.helix = async function (pathname, options) {
    const opts = options || {};
    const url = 'https://api.twitch.tv/helix' + pathname;

    const send = async (token) => fetch(url, {
      method: opts.method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Client-Id': credentials.client_id,
        'Content-Type': 'application/json'
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(10000)
    });

    let res = await send(await account.ensureToken());
    if (res.status === 401) {
      await account.refresh();
      res = await send(account.tokens.access_token);
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error('Helix ' + pathname + ' → ' + res.status + ' : ' +
                      (body.message || JSON.stringify(body)));
    }
    return body;
  };

  account.identify = async function () {
    const me = await account.helix('/users');
    const user = me.data && me.data[0];
    if (!user) throw new Error('impossible de lire le compte Twitch autorisé');
    account.tokens.user_id = user.id;
    account.tokens.login = user.login;
    account.tokens.display_name = user.display_name;
    console.log('Compte ' + name + ' autorisé : ' + user.display_name + ' (id ' + user.id + ')');
  };

  return account;
}

// Un token porte les permissions accordées le jour de l'autorisation : ajouter un
// scope au code ne le rajoute pas au token existant. Ce contrôle le signale sur la page
// d'accueil, plutôt qu'au moment où une fonctionnalité échoue en plein stream. Il voit
// aussi un token révoqué (mot de passe changé, application supprimée).
async function checkScopes(account) {
  if (!account.authorized()) return;
  try {
    const res = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { 'Authorization': 'OAuth ' + await account.ensureToken() },
      signal: AbortSignal.timeout(10000)
    });
    if (res.status === 401) {
      account.lastError = 'autorisation refusée par Twitch';
      console.warn('>>> Compte ' + account.name + ' : autorisation à refaire depuis la page d\'accueil.');
      return;
    }
    const body = await res.json().catch(() => ({}));
    const granted = body.scopes || [];
    account.missingScopes = account.scopes.filter((scope) => !granted.includes(scope));
    account.lastError = '';

    if (account.missingScopes.length) {
      console.warn('>>> Compte ' + account.name + ' : permission(s) manquante(s) — ' +
                   account.missingScopes.join(', '));
    }
  } catch (err) {
    // un refresh token révoqué fait échouer ensureToken() : même remède, réautoriser
    if (/^OAuth 4\d\d/.test(err.message)) account.lastError = 'autorisation refusée par Twitch';
    console.warn('Vérification des permissions (' + account.name + ') impossible : ' + err.message);
  }
}

const broadcaster = makeAccount('principal', TOKENS_FILE, SCOPES, '/auth');
const botAccount = makeAccount('bot', BOT_TOKENS_FILE, BOT_SCOPES, '/auth/bot',
                               credentials.bot.login);

/* ===================== rechargement des identifiants ===================== */

function applyCredentials(next) {
  const previous = credentials;
  credentials = next;
  botAccount.expectedLogin = next.bot.login;

  if (previous.client_id && previous.client_id !== next.client_id) {
    // tokens émis pour l'ancienne application : inutilisables avec la nouvelle
    if (broadcaster.authorized() || botAccount.authorized()) {
      console.log('Application Twitch changée : autorisations à refaire.');
    }
    broadcaster.forget();
    botAccount.forget();
    eventsub.stop();
  }
  // un bot autorisé sous un autre pseudo que celui qu'on vient de saisir ne compte plus
  if (next.bot.login && botAccount.tokens && botAccount.tokens.login &&
      botAccount.tokens.login.toLowerCase() !== next.bot.login) {
    console.log('Pseudo du bot changé : autorisation du bot à refaire.');
    botAccount.forget();
  }
  spotify.setCredentials(next.spotify);
}

// Surveille credentials.json et settings.json (édition à la main).
function watchCredentials() {
  // On surveille le dossier, pas le fichier : ça survit aux éditeurs qui remplacent
  // le fichier au lieu de l'écrire sur place.
  const debounce = {};
  const reloaders = {
    [path.basename(CREDENTIALS_FILE)]: () => applyCredentials(loadCredentials(credentials)),
    [path.basename(SETTINGS_FILE)]: () => applySettings(loadSettings(settings))
  };
  try {
    fs.watch(CONFIG_DIR, (evt, filename) => {
      const reload = reloaders[filename];
      if (!reload) return;
      clearTimeout(debounce[filename]);
      debounce[filename] = setTimeout(reload, 150);
    });
  } catch (err) {
    console.warn('Surveillance du dossier config impossible : ' + err.message);
  }
}

async function writeCredentials(next) {
  await fs.promises.writeFile(CREDENTIALS_FILE, JSON.stringify(next, null, 2) + '\n');
  // appliqué tout de suite pour que la réponse reflète le nouvel état ; le watcher
  // repassera derrière avec les mêmes valeurs, sans effet
  applyCredentials(next);
}

/* ===================== réglages des fonctionnalités ===================== */
// Une section par fonctionnalité (clé = id de overlays/features.js), chacune validée et
// complétée par défaut par son module : un fichier absent, ancien ou abîmé donne
// toujours des réglages utilisables. Chaque entrée sert aussi les routes
// GET /settings/<id> et POST /setup/<id> (et /setup/<id>/test si elle a test()).

const FEATURE_SETTINGS = {
  polls: {
    nom: 'sondages et prédictions dans le chat',
    normalize: (raw) => polls.normalize(raw),
    describe: () => polls.describe(),
    test: (body) => polls.test(body)
  },
  poll_overlay: {
    nom: 'overlay sondage',
    normalize: (raw) => votes.normalizeStyle('poll', raw),
    describe: () => votes.describeStyle('poll')
  },
  prediction_overlay: {
    nom: 'overlay prédiction',
    normalize: (raw) => votes.normalizeStyle('prediction', raw),
    describe: () => votes.describeStyle('prediction')
  }
};

function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  Object.keys(FEATURE_SETTINGS).forEach((id) => { out[id] = FEATURE_SETTINGS[id].normalize(src[id]); });
  return out;
}

function loadSettings(previous) {
  if (!fs.existsSync(SETTINGS_FILE)) return normalizeSettings({});
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
  } catch (err) {
    console.warn('settings.json illisible, valeurs précédentes gardées : ' + err.message);
    return previous || normalizeSettings({});
  }
}

let settings = loadSettings(null);

function applySettings(next) {
  settings = next;
  polls.setSettings(next.polls);
  // les overlays ouverts changent d'apparence tout de suite, sans être rafraîchis
  votes.KINDS.forEach((kind) => live.broadcast('/' + kind + '/stream', 'config', next[kind + '_overlay']));
}

async function writeSettings(next) {
  await fs.promises.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2) + '\n');
  applySettings(next);
}

/* ===================== serveur HTTP ===================== */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

let pendingAuth = null;          // { state, account } le temps de l'aller-retour OAuth
let pendingSpotifyAuth = null;   // idem pour Spotify, qui a son propre aller-retour

function sendJson(res, code, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(code, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(body);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]);
}

// page de retour d'une autorisation qui a échoué, avec un lien vers l'accueil
function sendHtml(res, code, title, message) {
  res.writeHead(code, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
  res.end('<!doctype html><meta charset="utf-8"><title>' + escapeHtml(title) + '</title>' +
          '<body style="font:15px/1.5 system-ui;padding:40px;max-width:640px;margin:auto">' +
          '<h2>' + escapeHtml(title) + '</h2><p>' + escapeHtml(message) + '</p>' +
          '<p><a href="/">← Revenir à la page d\'accueil</a></p>');
}

function redirect(res, location) {
  res.writeHead(302, { 'Location': location, 'Cache-Control': 'no-store' });
  res.end();
}

// Seul overlays/ est exposé : credentials.json et les tokens vivent ailleurs,
// hors de portée du serveur de fichiers, pas seulement filtrés par une liste.
function serveStatic(req, res, pathname) {
  const rel = pathname.replace(/^\/+/, '');
  const file = path.resolve(WEB_ROOT, rel);
  if (!file.startsWith(WEB_ROOT + path.sep)) {
    res.writeHead(403).end('403');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': MIME['.txt'] }).end('404 — ' + rel + ' introuvable');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}

/* ---------- saisie des clés depuis la page d'accueil ---------- */

const SETUP_BODY_MAX = 4 * 1024;
const KEY = /^[A-Za-z0-9]{20,64}$/;        // Client ID / Secret Twitch et Spotify
const TWITCH_LOGIN = /^[a-z0-9_]{3,25}$/;

function allowedOrigin(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') && u.port === String(PORT);
  } catch (err) {
    return false;
  }
}

// Une page web tierce ne doit pas pouvoir remplacer les clés : seule la page d'accueil,
// servie ici, passe (un formulaire ne sait pas envoyer de JSON, un fetch tiers n'a pas
// la bonne origine).
function setupRequestAllowed(req) {
  return req.method === 'POST' &&
         req.headers['sec-fetch-site'] === 'same-origin' &&
         allowedOrigin(req.headers.origin) &&
         String(req.headers['content-type'] || '').startsWith('application/json');
}

// corps de requête borné : au-delà, on arrête d'accumuler et on refuse à la fin
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= max) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > max) reject(new Error('corps trop volumineux'));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

// Client ID + Secret : le secret n'est jamais renvoyé à la page, donc un secret vide
// veut dire « garder celui qui est enregistré » — sauf si le Client ID change.
function keyPair(body, current, label) {
  const id = String(body.client_id || '').trim();
  const secret = String(body.client_secret || '').trim();
  if (!KEY.test(id)) return { erreur: 'Client ID ' + label + ' invalide : copie-le en entier.' };
  if (!secret) {
    if (id === current.client_id && current.client_secret) {
      return { client_id: id, client_secret: current.client_secret };
    }
    return { erreur: 'Il manque le secret ' + label + '.' };
  }
  if (!KEY.test(secret)) return { erreur: 'Secret ' + label + ' invalide : copie-le en entier.' };
  return { client_id: id, client_secret: secret };
}

// Garde commune à toutes les routes /setup/* : renvoie le corps JSON, ou null après
// avoir déjà répondu l'erreur.
async function readSetupBody(req, res, max) {
  if (!setupRequestAllowed(req)) {
    sendJson(res, 403, { erreur: 'à modifier depuis la page d\'accueil' });
    return null;
  }
  try {
    const body = JSON.parse(await readBody(req, max));
    if (body && typeof body === 'object') return body;
  } catch (err) {
    /* réponse juste en dessous */
  }
  sendJson(res, 400, { erreur: 'requête illisible' });
  return null;
}

async function handleSetup(req, res, pathname) {
  const body = await readSetupBody(req, res, SETUP_BODY_MAX);
  if (!body) return;

  const next = JSON.parse(JSON.stringify(credentials));

  if (pathname === '/setup/twitch') {
    const pair = keyPair(body, credentials, 'Twitch');
    if (pair.erreur) return sendJson(res, 400, pair);
    next.client_id = pair.client_id;
    next.client_secret = pair.client_secret;
  } else if (pathname === '/setup/bot') {
    const login = String(body.login || '').trim().replace(/^@/, '').toLowerCase();
    if (login && !TWITCH_LOGIN.test(login)) {
      return sendJson(res, 400, { erreur: 'Pseudo invalide : lettres, chiffres et _ seulement.' });
    }
    next.bot.login = login;
  } else {
    // Spotify est facultatif : tout vider le retire
    if (!body.client_id && !body.client_secret) {
      next.spotify = { client_id: '', client_secret: '' };
    } else {
      const pair = keyPair(body, credentials.spotify, 'Spotify');
      if (pair.erreur) return sendJson(res, 400, pair);
      next.spotify = pair;
    }
  }

  try {
    await writeCredentials(next);
    console.log('Clés enregistrées (' + pathname.slice('/setup/'.length) + ').');
    return sendJson(res, 200, { ok: true });
  } catch (err) {
    console.warn('Écriture de credentials.json impossible : ' + err.message);
    return sendJson(res, 500, { erreur: 'enregistrement impossible : ' + err.message });
  }
}

const SETUP_ROUTES = new Set(['/setup/twitch', '/setup/bot', '/setup/spotify']);

/* ---------- réglages des fonctionnalités ---------- */

// le plus gros : sept modèles de 450 caractères, emojis et accents comptant plusieurs octets
const FEATURE_BODY_MAX = 32 * 1024;

// /settings/<id>, /setup/<id>, /setup/<id>/test → { id, test } ou null
function featureRoute(pathname) {
  const m = /^\/(settings|setup)\/([a-z_]+)(\/test)?$/.exec(pathname);
  if (!m || !Object.prototype.hasOwnProperty.call(FEATURE_SETTINGS, m[2])) return null;
  if (m[1] === 'settings' && m[3]) return null;
  return { id: m[2], lecture: m[1] === 'settings', test: Boolean(m[3]) };
}

async function handleFeatureSettings(req, res, route) {
  const feature = FEATURE_SETTINGS[route.id];

  // réglages actuels + de quoi construire le formulaire (rien de secret)
  if (route.lecture) {
    return sendJson(res, 200, { reglages: settings[route.id], modele: feature.describe() });
  }

  const body = await readSetupBody(req, res, FEATURE_BODY_MAX);
  if (!body) return;

  if (route.test) {
    if (!feature.test) return sendJson(res, 404, { erreur: 'rien à tester ici' });
    try {
      return sendJson(res, 200, Object.assign({ ok: true }, await feature.test(body)));
    } catch (err) {
      return sendJson(res, 400, { erreur: err.message });
    }
  }

  const next = Object.assign({}, settings, { [route.id]: feature.normalize(body) });
  try {
    await writeSettings(next);
    console.log('Réglages enregistrés (' + feature.nom + ').');
    return sendJson(res, 200, { ok: true, reglages: next[route.id] });
  } catch (err) {
    console.warn('Écriture de settings.json impossible : ' + err.message);
    return sendJson(res, 500, { erreur: 'enregistrement impossible : ' + err.message });
  }
}

// État affiché sur la carte de la fonctionnalité, du plus bloquant au détail.
// Les comptes non autorisés, la page d'accueil les signale déjà d'elle-même.
function pollsState() {
  if (!settings.polls.actif) return { niveau: 'off', texte: 'Désactivé' };
  if (broadcaster.missingScopes.length || broadcaster.lastError) {
    return { niveau: 'bad', texte: 'Autorisation à refaire',
             detail: 'Clique sur « Autoriser ma chaîne » en haut de la page : Twitch doit te ' +
                     'demander l\'accès à tes sondages et prédictions.' };
  }
  const ev = eventsub.status();
  if (ev.erreur) return { niveau: 'warn', texte: 'Problème', detail: ev.erreur };
  if (!ev.connecte) return { niveau: 'warn', texte: 'Connexion…' };
  const ch = chat.status();
  if (ch.erreur) return { niveau: 'warn', texte: 'Problème', detail: 'Dernier message non envoyé : ' + ch.erreur };
  if (ch.avertissement) return { niveau: 'warn', texte: 'Actif', detail: ch.avertissement };
  return { niveau: 'ok', texte: 'Actif' };
}

const PHASE_TEXTE = {
  active: 'En cours',
  locked: 'Mises fermées',
  ended: 'Résultat à l\'écran',
  canceled: 'Annulation à l\'écran'
};

// Overlay sondage ou prédiction : prêt quand une source OBS écoute son flux.
function overlayState(kind) {
  if (broadcaster.missingScopes.length || broadcaster.lastError) {
    return { niveau: 'bad', texte: 'Autorisation à refaire',
             detail: 'Clique sur « Autoriser ma chaîne » en haut de la page : Twitch doit te ' +
                     'demander l\'accès à tes sondages et prédictions.' };
  }
  const ev = eventsub.status();
  if (ev.erreur) return { niveau: 'warn', texte: 'Problème', detail: ev.erreur };
  if (!ev.connecte) return { niveau: 'warn', texte: 'Connexion…' };
  if (!live.count('/' + kind + '/stream')) {
    return { niveau: 'off', texte: 'Pas encore dans OBS',
             detail: 'Ajoute la source dans OBS avec l\'adresse ci-dessous : l\'état passera au vert.' };
  }
  const ph = votes.phase(kind);
  return { niveau: 'ok', texte: ph ? PHASE_TEXTE[ph] || 'Dans OBS' : 'Dans OBS' };
}

/* ---------- état pour la page d'accueil ---------- */

function accountStatus(account) {
  const t = account.tokens;
  return {
    authorized: account.authorized(),
    login: t ? t.login || null : null,
    displayName: t ? t.display_name || t.login || null : null,
    pseudoAttendu: account.expectedLogin || null,
    scopesManquants: account.missingScopes.length ? account.missingScopes : null,
    erreur: account.lastError || null
  };
}

function statusPayload() {
  return {
    version: VERSION,
    port: PORT,
    twitch: {
      configured: twitchConfigured(),
      clientId: masked(credentials.client_id),
      redirect: REDIRECT_URI
    },
    spotify: {
      configured: spotify.configured(),
      clientId: masked(credentials.spotify.client_id),
      redirect: SPOTIFY_REDIRECT_URI
    },
    comptes: {
      principal: accountStatus(broadcaster),
      bot: accountStatus(botAccount),
      spotify: spotify.status()
    },
    // état de chaque fonctionnalité, par id de overlays/features.js
    fonctionnalites: {
      polls: pollsState(),
      poll_overlay: overlayState('poll'),
      prediction_overlay: overlayState('prediction')
    }
  };
}

/* ---------- routes ---------- */

const server = http.createServer(async (req, res) => {
  let url, pathname;
  try {
    url = new URL(req.url, 'http://127.0.0.1:' + PORT);
    pathname = decodeURIComponent(url.pathname);
  } catch (err) {
    return sendJson(res, 400, { erreur: 'adresse illisible' });
  }

  try {
    if (pathname === '/') return serveStatic(req, res, '/home.html');

    if (pathname === '/status') return sendJson(res, 200, statusPayload());

    if (SETUP_ROUTES.has(pathname)) return await handleSetup(req, res, pathname);

    const feature = featureRoute(pathname);
    if (feature) return await handleFeatureSettings(req, res, feature);

    if (pathname === '/auth' || pathname === '/auth/bot') {
      if (!twitchConfigured()) {
        return sendHtml(res, 400, 'Clés Twitch manquantes',
                        'Colle d\'abord le Client ID et le Secret de ton application Twitch sur la page d\'accueil.');
      }
      const account = pathname === '/auth/bot' ? botAccount : broadcaster;
      // le state sert à la fois d'anti-CSRF et de mémo du compte à autoriser
      pendingAuth = { state: crypto.randomBytes(16).toString('hex'), account: account };
      const authorize = new URL('https://id.twitch.tv/oauth2/authorize');
      authorize.searchParams.set('response_type', 'code');
      authorize.searchParams.set('client_id', credentials.client_id);
      authorize.searchParams.set('redirect_uri', REDIRECT_URI);
      authorize.searchParams.set('scope', account.scopes.join(' '));
      authorize.searchParams.set('state', pendingAuth.state);
      // sans ça Twitch réutilise la session en cours au lieu de demander quel compte
      authorize.searchParams.set('force_verify', 'true');
      return redirect(res, authorize.toString());
    }

    if (pathname === '/auth/callback') {
      const error = url.searchParams.get('error');
      if (error) {
        return sendHtml(res, 400, 'Autorisation refusée',
                        url.searchParams.get('error_description') || error);
      }
      if (!pendingAuth || url.searchParams.get('state') !== pendingAuth.state) {
        return sendHtml(res, 400, 'Autorisation expirée',
                        'Recommence en cliquant sur « Autoriser » depuis la page d\'accueil.');
      }
      const account = pendingAuth.account;
      pendingAuth = null;
      try {
        await account.exchangeCode(url.searchParams.get('code'));
        await checkScopes(account);
        // nouveaux droits, voire autre chaîne : on se réabonne aux événements
        if (account === broadcaster) {
          eventsub.restart();
          votes.seed(broadcaster);
        }
        return redirect(res, '/?connecte=' + (account === broadcaster ? 'twitch' : 'bot'));
      } catch (err) {
        console.error('Échange du code impossible :', err.message);
        return sendHtml(res, 500, 'Autorisation impossible', err.message);
      }
    }

    // Spotify : son propre aller-retour OAuth
    if (pathname === '/auth/spotify') {
      if (!spotify.configured()) {
        return sendHtml(res, 400, 'Clés Spotify manquantes',
                        'Colle d\'abord le Client ID et le Secret de ton application Spotify sur la page d\'accueil.');
      }
      pendingSpotifyAuth = crypto.randomBytes(16).toString('hex');
      return redirect(res, spotify.authorizeUrl(pendingSpotifyAuth));
    }

    if (pathname === '/auth/spotify/callback') {
      const error = url.searchParams.get('error');
      if (error) return sendHtml(res, 400, 'Autorisation Spotify refusée', error);
      if (!pendingSpotifyAuth || url.searchParams.get('state') !== pendingSpotifyAuth) {
        return sendHtml(res, 400, 'Autorisation expirée',
                        'Recommence en cliquant sur « Autoriser » depuis la page d\'accueil.');
      }
      pendingSpotifyAuth = null;
      try {
        await spotify.exchangeCode(url.searchParams.get('code'));
        return redirect(res, '/?connecte=spotify');
      } catch (err) {
        console.error('Autorisation Spotify impossible :', err.message);
        return sendHtml(res, 500, 'Autorisation Spotify impossible', err.message);
      }
    }

    serveStatic(req, res, pathname);
  } catch (err) {
    // filet de sécurité : une route qui plante ne doit jamais arrêter le serveur
    console.error('Erreur sur ' + pathname + ' : ' + err.message);
    if (!res.headersSent) sendJson(res, 500, { erreur: 'erreur interne' });
    else res.end();
  }
});

/* ===================== démarrage ===================== */

async function start() {
  try {
    if (!broadcaster.tokens.user_id) {
      await broadcaster.identify();
      broadcaster.save();
    }
  } catch (err) {
    console.error('Lecture du compte Twitch impossible : ' + err.message);
  }
  await checkScopes(broadcaster);
  // sans les droits, Twitch refuserait les abonnements : la page d'accueil demande déjà
  // de réautoriser, et le callback d'autorisation relancera EventSub
  if (!broadcaster.missingScopes.length) {
    eventsub.start();
    // un sondage ou une prédiction déjà lancés avant le démarrage du serveur
    votes.seed(broadcaster);
  }
}

/* ===================== fichier PID ===================== */
// obs_twitch_kit.lua s'en sert pour ne tuer que cette instance à la fermeture d'OBS.
// taskkill /F ne laisse pas tourner le handler 'exit' : le fichier peut donc rester en place
// après un arrêt par OBS. Le script Lua filtre aussi sur IMAGENAME, un PID périmé est sans danger.

let pidFileWritten = false;

function writePidFile() {
  try {
    fs.writeFileSync(PID_FILE, String(process.pid) + '\n');
    pidFileWritten = true;
  } catch (err) {
    console.error('Écriture de server.pid impossible :', err.message);
  }
}

process.on('exit', () => {
  // une instance de trop, morte sur EADDRINUSE, ne doit pas effacer le PID de celle qui tourne
  if (!pidFileWritten) return;
  try {
    fs.unlinkSync(PID_FILE);
  } catch (err) {
    /* déjà supprimé */
  }
});

// sans ça, Ctrl+C et la fermeture de la fenêtre ne passent pas par 'exit'
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// dernier filet : une promesse oubliée ne doit pas arrêter le serveur en plein live
process.on('unhandledRejection', (err) => {
  console.error('Erreur non gérée :', err && err.message ? err.message : err);
});

/* ===================== démarrage du serveur HTTP ===================== */

broadcaster.load();
botAccount.load();
spotify.init({
  file: SPOTIFY_TOKENS_FILE,
  credentials: credentials.spotify,
  redirectUri: SPOTIFY_REDIRECT_URI
});
applySettings(settings);
chat.init({ bot: botAccount, channel: broadcaster });
polls.init({ send: chat.say });
eventsub.init({ account: broadcaster });
Object.keys(polls.events).forEach((type) => eventsub.on(type, '1', polls.events[type]));

// overlays sondage et prédiction : un flux chacun. À la (re)connexion d'une page, ses
// réglages d'abord, pour qu'elle soit prête avant l'état en cours.
live.init({ port: PORT });
votes.init({
  broadcast: (kind, payload) => live.broadcast('/' + kind + '/stream', kind, payload),
  holdMs: (kind) => settings[kind + '_overlay'].resultat * 1000
});
votes.KINDS.forEach((kind) => {
  live.route('/' + kind + '/stream', (send) => {
    send('config', settings[kind + '_overlay']);
    const current = votes.payload(kind);
    if (current) send(kind, current);
  });
});
Object.keys(votes.events).forEach((type) => eventsub.on(type, '1', votes.events[type]));
server.on('upgrade', live.handleUpgrade);
watchCredentials();

server.listen(PORT, '127.0.0.1', async () => {
  writePidFile();
  // server.log est ouvert en ajout par le script OBS : on date chaque démarrage
  console.log('');
  console.log('=== démarrage ' + new Date().toLocaleString('fr-FR') + ' (version ' + VERSION + ') ===');
  console.log('Page d\'accueil : http://127.0.0.1:' + PORT + '/');
  if (!twitchConfigured()) {
    console.log('>>> Clés Twitch pas encore saisies : ouvre la page d\'accueil.');
    return;
  }
  if (broadcaster.authorized()) await start();
  else console.log('>>> Chaîne pas encore autorisée : ouvre la page d\'accueil.');
  if (botAccount.authorized()) await checkScopes(botAccount);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('Le port ' + PORT + ' est déjà utilisé — le serveur tourne peut-être déjà.');
  } else {
    console.error('Erreur serveur :', err.message);
  }
  process.exit(1);
});
