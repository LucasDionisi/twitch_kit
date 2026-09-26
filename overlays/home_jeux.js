/* Réglages « sources selon le jeu », sur la page de la fonctionnalité game_sources.
 *
 * Une carte par règle : le nom de la source OBS (proposé depuis la liste des sources
 * qu'OBS a envoyée), puis les jeux en pastilles. Un jeu s'ajoute en tapant son .exe, ou
 * en le choisissant parmi les programmes ouverts (GET /game_sources/choices, relu à
 * chaque fois qu'on ouvre le champ). Enregistré sur POST /setup/game_sources.
 *
 * L'état en direct (affichée / masquée) vient de /status, relayé par home.js avec
 * l'événement « twitchkit:status ». Utilise $, $$ et toast de home.js, chargé juste après.
 */
'use strict';

window.buildGameSourceSettings = function (root, f) {
  const CHOICES_MIN_MS = 4000;   // pas plus d'un PowerShell toutes les 4 s

  let model = null;
  let form = null;
  let list = null;
  let addRule = null;
  let saved = [];              // règles enregistrées, pour savoir quel état afficher
  let live = {};               // source → { visible, jeu } d'après /status
  let choicesAt = 0;

  const loading = node('p', 'muted small', 'Chargement des réglages…');
  root.appendChild(loading);

  // listes partagées par toutes les cartes : sources d'OBS, programmes ouverts
  const sourcesList = node('datalist');
  sourcesList.id = 'gs-sources';
  const programsList = node('datalist');
  programsList.id = 'gs-programs';
  root.append(sourcesList, programsList);

  function node(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  async function load() {
    try {
      const res = await fetch('/settings/' + f.id, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      model = data.modele;
      loading.remove();
      fillSources(model.sourcesObs);
      form = build();
      root.appendChild(form);
      fill(data.reglages);
    } catch (err) {
      loading.textContent = 'Réglages indisponibles pour l\'instant, nouvel essai…';
      setTimeout(load, 5000);
    }
  }

  /* ===================== listes de choix ===================== */

  function fillSources(names) {
    sourcesList.replaceChildren(...names.map((name) => {
      const opt = node('option');
      opt.value = name;
      return opt;
    }));
  }

  async function refreshChoices() {
    if (Date.now() - choicesAt < CHOICES_MIN_MS) return;
    choicesAt = Date.now();
    try {
      const res = await fetch('/game_sources/choices', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erreur || 'erreur ' + res.status);
      if (data.sources.length) fillSources(data.sources);
      programsList.replaceChildren(...data.programmes.map((p) => {
        const opt = node('option');
        opt.value = p.exe;
        opt.label = p.titre + ' — ' + p.exe;
        return opt;
      }));
      if (data.erreur) toast(data.erreur);
    } catch (err) {
      /* on garde les listes précédentes : la saisie à la main reste possible */
    }
  }

  /* ===================== construction ===================== */

  function build() {
    const el = node('form', 'settings gs');
    el.noValidate = true;

    el.appendChild(node('p', 'muted small gs-intro',
      'Pour chaque source, les jeux pendant lesquels elle s\'affiche. Le reste du temps, ' +
      'elle est masquée. Lance ton jeu une fois : il apparaîtra dans la liste des ' +
      'programmes ouverts.'));

    list = node('div', 'gs-list');
    el.appendChild(list);

    addRule = node('button', 'ghost small gs-add-rule', '+ Ajouter une source');
    addRule.type = 'button';
    addRule.addEventListener('click', () => {
      const card = ruleCard({ source: '', jeux: [] });
      list.appendChild(card);
      $('input.gs-source', card).focus();
      changed();
    });
    el.appendChild(addRule);

    const foot = node('div', 'form-foot');
    const save = node('button', null, 'Enregistrer');
    save.type = 'submit';
    const msg = node('span', 'form-msg');
    foot.append(save, msg);
    el.appendChild(foot);
    el.msg = msg;

    el.addEventListener('input', (evt) => {
      // le champ « ajouter un jeu » n'est pas un réglage tant qu'on n'a pas validé
      if (!evt.target.classList.contains('gs-new')) changed();
    });
    el.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const regles = read();
      const orphan = regles.find((r) => !r.source && r.jeux.length);
      if (orphan) {
        msg.dataset.level = 'bad';
        msg.textContent = 'Donne un nom de source à chaque carte qui a des jeux.';
        return;
      }
      msg.dataset.level = '';
      msg.textContent = 'Enregistrement…';
      try {
        const res = await fetch('/setup/' + f.id, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regles: regles.filter((r) => r.source) })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.erreur || 'erreur ' + res.status);
        fill(body.reglages);
        msg.dataset.level = 'ok';
        msg.textContent = 'Enregistré';
      } catch (err) {
        msg.dataset.level = 'bad';
        msg.textContent = err.message;
      }
    });
    return el;
  }

  function ruleCard(rule) {
    const card = node('div', 'gs-rule');

    const head = node('div', 'gs-head');
    const source = node('input', 'gs-source');
    source.value = rule.source;
    source.placeholder = 'Nom de la source dans OBS, ex. Manette';
    source.maxLength = model.sourceMax;
    source.spellcheck = false;
    source.setAttribute('list', 'gs-sources');
    source.setAttribute('aria-label', 'Source OBS');
    source.addEventListener('focus', refreshChoices);
    const badge = node('span', 'gs-badge');
    badge.hidden = true;
    const remove = node('button', 'link', 'Retirer');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      card.remove();
      changed();
    });
    head.append(source, badge, remove);

    const games = node('div', 'gs-games');
    rule.jeux.forEach((exe) => games.appendChild(gameChip(exe)));

    const add = node('div', 'gs-add');
    const input = node('input', 'gs-new');
    input.placeholder = 'Ajouter un jeu : choisis-le ou tape son .exe';
    input.spellcheck = false;
    input.setAttribute('list', 'gs-programs');
    input.setAttribute('aria-label', 'Jeu à ajouter');
    input.addEventListener('focus', refreshChoices);
    const addBtn = node('button', 'ghost small', 'Ajouter');
    addBtn.type = 'button';
    const commit = () => {
      if (addGame(games, input.value)) input.value = '';
      input.focus();
    };
    addBtn.addEventListener('click', commit);
    input.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        commit();
      }
    });
    // un choix dans la liste déroulante l'ajoute directement, sans bouton
    input.addEventListener('input', (evt) => {
      if (evt.inputType === 'insertReplacementText' || !evt.inputType) {
        if (Array.from(programsList.options).some((o) => o.value === input.value)) commit();
      }
    });
    add.append(input, addBtn);

    card.append(head, games, add);
    card.badge = badge;
    return card;
  }

  function gameChip(exe) {
    const chip = node('span', 'gs-game');
    chip.dataset.exe = exe;
    const x = node('button', 'gs-x', '×');
    x.type = 'button';
    x.title = 'Retirer ' + exe;
    x.setAttribute('aria-label', 'Retirer ' + exe);
    x.addEventListener('click', () => {
      chip.remove();
      changed();
    });
    chip.append(node('span', null, exe), x);
    return chip;
  }

  // même nettoyage que le serveur : un chemin ou un nom sans .exe sont acceptés
  function addGame(games, value) {
    let exe = String(value || '').trim().split(/[\\/]/).pop().trim();
    if (!exe) return false;
    if (!/\.exe$/i.test(exe)) exe += '.exe';
    if (/[<>:"|?*]/.test(exe) || exe.length > 100) {
      toast('Nom de programme invalide');
      return false;
    }
    if ($$('.gs-game', games).some((c) => c.dataset.exe.toLowerCase() === exe.toLowerCase())) {
      toast(exe + ' est déjà dans la liste');
      return true;
    }
    if ($$('.gs-game', games).length >= model.jeuxMax) {
      toast('Pas plus de ' + model.jeuxMax + ' jeux par source');
      return false;
    }
    games.appendChild(gameChip(exe));
    changed();
    return true;
  }

  /* ===================== lecture / remplissage ===================== */

  function read() {
    return $$('.gs-rule', list).map((card) => ({
      source: $('input.gs-source', card).value.trim(),
      jeux: $$('.gs-game', card).map((c) => c.dataset.exe)
    }));
  }

  function fill(reglages) {
    saved = reglages.regles;
    const regles = saved.length ? saved : [{ source: '', jeux: [] }];
    list.replaceChildren(...regles.map(ruleCard));
    sync();
  }

  function changed() {
    form.msg.dataset.level = '';
    form.msg.textContent = 'Modifications non enregistrées';
    sync();
  }

  // badge « Affichée / Masquée » seulement pour une règle enregistrée telle quelle
  function sync() {
    const cards = $$('.gs-rule', list);
    addRule.hidden = cards.length >= model.reglesMax;
    cards.forEach((card) => {
      const name = $('input.gs-source', card).value.trim();
      const st = live[name];
      const known = st && saved.some((r) => r.source === name && r.jeux.length);
      card.badge.hidden = !known;
      if (!known) return;
      card.badge.dataset.on = st.visible ? '1' : '0';
      card.badge.textContent = st.visible ? 'Affichée' : 'Masquée';
      card.badge.title = st.visible ? st.jeu + ' est lancé' : 'Aucun de ces jeux n\'est lancé';
    });
  }

  document.addEventListener('twitchkit:status', (evt) => {
    const st = evt.detail.fonctionnalites && evt.detail.fonctionnalites[f.id];
    live = (st && st.sources) || {};
    if (form) sync();
  });

  load();
};
