# CLAUDE.md

Instructions pour Claude Code dans ce repo.

## Le projet en bref

**Twitch Kit** est la version « streamer non développeur » de `twitch_tools` (le repo
personnel de l'auteur). Même principe : un serveur Node local, lancé et arrêté par OBS,
alimente des sources navigateur. Mais l'utilisateur final **ne code pas, n'édite aucun
fichier et n'installe rien** : c'est la contrainte qui guide tout le reste.

Le socle, plus une première fonctionnalité (sondages et prédictions annoncés par le bot) :

- `src/server.js` — serveur HTTP sans dépendance npm : OAuth Twitch pour deux comptes
  (chaîne et bot, via la fabrique `makeAccount()`), OAuth Spotify, `/status`, et les routes
  `POST /setup/twitch|bot|spotify` qui écrivent `config/credentials.json`. Les réglages des
  fonctionnalités vivent dans `config/settings.json` (une section par fonctionnalité,
  normalisée par son module ; `writeSettings()` → `applySettings()`, surveillé comme les
  identifiants). `/status` porte `fonctionnalites.<id>` : `{ niveau, texte, detail }`
  calculé côté serveur, affiché tel quel sur la carte.
- `src/spotify.js` — OAuth Spotify seul (autorisation, refresh, `ensureToken()` pour les
  futures fonctionnalités). N'importe rien du serveur, `server.js` l'injecte.
- `src/eventsub.js` — EventSub par WebSocket (client côté serveur, `WebSocket` natif de
  Node 22+) avec le token de la chaîne. `on(type, version, handler)` pour s'abonner ;
  gère welcome/keepalive (watchdog)/reconnect/revocation, dédoublonne par `message_id`,
  réessaie avec backoff. Un refus 401/403 à l'abonnement l'arrête (il faut réautoriser) :
  le callback d'autorisation de la chaîne appelle `eventsub.restart()`.
- `src/chat.js` — `say(texte, { annonce, couleur })` : le bot écrit dans le chat
  (`/chat/messages`) ou fait une annonce (`/chat/announcements`, bot modérateur) ; une
  annonce refusée retombe sur un message normal et laisse un avertissement pour l'accueil.
- `src/polls.js` — sondages et prédictions : modèles de messages à variables `{titre}`…,
  valeurs par défaut, `normalize()` (bornes), handlers EventSub (`events`), et `test()`
  (exemple envoyé dans le chat depuis l'accueil, 3 s minimum entre deux). Routes :
  `GET /settings/polls`, `POST /setup/polls`, `POST /setup/polls/test`.
- `overlays/home.html` + `home.js` + `home.css` — page d'accueil servie sur `/`, une seule
  page à vues : l'accueil (`#view-home`) n'est qu'une grille de **tuiles** (une par compte,
  une par fonctionnalité) avec leur pastille d'état ; chaque tuile ouvre la vue de sa
  section (`#twitch`, `#bot`, `#spotify`, `#<id>` → `#view-<nom>`, routage par
  `hashchange`) avec clés, bouton Autoriser, URL à copier, réglages. Les pastilles d'une
  même section portent `data-state="<nom>"` et sont mises à jour ensemble par `setPill()`.
  Sonde `/status` toutes les 5 s **seulement quand l'onglet est visible**. Tuiles et vues
  des fonctionnalités sont construites une fois au chargement puis mises à jour (jamais
  reconstruites : un formulaire en cours de saisie ne doit pas disparaître).
- `overlays/home_messages.js` — formulaire « modèles de messages du bot » de la vue d'une
  fonctionnalité (`reglages: 'messages'` dans `features.js`), construit depuis
  `GET /settings/<id>`.
- `overlays/features.js` — catalogue des fonctionnalités affichées sur l'accueil.
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

## Design et page d'accueil

- **Tous les visuels sont élégants, simples et « sexy »** : overlays comme pages de
  réglages. Peu d'éléments, une typo soignée, des espacements généreux, des couleurs
  cohérentes, des animations discrètes. Pas de surcharge, pas d'effet gadget : un streamer
  doit avoir envie de le montrer à l'écran tel quel.
- **L'accueil est le point d'entrée unique** : chaque fonctionnalité y est listée, et il doit
  rester organisé pour être compris et utilisé sans lire de doc. Regrouper par usage, aller
  du plus important au détail, un seul appel à l'action clair par carte, l'état visible
  d'un coup d'œil (prêt / à configurer / autorisation à refaire). L'accueil doit rester
  court, sans défilement : une tuile (titre, une phrase, pastille) par section, tout le
  détail et les réglages sur la page de la section.
- **Chaque fonctionnalité dit exactement quoi faire dans OBS**, directement sur sa page.
  Pour un overlay : l'URL à copier (bouton copier), le type de source (Navigateur), la
  **largeur et la hauteur à régler**, et tout réglage OBS utile (ex. « Actualiser le
  navigateur quand la scène devient active », fond transparent). Plus un aperçu via
  `?demo=1`. Ces infos vivent dans l'entrée de `overlays/features.js`, pas en dur dans
  `home.js`.

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

Modèle de branches (détaillé dans `RELEASE.md`) : `feature/<nom>` part de `develop` et y est
fusionnée, `develop` est fusionnée dans `main` pour publier, et les tags `v*` se posent sur
`main`. Pas de PR pour l'instant.

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
