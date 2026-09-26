/* Autorisation Spotify (facultative).
 *
 * Pour l'instant, ce module ne fait qu'autoriser le compte et garder le token à jour
 * quand on le demande : aucune fonctionnalité ne lit encore Spotify. Rien ne tourne
 * ici, aucun timer, aucun polling.
 *
 * OAuth « Authorization Code », le même principe que Twitch : on autorise une
 * fois depuis la page d'accueil, le refresh token est gardé dans
 * data/tokens_spotify.json (hors du dossier servi en HTTP, et data/ est gitignoré)
 * et ne périme pas.
 *
 * Ce module n'importe rien du serveur : src/server.js l'initialise et lui passe
 * ce dont il a besoin.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// lecture seule du morceau en cours : ce que demandera la future commande !musique
const SCOPE = 'user-read-currently-playing';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const TIMEOUT_MS = 10000;    // jamais d'attente qui traîne

const spotify = {
  file: null,
  clientId: '',
  clientSecret: '',
  redirectUri: '',

  tokens: null,        // { access_token, refresh_token, expires_at }
  refreshing: null,
  lastError: ''
};

/* ===================== jetons ===================== */

function configured() {
  return Boolean(spotify.clientId && spotify.clientSecret);
}

function authorized() {
  return Boolean(spotify.tokens && spotify.tokens.refresh_token);
}

function load() {
  if (!spotify.file || !fs.existsSync(spotify.file)) return null;
  try {
    spotify.tokens = JSON.parse(fs.readFileSync(spotify.file, 'utf8'));
  } catch (err) {
    console.warn(path.basename(spotify.file) + ' illisible : ' + err.message);
  }
  return spotify.tokens;
}

function save() {
  fs.writeFileSync(spotify.file, JSON.stringify(spotify.tokens, null, 2) + '\n');
}

// les tokens sont liés à l'application Spotify : on les jette quand ses clés changent
function forget() {
  spotify.tokens = null;
  spotify.lastError = '';
  try { fs.unlinkSync(spotify.file); } catch (err) { /* rien à supprimer */ }
}

function storeGrant(grant) {
  spotify.tokens = {
    access_token: grant.access_token,
    // un refresh absent de la réponse veut dire « garde le précédent »
    refresh_token: grant.refresh_token || (spotify.tokens && spotify.tokens.refresh_token),
    // marge de 60 s pour ne jamais partir avec un token qui expire pendant la requête
    expires_at: Date.now() + (grant.expires_in - 60) * 1000
  };
  save();
}

// Spotify veut les identifiants client en Basic, pas dans le corps
async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(spotify.clientId + ':' + spotify.clientSecret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error('Spotify ' + res.status + ' : ' +
                    (body.error_description || body.error || JSON.stringify(body)));
  }
  return body;
}

function refresh() {
  // une seule requête de refresh à la fois, même si deux appels tombent ensemble
  if (spotify.refreshing) return spotify.refreshing;
  spotify.refreshing = (async () => {
    console.log('Rafraîchissement du token Spotify…');
    try {
      storeGrant(await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: spotify.tokens.refresh_token
      }));
      spotify.lastError = '';
    } catch (err) {
      spotify.lastError = err.message;
      throw err;
    }
  })().finally(() => { spotify.refreshing = null; });
  return spotify.refreshing;
}

// pour les futures fonctionnalités : un token valide, rafraîchi si besoin
async function ensureToken() {
  if (!authorized()) throw new Error('Spotify pas encore autorisé');
  // 2 minutes d'avance : le token Spotify ne vit qu'une heure
  if (Date.now() > spotify.tokens.expires_at - 2 * 60 * 1000) await refresh();
  return spotify.tokens.access_token;
}

/* ===================== autorisation ===================== */

function authorizeUrl(state) {
  const url = new URL('https://accounts.spotify.com/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', spotify.clientId);
  url.searchParams.set('redirect_uri', spotify.redirectUri);
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', state);
  return url.toString();
}

async function exchangeCode(code) {
  storeGrant(await tokenRequest({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: spotify.redirectUri
  }));
  spotify.lastError = '';
  console.log('Spotify autorisé.');
}

/* ===================== branchement ===================== */

function readCredentials(cred) {
  return {
    id: String((cred && cred.client_id) || '').trim(),
    secret: String((cred && cred.client_secret) || '').trim()
  };
}

function init(deps) {
  const cred = readCredentials(deps.credentials);
  spotify.file = deps.file;
  spotify.clientId = cred.id;
  spotify.clientSecret = cred.secret;
  spotify.redirectUri = deps.redirectUri;
  if (configured()) load();
  return spotify;
}

// clés modifiées depuis la page d'accueil : appliquées sans redémarrer
function setCredentials(raw) {
  const cred = readCredentials(raw);
  if (cred.id === spotify.clientId && cred.secret === spotify.clientSecret) return;
  const appChanged = cred.id !== spotify.clientId;
  spotify.clientId = cred.id;
  spotify.clientSecret = cred.secret;
  if (appChanged || !configured()) forget();
  else if (!spotify.tokens) load();
}

function status() {
  return {
    authorized: authorized(),
    erreur: spotify.lastError || null
  };
}

module.exports = {
  init: init,
  setCredentials: setCredentials,
  status: status,
  configured: configured,
  authorized: authorized,
  authorizeUrl: authorizeUrl,
  exchangeCode: exchangeCode,
  ensureToken: ensureToken
};
