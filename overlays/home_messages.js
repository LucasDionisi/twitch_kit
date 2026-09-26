/* Réglages des messages du bot, sur la carte d'une fonctionnalité de la page d'accueil.
 *
 * Construit une seule fois à partir de ce que renvoie le serveur (GET /settings/<id>) :
 * interrupteur général, style (message ou annonce), puis un modèle par événement, avec
 * ses variables cliquables, un bouton « Tester » et un retour au texte par défaut.
 * Enregistré sur POST /setup/<id> ; « Tester » passe par POST /setup/<id>/test avec ce
 * qui est dans le formulaire, même pas encore enregistré.
 *
 * Utilise $, $$, toast et setField de home.js, chargé juste après.
 */
'use strict';

window.buildMessageSettings = function (root, id) {
  let model = null;

  const loading = document.createElement('p');
  loading.className = 'muted small';
  loading.textContent = 'Chargement des réglages…';
  root.appendChild(loading);

  async function post(pathname, data) {
    const res = await fetch(pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.erreur || 'erreur ' + res.status);
    return body;
  }

  // le serveur ne répond pas encore (OBS qui démarre) : on réessaie un peu plus tard
  async function load() {
    try {
      const res = await fetch('/settings/' + id, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      model = data.modele;
      loading.remove();
      const form = build();
      root.appendChild(form);
      fill(form, data.reglages);
    } catch (err) {
      loading.textContent = 'Réglages indisponibles pour l\'instant, nouvel essai…';
      setTimeout(load, 5000);
    }
  }

  /* ===================== construction ===================== */

  function node(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function switchInput(name) {
    const input = node('input', 'switch');
    input.type = 'checkbox';
    input.name = name;
    return input;
  }

  function build() {
    const form = node('form', 'settings');
    form.noValidate = true;

    // interrupteur général
    const master = node('label', 'set-row');
    const masterText = node('span', 'set-text');
    masterText.append(node('b', null, 'Messages activés'),
                      node('span', 'muted small', 'Coupe tout d\'un coup, sans perdre tes textes.'));
    master.append(masterText, switchInput('actif'));
    form.appendChild(master);

    // style
    const style = node('div', 'set-row');
    const styleText = node('span', 'set-text');
    styleText.append(node('b', null, 'Style'),
                     node('span', 'muted small', 'Une annonce est mise en avant, en couleur, dans le chat.'));
    const styleCtrl = node('div', 'set-style');
    const seg = node('div', 'segmented');
    [['message', 'Message'], ['annonce', 'Annonce']].forEach(([value, label]) => {
      const opt = node('label');
      const radio = node('input');
      radio.type = 'radio';
      radio.name = 'style';
      radio.value = value;
      opt.append(radio, node('span', null, label));
      seg.appendChild(opt);
    });
    const color = node('select');
    color.name = 'couleur';
    color.setAttribute('aria-label', 'Couleur de l\'annonce');
    model.couleurs.forEach((c) => {
      const opt = node('option', null, c.nom);
      opt.value = c.id;
      color.appendChild(opt);
    });
    styleCtrl.append(seg, color);
    style.append(styleText, styleCtrl);
    form.appendChild(style);

    const modHint = node('p', 'muted small mod-hint');
    const modCode = node('code', null, '/mod pseudo_du_bot');
    modCode.dataset.field = 'bot-mod';
    modHint.append('Pour les annonces, le bot doit être modérateur de ta chaîne : tape ', modCode,
                   ' dans ton chat. Sinon, il écrit en message normal.');
    form.appendChild(modHint);

    // un groupe par type d'événement, dans l'ordre du serveur
    const groups = new Map();
    model.messages.forEach((m) => {
      if (!groups.has(m.groupe)) {
        const g = node('div', 'msg-group');
        g.appendChild(node('h4', null, m.groupe));
        groups.set(m.groupe, g);
        form.appendChild(g);
      }
      groups.get(m.groupe).appendChild(buildMessage(form, m));
    });

    const foot = node('div', 'form-foot');
    const save = node('button', null, 'Enregistrer');
    save.type = 'submit';
    const msg = node('span', 'form-msg');
    foot.append(save, msg);
    form.appendChild(foot);

    form.addEventListener('input', () => {
      msg.dataset.level = '';
      msg.textContent = 'Modifications non enregistrées';
      syncState(form);
    });
    form.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      msg.dataset.level = '';
      msg.textContent = 'Enregistrement…';
      try {
        const body = await post('/setup/' + id, read(form));
        fill(form, body.reglages);
        msg.dataset.level = 'ok';
        msg.textContent = 'Enregistré';
      } catch (err) {
        msg.dataset.level = 'bad';
        msg.textContent = err.message;
      }
    });
    return form;
  }

  function buildMessage(form, m) {
    const box = node('div', 'msg');
    box.dataset.id = m.id;

    const head = node('div', 'msg-head');
    const toggle = node('label', 'msg-toggle');
    toggle.append(switchInput('on'), node('span', null, m.nom));
    const test = node('button', 'ghost small', 'Tester');
    test.type = 'button';
    test.dataset.test = '';
    test.title = 'Envoie un exemple dans ton chat';
    head.append(toggle, test);

    const area = node('textarea');
    area.rows = 2;
    area.maxLength = model.texteMax;
    area.spellcheck = true;
    area.setAttribute('aria-label', m.groupe + ' — ' + m.nom);

    const foot = node('div', 'msg-foot');
    const chips = node('div', 'chips');
    m.variables.forEach((v) => {
      const chip = node('button', 'chip', '{' + v.nom + '}');
      chip.type = 'button';
      chip.title = v.description;
      chip.addEventListener('click', () => insert(area, '{' + v.nom + '}'));
      chips.appendChild(chip);
    });
    const reset = node('button', 'link', 'Texte par défaut');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      area.value = m.defaut;
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    foot.append(chips, reset);

    test.addEventListener('click', async () => {
      const data = read(form);
      test.disabled = true;
      try {
        const res = await post('/setup/' + id + '/test', {
          id: m.id, texte: area.value, style: data.style, couleur: data.couleur
        });
        toast(data.style === 'annonce' && res.mode !== 'annonce'
          ? 'Envoyé en message normal : l\'annonce a été refusée'
          : 'Envoyé dans ton chat');
      } catch (err) {
        toast(err.message);
      } finally {
        setTimeout(() => { test.disabled = false; }, 3000);
      }
    });

    box.append(head, area, foot);
    return box;
  }

  // insère la variable là où est le curseur, comme si on l'avait tapée
  function insert(area, text) {
    const start = area.selectionStart != null ? area.selectionStart : area.value.length;
    const end = area.selectionEnd != null ? area.selectionEnd : start;
    area.setRangeText(text, start, end, 'end');
    area.focus();
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* ===================== lecture / remplissage ===================== */

  function read(form) {
    const style = $('input[name="style"]:checked', form);
    const data = {
      actif: $('input[name="actif"]', form).checked,
      style: style ? style.value : 'message',
      couleur: $('select[name="couleur"]', form).value,
      messages: {}
    };
    $$('.msg', form).forEach((box) => {
      data.messages[box.dataset.id] = {
        actif: $('input[name="on"]', box).checked,
        texte: $('textarea', box).value
      };
    });
    return data;
  }

  function fill(form, reglages) {
    $('input[name="actif"]', form).checked = reglages.actif;
    $$('input[name="style"]', form).forEach((r) => { r.checked = r.value === reglages.style; });
    $('select[name="couleur"]', form).value = reglages.couleur;
    $$('.msg', form).forEach((box) => {
      const m = reglages.messages[box.dataset.id];
      if (!m) return;
      $('input[name="on"]', box).checked = m.actif;
      $('textarea', box).value = m.texte;
    });
    // le pseudo du bot est connu de /status, déjà chargé la plupart du temps
    if (typeof status !== 'undefined' && status) {
      const bot = status.comptes.bot;
      setField('bot-mod', '/mod ' + (bot.login || bot.pseudoAttendu || 'pseudo_du_bot'));
    }
    syncState(form);
  }

  // ce qui est coupé apparaît estompé, sans être désactivé : on peut préparer ses textes
  function syncState(form) {
    const on = $('input[name="actif"]', form).checked;
    const annonce = $('input[name="style"][value="annonce"]', form).checked;
    form.classList.toggle('all-off', !on);
    $('select[name="couleur"]', form).hidden = !annonce;
    $('.mod-hint', form).hidden = !annonce;
    $$('.msg', form).forEach((box) => {
      box.classList.toggle('off', !$('input[name="on"]', box).checked);
    });
  }

  load();
};
