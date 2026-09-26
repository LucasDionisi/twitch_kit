/* Événements de la chaîne, poussés par Twitch (EventSub par WebSocket).
 *
 * Une seule connexion pour toutes les fonctionnalités : chacune déclare avec on() les
 * types d'événements qu'elle veut recevoir. Rien n'est sondé, Twitch pousse.
 *
 * Cycle de vie (doc Twitch « EventSub WebSockets ») :
 *  - session_welcome   : on a 10 s pour créer les abonnements (Helix, token de la chaîne)
 *  - session_keepalive : rien à faire, mais un silence plus long que le délai annoncé
 *                        veut dire connexion morte : on en rouvre une
 *  - session_reconnect : Twitch migre la session ; on ouvre l'URL fournie, les abonnements
 *                        suivent, et l'ancienne connexion n'est fermée qu'à l'accueil de
 *                        la nouvelle (ses notifications restent valables d'ici là)
 *  - notification      : l'événement, transmis au handler de son type
 *
 * Ce module n'importe rien du serveur : server.js lui passe le compte de la chaîne.
 * WebSocket est natif depuis Node 22 (le zip embarque Node 24).
 */
'use strict';

const WS_URL = 'wss://eventsub.wss.twitch.tv/ws';
const RETRY_MAX_MS = 60 * 1000;
const KEEPALIVE_MARGIN_MS = 10 * 1000;
const FIRST_MESSAGE_MS = 20 * 1000;   // délai pour recevoir l'accueil d'une connexion neuve
const SEEN_MAX = 100;                 // Twitch peut livrer deux fois le même événement

const state = {
  account: null,        // compte de la chaîne : helix() et tokens.user_id
  subs: new Map(),      // type → { version, handler }
  ws: null,             // connexion courante
  stopped: true,
  connected: false,     // session ouverte et abonnements créés
  keepaliveMs: 0,
  retries: 0,
  retryTimer: null,
  watchdog: null,
  seen: [],
  lastError: ''
};

function init(options) {
  state.account = options.account;
}

function on(type, version, handler) {
  state.subs.set(type, { version: version, handler: handler });
}

function status() {
  return { connecte: state.connected, erreur: state.lastError || null };
}

function start() {
  if (!state.stopped || !state.subs.size) return;
  state.stopped = false;
  state.retries = 0;
  connect(WS_URL, true);
}

function stop() {
  state.stopped = true;
  state.connected = false;
  clearTimeout(state.retryTimer);
  clearTimeout(state.watchdog);
  const ws = state.ws;
  state.ws = null;
  discard(ws);
}

// après une nouvelle autorisation de la chaîne : nouveaux droits, voire autre chaîne
function restart() {
  stop();
  state.lastError = '';
  start();
}

/* ===================== connexion ===================== */

// une connexion écartée est fermée et ses messages ignorés ; son onclose aussi,
// puisqu'elle n'est plus state.ws
function discard(socket) {
  if (!socket) return;
  socket.discarded = true;
  try { socket.close(); } catch (err) { /* déjà fermée */ }
}

// subscribe : false pour une migration demandée par Twitch (les abonnements suivent)
function connect(url, subscribe) {
  let socket;
  try {
    socket = new WebSocket(url);
  } catch (err) {
    retryLater('connexion impossible : ' + err.message);
    return;
  }
  // en migration, l'ancienne connexion reste ouverte jusqu'à l'accueil de la nouvelle
  const previous = subscribe ? null : state.ws;
  state.ws = socket;
  armWatchdog(socket, FIRST_MESSAGE_MS);

  socket.onmessage = (evt) => {
    if (socket.discarded || state.stopped) return;
    handleMessage(socket, previous, subscribe, evt.data).catch((err) => {
      console.warn('EventSub : message non traité : ' + err.message);
    });
  };
  socket.onclose = (evt) => {
    if (socket !== state.ws) return;
    state.ws = null;
    state.connected = false;
    clearTimeout(state.watchdog);
    if (!state.stopped) retryLater('connexion fermée par Twitch (code ' + evt.code + ')');
  };
  // une erreur est toujours suivie d'un close : c'est lui qui relance
  socket.onerror = () => {};
}

// Un seul minuteur, réarmé à chaque message : pas de nouvelles de Twitch au-delà du
// keepalive annoncé = connexion morte (Wi-Fi coupé, veille…), on repart de zéro.
function armWatchdog(socket, ms) {
  clearTimeout(state.watchdog);
  state.watchdog = setTimeout(() => {
    if (socket !== state.ws || state.stopped) return;
    console.warn('EventSub : plus de nouvelles de Twitch, reconnexion.');
    state.ws = null;
    state.connected = false;
    discard(socket);
    connect(WS_URL, true);
  }, ms);
}

function retryLater(reason) {
  const delay = Math.min(RETRY_MAX_MS, 1000 * Math.pow(2, state.retries));
  state.retries++;
  // quelques échecs d'affilée : on le dit sur la page d'accueil, sans s'arrêter d'essayer
  if (state.retries >= 3) {
    state.lastError = 'Twitch ne répond pas pour l\'instant, nouvel essai automatique. ' +
                      'Vérifie ta connexion internet si ça dure.';
  }
  console.warn('EventSub : ' + reason + ' — nouvel essai dans ' + Math.round(delay / 1000) + ' s.');
  clearTimeout(state.retryTimer);
  state.retryTimer = setTimeout(() => {
    if (!state.stopped && !state.ws) connect(WS_URL, true);
  }, delay);
}

/* ===================== messages ===================== */

async function handleMessage(socket, previous, subscribe, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch (err) {
    return;
  }
  const meta = msg.metadata || {};
  const payload = msg.payload || {};
  if (socket === state.ws) armWatchdog(socket, (state.keepaliveMs || 10000) + KEEPALIVE_MARGIN_MS);

  switch (meta.message_type) {
    case 'session_welcome': {
      if (socket !== state.ws) return;
      const session = payload.session || {};
      state.keepaliveMs = (session.keepalive_timeout_seconds || 10) * 1000;
      armWatchdog(socket, state.keepaliveMs + KEEPALIVE_MARGIN_MS);
      discard(previous);
      if (subscribe) await subscribeAll(socket, session.id);
      return;
    }
    case 'session_reconnect': {
      const url = payload.session && payload.session.reconnect_url;
      if (socket === state.ws && url) connect(url, false);
      return;
    }
    case 'notification':
      dispatch(meta, payload.event || {});
      return;
    case 'revocation': {
      const sub = payload.subscription || {};
      console.warn('EventSub : abonnement ' + sub.type + ' retiré par Twitch (' + sub.status + ').');
      state.lastError = 'Twitch a retiré l\'accès aux événements de ta chaîne : ' +
                        'clique sur « Autoriser ma chaîne » pour le redonner.';
      return;
    }
    default:
      // session_keepalive : le watchdog vient d'être réarmé, c'est tout
  }
}

function dispatch(meta, event) {
  if (state.seen.includes(meta.message_id)) return;
  state.seen.push(meta.message_id);
  if (state.seen.length > SEEN_MAX) state.seen.shift();

  const sub = state.subs.get(meta.subscription_type);
  if (!sub) return;
  Promise.resolve()
    .then(() => sub.handler(event))
    .catch((err) => console.warn('EventSub : ' + meta.subscription_type + ' : ' + err.message));
}

async function subscribeAll(socket, sessionId) {
  const userId = state.account.tokens && state.account.tokens.user_id;
  if (!userId || !sessionId) {
    stop();
    state.lastError = 'Ta chaîne n\'est pas connectée.';
    return;
  }

  const results = await Promise.allSettled(Array.from(state.subs, ([type, sub]) =>
    state.account.helix('/eventsub/subscriptions', {
      method: 'POST',
      body: {
        type: type,
        version: sub.version,
        condition: { broadcaster_user_id: userId },
        transport: { method: 'websocket', session_id: sessionId }
      }
    }).catch((err) => {
      // déjà abonné sur cette session : rien à refaire
      if (/→ 409/.test(err.message)) return;
      console.warn('EventSub : abonnement ' + type + ' impossible : ' + err.message);
      throw err;
    })));

  if (socket !== state.ws || state.stopped) return;   // remplacée entre-temps

  const failures = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
  // droits manquants ou token révoqué : inutile de réessayer en boucle, il faut
  // réautoriser la chaîne (le callback d'autorisation relance via restart())
  if (failures.some((m) => /→ 40[13]|^OAuth 4\d\d|non autorisé/.test(m))) {
    stop();
    state.lastError = 'Twitch refuse l\'accès aux événements de ta chaîne : ' +
                      'clique sur « Autoriser ma chaîne » pour refaire l\'autorisation.';
    return;
  }
  if (failures.length) {
    state.ws = null;
    discard(socket);
    retryLater('abonnements incomplets');
    return;
  }

  state.connected = true;
  state.retries = 0;
  state.lastError = '';
  console.log('EventSub : à l\'écoute (' + Array.from(state.subs.keys()).join(', ') + ').');
}

module.exports = { init, on, start, stop, restart, status };
