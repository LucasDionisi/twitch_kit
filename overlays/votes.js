/* Rendu commun des overlays sondage et prédiction (poll.html, prediction.html).
 *
 * VoteOverlay.start('poll' | 'prediction') :
 *  - écoute /<kind>/stream (live.js) : 'config' (réglages de la page d'accueil) et
 *    '<kind>' (état en cours, même format que votes.payload() côté serveur) ;
 *  - ?demo=1 : faux événements en boucle, les réglages arrivent toujours par le flux ;
 *  - ?demo=1 dans un iframe (aperçu de la page d'accueil) : pas de flux, les réglages
 *    arrivent par postMessage à chaque modification, même pas encore enregistrés.
 *
 * Les éléments ne sont construits qu'à l'arrivée d'un nouvel événement ; ensuite seuls
 * largeurs, textes et classes changent, et les transitions CSS font le reste. Un seul
 * minuteur par rôle (chrono, retrait, sortie), toujours annulé avant d'être relancé.
 */
(function () {
  'use strict';

  const LEAVE_MS = 450;          // doit couvrir les animations de sortie des thèmes
  const ENTER_MS = 700;
  const COLS = ['var(--c1)', 'var(--c2)', 'var(--c3)'];

  const KIND_LABELS = {
    poll: { active: 'SONDAGE', ended: 'RÉSULTAT' },
    prediction: { active: 'PRÉDICTION', locked: 'MISES FERMÉES', ended: 'RÉSULTAT', canceled: 'ANNULÉE' }
  };

  // repli le temps que les vrais réglages arrivent
  const DEFAULT_CONFIG = {
    theme: 'circuit',
    couleurs: {
      circuit: { c1: '#35cdff', c2: '#ff2f8e', titres: '#58d6ff' },
      crt: { c1: '#38d9ff', c2: '#ff4f7b', titres: '#ffd23f' }
    },
    taille: 1,
    elements: { chrono: true, stats: true, pied: true },
    textes: {}
  };

  const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
  const plural = (n, word) => fmt(n) + ' ' + word + (Math.abs(n) >= 2 ? 's' : '');

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function start(kind) {
    const $ = (id) => document.getElementById(id);
    const ov = $('ov');
    const rowsEl = $('rows');
    const duelEl = $('duel');

    let config = DEFAULT_CONFIG;
    let current = null;          // dernier état reçu
    let currentId = null;        // événement à l'écran
    let parts = new Map();       // id de choix/issue → éléments à mettre à jour
    let deadline = 0;
    let clockTimer = null;
    let hideTimer = null;
    let leaveTimer = null;
    let enterTimer = null;

    const items = (data) => (kind === 'poll' ? data.choices : data.outcomes) || [];
    const isResult = (data) => data.phase === 'ended' || data.phase === 'canceled';
    // la prédiction à deux issues se joue en face à face ; au-delà, liste comme le sondage
    const isDuel = (data) => kind === 'prediction' && items(data).length === 2;

    /* ===================== construction ===================== */

    function buildRow(item, i) {
      const row = el('div', 'row');
      row.style.setProperty('--col', COLS[i % COLS.length]);
      const top = el('div', 'row-top');
      const label = el('span', 'label');
      const name = el('span', 'name');
      const votes = el('span', 'votes');
      label.append(name, el('span', 'win-tag', 'GAGNANT'), votes);
      const pct = el('span', 'pct');
      top.append(label, pct);
      const bar = el('div', 'bar');
      const fill = el('div', 'fill');
      bar.appendChild(fill);
      row.append(top, bar);
      rowsEl.appendChild(row);
      return { row: row, name: name, votes: votes, pct: pct, fill: fill };
    }

    function build(data) {
      rowsEl.textContent = '';
      parts = new Map();
      const duel = isDuel(data);
      rowsEl.hidden = duel;
      duelEl.hidden = !duel;
      if (!duel) {
        items(data).forEach((item, i) => parts.set(item.id, buildRow(item, i)));
        return;
      }
      ['a', 'b'].forEach((side, i) => {
        const box = duelEl.querySelector('.side.' + side);
        box.style.setProperty('--col', COLS[i]);
        parts.set(items(data)[i].id, {
          row: box,
          name: box.querySelector('.name-text'),
          votes: box.querySelector('.sub'),
          pct: duelEl.querySelector('.stats .' + side),
          fill: duelEl.querySelector('.tug > .' + side)
        });
      });
    }

    /* ===================== mise à jour ===================== */

    function footText(data) {
      const t = config.textes || {};
      if (kind === 'poll') return data.phase === 'ended' ? t.fin : t.encours;
      if (data.phase === 'locked') return t.verrou;
      if (data.phase === 'canceled') return t.annule;
      if (data.phase === 'ended') {
        const win = items(data).find((o) => (data.leaderIds || []).includes(o.id));
        return win ? plural(win.users, 'gagnant') : '';
      }
      return t.encours;
    }

    function update(data) {
      const result = isResult(data);
      const leaders = data.leaderIds || [];
      ov.classList.toggle('result', result);
      $('kind').textContent = KIND_LABELS[kind][data.phase] || '';
      $('title').textContent = data.title;

      items(data).forEach((item) => {
        const p = parts.get(item.id);
        if (!p) return;
        p.name.textContent = item.title;
        p.pct.textContent = item.percent + '%';
        p.fill.style.width = item.percent + '%';
        p.row.classList.toggle('top1', !result && leaders.includes(item.id));
        p.row.classList.toggle('winner', result && leaders.includes(item.id));
        p.row.classList.toggle('loser', result && leaders.length > 0 && !leaders.includes(item.id));
        if (kind === 'poll') {
          p.votes.textContent = plural(item.votes, 'vote');
        } else if (isDuel(data)) {
          p.votes.textContent = plural(item.users, 'parieur') + ' · ' + fmt(item.points) + ' pts';
        } else {
          p.votes.textContent = fmt(item.points) + ' pts';
        }
      });

      if (isDuel(data)) {
        // personne n'a misé : moitié-moitié plutôt qu'une jauge vide
        const a = data.totalPoints ? items(data)[0].percent : 50;
        duelEl.querySelector('.tug > .a').style.width = a + '%';
        duelEl.querySelector('.tug > .b').style.width = (100 - a) + '%';
        duelEl.querySelector('.meet').style.left = a + '%';
      }

      $('foot-left').textContent = kind === 'poll'
        ? plural(data.totalVotes, 'vote')
        : fmt(data.totalPoints) + ' points en jeu';
      $('foot-right').textContent = footText(data) || '';
    }

    /* ===================== chrono ===================== */

    function showClock() {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      $('time').textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
      if (!left) stopClock();
    }

    function stopClock() {
      clearInterval(clockTimer);
      clockTimer = null;
    }

    function startClock(remainingMs) {
      stopClock();
      deadline = Date.now() + remainingMs;
      showClock();
      clockTimer = setInterval(showClock, 1000);
    }

    /* ===================== apparition / retrait ===================== */

    function show() {
      clearTimeout(leaveTimer);
      clearTimeout(enterTimer);
      ov.hidden = false;
      ov.classList.remove('leaving', 'entering');
      void ov.offsetWidth;   // rejoue l'animation d'entrée
      ov.classList.add('entering');
      enterTimer = setTimeout(() => ov.classList.remove('entering'), ENTER_MS);
    }

    function hide() {
      clearTimeout(hideTimer);
      clearTimeout(enterTimer);
      stopClock();
      currentId = null;
      ov.classList.remove('entering');
      ov.classList.add('leaving');
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        ov.hidden = true;
        ov.classList.remove('leaving');
      }, LEAVE_MS);
    }

    function render(data) {
      current = data && data.phase !== 'gone' ? data : null;
      if (!current) {
        if (currentId) hide();
        return;
      }
      clearTimeout(hideTimer);
      // nouvel identifiant (ou passage en face à face) : on reconstruit et on rejoue l'entrée
      if (data.id !== currentId) {
        currentId = data.id;
        build(data);
        show();
      }
      update(data);

      $('timer').hidden = data.phase !== 'active';
      if (data.phase === 'active') startClock(data.remainingMs || 0);
      else stopClock();

      // le résultat reste le temps réglé, puis la carte se retire seule
      if (isResult(data)) hideTimer = setTimeout(hide, Math.max(data.holdMs || 0, 1000));
    }

    /* ===================== réglages ===================== */

    function applyConfig(incoming) {
      config = Object.assign({}, DEFAULT_CONFIG, incoming || {});
      const theme = config.theme === 'crt' ? 'crt' : 'circuit';
      const colors = Object.assign({}, DEFAULT_CONFIG.couleurs[theme], (config.couleurs || {})[theme]);
      const elements = Object.assign({}, DEFAULT_CONFIG.elements, config.elements);

      document.body.className = [
        'theme-' + theme,
        'kind-' + kind,
        elements.chrono ? '' : 'no-chrono',
        elements.stats ? '' : 'no-stats',
        elements.pied ? '' : 'no-pied'
      ].join(' ').trim();

      const root = document.documentElement.style;
      root.setProperty('--c1', colors.c1);
      root.setProperty('--c2', colors.c2);
      root.setProperty('--titres', colors.titres);
      root.setProperty('--scale', Number(config.taille) || 1);
      // les textes du pied changent tout de suite, même en plein événement
      if (current) update(current);
    }

    applyConfig(null);

    /* ===================== sources ===================== */

    const params = new URLSearchParams(location.search);
    const demo = params.get('demo') === '1';
    const embedded = window.parent !== window;

    if (demo && embedded) {
      // aperçu de la page d'accueil : réglages en direct, même non enregistrés
      window.addEventListener('message', (evt) => {
        if (evt.origin !== location.origin || !evt.data || !evt.data.twitchKitConfig) return;
        applyConfig(evt.data.twitchKitConfig);
      });
    } else {
      // ?demo=1 hors aperçu : le flux ne sert qu'aux réglages, et ne compte pas comme source OBS
      const source = Live.connect('/' + kind + '/stream' + (demo ? '?demo=1' : ''));
      source.addEventListener('config', (evt) => {
        try {
          applyConfig(JSON.parse(evt.data));
        } catch (err) {
          console.warn('réglages illisibles :', err);
        }
      });
      if (!demo) {
        source.addEventListener(kind, (evt) => {
          try {
            render(JSON.parse(evt.data));
          } catch (err) {
            console.warn('état illisible :', err);
          }
        });
      }
    }

    if (demo) setTimeout(() => (kind === 'poll' ? demoPoll : demoPrediction)(render, 0), 400);
  }

  /* ===================== démo ===================== */
  // Faux événements qui passent par le même render() qu'un vrai, au même format que
  // votes.payload() côté serveur. Tourne en boucle, pour l'aperçu.

  const DEMO_HOLD_MS = 5000;
  const DEMO_GAP_MS = 1200;

  function percents(list, key) {
    const total = list.reduce((sum, x) => sum + x[key], 0);
    list.forEach((x) => { x.percent = total ? Math.round(x[key] * 100 / total) : 0; });
    return total;
  }

  function leaders(list, key) {
    const best = Math.max(...list.map((x) => x[key]));
    return best > 0 ? list.filter((x) => x[key] === best).map((x) => x.id) : [];
  }

  const DEMO_POLLS = [
    ['On joue à quoi ce soir ?', ['Hollow Knight', 'Celeste', 'Hades']],
    ['Pizza ou sushis pour la pause ?', ['Pizza', 'Sushis']],
    ['Le prochain boss, on le tente…', ['Sans soin', 'Normalement', 'Avec le chat', 'On fuit']]
  ];

  function demoPoll(render, n) {
    const [title, labels] = DEMO_POLLS[n % DEMO_POLLS.length];
    const id = 'demo-poll-' + n;
    const weights = labels.map(() => 0.3 + Math.random());
    const choices = labels.map((t, i) => ({ id: id + '-' + i, title: t, votes: 0, percent: 0 }));
    const runMs = 10000;
    const endsAt = Date.now() + runMs;

    function payload(phase) {
      const totalVotes = percents(choices, 'votes');
      return {
        phase: phase, id: id, title: title,
        choices: choices.map((c) => Object.assign({}, c)),
        totalVotes: totalVotes,
        leaderIds: leaders(choices, 'votes'),
        durationMs: runMs,
        remainingMs: Math.max(endsAt - Date.now(), 0),
        holdMs: DEMO_HOLD_MS
      };
    }

    render(payload('active'));
    const tick = setInterval(() => {
      if (Date.now() >= endsAt) {
        clearInterval(tick);
        render(payload('ended'));
        setTimeout(() => demoPoll(render, n + 1), DEMO_HOLD_MS + DEMO_GAP_MS);
        return;
      }
      choices.forEach((c, i) => { c.votes += Math.round(Math.random() * 5 * weights[i]); });
      render(payload('active'));
    }, 900);
  }

  const DEMO_PREDICTIONS = [
    ['Je gagne cette partie ?', ['Oui', 'Non']],
    ['Dans quel top je finis ?', ['Top 1', 'Top 5', 'Top 10']]
  ];

  function demoPrediction(render, n) {
    const [title, labels] = DEMO_PREDICTIONS[n % DEMO_PREDICTIONS.length];
    const id = 'demo-pred-' + n;
    const weights = labels.map(() => 0.3 + Math.random());
    const outcomes = labels.map((t, i) => ({ id: id + '-' + i, title: t, points: 0, users: 0, percent: 0 }));
    const runMs = 8000;
    const endsAt = Date.now() + runMs;

    function payload(phase, winner) {
      const totalPoints = percents(outcomes, 'points');
      return {
        phase: phase, id: id, title: title,
        outcomes: outcomes.map((o) => Object.assign({}, o)),
        totalPoints: totalPoints,
        totalUsers: outcomes.reduce((sum, o) => sum + o.users, 0),
        leaderIds: winner ? [winner] : leaders(outcomes, 'points'),
        durationMs: runMs,
        remainingMs: Math.max(endsAt - Date.now(), 0),
        holdMs: DEMO_HOLD_MS
      };
    }

    render(payload('active'));
    const tick = setInterval(() => {
      if (Date.now() < endsAt) {
        outcomes.forEach((o, i) => {
          const bettors = Math.round(Math.random() * 2 * weights[i]);
          o.users += bettors;
          o.points += bettors * (100 + Math.round(Math.random() * 900));
        });
        render(payload('active'));
        return;
      }
      clearInterval(tick);
      render(payload('locked'));
      const winner = outcomes[Math.floor(Math.random() * outcomes.length)].id;
      setTimeout(() => {
        render(payload('ended', winner));
        setTimeout(() => demoPrediction(render, n + 1), DEMO_HOLD_MS + DEMO_GAP_MS);
      }, 3000);
    }, 900);
  }

  window.VoteOverlay = { start: start };
})();
