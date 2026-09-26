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
 *     comptes: ['twitch'],                   // autorisations requises : 'twitch', 'bot', 'spotify'
 *     reglages: 'messages'                   // formulaire de réglages sur la carte (facultatif) :
 *                                            // 'messages' = modèles de messages du bot,
 *                                            // lus sur /settings/<id>, écrits sur /setup/<id>
 *   }
 */
window.FEATURES = [
  {
    id: 'polls',
    nom: 'Sondages et prédictions dans le chat',
    description: 'Quand tu lances un sondage ou une prédiction, le bot l\'annonce dans le chat, ' +
                 'puis donne le résultat à la fin.',
    url: null,
    obs: 'Rien à ajouter dans OBS : le bot écrit directement dans ton chat.',
    comptes: ['twitch', 'bot'],
    reglages: 'messages'
  }
];
