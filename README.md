# Twitch Kit

Des outils pour ton stream Twitch, qui s'allument tout seuls avec OBS.
**Rien à installer** : tu télécharges un dossier, tu le branches sur OBS, et tout se règle
ensuite depuis une page de ton navigateur, la **page d'accueil**.

La mise en place se fait **une seule fois** (environ 15 minutes).

**Sommaire**

1. [Installer](#1--installer) — télécharger, brancher sur OBS, connecter ta chaîne
2. [Options](#2--options-facultatif) — le bot du chat, Spotify
3. [Les outils](#3--les-outils) — ce qu'il y a, et comment les mettre dans OBS
4. [Mettre à jour](#4--mettre-à-jour)
5. [Si quelque chose ne marche pas](#5--si-quelque-chose-ne-marche-pas)

---

## 1 — Installer

Il te faut **OBS Studio** sur un PC Windows, et ton **compte Twitch** avec la **double
authentification** activée (sur Twitch : avatar → **Paramètres** → **Sécurité et
confidentialité** → **Activer l'authentification à deux facteurs**).

### Télécharger

1. Sur cette page GitHub, colonne de droite : **Releases**. Dans la version la plus haute,
   clique sur **twitch_kit.zip**.
2. Dans **Téléchargements** : clic droit sur `twitch_kit.zip` → **Propriétés** → coche
   **Débloquer** en bas → **OK**. *(Pas de case ? Tout va bien, continue.)*
3. Clic droit sur `twitch_kit.zip` → **Extraire tout…** → choisis **Documents** →
   **Extraire**.

Tu as maintenant un dossier `Documents\twitch_kit`.
⚠️ **Ne le déplace plus jamais** : OBS a besoin qu'il reste là.

### Brancher sur OBS

1. Dans OBS : menu **Outils** → **Scripts** → bouton **+** en bas à gauche.
2. Choisis `Documents\twitch_kit\obs_twitch_kit.lua`.
3. Clique sur **Ouvrir la page d'accueil**.

⭐ **Mets la page d'accueil en favori** : c'est là que tout se règle. Elle ne s'ouvre que
quand OBS est ouvert, c'est normal. Chaque compte et chaque outil y a sa **vignette**, avec
un point de couleur (vert = prêt) ; clique dessus pour ouvrir sa page.

### Connecter ta chaîne Twitch

Twitch demande de créer une « application » (gratuite, visible de toi seul) pour que
Twitch Kit puisse lire ce qui se passe sur ta chaîne. Garde la page d'accueil ouverte dans
un onglet : tu vas copier des choses entre les deux.

**A. Créer l'application**

1. Va sur <https://dev.twitch.tv/console/apps>, connecte-toi, puis **Register Your
   Application**.
2. Remplis :
   - **Name** : un nom inventé, par exemple `twitchkit-` suivi de ton pseudo ;
   - **OAuth Redirect URLs** : sur la page d'accueil, vignette **Chaîne Twitch** →
     **Clés de l'application Twitch** → **Copier**, puis colle ici ;
   - **Category** : **Broadcaster Suite** ;
   - **Client Type** : **Confidential**.
3. Clique sur **Create**.

**B. Récupérer les deux clés**

1. À côté de ton application, clique sur **Manage**.
2. Copie le **Client ID** (tout en bas) dans la case **Client ID** de la page d'accueil.
3. Clique sur **New Secret** → **OK**, et copie le code dans la case **Secret**.
   *(Twitch ne le montre qu'une fois : si tu le perds, reclique sur New Secret.)*
4. Sur la page d'accueil, clique sur **Enregistrer**.

**C. Autoriser**

Clique sur **Autoriser ma chaîne**, puis sur **Autoriser** chez Twitch. La vignette
**Chaîne Twitch** affiche **Connecté : ton pseudo** avec un point vert. 🎉

**C'est terminé pour l'essentiel.**

---

## 2 — Options *(facultatif)*

### Le bot du chat

Un second compte Twitch qui écrit dans ton chat (annonces des sondages et prédictions).

1. Crée un nouveau compte Twitch pour le bot, puis reconnecte-toi avec ton compte habituel.
2. Dans ton chat, écris `/mod` suivi du pseudo du bot (ex. `/mod monbot`) : il devient
   modérateur.
3. Page d'accueil → vignette **Compte du bot** → **Pseudo du bot** : écris son pseudo,
   **Enregistrer**, puis **Copier**.
4. Ouvre une **fenêtre de navigation privée** (**Ctrl + Maj + N**), connecte-toi sur
   <https://www.twitch.tv> avec **le compte du bot**.
5. Dans cette fenêtre, colle l'adresse copiée dans la barre d'adresse, Entrée, puis
   **Autoriser**. Ferme la fenêtre privée.

La vignette **Compte du bot** affiche **Connecté : pseudo du bot**.
*La fenêtre privée évite que Twitch prenne ton compte à toi. Si ça arrive quand même,
refais simplement les points 4 et 5.*

### Spotify

Pour afficher la musique que tu écoutes (un compte gratuit suffit).

1. Va sur <https://developer.spotify.com/dashboard>, connecte-toi, puis **Create app**.
2. Remplis **App name** et **App description** comme tu veux. Dans **Redirect URIs**,
   colle l'adresse copiée depuis la page d'accueil (vignette **Spotify** → **Clés de
   l'application Spotify** → **Copier**) et clique sur **Add**. Coche **Web API** et
   les conditions, puis **Save**.
3. Dans **Settings**, copie le **Client ID**, puis le code de **View client secret**, dans
   les cases de la page d'accueil.
4. **Enregistrer** → **Autoriser Spotify** → **Accepter**.

---

## 3 — Les outils

Chaque outil a sa vignette sur la page d'accueil. Sa page te dit **exactement quoi faire
dans OBS** et contient ses réglages, avec un aperçu en direct pour les overlays.

| Outil | Ce qu'il fait | Dans OBS |
| --- | --- | --- |
| **Overlay sondage**, **Overlay prédiction** | Ton sondage ou ta prédiction à l'écran, votes en direct puis résultat. Invisibles le reste du temps. | Une source Navigateur chacun |
| **Sondages et prédictions dans le chat** | Le bot annonce le lancement et le résultat. Textes modifiables, bouton **Tester**. | Rien |
| **Dock OBS** | L'état de Twitch Kit dans un panneau d'OBS, pendant le stream. | Un dock |
| **Transition de scène** | Une transition néon aux couleurs du stream. | Une transition Stinger |
| **Sources selon le jeu** | Une source (ta manette…) visible seulement pendant les jeux choisis. | Rien |

Après chaque réglage, clique sur **Enregistrer** : OBS change tout de suite, sans rien
recharger.

### Ajouter une source Navigateur (overlays)

1. Sur la page de l'outil, clique sur **Copier** à côté de l'adresse.
2. Dans OBS, cadre **Sources** → **+** → **Navigateur** → **OK**.
3. Colle l'adresse dans **URL**, et mets la **Largeur** et la **Hauteur** indiquées sur la
   page de l'outil.
4. Décoche **Fichier local** et **Éteindre la source quand elle n'est pas visible**, puis
   **OK**.

### Ajouter le dock

1. Sur la page **Dock OBS**, copie l'adresse.
2. Dans OBS : menu **Docks** → **Docks personnalisés du navigateur**. Sur la ligne vide,
   écris **Twitch Kit** comme nom, colle l'adresse comme URL, puis **Appliquer**.
3. Fais glisser le dock où tu veux.

### Ajouter la transition

1. Sur la page **Transition de scène**, règle-la puis clique sur **Exporter la vidéo pour
   OBS** (garde l'onglet au premier plan jusqu'à **Terminé**). Range la vidéo dans un
   dossier où elle ne bougera plus.
2. Dans OBS, **Transitions de scène** (en bas à droite) → **+** → **Stinger**.
3. **Fichier vidéo** : la vidéo exportée. **Type de point de transition** : **Temps
   (millisecondes)**, avec le nombre affiché sur la page. **Track Matte** décoché,
   **Précharger la vidéo en mémoire** coché → **OK**.

Si tu changes un réglage, exporte à nouveau et remplace la vidéo (le point de transition
peut changer aussi).

### Sources selon le jeu

1. Lance ton jeu une fois, pour qu'il apparaisse dans la liste.
2. Sur la page **Sources selon le jeu**, choisis ta source OBS, puis ajoute tes jeux avec
   **Ajouter un jeu** (dans la liste, ou tape le nom du programme, ex.
   `RocketLeague.exe`). **Enregistrer**.

Deux jeux avec le même nom de programme ? Choisis la ligne **ce dossier seulement**, ou
colle le chemin du jeu (dans l'Explorateur : Maj + clic droit sur le programme →
**Copier en tant que chemin d'accès**).
Si tu renommes la source dans OBS, renomme-la aussi sur la page.

---

## 4 — Mettre à jour

1. Télécharge le nouveau **twitch_kit.zip** et **Débloque**-le (comme à l'installation).
2. **Ferme OBS.**
3. Extrais le zip dans **Documents**, comme la première fois. Si Windows demande quoi
   faire des fichiers existants : **Remplacer**.
4. Rouvre OBS.

Tes réglages sont gardés. Si une vignette affiche **Autorisation à refaire**, ouvre-la et
clique sur **Autoriser**.

---

## 5 — Si quelque chose ne marche pas

Commence par regarder la vignette concernée sur la page d'accueil : elle dit ce qui
manque.

- **La page d'accueil ne s'ouvre pas** — Vérifie qu'OBS est ouvert. Sinon : OBS →
  **Outils** → **Scripts** → **obs_twitch_kit.lua** → **Démarrer maintenant**.
- **Plus rien ne marche après une mise à jour** — Le zip n'a pas été **Débloqué**. Ferme
  OBS et refais la mise à jour.
- **Twitch parle de « redirect_mismatch »** — Sur <https://dev.twitch.tv/console/apps>
  → **Manage**, remplace l'adresse par celle du bouton **Copier** de la page d'accueil,
  puis **Save**.
- **« Autorisation à refaire »** — Ouvre la vignette et clique sur **Autoriser** (pour le
  bot, dans une fenêtre de navigation privée). Normal après certaines mises à jour ou un
  changement de mot de passe.
- **Le bot est connecté avec ton compte à toi** — Refais les points 4 et 5 du bot, bien
  dans une fenêtre privée.
- **Le bot n'annonce rien** — Vérifie que **Messages activés** est allumé sur la page
  **Sondages et prédictions dans le chat**, puis clique sur **Tester**.
- **Le bot écrit en message normal au lieu d'une annonce** — Il n'est pas modérateur :
  écris `/mod` suivi de son pseudo dans ton chat.
- **Spotify affiche « INVALID_CLIENT »** — Une des deux clés est fausse : recopie-les et
  **Enregistrer**.
- **« OBS ne répond pas » sur Sources selon le jeu** — Ouvre OBS, ou ferme-le et
  rouvre-le (nécessaire une fois après une mise à jour).
- **Ma source ne s'affiche pas en jeu** — Le nom doit être exactement celui de la source
  dans OBS, majuscules comprises. Si le jeu passe par un lanceur, ajoute aussi le
  programme du jeu lui-même, choisi dans la liste pendant que tu joues.
- **L'antivirus bloque un fichier** — Autorise le dossier `Documents\twitch_kit`. Rien
  n'est envoyé ailleurs qu'à Twitch et Spotify.
- **Toujours bloqué ?** — OBS → **Outils** → **Scripts** → **obs_twitch_kit.lua** →
  **Ouvrir le journal**, et envoie le texte à la personne qui t'a donné l'outil.

🔒 **Ne partage jamais** les dossiers `config` et `data` de `Documents\twitch_kit` : ils
contiennent tes clés secrètes.
