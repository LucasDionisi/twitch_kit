# CLAUDE.md

Instructions pour Claude Code dans ce repo.

## Le projet en bref

**Twitch Kit** est la version « streamer non développeur » de `twitch_tools` (le repo
personnel de l'auteur). Même principe : un serveur Node local, lancé et arrêté par OBS,
alimente des sources navigateur. Mais l'utilisateur final **ne code pas, n'édite aucun
fichier et n'installe rien** : c'est la contrainte qui guide tout le reste.

Pour l'instant, le repo n'est qu'un socle, **sans aucune fonctionnalité** :

- `src/server.js` — serveur HTTP sans dépendance npm : OAuth Twitch pour deux comptes
  (chaîne et bot, via la fabrique `makeAccount()`), OAuth Spotify, `/status`, et les routes
  `POST /setup/twitch|bot|spotify` qui écrivent `config/credentials.json`.
- `src/spotify.js` — OAuth Spotify seul (autorisation, refresh, `ensureToken()` pour les
  futures fonctionnalités). N'importe rien du serveur, `server.js` l'injecte.
- `overlays/home.html` + `home.js` + `home.css` — page d'accueil servie sur `/` : une carte
  par compte (état, clés, bouton Autoriser, URL de redirection à copier) et la liste des
  fonctionnalités. Sonde `/status` toutes les 5 s **seulement quand l'onglet est visible**.
- `overlays/features.js` — catalogue des fonctionnalités affichées sur l'accueil (vide).
- `obs_twitch_kit.lua` + `start_server_hidden.vbs` — lancement caché depuis OBS. Le `.vbs`
  prend `runtime\node.exe` s'il existe (zip de release), sinon `node` du PATH (dev).
  `start_server_debug.bat` : même chose avec fenêtre.
- `.github/workflows/release.yml` — sur un tag `v*`, assemble `twitch_kit.zip` avec un
  `node.exe` portable officiel (somme SHA256 vérifiée) et écrit `VERSION`. La marche à
  suivre pour publier est dans `RELEASE.md` (pour l'auteur, pas livré dans le zip) : à
  tenir à jour si le workflow change.

## Règles propres à ce repo

- **Aucun fichier à éditer pour l'utilisateur.** Tout réglage passe par la page d'accueil
  (ou une future page de réglages) : clés, pseudos, options. Un nouveau réglage = un champ
  dans une page + une route qui valide et borne la valeur + une valeur par défaut.
- **Identifiants rechargés à chaud** : `writeCredentials()` écrit puis `applyCredentials()`
  applique ; `watchCredentials()` couvre une édition à la main. Changer le Client ID Twitch
  jette les tokens des deux comptes (ils sont liés à l'application). Le secret n'est
  **jamais** renvoyé par `/status` ; un secret vide au `POST` veut dire « garder l'ancien ».
- **Le README est pour le streamer uniquement** : installation dans OBS, récupération des
  clés, mise à jour, dépannage. Aucune mention de code, de Node, de git ni de JSON. Ce qui
  concerne le développement va ici.
- **Nouvelle fonctionnalité** = une entrée dans `overlays/features.js` (sinon elle n'apparaît
  pas sur l'accueil), ses scopes ajoutés à `SCOPES` / `BOT_SCOPES` (`checkScopes()` signalera
  alors « Autorisation à refaire » aux comptes déjà autorisés), une section du README si
  l'utilisateur a quelque chose à faire dans OBS, et une mise à jour de ce fichier.
- Port par défaut **8787** (pas 8777) pour cohabiter avec `twitch_tools` sur le PC de
  l'auteur. Il est aussi en dur dans `obs_twitch_kit.lua` (`HOME_URL`) et dans le README.
- Le zip ne contient jamais `config/` ni `data/` : une mise à jour extraite par-dessus garde
  clés et autorisations. Ne rien y mettre qui doive être livré.

## Reprendre depuis twitch_tools

Les futures fonctionnalités se portent depuis `twitch_tools`, en en reprenant les règles :

- **Pas de SSE ni de long polling pour un overlay** (les sources OBS partagent un Chromium
  limité à 6 connexions HTTP). Le temps réel passe par WebSocket natif : porter
  `LIVE_ROUTES` / `handleUpgrade()` / `greet()` côté serveur **et** `overlays/live.js` côté
  page, ensemble (ni l'un ni l'autre n'est encore là).
- Pousser plutôt que sonder ; purge paresseuse plutôt que timers ; jamais deux
  `setInterval` sur le même job.
- Animations en CSS pour les pages affichées tout le stream, pas de `requestAnimationFrame`.
- Chaque overlay a un `?demo=1` (c'est lui que la page d'accueil pourra prévisualiser).

## Git — ne jamais le faire soi-même

Claude ne doit **jamais** exécuter `git add`, `git commit`, `git push`, `git tag` (ni
`git reset`/`checkout`/`clean` destructifs) dans ce repo. L'utilisateur gère git et les
releases lui-même.

## Perf et fiabilité

Le serveur tourne pendant tout le stream, en arrière-plan, sans fenêtre : une exception
non catchée casse tout en direct, et l'utilisateur ne saura pas lire un log.

- **Sans dépendance npm**, pas de `package.json` : le zip ne contient que `node.exe` et les
  sources. Ne pas en ajouter sans en discuter.
- Toute erreur réseau/API est catchée et logguée (`try/catch` + `console.warn`), tous les
  `fetch` ont un `AbortSignal.timeout`. Le routeur HTTP a un `try/catch` global et
  `unhandledRejection` est intercepté : ce sont des filets, pas une excuse.
- Messages d'erreur montrés à l'utilisateur : en français simple, avec l'action à faire.
- Après une modif de `src/`, vérifier au minimum `node -c src/server.js`, puis relancer le
  serveur et contrôler `/status` et la page d'accueil.

## Secrets

`config/credentials.json` (secrets Twitch et Spotify) et `data/tokens*.json` (refresh
tokens) sont gitignorés et hors de `overlays/`, **seul dossier servi en HTTP**. Ne jamais
afficher leur contenu, les logguer, ni les exposer dans une route.

## Style

JS natif ES2020+, pas de framework, commentaires en français. Un fichier par composant dans
`src/`, injecté depuis `src/server.js` (dépendance à sens unique).
