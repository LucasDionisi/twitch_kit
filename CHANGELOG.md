# Nouveautés de Twitch Kit

Chaque version, en langage simple : ce qui change pour toi, et ce qu'il faut faire après
la mise à jour. La section de chaque version devient la description de sa page de
téléchargement.

## À venir

## v1.0.1 — 2026-09-26

### Nouveautés

- Chaque version a maintenant une description claire sur sa page de téléchargement : ce
  qui change pour toi, et ce qu'il faut faire après la mise à jour.

### À faire après la mise à jour

Rien : cette version ne change rien au fonctionnement. Si tu es déjà en v1.0.0, tu peux
attendre la prochaine.

## v1.0.0 — 2026-09-26

### Nouveautés

- **Page d'accueil repensée** : une vignette par compte et par outil, avec son état d'un
  coup d'œil. Clique sur une vignette pour ouvrir sa page (réglages, adresse à copier).
- **Overlay sondage** : ton sondage s'affiche à l'écran quand tu le lances, les votes
  bougent en direct, puis le résultat s'affiche avec le gagnant mis en avant, avant de
  disparaître tout seul.
- **Overlay prédiction** : pareil pour les prédictions, avec un face-à-face quand il y a
  deux issues, l'étape « mises fermées », puis l'issue gagnante (ou l'annulation).
- **Deux thèmes pour les overlays**, « Néon circuit » et « Néon CRT », avec couleurs,
  taille, durée du résultat, éléments affichés et textes à régler. Un aperçu en direct
  montre le rendu pendant que tu règles.
- **Le bot annonce tes sondages et prédictions dans le chat** : au lancement, quand les
  mises ferment, au résultat et en cas d'annulation. Chaque message est modifiable, et un
  bouton **Tester** envoie un exemple dans ton chat. Le bot peut écrire en message normal
  ou en annonce colorée.

### À faire après la mise à jour

1. Sur la page d'accueil, ouvre **Chaîne Twitch** et clique sur **Autoriser** : Twitch doit
   te demander l'accès à tes sondages et prédictions.
2. Si tu utilises le bot : refais son autorisation dans une **fenêtre de navigation
   privée** (étape 4 du guide), pour qu'il puisse faire des annonces. Pour les annonces,
   il doit aussi être modérateur : tape `/mod` suivi de son pseudo dans ton chat.
3. Pour les overlays : ajoute-les dans OBS depuis leur page (source **Navigateur**,
   **660 × 720**).

## v0.1.0 — 2026-09-26

### Nouveautés

- Première version : la page d'accueil pour connecter ta chaîne Twitch, le compte du bot
  et Spotify, et le lancement automatique avec OBS.
