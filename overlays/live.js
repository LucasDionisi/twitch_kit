/* Client temps réel commun aux overlays, à la place d'EventSource.
   Même interface : Live.connect('/xxx/stream') renvoie un objet dont
   addEventListener(nom, fn) appelle fn({ data: '<json>' }), comme un événement SSE :
   les pages n'ont eu qu'une ligne à changer.

   Pourquoi pas SSE : toutes les sources navigateur d'OBS partagent un seul Chromium,
   limité à 6 connexions HTTP à la fois par adresse. Chaque flux SSE en gardait une à
   vie : au-delà de 6 overlays, plus rien ne passait, ni le chargement d'une page, ni
   les images, ni les sons. Une WebSocket ne compte pas dans ce quota.

   Reconnexion automatique, comme EventSource : 1 s, puis de plus en plus espacée
   jusqu'à 10 s. À chaque connexion, le serveur renvoie les réglages et l'état en cours. */
(function () {
  'use strict';

  const RETRY_MIN_MS = 1000;
  const RETRY_MAX_MS = 10000;

  function connect(path) {
    const handlers = new Map();   // nom d'événement -> [fn]
    const url = new URL(path, location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    let delay = RETRY_MIN_MS;
    let retryTimer = null;

    // une erreur dans une page ne doit pas empêcher les autres événements d'arriver
    function dispatch(name, evt) {
      for (const fn of handlers.get(name) || []) {
        try {
          fn(evt);
        } catch (err) {
          console.warn('flux ' + url.pathname + ' : événement ' + name + ' ignoré :', err);
        }
      }
    }

    function schedule() {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(open, delay);
      delay = Math.min(delay * 2, RETRY_MAX_MS);
    }

    function open() {
      let ws;
      try {
        ws = new WebSocket(url.href);
      } catch (err) {
        schedule();
        return;
      }
      ws.onopen = () => {
        delay = RETRY_MIN_MS;
        dispatch('open', {});
      };
      // un message = « nom\njson » : le JSON n'est parsé qu'une fois, par la page
      ws.onmessage = (msg) => {
        if (typeof msg.data !== 'string') return;
        const cut = msg.data.indexOf('\n');
        if (cut > 0) dispatch(msg.data.slice(0, cut), { data: msg.data.slice(cut + 1) });
      };
      // onerror est toujours suivi de onclose : la reconnexion part d'ici
      ws.onclose = () => {
        dispatch('error', {});
        schedule();
      };
    }

    open();

    return {
      addEventListener(name, fn) {
        if (!handlers.has(name)) handlers.set(name, []);
        handlers.get(name).push(fn);
      }
    };
  }

  window.Live = { connect: connect };
})();
