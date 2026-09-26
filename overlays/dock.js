/* Dock OBS : une ligne par compte et par fonctionnalité, avec la même pastille que sur
 * la page d'accueil (calcul partagé dans etat.js). Construit une fois, puis mis à jour
 * à chaque sondage de /status, seulement quand le dock est visible.
 * Un clic sur une ligne ouvre sa page sur l'accueil (OBS l'ouvre dans le navigateur). */
'use strict';

const POLL_MS = 5000;
const Etat = window.TwitchKitEtat;

// comptes : id de la page sur l'accueil → nom et calcul de l'état
const ACCOUNTS = [
  { id: 'twitch', nom: 'Chaîne Twitch', etat: Etat.twitch },
  { id: 'bot', nom: 'Bot', etat: Etat.bot },
  { id: 'spotify', nom: 'Spotify', etat: Etat.spotify }
];

const rows = new Map();   // id → { row, text, detail }
let pollTimer = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function section(title) {
  const box = el('section');
  box.appendChild(el('h2', null, title));
  document.getElementById('groups').appendChild(box);
  return box;
}

function addRow(parent, id, nom) {
  const row = el('a', 'row');
  row.href = '/#' + id;
  row.target = '_blank';
  row.dataset.level = 'off';
  const text = el('span', 'state', '…');
  const detail = el('span', 'detail');
  detail.hidden = true;
  row.append(el('span', 'dot'), el('span', 'name', nom), text, detail);
  parent.appendChild(row);
  rows.set(id, { row, text, detail });
}

function build() {
  const accounts = section('Connexions');
  ACCOUNTS.forEach((a) => addRow(accounts, a.id, a.nom));

  // ni le dock lui-même ni les outils sans état (dock: false) ; un groupe vide n'a pas de section
  const list = (window.FEATURES || []).filter((f) => f.dock !== false);
  const groups = window.FEATURE_GROUPS || [];
  const known = groups.map((g) => g.id);
  const last = known[known.length - 1];
  groups.forEach((g) => {
    const members = list.filter((f) => (known.includes(f.groupe) ? f.groupe : last) === g.id);
    if (!members.length) return;
    const box = section(g.nom);
    members.forEach((f) => addRow(box, f.id, f.nom));
  });
}

function setRow(id, st) {
  const r = rows.get(id);
  r.row.dataset.level = st.niveau;
  r.text.textContent = st.texte;
  r.row.title = st.texte + (st.detail ? ' — ' + st.detail : '');
  // le détail ne sert que quand il y a quelque chose à faire
  const show = Boolean(st.detail) && (st.niveau === 'warn' || st.niveau === 'bad');
  r.detail.hidden = !show;
  r.detail.textContent = show ? st.detail : '';
}

function render(s) {
  const states = [];
  ACCOUNTS.forEach((a) => {
    const st = a.etat(s);
    setRow(a.id, st);
    states.push(st);
  });
  (window.FEATURES || []).forEach((f) => {
    if (!rows.has(f.id)) return;
    const st = Etat.feature(f, s);
    setRow(f.id, st);
    states.push(st);
  });

  // résumé : sans la chaîne rien ne marche ; sinon, ce qui demande une action (warn / bad),
  // « off » voulant dire non utilisé ou pas encore dans OBS
  const todo = states.filter((st) => st.niveau === 'warn' || st.niveau === 'bad');
  const summary = document.getElementById('summary');
  if (states[0].niveau !== 'ok') {
    summary.dataset.level = states[0].niveau === 'bad' ? 'bad' : 'warn';
    summary.textContent = 'Chaîne à connecter';
  } else {
    summary.dataset.level = todo.some((st) => st.niveau === 'bad') ? 'bad' : todo.length ? 'warn' : 'ok';
    summary.textContent = todo.length
      ? todo.length + (todo.length > 1 ? ' points à voir' : ' point à voir')
      : 'Tout va bien';
  }
  document.getElementById('version').textContent = /^\d/.test(s.version) ? 'v' + s.version : s.version;
}

async function refresh() {
  const offline = document.getElementById('offline');
  try {
    const res = await fetch('/status?dock=1', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const s = await res.json();
    offline.hidden = true;
    document.body.classList.remove('offline');
    render(s);
  } catch (err) {
    offline.hidden = false;
    document.body.classList.add('offline');
    const summary = document.getElementById('summary');
    summary.dataset.level = 'bad';
    summary.textContent = 'Hors ligne';
  }
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
  if (document.hidden) return;
  refresh();
  pollTimer = setInterval(refresh, POLL_MS);
}

document.addEventListener('visibilitychange', startPolling);

build();
startPolling();
