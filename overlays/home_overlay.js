/* Réglages d'apparence d'un overlay, sur sa page de la page d'accueil.
 *
 * Construit une seule fois à partir de ce que renvoie le serveur (GET /settings/<id>) :
 * aperçu en direct (l'overlay en ?demo=1 dans un iframe), thème, couleurs, taille,
 * durée du résultat, éléments affichés et textes. Chaque modification est envoyée à
 * l'aperçu par postMessage, avant même d'être enregistrée (POST /setup/<id>).
 *
 * Les couleurs sont gardées par thème : passer d'un thème à l'autre ne perd rien.
 * Utilise $, $$ et toast de home.js, chargé juste après.
 */
'use strict';

window.buildOverlaySettings = function (root, f) {
  let model = null;
  let reglages = null;     // copie de travail, couleurs de tous les thèmes comprises
  let frame = null;

  const loading = document.createElement('p');
  loading.className = 'muted small';
  loading.textContent = 'Chargement des réglages…';
  root.appendChild(loading);

  function node(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  // le serveur ne répond pas encore (OBS qui démarre) : on réessaie un peu plus tard
  async function load() {
    try {
      const res = await fetch('/settings/' + f.id, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      model = data.modele;
      reglages = JSON.parse(JSON.stringify(data.reglages));
      loading.remove();
      root.append(buildPreview(), build());
    } catch (err) {
      loading.textContent = 'Réglages indisponibles pour l\'instant, nouvel essai…';
      setTimeout(load, 5000);
    }
  }

  /* ===================== aperçu ===================== */

  // l'overlay à sa taille OBS, réduit pour tenir dans la carte
  function buildPreview() {
    const box = node('div', 'preview');
    frame = node('iframe');
    frame.title = 'Aperçu de ' + f.nom;
    frame.src = f.url + '?demo=1';
    frame.width = f.taille[0];
    frame.height = f.taille[1];
    frame.addEventListener('load', sendPreview);
    box.appendChild(frame);
    box.appendChild(node('span', 'preview-tag', 'Aperçu — faux événements en boucle'));

    // mise à l'échelle au redimensionnement de la carte, sans sonder
    const fit = () => {
      const k = Math.min(1, box.clientWidth / f.taille[0]);
      frame.style.transform = 'scale(' + k + ')';
    };
    new ResizeObserver(fit).observe(box);
    return box;
  }

  function sendPreview() {
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ twitchKitConfig: reglages }, location.origin);
  }

  /* ===================== formulaire ===================== */

  function row(title, help, control) {
    const r = node('div', 'set-row');
    const t = node('span', 'set-text');
    t.appendChild(node('b', null, title));
    if (help) t.appendChild(node('span', 'muted small', help));
    r.append(t, control);
    return r;
  }

  function switchInput(name) {
    const input = node('input', 'switch');
    input.type = 'checkbox';
    input.name = name;
    return input;
  }

  function range(name, b, format) {
    const wrap = node('div', 'range');
    const input = node('input');
    input.type = 'range';
    input.name = name;
    input.min = b.min;
    input.max = b.max;
    input.step = b.pas || 1;
    const value = node('output', 'range-value');
    const show = () => { value.textContent = format(Number(input.value)); };
    input.addEventListener('input', show);
    wrap.append(input, value);
    wrap.show = show;
    return wrap;
  }

  function build() {
    const form = node('form', 'settings');
    form.noValidate = true;

    // thème
    const seg = node('div', 'segmented');
    model.themes.forEach((t) => {
      const opt = node('label');
      const radio = node('input');
      radio.type = 'radio';
      radio.name = 'theme';
      radio.value = t.id;
      opt.append(radio, node('span', null, t.nom));
      seg.appendChild(opt);
    });
    form.appendChild(row('Thème', 'Chaque thème garde ses propres couleurs.', seg));

    // couleurs du thème choisi
    const colors = node('div', 'colors');
    model.couleurs.forEach((c) => {
      const label = node('label', 'color');
      const input = node('input');
      input.type = 'color';
      input.name = 'couleur-' + c.id;
      const text = node('span');
      text.append(node('b', null, c.nom), node('span', 'muted small', c.aide));
      label.append(input, text);
      colors.appendChild(label);
    });
    const reset = node('button', 'link', 'Couleurs d\'origine');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      const theme = model.themes.find((t) => t.id === reglages.theme);
      reglages.couleurs[reglages.theme] = Object.assign({}, theme.couleurs);
      fill(form);
      changed(form);
    });
    const colorBlock = node('div', 'color-block');
    colorBlock.append(colors, reset);
    form.appendChild(colorBlock);

    // taille et durée
    const size = range('taille', model.taille, (v) => Math.round(v * 100) + ' %');
    form.appendChild(row('Taille', null, size));
    const hold = range('resultat', model.resultat, (v) => v + ' s');
    form.appendChild(row('Durée du résultat', 'Combien de temps le résultat reste à l\'écran.', hold));

    // éléments affichés
    const elements = node('div', 'msg-group');
    elements.appendChild(node('h4', null, 'Éléments affichés'));
    model.elements.forEach((e) => {
      const label = node('label', 'set-row');
      label.append(node('span', null, e.nom), switchInput('el-' + e.id));
      elements.appendChild(label);
    });
    form.appendChild(elements);

    // textes
    const textes = node('div', 'msg-group');
    textes.appendChild(node('h4', null, 'Textes'));
    model.textes.forEach((t) => {
      const label = node('label', 'text-field');
      const input = node('input');
      input.name = 'texte-' + t.id;
      input.maxLength = model.texteMax;
      input.placeholder = t.defaut;
      label.append(node('span', null, t.nom), input);
      textes.appendChild(label);
    });
    form.appendChild(textes);

    const foot = node('div', 'form-foot');
    const save = node('button', null, 'Enregistrer');
    save.type = 'submit';
    const msg = node('span', 'form-msg');
    foot.append(save, msg);
    form.appendChild(foot);

    form.ranges = [size, hold];
    form.msg = msg;
    fill(form);

    form.addEventListener('input', (evt) => {
      // changer de thème recharge ses couleurs dans les sélecteurs
      if (evt.target.name === 'theme') {
        reglages.theme = evt.target.value;
        fill(form);
      }
      read(form);
      changed(form);
    });

    form.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      read(form);
      msg.dataset.level = '';
      msg.textContent = 'Enregistrement…';
      try {
        const res = await fetch('/setup/' + f.id, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reglages)
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.erreur || 'erreur ' + res.status);
        reglages = body.reglages;
        fill(form);
        sendPreview();
        msg.dataset.level = 'ok';
        msg.textContent = 'Enregistré : les overlays ouverts dans OBS changent tout de suite';
      } catch (err) {
        msg.dataset.level = 'bad';
        msg.textContent = err.message;
      }
    });
    return form;
  }

  function changed(form) {
    form.msg.dataset.level = '';
    form.msg.textContent = 'Modifications non enregistrées';
    sendPreview();
  }

  /* ===================== lecture / remplissage ===================== */

  function fill(form) {
    $$('input[name="theme"]', form).forEach((r) => { r.checked = r.value === reglages.theme; });
    const colors = reglages.couleurs[reglages.theme];
    model.couleurs.forEach((c) => { $('input[name="couleur-' + c.id + '"]', form).value = colors[c.id]; });
    $('input[name="taille"]', form).value = reglages.taille;
    $('input[name="resultat"]', form).value = reglages.resultat;
    form.ranges.forEach((r) => r.show());
    model.elements.forEach((e) => { $('input[name="el-' + e.id + '"]', form).checked = reglages.elements[e.id]; });
    // texte par défaut affiché en indication : le champ vide garde le défaut
    model.textes.forEach((t) => {
      const value = reglages.textes[t.id];
      $('input[name="texte-' + t.id + '"]', form).value = value === t.defaut ? '' : value;
    });
  }

  function read(form) {
    const colors = {};
    model.couleurs.forEach((c) => { colors[c.id] = $('input[name="couleur-' + c.id + '"]', form).value; });
    reglages.couleurs[reglages.theme] = colors;
    reglages.taille = Number($('input[name="taille"]', form).value);
    reglages.resultat = Number($('input[name="resultat"]', form).value);
    model.elements.forEach((e) => { reglages.elements[e.id] = $('input[name="el-' + e.id + '"]', form).checked; });
    model.textes.forEach((t) => {
      reglages.textes[t.id] = $('input[name="texte-' + t.id + '"]', form).value.trim() || t.defaut;
    });
  }

  load();
};
