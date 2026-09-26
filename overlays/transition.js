/* Transition de scène « néon circuit » : le moteur de rendu et d'export.
 *
 * Un panneau de verre sombre à trame LED traverse l'écran, bords en biseau cernés de néon,
 * pistes de circuit qui s'allument dedans ; il couvre tout l'écran un instant, et OBS change
 * de scène derrière lui (transition « Stinger »). Pendant le live, OBS ne fait que lire la
 * vidéo exportée ici : aucun coût, rien qui puisse planter.
 *
 * Le rendu est une fonction pure du temps (renderFrame(ctx, t), t de 0 à 1) avec un aléatoire
 * à graine fixe : l'aperçu et l'export donnent exactement les mêmes images.
 * Aucun DOM de page ici : la page de la tuile (home_transition.js) fournit les réglages.
 *
 * Exposé : TwitchKitTransition.create({ c1, c2, angle, densite, seed }) → moteur,
 *          TwitchKitTransition.exportVideo(moteur, { durationMs, fps, onProgress }) → Blob WebM.
 */
'use strict';

(function () {
  const W = 1920, H = 1080;
  const TAU = Math.PI * 2;

  /* ===================== outils ===================== */

  // aléatoire à graine fixe (mulberry32) : l'aperçu et l'export tirent les mêmes éléments
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // hasard sans état, pour le scintillement : même (a, b) → même valeur, à chaque image
  function hash(a, b) {
    let h = Math.imul(a ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(b + 0x7F4A7C15, 0xC2B2AE35);
    h = Math.imul(h ^ (h >>> 16), 0x45D9F3B);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }

  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a)); return k * k * (3 - 2 * k); };
  const easeInOut = (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

  // « #35cdff » → « 53, 205, 255 », pour composer des rgba()
  function rgbOf(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    const n = m ? parseInt(m[1], 16) : 0xffffff;
    return ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255);
  }

  function create(opts) {
    const o = Object.assign({ c1: '#35cdff', c2: '#ff2f8e', angle: -30, densite: 1, seed: 7 }, opts);
    const C1 = rgbOf(o.c1), C2 = rgbOf(o.c2);
    const col = (c, a) => 'rgba(' + c + ', ' + a + ')';
    const rad = o.angle * Math.PI / 180;

    /* ===================== chronologie =====================
       Le front du panneau (lead) monte du bas jusqu'au-dessus de l'écran, puis sa queue (trail)
       fait le même trajet un peu plus tard. Entre les deux, l'écran est entièrement couvert :
       c'est dans ce creux qu'OBS change de scène.

       Le panneau est dessiné dans un repère « virtuel » où il monte tout droit, puis ce repère est
       tourné de l'angle choisi autour du centre de l'écran. Le repère est agrandi (VW × VH) pour
       que l'écran tourné tienne dedans. Le décor du panneau (trame, pistes, pluie de points) est
       lui dessiné droit, dans le repère de l'écran : un circuit reste horizontal et vertical. */

    const ac = Math.abs(Math.cos(rad)), as = Math.abs(Math.sin(rad));
    const VW = W * ac + H * as;
    const VH = W * as + H * ac;
    // départ et arrivée juste hors de l'écran (profil ±90 et halos compris) : pas d'image vide
    const LEAD = { from: VH + 150, to: -220, t0: 0.00, t1: 0.44 };
    const TRAIL = { from: VH + 200, to: -190, t0: 0.44, t1: 1.00 };

    // écran → repère virtuel (rotation inverse autour du centre)
    const icos = Math.cos(-rad), isin = Math.sin(-rad);
    function toVirtual(x, y) {
      const dx = x - W / 2, dy = y - H / 2;
      return [VW / 2 + dx * icos - dy * isin, VH / 2 + dx * isin + dy * icos];
    }

    function setVirtual(ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(W / 2, H / 2);
      ctx.rotate(rad);
      ctx.translate(-VW / 2, -VH / 2);
    }

    function edgeBase(e, t) {
      // moitié linéaire, moitié ease-in-out : ça part tout de suite, sans à-coup
      const k = clamp((t - e.t0) / (e.t1 - e.t0));
      return lerp(e.from, e.to, lerp(k, easeInOut(k), 0.5));
    }

    const r = rng(o.seed);
    const n = (k, scale) => Math.max(1, Math.round(k * scale * o.densite));
    const along = VW / W;

    /* ===================== bords en biseau =====================
       Paliers plats reliés par des pans à 45°, comme les coupes des cadres du stream.
       Le profil est une ligne brisée : ses sommets servent aussi de nœuds de circuit. */

    function profile() {
      const pts = [];
      let x = -60, level = lerp(-50, 50, r());
      pts.push([x, level]);
      while (x < VW + 60) {
        x += 220 + r() * 380;
        const next = clamp(level + (r() < 0.5 ? -1 : 1) * (50 + r() * 80), -90, 90);
        pts.push([x, level]);
        x += Math.abs(next - level);        // pente à 45°
        pts.push([x, next]);
        level = next;
      }
      pts.push([x + 60, level]);
      return pts;
    }

    function profileAt(pts, x) {
      if (x <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        if (x <= x1) {
          const [x0, y0] = pts[i - 1];
          return x1 === x0 ? y1 : lerp(y0, y1, (x - x0) / (x1 - x0));
        }
      }
      return pts[pts.length - 1][1];
    }

    const leadProfile = profile();
    const trailProfile = profile();
    const leadY = (x, t) => edgeBase(LEAD, t) + profileAt(leadProfile, x);
    const trailY = (x, t) => edgeBase(TRAIL, t) + profileAt(trailProfile, x);

    /* ===================== sprites ===================== */

    // nœud de circuit : anneau néon, cœur plein, halo (comme le nœud du chrono des overlays)
    function nodeSprite(tint) {
      const S = 64, cx = S / 2;
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const g2 = cv.getContext('2d');
      const g = g2.createRadialGradient(cx, cx, 6, cx, cx, cx);
      g.addColorStop(0, col(tint, 0.55));
      g.addColorStop(1, col(tint, 0));
      g2.fillStyle = g;
      g2.fillRect(0, 0, S, S);
      g2.lineWidth = 3;
      g2.strokeStyle = col(tint, 1);
      g2.beginPath(); g2.arc(cx, cx, 11, 0, TAU); g2.stroke();
      g2.fillStyle = '#0a0812';
      g2.beginPath(); g2.arc(cx, cx, 9.5, 0, TAU); g2.fill();
      g2.fillStyle = 'rgba(255, 255, 255, 0.95)';
      g2.beginPath(); g2.arc(cx, cx, 4.5, 0, TAU); g2.fill();
      return cv;
    }
    const nodes = { c1: nodeSprite(C1), c2: nodeSprite(C2) };

    // trame de points LED, comme le fond des panneaux des overlays
    const dots = document.createElement('canvas');
    dots.width = dots.height = 8;
    {
      const g2 = dots.getContext('2d');
      g2.fillStyle = 'rgba(255, 255, 255, 0.075)';
      g2.beginPath(); g2.arc(4, 4, 1.25, 0, TAU); g2.fill();
    }
    let dotPattern = null;

    function drawNode(ctx, sprite, x, y, size, alpha) {
      if (alpha <= 0.005) return;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    }

    /* ===================== tirage du décor =====================
       Couleur selon la position à l'écran : rose à gauche, cyan à droite, comme les fonds. */

    const sideColor = (x) => (r() < clamp(x / W, 0.1, 0.9) ? 'c1' : 'c2');

    // pistes de circuit, dans le repère de l'écran : une ligne droite, un pan à 45°, une ligne,
    // un nœud au bout. Elles s'allument une fois que le front est passé sur leur départ.
    const traces = Array.from({ length: n(16, 1) }, () => {
      const vertical = r() < 0.4;
      const x0 = r() * W, y0 = r() * H;
      const l1 = 120 + r() * 520, l2 = 40 + r() * 140, l3 = 80 + r() * 460;
      const sa = r() < 0.5 ? -1 : 1, sb = r() < 0.5 ? -1 : 1;
      const d = l2 / Math.SQRT2;
      const pts = vertical
        ? [[x0, y0], [x0, y0 + sa * l1], [x0 + sb * d, y0 + sa * (l1 + d)], [x0 + sb * d, y0 + sa * (l1 + d + l3)]]
        : [[x0, y0], [x0 + sa * l1, y0], [x0 + sa * (l1 + d), y0 + sb * d], [x0 + sa * (l1 + d + l3), y0 + sb * d]];
      const lens = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        lens.push(len);
        total += len;
      }
      return { pts, lens, total, color: sideColor(x0), start: toVirtual(x0, y0), width: r() < 0.3 ? 3 : 2 };
    });

    // colonnes de points qui clignotent (la matrice des fonds), dans le repère de l'écran
    const rain = Array.from({ length: n(34, 1) }, (_, i) => ({
      id: i,
      x: Math.round(r() * W / 10) * 10,
      y: Math.round(r() * H / 10) * 10 - 200,
      cells: 6 + Math.floor(r() * 22),
      rate: 6 + r() * 10,
      alpha: 0.18 + r() * 0.35,
      color: sideColor(i * W / 34)
    }));

    // traits de vitesse devant le front : ils filent avec lui sur l'ancienne scène
    const streaks = Array.from({ length: n(26, along) }, () => {
      const x = r() * VW;
      return { x, dy: -40 - r() * 300, len: 60 + r() * 240, w: r() < 0.25 ? 3 : 1.6, color: r() < 0.5 ? 'c1' : 'c2' };
    });

    // éclats de pixels derrière la queue : ils restent sur la nouvelle scène et s'éteignent
    const wake = Array.from({ length: n(70, along) }, (_, i) => ({
      id: i,
      x: r() * VW,
      dy: 20 + Math.pow(r(), 1.3) * 420,
      size: [4, 6, 8, 10][Math.floor(r() * 4)],
      rate: 5 + r() * 8,
      color: r() < 0.5 ? 'c1' : 'c2'
    }));

    /* ===================== rendu d'une image =====================
       Pure fonction de t (0 → 1) : ne dépend d'aucun état, on peut sauter à n'importe quelle image. */

    function edgePath(ctx, pts, base) {
      ctx.moveTo(pts[0][0], base + pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], base + pts[i][1]);
    }

    function panelPath(ctx, t) {
      const lb = edgeBase(LEAD, t), tb = edgeBase(TRAIL, t);
      ctx.beginPath();
      edgePath(ctx, leadProfile, lb);
      const tp = trailProfile;
      for (let i = tp.length - 1; i >= 0; i--) ctx.lineTo(tp[i][0], tb + tp[i][1]);
      ctx.closePath();
    }

    // dégradé le long d'un bord, d'une couleur à l'autre (repère virtuel)
    function along2(ctx, ca, cb, a) {
      const g = ctx.createLinearGradient(0, 0, VW, 0);
      g.addColorStop(0, col(ca, a));
      g.addColorStop(1, col(cb, a));
      return g;
    }

    // bande lumineuse le long d'un bord, côté intérieur (dessinée dans le clip du panneau)
    function innerGlow(ctx, pts, base, ca, cb, strength) {
      for (const [w, a] of [[160, 0.08], [80, 0.12], [34, 0.18]]) {
        ctx.beginPath(); edgePath(ctx, pts, base);
        ctx.lineWidth = w;
        ctx.strokeStyle = along2(ctx, ca, cb, a * strength);
        ctx.stroke();
      }
    }

    // le filet néon lui-même : fin, presque blanc au cœur, avec son halo qui déborde
    function neonLine(ctx, pts, base, ca, cb, strength) {
      ctx.beginPath(); edgePath(ctx, pts, base);
      ctx.lineWidth = 7;
      ctx.strokeStyle = along2(ctx, ca, cb, 0.9 * strength);
      ctx.shadowColor = col(ca, 0.9 * strength);
      ctx.shadowBlur = 26;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath(); edgePath(ctx, pts, base);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = 'rgba(250, 248, 255, ' + (0.9 * strength) + ')';
      ctx.stroke();
    }

    // une piste, tracée sur la longueur allumée
    function tracePath(ctx, tr, length) {
      ctx.beginPath();
      ctx.moveTo(tr.pts[0][0], tr.pts[0][1]);
      let left = length, end = tr.pts[0];
      for (let i = 1; i < tr.pts.length && left > 0; i++) {
        const [xa, ya] = tr.pts[i - 1], [xb, yb] = tr.pts[i];
        const k = Math.min(1, left / tr.lens[i - 1]);
        end = [lerp(xa, xb, k), lerp(ya, yb, k)];
        ctx.lineTo(end[0], end[1]);
        left -= tr.lens[i - 1];
      }
      return end;
    }

    function renderFrame(ctx, t) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.lineJoin = 'miter';
      ctx.lineCap = 'butt';
      setVirtual(ctx);

      const lb = edgeBase(LEAD, t), tb = edgeBase(TRAIL, t);
      const visible = tb + 100 > 0 && lb - 100 < VH;
      // intensité du halo central : maximale quand l'écran est couvert
      const bloom = smooth(0.2, 0.42, t) * (1 - smooth(0.46, 0.7, t));
      const leadIn = smooth(0, 0.06, t);
      const fadeOut = 1 - smooth(0.8, 1, t);

      if (visible) {
        // ---- le panneau : verre sombre, opaque (c'est lui qui cache le changement de scène) ----
        ctx.save();
        panelPath(ctx, t);
        let g = ctx.createLinearGradient(0, lb, 0, tb);
        g.addColorStop(0, '#120e1c');
        g.addColorStop(1, '#07060b');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.clip();

        // décor droit, dans le repère de l'écran (le clip, lui, reste celui du panneau)
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // lueurs rose à gauche et cyan à droite, plus fortes au moment du changement de scène
        const k = 0.55 + 0.45 * bloom;
        g = ctx.createRadialGradient(W * 0.12, H * 0.45, 0, W * 0.12, H * 0.45, W * 0.55);
        g.addColorStop(0, col(C2, 0.3 * k));
        g.addColorStop(1, col(C2, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        g = ctx.createRadialGradient(W * 0.88, H * 0.6, 0, W * 0.88, H * 0.6, W * 0.55);
        g.addColorStop(0, col(C1, 0.3 * k));
        g.addColorStop(1, col(C1, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        // trame LED
        if (!dotPattern) dotPattern = ctx.createPattern(dots, 'repeat');
        ctx.fillStyle = dotPattern;
        ctx.fillRect(0, 0, W, H);

        // matrice : des colonnes de carrés qui clignotent par à-coups
        for (const column of rain) {
          const step = Math.floor(t * column.rate * 4);
          ctx.fillStyle = col(column.color === 'c1' ? C1 : C2, 1);
          for (let i = 0; i < column.cells; i++) {
            const on = hash(column.id * 97 + i, step + i * 3);
            if (on < 0.45) continue;
            ctx.globalAlpha = column.alpha * (on > 0.9 ? 1.6 : 0.8);
            ctx.fillRect(column.x, column.y + i * 10, 5, 5);
          }
        }
        ctx.globalAlpha = 1;

        // pistes de circuit : elles se dessinent derrière le front
        for (const tr of traces) {
          const depth = tr.start[1] - leadY(tr.start[0], t);
          const lit = clamp(depth / 520);
          if (lit <= 0) continue;
          const tint = tr.color === 'c1' ? C1 : C2, sprite = nodes[tr.color];
          const length = tr.total * easeInOut(lit);
          tracePath(ctx, tr, length);
          ctx.lineWidth = tr.width + 6;
          ctx.strokeStyle = col(tint, 0.18);
          ctx.stroke();
          const end = tracePath(ctx, tr, length);
          ctx.lineWidth = tr.width;
          ctx.strokeStyle = col(tint, 0.9);
          ctx.stroke();
          // un nœud au départ, et la tête qui court jusqu'au nœud d'arrivée
          drawNode(ctx, sprite, tr.pts[0][0], tr.pts[0][1], 34, 0.9);
          drawNode(ctx, sprite, end[0], end[1], lit >= 1 ? 44 : 26, 1);
          ctx.globalAlpha = 1;
        }

        // lueur intérieure le long des deux bords
        setVirtual(ctx);
        innerGlow(ctx, leadProfile, lb, C2, C1, 1);
        innerGlow(ctx, trailProfile, tb, C1, C2, 0.85);
        ctx.restore();

        // halo au-dessus du front, sur l'ancienne scène
        ctx.save();
        ctx.beginPath(); edgePath(ctx, leadProfile, lb);
        ctx.lineWidth = 80;
        ctx.strokeStyle = along2(ctx, C2, C1, 0.1);
        ctx.stroke();
        ctx.restore();

        // les deux filets néon, par-dessus tout le reste du panneau
        ctx.save();
        neonLine(ctx, leadProfile, lb, C2, C1, leadIn);
        neonLine(ctx, trailProfile, tb, C1, C2, 0.85 * fadeOut);
        ctx.restore();

        // un nœud à chaque coude des bords, comme sur les cadres du stream
        for (let i = 1; i < leadProfile.length - 1; i += 2) {
          const [x, y] = leadProfile[i];
          drawNode(ctx, x < VW / 2 ? nodes.c2 : nodes.c1, x, lb + y, 40, leadIn);
        }
        for (let i = 2; i < trailProfile.length - 1; i += 2) {
          const [x, y] = trailProfile[i];
          drawNode(ctx, x < VW / 2 ? nodes.c1 : nodes.c2, x, tb + y, 36, 0.85 * fadeOut);
        }
        ctx.globalAlpha = 1;
      }

      // ---- traits de vitesse devant le front ----
      ctx.lineCap = 'round';
      for (const st of streaks) {
        const head = leadY(st.x, t) + st.dy;
        const tail = head + st.len;
        if (tail < -50 || head > VH + 50) continue;
        const a = clamp(1 + st.dy / 380) * leadIn;
        if (a <= 0.01) continue;
        const tint = st.color === 'c1' ? C1 : C2;
        const g = ctx.createLinearGradient(0, head, 0, tail);
        g.addColorStop(0, col(tint, 0));
        g.addColorStop(0.7, col(tint, 0.75 * a));
        g.addColorStop(1, 'rgba(255, 255, 255, ' + (0.8 * a) + ')');
        ctx.strokeStyle = g;
        ctx.lineWidth = st.w;
        ctx.beginPath(); ctx.moveTo(st.x, head); ctx.lineTo(st.x, tail); ctx.stroke();
      }

      // ---- éclats de pixels derrière la queue ----
      for (const px of wake) {
        const y = trailY(px.x, t) + px.dy;
        if (y < -20 || y > VH + 20) continue;
        const blink = hash(px.id, Math.floor(t * px.rate * 4)) > 0.35 ? 1 : 0.25;
        const a = clamp(1 - px.dy / 440) * fadeOut * blink;
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = col(px.color === 'c1' ? C1 : C2, 1);
        ctx.fillRect(px.x - px.size / 2, y - px.size / 2, px.size, px.size);
      }
      ctx.globalAlpha = 1;
    }

    /* ===================== point de transition =====================
       Cherche l'intervalle où le panneau couvre tout l'écran, et en prend le milieu.
       Il suffit de tester le tour de l'écran : sur chaque colonne du repère virtuel, les points
       les plus hauts et les plus bas de l'écran tourné sont sur son bord. */

    function coverWindow() {
      const border = [];
      for (let x = 0; x <= W; x += 10) { border.push(toVirtual(x, 0), toVirtual(x, H)); }
      for (let y = 0; y <= H; y += 10) { border.push(toVirtual(0, y), toVirtual(W, y)); }

      let first = -1, last = -1;
      for (let i = 0; i <= 1000; i++) {
        const t = i / 1000;
        let covered = true;
        for (const [x, y] of border) {
          if (leadY(x, t) > y || trailY(x, t) < y) { covered = false; break; }
        }
        if (covered) { if (first < 0) first = t; last = t; }
      }
      return first < 0 ? null : { first, last, point: (first + last) / 2 };
    }

    return { W, H, renderFrame, cover: coverWindow() };
  }

  /* ===================== export =====================
     Vidéo WebM (VP9 ou VP8) avec transparence (canal alpha), en 1920 × 1080 : c'est le format
     qu'attend un Stinger d'OBS, dont le lecteur décode l'alpha des WebM.

     Ne pas passer en « Track matte » : dans OBS, le « cache de piste » choisit quelle scène se
     voit dessous, il ne rend pas la vidéo transparente — elle reste noire autour du panneau.
     Et pas WebCodecs non plus : son encodeur refuse l'alpha (alpha: 'keep') dans Chrome et Edge.

     C'est donc MediaRecorder qui encode : il garde l'alpha d'un canvas transparent. Mais il
     enregistre en temps réel et saute des images quand l'encodeur ne suit pas. Chaque image est
     donc poussée à la main (requestFrame), lentement, pour qu'aucune ne soit perdue. Puis le
     fichier est relu et réassemblé (remuxWebm) : images d'origine inchangées, mais horodatées
     pile à 1 / fps d'écart, avec la durée et l'index qu'OBS attend pour connaître la longueur. */

  // ---- lecture et écriture WebM (EBML) ----

  const enc = new TextEncoder();

  function concat(parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  // taille toujours sur 8 octets : plus simple, et la place perdue ne compte pas ici
  function ebmlSize(n) {
    const b = new Uint8Array(8);
    b[0] = 0x01;
    for (let i = 7; i >= 1; i--) { b[i] = n % 256; n = Math.floor(n / 256); }
    return b;
  }

  function ebmlId(id) {
    const bytes = [];
    while (id > 0) { bytes.unshift(id & 0xff); id = Math.floor(id / 256); }
    return new Uint8Array(bytes);
  }

  function el(id, payload) {
    if (Array.isArray(payload)) payload = concat(payload);
    return concat([ebmlId(id), ebmlSize(payload.length), payload]);
  }

  function uint(n) {
    const bytes = [];
    do { bytes.unshift(n % 256); n = Math.floor(n / 256); } while (n > 0);
    return new Uint8Array(bytes);
  }

  function float64(n) {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, n);
    return b;
  }

  // lit un en-tête d'élément : identifiant (marqueur compris), taille (null = inconnue)
  function readHead(buf, pos) {
    const vint = (keepMarker) => {
      const first = buf[pos];
      let len = 1;
      while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
      if (len > 8) throw new Error('vidéo illisible');
      let v = keepMarker ? first : first & (0xff >> len), allOnes = v === (0xff >> len);
      for (let i = 1; i < len; i++) { v = v * 256 + buf[pos + i]; if (buf[pos + i] !== 0xff) allOnes = false; }
      pos += len;
      return { v, allOnes };
    };
    const id = vint(true).v;
    const size = vint(false);
    return { id, size: size.allOnes ? null : size.v, data: pos };
  }

  const CLUSTER_CHILDREN = new Set([0xE7, 0xA3, 0xA0, 0xA7, 0xAB]);   // temps, blocs, positions

  // relit le fichier de MediaRecorder : les pistes telles quelles, et la liste de ses images
  // (chaque bloc copié, avec la position de son temps relatif, pour pouvoir le réécrire)
  function parseWebm(buf) {
    let pos = readHead(buf, 0);
    pos = pos.data + pos.size;                                          // saute l'en-tête EBML
    const seg = readHead(buf, pos);
    if (seg.id !== 0x18538067) throw new Error('vidéo inattendue');
    const end = seg.size === null ? buf.length : seg.data + seg.size;
    let tracks = null;
    const blocks = [];
    pos = seg.data;
    while (pos < end) {
      const h = readHead(buf, pos);
      if (h.id === 0x1F43B675) {
        // cluster de taille souvent inconnue : il s'arrête au premier élément qui n'est pas à lui
        let p = h.data;
        const stop = h.size === null ? end : h.data + h.size;
        while (p < stop) {
          const c = readHead(buf, p);
          if (!CLUSTER_CHILDREN.has(c.id)) break;
          const next = c.data + c.size;
          if (c.id === 0xA3 || c.id === 0xA0) {
            // temps relatif : 2 octets juste après le numéro de piste (1 octet), dans le bloc
            const blk = c.id === 0xA3 ? c.data : readHead(buf, c.data).data;
            blocks.push({ bytes: buf.slice(p, next), timeAt: blk + 1 - p });
          }
          p = next;
        }
        pos = p;
      } else {
        if (h.size === null) throw new Error('vidéo inattendue');
        if (h.id === 0x1654AE6B) tracks = buf.subarray(pos, h.data + h.size);
        pos = h.data + h.size;
      }
    }
    if (!tracks || !blocks.length) throw new Error('vidéo vide');
    return { tracks, blocks };
  }

  // réécrit le fichier : un seul cluster, images horodatées à 1 / fps d'écart, durée et index
  function remuxWebm(buf, fps, expected) {
    const { tracks, blocks } = parseWebm(buf);
    // MediaRecorder capture parfois aussi le canvas au démarrage : une image vide en plus, comme
    // la première de l'animation (t = 0). Elle ne décale la vidéo que d'une image, on la garde.
    if (blocks.length !== expected && blocks.length !== expected + 1) {
      throw new Error(blocks.length + ' images enregistrées sur ' + expected +
                      '. Réessaie en gardant cet onglet au premier plan pendant l\'export.');
    }
    blocks.forEach((b, i) => {
      new DataView(b.bytes.buffer, b.bytes.byteOffset + b.timeAt, 2).setInt16(0, Math.round(i * 1000 / fps));
    });
    const durationMs = blocks.length * 1000 / fps;

    const header = el(0x1A45DFA3, [
      el(0x4286, uint(1)), el(0x42F7, uint(1)), el(0x42F2, uint(4)), el(0x42F3, uint(8)),
      el(0x4282, enc.encode('webm')), el(0x4287, uint(4)), el(0x4285, uint(2)),
    ]);
    const info = el(0x1549A966, [
      el(0x2AD7B1, uint(1000000)),               // horodatage en millisecondes
      el(0x4489, float64(durationMs)),
      el(0x4D80, enc.encode('Twitch Kit')),
      el(0x5741, enc.encode('Twitch Kit')),
    ]);
    // un seul cluster suffit : les temps relatifs tiennent sur 16 bits (32 s)
    const body = [el(0x1F43B675, [el(0xE7, uint(0)), ...blocks.map(b => b.bytes)])];
    // index réduit au début de la vidéo : un Stinger est toujours relu depuis le début.
    // Position sur 8 octets fixes, pour que la taille de l'index ne dépende pas d'elle-même.
    const fixed = (n) => ebmlSize(n).map((b, i) => (i === 0 ? 0 : b));
    const cues = (offset) => el(0x1C53BB6B, el(0xBB, [
      el(0xB3, uint(0)),
      el(0xB7, [el(0xF7, uint(1)), el(0xF1, fixed(offset))]),
    ]));
    const offset = info.length + tracks.length + cues(0).length;
    return new Blob([header, el(0x18538067, [info, tracks, cues(offset), ...body])], { type: 'video/webm' });
  }

  // ---- enregistrement ----

  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8'].find(m => MediaRecorder.isTypeSupported(m)) || null;
  }

  // L'export a besoin de pousser les images une à une (requestFrame sur la piste du canvas) :
  // Chrome, Edge, Brave, Opera. Firefox n'a requestFrame que sur le flux, et rien ne garantit
  // qu'il garde l'alpha : une vidéo à fond noir serait pire qu'un refus clair. Safari non plus.
  function canExport() {
    return Boolean(pickMime()) && typeof CanvasCaptureMediaStreamTrack !== 'undefined' &&
           typeof CanvasCaptureMediaStreamTrack.prototype.requestFrame === 'function';
  }

  const EXPORT_BROWSERS = 'ce navigateur ne sait pas fabriquer la vidéo. Ouvre cette page dans Chrome ou Edge.';

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function exportVideo(engine, { durationMs, fps, onProgress }) {
    if (!canExport()) throw new Error(EXPORT_BROWSERS);
    const mime = pickMime();

    const canvas = document.createElement('canvas');
    canvas.width = engine.W; canvas.height = engine.H;
    const ctx = canvas.getContext('2d');          // canvas transparent : l'alpha part dans la vidéo
    engine.renderFrame(ctx, 0);                   // vide : c'est l'éventuelle image capturée au démarrage

    const stream = canvas.captureStream(0);       // 0 = une image seulement quand on la demande
    const track = stream.getVideoTracks()[0];
    // une extension (anti-pistage…) peut remplacer captureStream par une copie sans requestFrame
    if (!track || typeof track.requestFrame !== 'function') throw new Error(EXPORT_BROWSERS);
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16e6 });
    const parts = [];
    recorder.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    const stopped = new Promise((r) => { recorder.onstop = r; });
    recorder.start();
    await wait(100);

    // images à t = i / n, de 0 à 1 compris. Une image toutes les FRAME_GAP ms laisse le temps à
    // l'encodeur : les horodatages sont de toute façon réécrits ensuite.
    const FRAME_GAP = 120;
    const n = Math.round(durationMs * fps / 1000);
    try {
      for (let i = 0; i <= n; i++) {
        engine.renderFrame(ctx, i / n);
        track.requestFrame();
        onProgress((i + 1) / (n + 1));
        await wait(FRAME_GAP);
      }
      await wait(400);                            // la dernière image a le temps de sortir
    } finally {
      recorder.stop();
      await stopped;
      track.stop();
    }

    const raw = new Uint8Array(await new Blob(parts).arrayBuffer());
    return remuxWebm(raw, fps, n + 1);
  }

  window.TwitchKitTransition = { create, exportVideo, canExport };
})();
