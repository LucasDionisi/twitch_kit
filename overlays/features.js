/* Catalogue des fonctionnalités affichées sur la page d'accueil.
 *
 * Vide pour l'instant : la page affiche « Aucune fonctionnalité pour l'instant ».
 * Chaque nouvelle fonctionnalité ajoute une entrée ici, sinon elle n'apparaît pas.
 *
 * Format d'une entrée :
 *   {
 *     id: 'alerts',                          // identifiant court, unique
 *     nom: 'Alertes',                        // titre de la carte
 *     description: 'Follow, sub, raid…',     // une phrase, pour le streamer
 *     url: '/alerts.html',                   // page à coller dans OBS (Source → Navigateur),
 *                                            // ou null si ce n'est pas une source OBS
 *     taille: [1920, 1080],                  // largeur / hauteur de la source OBS
 *     comptes: ['twitch']                    // autorisations requises : 'twitch', 'bot', 'spotify'
 *   }
 */
window.FEATURES = [];
