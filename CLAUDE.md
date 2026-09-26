# CLAUDE.md

Instructions pour Claude Code dans ce repo.

## Le projet en bref

**Twitch Kit** est la version « streamer non développeur » de `twitch_tools` (le repo
personnel de l'auteur). Même principe : un serveur Node local, lancé et arrêté par OBS,
alimente des sources navigateur. Mais l'utilisateur final **ne code pas, n'édite aucun
fichier et n'installe rien** : c'est la contrainte qui guide tout le reste.

Le socle, plus les sondages et prédictions (annoncés par le bot dans le chat, et affichés
par deux overlays OBS) :

- `src/server.js` — serveur HTTP sans dépendance npm : OAuth Twitch pour deux comptes
  (chaîne et bot, via la fabrique `makeAccount()`), OAuth Spotify, `/status`, et les routes
  `POST /setup/twitch|bot|spotify` qui écrivent `config/credentials.json`. Les réglages des
  fonctionnalités vivent dans `config/settings.json` (une section par fonctionnalité,
  normalisée par son module ; `writeSettings()` → `applySettings()`, surveillé comme les
  identifiants). Le registre `FEATURE_SETTINGS` (id → `normalize`, `describe`, `test`
  facultatif) sert à la fois ce fichier et les routes génériques `GET /settings/<id>`,
  `POST /setup/<id>` et `POST /setup/<id>/test`. `/status` porte `fonctionnalites.<id>` :
  `{ niveau, texte, detail }` calculé côté serveur, affiché tel quel sur la carte.
- `src/spotify.js` — OAuth Spotify seul (autorisation, refresh, `ensureToken()` pour les
  futures fonctionnalités). N'importe rien du serveur, `server.js` l'injecte.
- `src/eventsub.js` — EventSub par WebSocket (client côté serveur, `WebSocket` natif de
  Node 22+) avec le token de la chaîne. `on(type, version, handler)` pour s'abonner
  (plusieurs handlers par type, un seul abonnement Twitch) ;
  gère welcome/keepalive (watchdog)/reconnect/revocation, dédoublonne par `message_id`,
  réessaie avec backoff. Un refus 401/403 à l'abonnement l'arrête (il faut réautoriser) :
  le callback d'autorisation de la chaîne appelle `eventsub.restart()`.
- `src/chat.js` — `say(texte, { annonce, couleur })` : le bot écrit dans le chat
  (`/chat/messages`) ou fait une annonce (`/chat/announcements`, bot modérateur) ; une
  annonce refusée retombe sur un message normal et laisse un avertissement pour l'accueil.
- `src/polls.js` — sondages et prédictions : modèles de messages à variables `{titre}`…,
  valeurs par défaut, `normalize()` (bornes), handlers EventSub (`events`), et `test()`
  (exemple envoyé dans le chat depuis l'accueil, 3 s minimum entre deux). Id `polls`.
- `src/votes.js` — overlays sondage et prédiction (porté de `twitch_tools`) : état en
  mémoire alimenté par begin/progress/lock/end, `payload(kind)` avec temps restant
  recalculé, `seed()` rattrape via Helix un événement déjà en cours au démarrage. Le
  résultat porte son `hideAtMs` : la page se retire seule et le serveur l'oublie
  paresseusement (aucune minuterie). Réglages d'apparence (`normalizeStyle`,
  `describeStyle`) : thème (`circuit` | `crt`), couleurs **par thème**, taille, durée du
  résultat, éléments affichés, textes. Ids `poll_overlay` et `prediction_overlay`.
- `src/live.js` — flux WebSocket vers les overlays, porté de `twitch_tools` (RFC 6455
  minimal, ping commun toutes les 30 s, origine vérifiée). `route(chemin, greet)` :
  `greet(send)` envoie réglages puis état à chaque (re)connexion ; `broadcast()` ;
  `count()` ignore les connexions `?demo=1`. Flux `/poll/stream` et `/prediction/stream`
  (événements `config`, `poll` / `prediction`).
- `overlays/poll.html`, `prediction.html` — pages minces ; rendu commun dans `votes.js`
  (`VoteOverlay.start(kind)`), les deux thèmes dans `votes.css` (variables `--c1`, `--c2`,
  `--titres`, `--scale`, classes `theme-*`, `no-*` sur `body`). Polices embarquées dans
  `overlays/fonts/` (OFL, licence dans `OFL.txt`) : jamais de Google Fonts en ligne.
- `overlays/live.js` — client WebSocket des overlays (repris tel quel de `twitch_tools`).
- `overlays/home.html` + `home.js` + `home.css` — page d'accueil servie sur `/`, une seule
  page à vues : l'accueil (`#view-home`) n'est qu'une grille de **tuiles** (une par compte,
  une par fonctionnalité) avec leur pastille d'état ; chaque tuile ouvre la vue de sa
  section (`#twitch`, `#bot`, `#spotify`, `#<id>` → `#view-<nom>`, routage par
  `hashchange`) avec clés, bouton Autoriser, URL à copier, réglages. Les pastilles d'une
  même section portent `data-state="<nom>"` et sont mises à jour ensemble par `setPill()`.
  Sonde `/status` toutes les 5 s **seulement quand l'onglet est visible**. Tuiles et vues
  des fonctionnalités sont construites une fois au chargement puis mises à jour (jamais
  reconstruites : un formulaire en cours de saisie ne doit pas disparaître).
- `overlays/etat.js` — calcul des pastilles (comptes, fonctionnalités) depuis `/status`,
  partagé par l'accueil et le dock : les deux affichent toujours le même état.
- `overlays/dock.html` + `dock.js` + `dock.css` — dock OBS (Docks → Docks personnalisés du
  navigateur), toujours sombre, pensé pour 200 à 400 px de large : une ligne par compte et
  par fonctionnalité (sauf lui-même), un résumé en tête, le détail sous la ligne quand il y
  a quelque chose à faire ; un clic ouvre la page de la section sur l'accueil en
  `target="_blank"` (OBS devrait l'ouvrir dans le navigateur par défaut : à vérifier). Sonde `/status?dock=1` toutes les
  5 s quand il est visible ; le `?dock=1` passe la fonctionnalité `dock` à « Dans OBS »
  (vu au moins une fois depuis le démarrage). Futures actions en direct : ici aussi, en
  plus du Stream Deck.
- `overlays/home_messages.js` — formulaire « modèles de messages du bot » de la vue d'une
  fonctionnalité (`reglages: 'messages'` dans `features.js`), construit depuis
  `GET /settings/<id>`.
- `overlays/home_overlay.js` — réglages d'apparence d'un overlay (`reglages: 'apparence'`),
  avec l'aperçu : l'overlay en `?demo=1` dans un iframe, qui reçoit les réglages non
  enregistrés par `postMessage` (`{ twitchKitConfig }`, origine vérifiée) et n'ouvre alors
  pas de flux.
- `overlays/transition.js` — transition de scène « néon circuit » (Stinger OBS, portée de
  `transition.html` de `twitch_tools`) : `create(opts)` → moteur avec `renderFrame(ctx, t)`
  pur (t de 0 à 1, aléatoire à graine) et `cover` (point de transition) ;
  `exportVideo()` → WebM avec alpha (MediaRecorder image par image, puis remux EBML).
  Chromium seulement : `canExport()` exige `CanvasCaptureMediaStreamTrack.requestFrame`
  (Firefox ne l'a que sur le flux, alpha non garanti) ; sinon la page désactive l'export
  et dit d'ouvrir Chrome ou Edge.
  Pas une source OBS : OBS ne lit que la vidéo exportée.
- `overlays/home_transition.js` — page de la tuile transition (`reglages: 'transition'`) :
  aperçu sur deux fausses scènes (rAF seulement quand la vue est affichée), réglages non
  enregistrés (vitesse, direction, couleurs, densité, tirage), export, marche à suivre OBS.
- `src/jeux.js` — sources OBS affichées selon le jeu lancé (id `game_sources`) : règles
  « nom de source ↔ liste de .exe ». Un `tasklist` caché toutes les 3 s, **seulement s'il
  y a une règle avec des jeux**. Lua n'ayant pas de HTTP, le canal avec OBS est fait de
  deux fichiers de `data/`, une ligne par source (pas de JSON côté Lua) :
  `game_sources_state.txt` (écrit ici, tmp + rename, seulement quand l'état change :
  `1<TAB>Manette`) et `obs_sources.txt` (écrit par le Lua toutes les 10 s : noms des
  sources, et signe de vie → « OBS ne répond pas » au-delà de 30 s). Un jeu est un nom
  (`game.exe`, tout dossier) ou un chemin complet (ce programme-là seulement) : `tasklist`
  n'ayant pas les chemins, `resolvePaths()` les lit par `Win32_Process` (PowerShell)
  **seulement** pour les PID dont le nom correspond à un jeu donné par chemin, une fois
  par PID (cache purgé quand le processus disparaît) ; chemin illisible → repli sur le
  nom. `choices()` (route
  `GET /game_sources/choices`, same-origin seulement) liste les programmes à fenêtre via
  PowerShell (titres en UTF-8), à la demande. `/status` porte en plus `sources`
  (`{ nom: { visible, jeu } }`) pour les badges de la page.
- `overlays/home_jeux.js` — page de cette fonctionnalité (`reglages: 'jeux'`) : une carte
  par règle, datalists des sources OBS et des programmes ouverts ; état en direct via
  l'événement `twitchkit:status` que `home.js` émet après chaque sondage de `/status`.
- `overlays/features.js` — catalogue des fonctionnalités affichées sur l'accueil
  (`dock: false` = pas de ligne dans le dock, pour le dock lui-même et les outils sans état).
- `obs_twitch_kit.lua` + `start_server_hidden.vbs` — lancement caché depuis OBS. Le `.vbs`
  prend `runtime\node.exe` s'il existe (zip de release), sinon `node` du PATH (dev).
  `start_server_debug.bat` : même chose avec fenêtre. Le Lua applique aussi
  `data/game_sources_state.txt` (timer d'1 s, n'agit que si le contenu change, plus aux
  événements `FINISHED_LOADING` / `SCENE_LIST_CHANGED`) : `obs_sceneitem_set_visible` sur
  chaque élément de scène du bon nom, groupes compris. Une source absente du fichier n'est
  jamais touchée. Un changement du `.lua` demande de redémarrer OBS (à dire dans le
  CHANGELOG).
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
  pas sur l'accueil) avec son `groupe` (section de l'accueil : `overlays`, `bot`… ; un
  nouveau groupe s'ajoute à `FEATURE_GROUPS`), ses scopes ajoutés à `SCOPES` / `BOT_SCOPES` (`checkScopes()` signalera
  alors « Autorisation à refaire » aux comptes déjà autorisés), une section du README si
  l'utilisateur a quelque chose à faire dans OBS, une ligne sous `## À venir` dans
  `CHANGELOG.md`, et une mise à jour de ce fichier.
- **`CHANGELOG.md` est lu par le streamer** : c'est la description de chaque release (le
  workflow prend la section `## vX.Y.Z` du tag et s'arrête si elle manque). Même règle que
  le README : langage simple, pas de code, et toujours une rubrique « À faire après la
  mise à jour » quand il y a quelque chose à refaire (réautoriser, ajouter une source…).
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
  navigateur quand la scène devient active », fond transparent). Ces infos vivent dans
  l'entrée de `overlays/features.js`, pas en dur dans `home.js`.
- **Toujours un `?demo=1` pour l'aperçu dans l'accueil.** Tout overlay doit avoir un mode
  `?demo=1` (faux événements en boucle, même rendu qu'en vrai), et sa page dans l'accueil
  l'affiche en aperçu, mis à jour en direct à chaque réglage. Pas d'overlay sans aperçu.

## Stream Deck+

Le streamer a un **Stream Deck+** (8 touches, 4 molettes, bande tactile). Pour toute action
à déclencher en direct (lancer, afficher / masquer, passer à l'étape suivante, relancer…),
se demander si un bouton du Stream Deck est plus pratique qu'un clic sur la page
d'accueil ; si oui, le mettre en place avec la fonctionnalité, pas après.

- **Sans rien installer** : l'action native « Site web » du Stream Deck, option « Accéder en
  arrière-plan » (requête GET, pas de navigateur ouvert), pointée sur une route locale du
  serveur, du type `/deck/<action>`.
- **Chaque action a sa fiche sur la page de sa fonctionnalité** : l'URL à copier (bouton
  copier) et la marche à suivre dans le logiciel Stream Deck, comme on le fait pour OBS.
  Ces infos vivent dans `overlays/features.js`, et le README explique la manip une fois.
- **Sécurité** : une route GET qui agit peut être appelée par n'importe quelle page web
  ouverte sur le PC (CSRF vers 127.0.0.1). Les routes `/deck/*` exigent donc une clé
  secrète dans l'URL, générée au premier démarrage (dans `data/`, jamais dans le zip),
  comparée en temps constant, et régénérable depuis l'accueil.
- **Réponse immédiate et sûre** : l'action répond vite, ne fait rien de destructif si on
  appuie deux fois, et un échec se voit (log + état sur l'accueil), le Stream Deck
  n'affichant qu'un simple triangle d'erreur.
- **Molettes et bande tactile** : l'action « Site web » ne s'y pose pas, il faudrait un
  plugin Stream Deck. À éviter tant que les touches suffisent ; en discuter avant.

## Reprendre depuis twitch_tools

Les futures fonctionnalités se portent depuis `twitch_tools`, en en reprenant les règles :

`twitch_tools` est sur le PC de l'auteur dans `C:\Github\OBS_Manisi_Tools`.

- **Pas de SSE ni de long polling pour un overlay** (les sources OBS partagent un Chromium
  limité à 6 connexions HTTP). Le temps réel passe par WebSocket natif : `src/live.js`
  côté serveur (un `live.route()` par flux) et `overlays/live.js` côté page.
- Pousser plutôt que sonder ; purge paresseuse plutôt que timers ; jamais deux
  `setInterval` sur le même job.
- Animations en CSS pour les pages affichées tout le stream, pas de `requestAnimationFrame`
  (les overlays de `twitch_tools` en utilisent pour faire rouler les compteurs : ne pas
  le reprendre).
- Pour vérifier un overlay par capture Edge headless (`--virtual-time-budget`), les
  transitions CSS restent figées à leur valeur de départ : une jauge vide sur la capture
  n'est pas forcément un bug (couper les transitions dans une copie pour vérifier).

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
