/* Catalogue des fonctionnalités affichées sur la page d'accueil.
 *
 * Chaque nouvelle fonctionnalité ajoute une entrée ici, sinon elle n'apparaît pas.
 *
 * Format d'une entrée :
 *   {
 *     id: 'alerts',                          // identifiant court, unique ; c'est aussi la clé
 *                                            // de son état dans /status (fonctionnalites.<id>)
 *     nom: 'Alertes',                        // titre de la carte
 *     description: 'Follow, sub, raid…',     // une phrase, pour le streamer
 *     url: '/alerts.html',                   // page à coller dans OBS (Source → Navigateur),
 *                                            // ou null si ce n'est pas une source OBS
 *     taille: [1920, 1080],                  // largeur / hauteur de la source OBS
 *     obs: 'Rien à ajouter dans OBS.',       // consigne OBS en une phrase, si pas d'URL
 *     groupe: 'overlays',                    // section de l'accueil, voir FEATURE_GROUPS
 *     comptes: ['twitch'],                   // autorisations requises : 'twitch', 'bot', 'spotify'
 *     reglages: 'messages'                   // formulaire de réglages sur la page (facultatif),
 *                                            // lu sur /settings/<id>, écrit sur /setup/<id> :
 *                                            // 'messages' = modèles de messages du bot,
 *                                            // 'apparence' = thème, couleurs… d'un overlay,
 *                                            // avec son aperçu en direct (url + '?demo=1'),
 *                                            // 'transition' = créateur de la transition de scène,
 *                                            // 'jeux' = sources OBS affichées selon le jeu lancé
 *     dock: false                            // pas de ligne dans le dock OBS (facultatif) :
 *                                            // outil sans état à surveiller pendant le stream
 *   }
 *
 * Un overlay a toujours un ?demo=1 : c'est lui que sa page affiche en aperçu.
 */

// Sections de l'accueil, dans l'ordre d'affichage. Un groupe sans fonctionnalité n'est
// pas affiché ; une fonctionnalité sans groupe connu tombe dans le dernier.
window.FEATURE_GROUPS = [
  { id: 'overlays', nom: 'Overlays' },
  { id: 'bot', nom: 'Bot du chat' },
  { id: 'obs', nom: 'Dans OBS' }
];

window.FEATURES = [
  {
    id: 'poll_overlay',
    nom: 'Overlay sondage',
    description: 'Ton sondage à l\'écran pendant qu\'il tourne, avec les votes en direct, puis le résultat.',
    url: '/poll.html',
    taille: [660, 720],
    obs: 'Dans les propriétés de la source, décoche « Éteindre la source quand elle n\'est pas ' +
         'visible ». Le fond est transparent : l\'overlay n\'apparaît que pendant un sondage.',
    groupe: 'overlays',
    comptes: ['twitch'],
    reglages: 'apparence'
  },
  {
    id: 'prediction_overlay',
    nom: 'Overlay prédiction',
    description: 'Ta prédiction à l\'écran, avec les mises en direct, puis l\'issue gagnante.',
    url: '/prediction.html',
    taille: [660, 720],
    obs: 'Dans les propriétés de la source, décoche « Éteindre la source quand elle n\'est pas ' +
         'visible ». Le fond est transparent : l\'overlay n\'apparaît que pendant une prédiction.',
    groupe: 'overlays',
    comptes: ['twitch'],
    reglages: 'apparence'
  },
  {
    id: 'polls',
    nom: 'Sondages et prédictions dans le chat',
    description: 'Quand tu lances un sondage ou une prédiction, le bot l\'annonce dans le chat, ' +
                 'puis donne le résultat à la fin.',
    url: null,
    obs: 'Rien à ajouter dans OBS : le bot écrit directement dans ton chat.',
    groupe: 'bot',
    comptes: ['twitch', 'bot'],
    reglages: 'messages'
  },
  {
    id: 'dock',
    nom: 'Dock OBS',
    description: 'Un petit panneau dans OBS, à côté de tes scènes : l\'état de Twitch Kit ' +
                 'd\'un coup d\'œil pendant le stream.',
    url: '/dock.html',
    obs: 'Dans OBS, menu Docks → Docks personnalisés du navigateur. Sur la ligne vide, écris ' +
         '« Twitch Kit » comme nom, colle l\'adresse ci-dessus comme URL, puis clique sur ' +
         'Appliquer. Le dock apparaît : fais-le glisser où tu veux dans la fenêtre d\'OBS.',
    groupe: 'obs',
    comptes: [],
    dock: false
  },
  {
    id: 'transition',
    nom: 'Transition de scène',
    description: 'Une transition néon aux couleurs du stream, en vidéo pour OBS.',
    url: null,
    obs: 'Ce n\'est pas une source : règle la transition ci-dessous, exporte la vidéo, puis ' +
         'ajoute-la dans OBS comme transition Stinger en suivant la marche à suivre en bas de page.',
    groupe: 'obs',
    comptes: [],
    reglages: 'transition',
    dock: false
  },
  {
    id: 'game_sources',
    nom: 'Sources selon le jeu',
    description: 'Une source de tes scènes (ta manette…) qui ne s\'affiche que pendant les ' +
                 'jeux choisis.',
    url: null,
    obs: 'Rien à ajouter dans OBS : garde ta source dans tes scènes, Twitch Kit l\'affiche ' +
         'et la masque tout seul. OBS doit être ouvert, avec le script Twitch Kit chargé.',
    groupe: 'obs',
    comptes: [],
    reglages: 'jeux'
  }
];
