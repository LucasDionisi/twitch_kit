/* Sources OBS affichées seulement pendant certains jeux (id « game_sources »).
 *
 * Chaque règle associe une source OBS (par son nom) à une liste de .exe : la source est
 * affichée quand l'un d'eux tourne, masquée sinon. Le serveur repère les programmes
 * lancés (tasklist, sans fenêtre) ; c'est obs_twitch_kit.lua, déjà chargé dans OBS, qui
 * affiche ou masque les éléments de scène. Lua n'a pas de HTTP : les deux se parlent par
 * deux petits fichiers de data/, une ligne par source, sans JSON à décoder côté Lua.
 *
 *   data/game_sources_state.txt  écrit ici, lu par le Lua : « 1<TAB>Manette »
 *   data/obs_sources.txt         écrit par le Lua toutes les 10 s : noms des sources
 *                                d'OBS (liste déroulante de l'accueil, et signe de vie)
 *
 * Ce module n'importe rien du serveur : server.js lui donne data/ et ses réglages
 * (config/settings.json, section « game_sources »).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const RULES_MAX = 20;
const GAMES_MAX = 50;
const SOURCE_MAX = 200;
const EXE_MAX = 100;
const PATH_MAX = 260;          // MAX_PATH de Windows
const PATHS_TIMEOUT_MS = 8000;
const CHECK_MS = 3000;         // un tasklist toutes les 3 s, seulement s'il y a une règle
const TASKLIST_TIMEOUT_MS = 5000;
const OBS_FRESH_MS = 30000;    // le Lua réécrit obs_sources.txt toutes les 10 s
const CHOICES_TIMEOUT_MS = 8000;

// Programmes à fenêtre qui ne sont jamais des jeux : retirés de « programmes ouverts ».
const NOT_GAMES = new Set([
  'obs64.exe', 'obs32.exe', 'explorer.exe', 'node.exe', 'applicationframehost.exe',
  'systemsettings.exe', 'textinputhost.exe', 'shellexperiencehost.exe',
  'searchhost.exe', 'startmenuexperiencehost.exe', 'lockapp.exe', 'taskmgr.exe',
  'streamdeck.exe', 'powershell.exe', 'windowsterminal.exe', 'cmd.exe', 'conhost.exe'
]);

const state = {
  stateFile: null,
  sourcesFile: null,
  settings: { regles: [] },
  timer: null,
  busy: false,
  running: null,          // Set des .exe lancés (minuscules), null avant le premier relevé
  paths: new Map(),       // PID → chemin du .exe (null si illisible), lu une fois par processus
  runningPaths: new Set(),  // chemins lancés (minuscules), pour les jeux donnés par chemin
  unknownPaths: new Set(),  // noms lancés dont le chemin est illisible
  visible: new Map(),     // source → nom du jeu qui la fait afficher, ou null
  written: null,          // dernier contenu écrit dans le fichier d'état
  erreur: null
};

/* ===================== réglages ===================== */

// « rocketleague », « Jeux\RocketLeague.exe » → « RocketLeague.exe » ; null si invalide
function exeName(value) {
  let name = String(value == null ? '' : value).trim().split(/[\\/]/).pop().trim();
  if (!name) return null;
  if (!/\.exe$/i.test(name)) name += '.exe';
  if (name.length > EXE_MAX || /[<>:"|?*\x00-\x1f]/.test(name)) return null;
  return name;
}

// Un jeu est un nom de programme (n'importe quel dossier) ou un chemin complet
// « C:\Jeux\Launcher\game.exe » (ce programme-là seulement : deux jeux au même nom de
// .exe, un lanceur générique…). Les guillemets de « Copier en tant que chemin
// d'accès » de Windows sont retirés ; un chemin partiel est ramené au nom seul.
function gameEntry(value) {
  const s = String(value == null ? '' : value).trim().replace(/^"+|"+$/g, '').trim().replace(/\//g, '\\');
  if (!/^[a-z]:\\/i.test(s)) return exeName(s);
  const full = s.slice(0, 3) + s.slice(3).replace(/\\{2,}/g, '\\');
  if (!/\.exe$/i.test(full) || full.length > PATH_MAX) return null;
  if (/[<>:"|?*\x00-\x1f]/.test(full.slice(2)) || !exeName(full)) return null;
  return full;
}

function isPath(entry) {
  return entry.includes('\\');
}

// nom affiché dans les messages : le nom du programme, sans son dossier
function label(entry) {
  return entry.split('\\').pop();
}

function normalize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const regles = [];
  (Array.isArray(src.regles) ? src.regles : []).forEach((r) => {
    if (regles.length >= RULES_MAX || !r || typeof r !== 'object') return;
    // tabulations et retours à la ligne séparent les champs des fichiers d'échange
    const source = String(r.source == null ? '' : r.source).replace(/[\t\r\n]+/g, ' ').trim().slice(0, SOURCE_MAX);
    if (!source) return;
    const jeux = [];
    const seen = new Set();
    (Array.isArray(r.jeux) ? r.jeux : []).forEach((j) => {
      const exe = gameEntry(j);
      if (!exe || seen.has(exe.toLowerCase()) || jeux.length >= GAMES_MAX) return;
      seen.add(exe.toLowerCase());
      jeux.push(exe);
    });
    regles.push({ source: source, jeux: jeux });
  });
  return { regles: regles };
}

function describe() {
  return { reglesMax: RULES_MAX, jeuxMax: GAMES_MAX, sourceMax: SOURCE_MAX, sourcesObs: obsSources() };
}

// règles qui ont au moins un jeu : une source sans jeu n'est jamais touchée
function activeRules() {
  return state.settings.regles.filter((r) => r.jeux.length);
}

function setSettings(next) {
  state.settings = next;
  // plus de règle : on arrête de sonder ; sinon un relevé tout de suite, sans attendre
  if (!activeRules().length) {
    clearInterval(state.timer);
    state.timer = null;
    state.visible = new Map();
    writeState();
    return;
  }
  if (!state.timer) state.timer = setInterval(check, CHECK_MS);
  if (state.running) apply();
  check();
}

/* ===================== programmes lancés ===================== */

// tasklist /fo csv /nh : « "RocketLeague.exe","1234","Console","1","1 234 K" »
function listRunning() {
  return new Promise((resolve, reject) => {
    execFile('tasklist', ['/fo', 'csv', '/nh'],
      { windowsHide: true, timeout: TASKLIST_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        const procs = [];
        stdout.split(/\r?\n/).forEach((line) => {
          const m = /^"([^"]+)","(\d+)"/.exec(line);
          if (m) procs.push({ name: m[1].toLowerCase(), pid: Number(m[2]) });
        });
        resolve(procs);
      });
  });
}

// Chemin des .exe de ces PID. Win32_Process plutôt que Get-Process : il lit aussi le
// chemin des jeux lancés en administrateur (anti-triche). Les PID sont des nombres : rien
// d'extérieur n'entre dans la commande.
function processPaths(pids) {
  const cmd = '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' +
    'Get-CimInstance Win32_Process -Filter \'' + pids.map((p) => 'ProcessId=' + p).join(' OR ') + '\'' +
    ' | ForEach-Object { $_.ProcessId.ToString() + [char]9 + $_.ExecutablePath }';
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd],
      { windowsHide: true, timeout: PATHS_TIMEOUT_MS, maxBuffer: 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => {
        if (err) return reject(err);
        const out = new Map();
        stdout.split(/\r?\n/).forEach((line) => {
          const m = /^(\d+)\t(.+)$/.exec(line.trim());
          if (m) out.set(Number(m[1]), m[2]);
        });
        resolve(out);
      });
  });
}

// Pour les jeux donnés par chemin : le chemin n'est demandé que pour les processus qui
// portent le même nom de .exe, et une seule fois par processus (le chemin d'un PID ne
// change pas). Sans règle par chemin, PowerShell n'est jamais lancé.
async function resolvePaths(procs) {
  const wanted = new Set();
  activeRules().forEach((r) => r.jeux.filter(isPath).forEach((j) => wanted.add(label(j).toLowerCase())));
  const alive = new Set(procs.map((p) => p.pid));
  state.paths.forEach((v, pid) => { if (!alive.has(pid)) state.paths.delete(pid); });

  const missing = procs.filter((p) => wanted.has(p.name) && !state.paths.has(p.pid)).slice(0, 20);
  if (missing.length) {
    let found = new Map();
    try {
      found = await processPaths(missing.map((p) => p.pid));
    } catch (err) {
      console.warn('Jeux : chemin des programmes illisible, repli sur le nom : ' + err.message);
    }
    // illisible : mémorisé aussi (null), pour ne pas relancer PowerShell toutes les 3 s
    missing.forEach((p) => state.paths.set(p.pid, found.get(p.pid) || null));
  }

  state.runningPaths = new Set();
  state.unknownPaths = new Set();
  procs.forEach((p) => {
    if (!wanted.has(p.name)) return;
    const full = state.paths.get(p.pid);
    if (full) state.runningPaths.add(full.toLowerCase());
    else state.unknownPaths.add(p.name);
  });
}

function isRunning(entry) {
  if (!isPath(entry)) return state.running.has(entry.toLowerCase());
  if (state.runningPaths.has(entry.toLowerCase())) return true;
  // chemin illisible (processus protégé) : mieux vaut afficher sur le seul nom que jamais
  return state.unknownPaths.has(label(entry).toLowerCase());
}

async function check() {
  if (state.busy) return;   // un tasklist lent ne doit pas s'empiler
  state.busy = true;
  try {
    const procs = await listRunning();
    await resolvePaths(procs);
    state.running = new Set(procs.map((p) => p.name));
    if (state.erreur) console.log('Jeux : programmes lancés de nouveau lisibles.');
    state.erreur = null;
    apply();
  } catch (err) {
    if (!state.erreur) console.warn('Jeux : liste des programmes illisible : ' + err.message);
    state.erreur = 'Impossible de voir les programmes lancés. Redémarre OBS ; si ça continue, ' +
                   'ouvre le journal depuis le script Twitch Kit dans OBS.';
  } finally {
    state.busy = false;
  }
}

// Une source visée par deux règles est affichée si l'un de leurs jeux tourne.
function apply() {
  const visible = new Map();
  activeRules().forEach((r) => {
    const jeu = r.jeux.find(isRunning) || null;
    if (!visible.get(r.source)) visible.set(r.source, jeu);
  });
  visible.forEach((jeu, source) => {
    if (Boolean(jeu) !== Boolean(state.visible.get(source))) {
      console.log('Jeux : ' + source + (jeu ? ' affichée (' + label(jeu) + ' lancé).' : ' masquée.'));
    }
  });
  state.visible = visible;
  writeState();
}

/* ===================== fichiers d'échange avec OBS ===================== */

// Écrit seulement si l'état change ; tmp + rename : le Lua ne lit jamais un fichier à moitié.
function writeState() {
  if (!state.stateFile) return;
  const lines = [];
  state.visible.forEach((jeu, source) => lines.push((jeu ? '1' : '0') + '\t' + source));
  const content = lines.join('\n') + (lines.length ? '\n' : '');
  if (content === state.written) return;
  try {
    const tmp = state.stateFile + '.tmp';
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, state.stateFile);
    state.written = content;
  } catch (err) {
    console.warn('Jeux : écriture de ' + path.basename(state.stateFile) + ' impossible : ' + err.message);
  }
}

function obsFresh() {
  try {
    return Date.now() - fs.statSync(state.sourcesFile).mtimeMs < OBS_FRESH_MS;
  } catch (err) {
    return false;
  }
}

// noms des sources d'OBS, tels que le Lua les a vus ; vide si OBS n'a encore rien écrit
function obsSources() {
  try {
    const names = fs.readFileSync(state.sourcesFile, 'utf8').split(/\r?\n/)
      .map((s) => s.trim()).filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'fr'));
  } catch (err) {
    return [];
  }
}

/* ===================== programmes ouverts, pour choisir un jeu ===================== */

// Programmes qui ont une fenêtre, avec son titre : le streamer reconnaît son jeu sans
// connaître le nom du .exe. PowerShell plutôt que tasklist /v : titres en UTF-8, et bien
// plus rapide. Appelé seulement quand on clique, jamais en boucle.
const PS_LIST =
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' +
  'Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object {' +
  ' $_.ProcessName + [char]9 + $_.Path + [char]9 + $_.MainWindowTitle }';

function listWindows() {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_LIST],
      { windowsHide: true, timeout: CHOICES_TIMEOUT_MS, maxBuffer: 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => {
        if (err) return reject(err);
        const seen = new Set();
        const out = [];
        stdout.split(/\r?\n/).forEach((line) => {
          // nom <TAB> chemin (vide si illisible) <TAB> titre, qui peut contenir des tabulations
          const parts = line.split('\t');
          if (parts.length < 3) return;
          const exe = exeName(parts[0]);
          if (!exe || NOT_GAMES.has(exe.toLowerCase()) || seen.has(exe.toLowerCase())) return;
          seen.add(exe.toLowerCase());
          const chemin = gameEntry(parts[1]);
          out.push({ exe: exe, chemin: chemin && isPath(chemin) ? chemin : null,
                     titre: parts.slice(2).join(' ').trim().slice(0, 120) });
        });
        resolve(out.sort((a, b) => a.titre.localeCompare(b.titre, 'fr')));
      });
  });
}

async function choices() {
  let programmes = [];
  let erreur = null;
  try {
    programmes = await listWindows();
  } catch (err) {
    console.warn('Jeux : liste des fenêtres illisible : ' + err.message);
    erreur = 'Liste des programmes indisponible : tape le nom du .exe à la main.';
  }
  return { programmes: programmes, sources: obsSources(), erreur: erreur };
}

/* ===================== état pour l'accueil ===================== */

function status() {
  if (!activeRules().length) {
    return { niveau: 'off', texte: 'À configurer',
             detail: 'Choisis une source de tes scènes OBS et les jeux pendant lesquels elle s\'affiche.' };
  }
  const sources = {};
  state.visible.forEach((jeu, source) => {
    sources[source] = { visible: Boolean(jeu), jeu: jeu ? label(jeu) : null };
  });
  if (state.erreur) return { niveau: 'warn', texte: 'Problème', detail: state.erreur, sources: sources };
  if (!state.running) return { niveau: 'warn', texte: 'Démarrage…', sources: sources };
  if (!obsFresh()) {
    return { niveau: 'warn', texte: 'OBS ne répond pas', sources: sources,
             detail: 'Ouvre OBS. S\'il est déjà ouvert, redémarre-le : le script Twitch Kit doit ' +
                     'être à jour pour afficher et masquer tes sources.' };
  }
  const shown = Object.keys(sources).filter((s) => sources[s].visible);
  if (!shown.length) return { niveau: 'ok', texte: 'Aucun jeu lancé', sources: sources };
  return {
    niveau: 'ok',
    texte: shown.length === 1 ? shown[0] + ' affichée' : shown.length + ' sources affichées',
    detail: shown.map((s) => s + ' : ' + sources[s].jeu + ' lancé').join(' · '),
    sources: sources
  };
}

function init(options) {
  state.stateFile = path.join(options.dataDir, 'game_sources_state.txt');
  state.sourcesFile = path.join(options.dataDir, 'obs_sources.txt');
}

module.exports = { init, normalize, describe, setSettings, status, choices };
