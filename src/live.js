/* Flux temps réel vers les overlays, par WebSocket (porté de twitch_tools).
 *
 * Pourquoi pas SSE ni long polling : toutes les sources navigateur d'OBS partagent un seul
 * Chromium, limité à 6 connexions HTTP à la fois par adresse. Un flux SSE en garde une à
 * vie : au-delà de 6 overlays, plus rien ne passe. Une WebSocket sort de ce quota.
 *
 * Implémentation native minimale (RFC 6455), sans dépendance : le serveur ne fait
 * qu'envoyer du texte ; des pages, il ne lit que les trames de contrôle (close, ping, pong).
 * Côté page, c'est overlays/live.js.
 *
 * Chaque flux est déclaré avec route(chemin, greet) : greet(send) envoie à une page qui
 * (re)se connecte ses réglages puis l'état en cours, pour qu'une source OBS rafraîchie
 * reprenne là où elle en était.
 *
 * Ce module n'importe rien du serveur : server.js lui passe le port et branche
 * handleUpgrade sur l'événement 'upgrade' du serveur HTTP.
 */
'use strict';

const crypto = require('crypto');

const PING_MS = 30000;
// une source OBS gelée qui ne lit plus rien ne doit pas faire gonfler la mémoire :
// au-delà, on coupe, la page se reconnectera et recevra l'état à jour
const MAX_BUFFER = 1024 * 1024;
// trames reçues : les pages n'envoient que du contrôle, quelques octets
const MAX_INPUT = 64 * 1024;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const state = {
  port: 0,
  routes: new Map(),     // chemin → { clients: Set, greet }
  sockets: new Map()     // socket → { alive, input, demo }, pour le ping commun
};

function init(options) {
  state.port = options.port;
}

function route(pathname, greet) {
  state.routes.set(pathname, { clients: new Set(), greet: greet });
}

/* ===================== trames ===================== */

function frame(opcode, payload) {
  const length = payload.length;
  let head;
  if (length < 126) {
    head = Buffer.alloc(2);
    head[1] = length;
  } else if (length < 65536) {
    head = Buffer.alloc(4);
    head[1] = 126;
    head.writeUInt16BE(length, 2);
  } else {
    head = Buffer.alloc(10);
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(length), 2);
  }
  head[0] = 0x80 | opcode;   // FIN + opcode : jamais de message fragmenté
  return Buffer.concat([head, payload]);
}

const WS_PING = frame(0x9, Buffer.alloc(0));
const WS_PONG = frame(0xA, Buffer.alloc(0));
const WS_CLOSE = frame(0x8, Buffer.alloc(0));

// un message = « nom\njson » : la page ne parse le JSON qu'une fois
function message(eventName, payload) {
  return frame(0x1, Buffer.from(eventName + '\n' + JSON.stringify(payload), 'utf8'));
}

function write(socket, data) {
  if (socket.destroyed) return;
  if (socket.writableLength > MAX_BUFFER) {
    socket.destroy();
    return;
  }
  socket.write(data);
}

// la trame est construite une seule fois, quel que soit le nombre de pages ouvertes
function broadcast(pathname, eventName, payload) {
  const r = state.routes.get(pathname);
  if (!r || !r.clients.size) return;
  const data = message(eventName, payload);
  for (const socket of r.clients) write(socket, data);
}

// Lit ce que la page envoie : seulement close, ping et pong en pratique. Les données
// arrivent masquées (règle du protocole) ; on n'a besoin que de l'opcode.
function readFrames(socket, live, chunk) {
  live.alive = true;   // toute trame reçue prouve que la page est là
  live.input = live.input.length ? Buffer.concat([live.input, chunk]) : chunk;
  if (live.input.length > MAX_INPUT) {
    socket.destroy();
    return;
  }
  while (live.input.length >= 2) {
    const b = live.input;
    const opcode = b[0] & 0x0f;
    let length = b[1] & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (b.length < 4) return;
      length = b.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (b.length < 10) return;
      length = Number(b.readBigUInt64BE(2));
      offset = 10;
    }
    if (b[1] & 0x80) offset += 4;               // clé de masquage
    if (b.length < offset + length) return;     // trame incomplète : on attend la suite
    live.input = b.subarray(offset + length);

    if (opcode === 0x8) {           // la page ferme : on répond et on raccroche
      write(socket, WS_CLOSE);
      socket.end();
      return;
    }
    if (opcode === 0x9) write(socket, WS_PONG);
    // pong (0xA) : déjà compté par alive ; texte / binaire : les pages n'envoient rien
  }
}

// Un seul timer pour toutes les pages : ping toutes les 30 s, et une page qui n'a pas
// répondu au précédent est considérée comme morte. Le navigateur répond tout seul.
const pingTimer = setInterval(() => {
  for (const [socket, live] of state.sockets) {
    if (!live.alive) {
      socket.destroy();
      continue;
    }
    live.alive = false;
    write(socket, WS_PING);
  }
}, PING_MS);
pingTimer.unref();

/* ===================== connexion ===================== */

// Seules les pages servies par ce serveur peuvent s'abonner : une WebSocket n'est pas
// protégée par la règle de même origine, n'importe quel site ouvert pourrait sinon lire
// les flux.
function allowedOrigin(origin) {
  if (!origin) return true;   // client hors navigateur (outil de debug)
  try {
    const u = new URL(origin);
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') && u.port === String(state.port);
  } catch (err) {
    return false;
  }
}

function handleUpgrade(req, socket) {
  // page fermée brutalement, OBS quitté : jamais d'exception non catchée pour ça
  socket.on('error', () => {});

  let url = null;
  try {
    url = new URL(req.url, 'http://127.0.0.1');
  } catch (err) {
    /* URL illisible : refusée plus bas */
  }
  const r = url && state.routes.get(url.pathname);
  const key = req.headers['sec-websocket-key'];
  if (!r || !key || String(req.headers.upgrade).toLowerCase() !== 'websocket' ||
      req.headers['sec-websocket-version'] !== '13') {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return;
  }
  if (!allowedOrigin(req.headers.origin)) {
    console.warn('Flux ' + url.pathname + ' refusé à l\'origine ' + req.headers.origin);
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }

  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
               'Upgrade: websocket\r\n' +
               'Connection: Upgrade\r\n' +
               'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);   // petits messages : pas d'attente pour les regrouper

  // un aperçu (?demo=1) ne compte pas comme une source ajoutée dans OBS
  const live = { alive: true, input: Buffer.alloc(0), demo: url.searchParams.get('demo') === '1' };
  state.sockets.set(socket, live);
  r.clients.add(socket);
  socket.on('data', (chunk) => readFrames(socket, live, chunk));
  socket.on('close', () => {
    state.sockets.delete(socket);
    r.clients.delete(socket);
  });

  try {
    r.greet((eventName, payload) => write(socket, message(eventName, payload)));
  } catch (err) {
    console.warn('Flux ' + url.pathname + ' : envoi initial impossible : ' + err.message);
  }
}

// nombre de vraies sources (hors aperçus) branchées sur un flux
function count(pathname) {
  const r = state.routes.get(pathname);
  if (!r) return 0;
  let n = 0;
  for (const socket of r.clients) {
    const live = state.sockets.get(socket);
    if (live && !live.demo) n++;
  }
  return n;
}

module.exports = { init, route, broadcast, handleUpgrade, count };
