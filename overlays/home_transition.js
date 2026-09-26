/* Créateur de la transition de scène, sur la page de sa tuile dans l'accueil.
 *
 * Aperçu sur deux fausses scènes (bascule de l'une à l'autre au point de transition, comme
 * OBS), réglages (vitesse, direction, couleurs, densité, tirage), export de la vidéo et marche
 * à suivre dans OBS. Rien n'est enregistré : les réglages ne servent qu'à fabriquer la vidéo.
 * Le rendu et l'export sont dans transition.js ; l'animation de l'aperçu ne tourne que
 * quand la page de la tuile est affichée.
 * Utilise $, $$ et toast de home.js, chargé juste après.
 */
'use strict';

window.buildTransitionSettings = function (root, f) {
  const T = window.TwitchKitTransition;
  const BASE_MS = 1400;                          // durée à vitesse normale
  const DEFAUTS = { c1: '#35cdff', c2: '#ff2f8e' };
  const VITESSES = [
    { v: 1.25, nom: 'Rapide' }, { v: 1, nom: 'Normale' }, { v: 0.8, nom: 'Un peu lente' },
    { v: 0.65, nom: 'Lente' }, { v: 0.5, nom: 'Très lente' }
  ];
  const DIRECTIONS = [
    { v: 0, nom: '↑', aide: 'Vers le haut' }, { v: -30, nom: '↖', aide: 'Diagonale vers la gauche' },
    { v: 30, nom: '↗', aide: 'Diagonale vers la droite' }, { v: 90, nom: '→', aide: 'Vers la droite' }
  ];
  const DENSITES = [{ v: 0.6, nom: 'Sobre' }, { v: 1, nom: 'Normale' }, { v: 1.5, nom: 'Riche' }];

  const opts = { c1: DEFAUTS.c1, c2: DEFAUTS.c2, angle: -30, densite: 1, seed: 7 };
  let rate = 1;
  let engine = null;

  const title = root.querySelector('.card-title');
  if (title) title.textContent = 'Créer la transition';

  function node(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  const duration = () => Math.round(BASE_MS / rate);
  const seconds = (ms) => (ms / 1000).toFixed(1).replace('.', ',') + ' s';

  /* ===================== aperçu ===================== */

  const stage = node('div', 'tr-stage');
  const scenes = [node('div', 'tr-scene a'), node('div', 'tr-scene b')];
  scenes[0].appendChild(node('span', null, 'Scène A'));
  scenes[1].appendChild(node('span', null, 'Scène B'));
  scenes[1].hidden = true;
  const canvas = node('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  stage.append(scenes[0], scenes[1], canvas);
  const ctx = canvas.getContext('2d');

  const bar = node('div', 'tr-bar');
  const playBtn = node('button', 'ghost small', 'Pause');
  playBtn.type = 'button';
  const scrub = node('input');
  scrub.type = 'range';
  scrub.min = 0;
  scrub.max = 1000;
  scrub.value = 0;
  scrub.setAttribute('aria-label', 'Position dans la transition');
  const time = node('output', 'range-value');
  bar.append(playBtn, scrub, time);

  const info = node('p', 'tr-info');

  root.append(stage, bar, info);

  let current = 0;           // scène affichée avant la transition
  let playing = false;       // l'aperçu est en lecture (voulu par l'utilisateur)
  let raf = 0, startAt = 0, fromT = 0, restartTimer = 0;
  const view = root.closest('.view');
  const onScreen = () => !document.hidden && !(view && view.hidden);

  function show(t) {
    engine.renderFrame(ctx, t);
    // comme OBS : on bascule sur l'autre scène une fois le point de transition passé
    const swapped = engine.cover && t >= engine.cover.point;
    scenes[current].hidden = swapped;
    scenes[1 - current].hidden = !swapped;
    scrub.value = Math.round(t * 1000);
    time.textContent = Math.round(t * duration()) + ' ms';
  }

  function tick(now) {
    raf = 0;
    const t = Math.min(1, fromT + (now - startAt) / duration());
    show(t);
    if (t < 1) { raf = requestAnimationFrame(tick); return; }
    // fin : la nouvelle scène devient la scène courante, et on relance après une pause
    current = 1 - current;
    fromT = 0;
    restartTimer = setTimeout(() => { restartTimer = 0; show(0); run(); }, 900);
  }

  // lance l'animation si l'aperçu est en lecture et visible ; sinon l'arrête
  function run() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (!playing || !onScreen() || restartTimer) return;
    if (Number(scrub.value) >= 1000) fromT = 0;
    startAt = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function halt() {
    cancelAnimationFrame(raf);
    raf = 0;
    clearTimeout(restartTimer);
    restartTimer = 0;
    fromT = Number(scrub.value) / 1000;
  }

  function setPlaying(on) {
    playing = on;
    playBtn.textContent = on ? 'Pause' : 'Lecture';
    halt();
    run();
  }

  playBtn.addEventListener('click', () => setPlaying(!playing));
  scrub.addEventListener('input', () => {
    setPlaying(false);
    show(Number(scrub.value) / 1000);
  });

  // pas d'animation quand la page de la tuile n'est pas affichée
  function visibility() {
    if (onScreen()) { if (!raf && !restartTimer) run(); } else halt();
  }
  window.addEventListener('hashchange', visibility);
  document.addEventListener('visibilitychange', visibility);

  // les réglages ont changé : nouveau moteur, et l'aperçu repart du début
  function rebuild() {
    engine = T.create(opts);
    updateInfo();
    halt();
    fromT = 0;
    show(0);
    if (!playing) setPlaying(true); else run();
  }

  function updateInfo() {
    info.textContent = '';
    const c = engine.cover;
    if (!c) {
      info.dataset.level = 'bad';
      info.textContent = 'La transition ne couvre jamais tout l\'écran : change de tirage ou de direction.';
      obsPoint.textContent = '—';
      return;
    }
    info.dataset.level = '';
    const ms = (k) => Math.round(k * duration());
    info.append('Durée ', node('b', null, seconds(duration())),
                ' · écran entièrement couvert de ', node('b', null, ms(c.first) + ' à ' + ms(c.last) + ' ms'),
                ' · point de transition : ', node('b', null, ms(c.point) + ' ms'));
    obsPoint.textContent = ms(c.point);
  }

  /* ===================== réglages ===================== */

  const form = node('form', 'settings');
  form.noValidate = true;
  form.addEventListener('submit', (evt) => evt.preventDefault());

  function row(label, help, control) {
    const r = node('div', 'set-row');
    const t = node('span', 'set-text');
    t.appendChild(node('b', null, label));
    if (help) t.appendChild(node('span', 'muted small', help));
    r.append(t, control);
    return r;
  }

  function segmented(name, list, value, onPick) {
    const seg = node('div', 'segmented');
    list.forEach((item) => {
      const opt = node('label');
      if (item.aide) opt.title = item.aide;
      const radio = node('input');
      radio.type = 'radio';
      radio.name = name;
      radio.value = item.v;
      radio.checked = item.v === value;
      radio.addEventListener('change', () => onPick(item.v));
      opt.append(radio, node('span', null, item.nom));
      seg.appendChild(opt);
    });
    return seg;
  }

  const speed = node('select');
  speed.name = 'vitesse';
  VITESSES.forEach((s) => {
    const o = node('option', null, s.nom + ' (' + seconds(BASE_MS / s.v) + ')');
    o.value = s.v;
    o.selected = s.v === rate;
    speed.appendChild(o);
  });
  speed.addEventListener('change', () => { rate = Number(speed.value); rebuild(); });
  form.appendChild(row('Vitesse', 'La vidéo exportée aura cette durée.', speed));

  const arrows = segmented('direction', DIRECTIONS, opts.angle, (v) => { opts.angle = v; rebuild(); });
  arrows.classList.add('tr-arrows');
  form.appendChild(row('Direction', null, arrows));

  form.appendChild(row('Densité', 'Nombre de pistes, de points et d\'éclats.',
    segmented('densite', DENSITES, opts.densite, (v) => { opts.densite = v; rebuild(); })));

  // couleurs : mêmes valeurs par défaut que les overlays
  const colors = node('div', 'colors');
  const colorInputs = {};
  [['c1', 'Couleur 1', 'Cyan : côté droit et front'], ['c2', 'Couleur 2', 'Rose : côté gauche et queue']]
    .forEach(([id, nom, aide]) => {
      const label = node('label', 'color');
      const input = node('input');
      input.type = 'color';
      input.value = opts[id];
      input.addEventListener('input', () => { opts[id] = input.value; rebuild(); });
      colorInputs[id] = input;
      const text = node('span');
      text.append(node('b', null, nom), node('span', 'muted small', aide));
      label.append(input, text);
      colors.appendChild(label);
    });
  const reset = node('button', 'link', 'Couleurs d\'origine');
  reset.type = 'button';
  reset.addEventListener('click', () => {
    Object.assign(opts, DEFAUTS);
    colorInputs.c1.value = opts.c1;
    colorInputs.c2.value = opts.c2;
    rebuild();
  });
  const reroll = node('button', 'link', 'Autre tirage');
  reroll.type = 'button';
  reroll.title = 'Change la place des pistes, des points et des coudes';
  reroll.addEventListener('click', () => { opts.seed = (opts.seed * 7919 + 13) % 100000; rebuild(); });
  const links = node('div', 'tr-links');
  links.append(reset, reroll);
  const colorBlock = node('div', 'color-block');
  colorBlock.append(colors, links);
  form.appendChild(colorBlock);

  root.appendChild(form);

  /* ===================== export ===================== */

  const exportBox = node('div', 'tr-export');
  const exportBtn = node('button', null, 'Exporter la vidéo pour OBS');
  exportBtn.type = 'button';
  const fps = node('select');
  fps.setAttribute('aria-label', 'Images par seconde');
  [60, 30].forEach((v) => {
    const o = node('option', null, v + ' images/s');
    o.value = v;
    fps.appendChild(o);
  });
  const progress = node('span', 'form-msg');
  exportBox.append(exportBtn, fps, progress);
  root.appendChild(exportBox);
  root.appendChild(node('p', 'muted small',
    'L\'export prend quelques secondes : garde cet onglet au premier plan jusqu\'à la fin.'));

  // Firefox, Safari : l'aperçu marche, mais pas l'export. On le dit avant le clic, avec
  // l'adresse à ouvrir ailleurs.
  if (!T.canExport()) {
    exportBtn.disabled = true;
    fps.disabled = true;
    const addr = node('code', null, location.origin + '/#transition');
    const note = node('p', 'tr-warn');
    note.append('Ton navigateur ne sait pas fabriquer la vidéo (la transparence serait perdue). ' +
                'Ouvre cette page dans ', node('b', null, 'Chrome'), ' ou ', node('b', null, 'Edge'),
                ' pour l\'exporter : ', addr);
    root.appendChild(note);
  }

  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    fps.disabled = true;
    const wasPlaying = playing;
    setPlaying(false);          // l'aperçu se tait pendant l'export : l'encodeur a toute la place
    progress.dataset.level = '';
    try {
      const blob = await T.exportVideo(engine, {
        durationMs: duration(),
        fps: Number(fps.value),
        onProgress: (k) => { progress.textContent = 'Rendu… ' + Math.round(k * 100) + ' %'; }
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'transition_twitch_kit.webm';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      progress.dataset.level = 'ok';
      progress.textContent = 'Terminé : ' + (blob.size / 1e6).toFixed(1).replace('.', ',') +
                             ' Mo, dans tes téléchargements';
    } catch (err) {
      console.warn(err);
      progress.dataset.level = 'bad';
      progress.textContent = 'Échec de l\'export : ' + (err.message || err);
    } finally {
      exportBtn.disabled = !T.canExport();
      fps.disabled = exportBtn.disabled;
      if (wasPlaying) setPlaying(true);
    }
  });

  /* ===================== dans OBS ===================== */

  const guide = node('div', 'tr-guide');
  guide.appendChild(node('h4', null, 'Dans OBS'));
  const steps = node('ol');
  const obsPoint = node('b', null, '—');
  const li = (...parts) => { const item = node('li'); item.append(...parts); steps.appendChild(item); };
  li('Range la vidéo exportée dans un dossier où elle ne bougera plus : OBS retient son emplacement.');
  li('En bas à droite, dans ', node('b', null, 'Transitions de scène'), ', clique sur ', node('b', null, '+'),
     ' puis ', node('b', null, 'Stinger'), '. Donne-lui un nom, par exemple « Twitch Kit ».');
  li(node('b', null, 'Fichier vidéo'), ' : choisis la vidéo exportée.');
  li(node('b', null, 'Type de point de transition'), ' : ', node('b', null, 'Temps (millisecondes)'),
     ', et mets ', obsPoint, ' dans ', node('b', null, 'Point de transition'), '.');
  li('Laisse ', node('b', null, 'Track Matte'), ' décoché : la transparence est déjà dans la vidéo. ' +
     'Laisse ', node('b', null, 'Précharger la vidéo en mémoire'), ' coché.');
  li('Clique sur ', node('b', null, 'OK'), '. Si tu changes la vitesse ici, exporte à nouveau et ' +
     'mets à jour le point de transition.');
  guide.appendChild(steps);
  root.appendChild(guide);

  rebuild();
};
