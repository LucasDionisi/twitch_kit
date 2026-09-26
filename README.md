# Twitch Kit

Des outils pour ton stream Twitch, qui s'allument tout seuls avec OBS.

**Il n'y a rien à installer.** Tu télécharges un dossier, tu le branches sur OBS, et
tout le reste se fait depuis une page de ton navigateur.

La mise en place se fait **une seule fois** et prend environ 15 minutes.

---

## Avant de commencer

Il te faut :

- **OBS Studio**, sur un PC Windows ;
- ton **compte Twitch** ;
- la **double authentification** activée sur ce compte Twitch. Si ce n'est pas déjà fait :
  sur Twitch, clique sur ton avatar → **Paramètres** → **Sécurité et confidentialité** →
  **Activer l'authentification à deux facteurs**.

---

## Étape 1 — Télécharger

1. Sur cette page GitHub, regarde dans la colonne de droite et clique sur **Releases**.
2. Dans la version la plus haute de la liste, clique sur **twitch_kit.zip** pour le
   télécharger.
3. Va dans ton dossier **Téléchargements**. Fais un **clic droit** sur `twitch_kit.zip` →
   **Propriétés**.
4. En bas de la fenêtre, coche la case **Débloquer**, puis clique sur **OK**.
   *(Si tu ne vois pas cette case, tout va bien, passe à la suite.)*
5. Fais un **clic droit** sur `twitch_kit.zip` → **Extraire tout…** → choisis ton dossier
   **Documents** → **Extraire**.

Tu as maintenant un dossier `Documents\twitch_kit`.

⚠️ **Ne déplace plus jamais ce dossier.** OBS a besoin qu'il reste à cet endroit.

---

## Étape 2 — Brancher sur OBS

1. Ouvre OBS.
2. En haut, clique sur le menu **Outils**, puis sur **Scripts**.
3. En bas à gauche de la fenêtre, clique sur le bouton **+**.
4. Va dans `Documents\twitch_kit` et choisis le fichier **obs_twitch_kit.lua**.
5. Clique sur le bouton **Ouvrir la page d'accueil**.

Ton navigateur s'ouvre sur la **page d'accueil** de Twitch Kit.

⭐ **Ajoute cette page à tes favoris.** C'est là que tout se règle.
Elle ne s'affiche que quand OBS est ouvert : c'est normal.

Elle montre une **vignette** par compte et par outil, avec son état (point vert = prêt).
Clique sur une vignette pour ouvrir sa page, et sur **← Accueil** pour revenir.

---

## Étape 3 — Connecter ta chaîne Twitch

Twitch demande de créer une « application » pour donner le droit à Twitch Kit de lire ce
qui se passe sur ta chaîne. C'est gratuit, et personne d'autre ne la voit.

Garde la page d'accueil ouverte dans un onglet : tu vas copier des choses entre les deux.

**A. Créer l'application**

1. Dans un nouvel onglet, va sur <https://dev.twitch.tv/console/apps> et connecte-toi
   avec ton compte Twitch.
2. Clique sur **Register Your Application** (Enregistrer votre application).
3. Remplis le formulaire :
   - **Name** (Nom) : invente un nom, par exemple `twitchkit-` suivi de ton pseudo.
   - **OAuth Redirect URLs** : retourne sur la page d'accueil et clique sur la vignette
     **Chaîne Twitch**. Clique sur **Clés de l'application Twitch**, puis sur le bouton
     **Copier**. Reviens sur Twitch et colle (Ctrl+V).
   - **Category** (Catégorie) : choisis **Broadcaster Suite**.
   - **Client Type** (Type de client) : choisis **Confidential** (Confidentiel).
4. Coche « Je ne suis pas un robot » si on te le demande, puis clique sur **Create**
   (Créer).

**B. Récupérer les deux clés**

1. Dans la liste, à côté de ton application, clique sur **Manage** (Gérer).
2. Tout en bas, tu vois **Client ID** : copie ce code et colle-le dans la case
   **Client ID** de la page d'accueil.
3. Sur Twitch, clique sur **New Secret** (Nouveau secret), puis sur **OK**. Un code
   apparaît : copie-le et colle-le dans la case **Secret** de la page d'accueil.
   *(Twitch ne le montre qu'une seule fois. Si tu le perds, reclique sur New Secret.)*
4. Sur la page d'accueil, clique sur **Enregistrer**.

**C. Autoriser**

1. Clique sur le bouton violet **Autoriser ma chaîne**.
2. Twitch te demande si tu es d'accord : clique sur **Autoriser**.

Tu reviens sur la page d'accueil, et la vignette **Chaîne Twitch** affiche
**Connecté : ton pseudo** avec un point vert. 🎉

**C'est terminé pour l'essentiel.** Les étapes 4 et 5 sont facultatives.

---

## Étape 4 — Le bot *(facultatif)*

Le bot est un second compte Twitch qui écrira dans ton chat.

1. Crée un nouveau compte Twitch pour ton bot (déconnecte-toi de Twitch, puis
   **S'inscrire**). Reconnecte-toi ensuite avec ton compte habituel.
2. Dans le chat de ta chaîne, écris `/mod` suivi du pseudo du bot, par exemple
   `/mod monbot`, puis Entrée. Ton bot devient modérateur.
3. Sur la page d'accueil, clique sur la vignette **Compte du bot**, puis sur **Pseudo du bot**,
   écris son pseudo et clique sur **Enregistrer**.
4. Sur la même page, clique sur **Copier**.
5. Ouvre une **fenêtre de navigation privée** : appuie en même temps sur
   **Ctrl + Maj + N**.
6. Dans cette fenêtre, va sur <https://www.twitch.tv>, et connecte-toi avec **le compte du
   bot**.
7. Toujours dans cette fenêtre, clique dans la barre d'adresse, colle (Ctrl+V) et appuie
   sur Entrée. Clique sur **Autoriser**.
8. Ferme la fenêtre privée et retourne sur la page d'accueil.

La vignette **Compte du bot** affiche **Connecté : pseudo du bot**.

*Pourquoi la fenêtre privée ? Sinon Twitch utilise le compte déjà connecté, c'est-à-dire
le tien. Si ça arrive, pas de panique : rien n'est enregistré, recommence simplement à
l'étape 5.*

---

## Étape 5 — Spotify *(facultatif)*

Pour afficher la musique que tu écoutes. Un compte Spotify gratuit suffit.

1. Va sur <https://developer.spotify.com/dashboard> et connecte-toi avec ton compte
   Spotify. Accepte les conditions si on te le demande.
2. Clique sur **Create app**.
3. Remplis :
   - **App name** : ce que tu veux, par exemple `Twitch Kit` ;
   - **App description** : ce que tu veux, par exemple `Mon stream` ;
   - **Redirect URIs** : sur la page d'accueil, clique sur la vignette **Spotify**, puis sur
     **Clés de l'application Spotify**, puis sur **Copier**. Reviens sur Spotify, colle,
     et clique sur **Add** ;
   - coche **Web API** ;
   - coche la case qui accepte les conditions.
4. Clique sur **Save**.
5. Clique sur **Settings**. Copie le **Client ID** et colle-le dans la case **Client ID**
   de la page d'accueil.
6. Sur Spotify, clique sur **View client secret**, copie le code et colle-le dans la case
   **Secret** de la page d'accueil.
7. Clique sur **Enregistrer**, puis sur **Autoriser Spotify**, puis sur **Accepter**.

---

## Ajouter un outil dans OBS

La partie **Fonctionnalités** de la page d'accueil liste les outils disponibles.
Clique sur la vignette d'un outil : sa page te donne une adresse à copier et une taille.

Pour en ajouter un dans OBS :

1. Dans OBS, sélectionne ta scène. Dans le cadre **Sources**, clique sur **+** →
   **Navigateur** → **OK**.
2. Dans la case **URL**, efface ce qui est écrit et colle l'adresse copiée depuis la page
   d'accueil.
3. Mets la **Largeur** et la **Hauteur** indiquées sur la page d'accueil.
4. Vérifie que ces deux cases sont **décochées** :
   - **Fichier local**
   - **Éteindre la source quand elle n'est pas visible**
5. Clique sur **OK**.

---

## Sondages et prédictions dans le chat

Quand tu lances un sondage ou une prédiction sur Twitch, le bot l'annonce dans ton chat,
puis donne le résultat à la fin. Il faut que ta chaîne **et** le bot soient connectés
(étapes 3 et 4). Rien à ajouter dans OBS.

Sur la page d'accueil, clique sur la vignette **Sondages et prédictions dans le chat**.
Dans la partie **Réglages** de sa page :

- **Messages activés** coupe ou rallume tout d'un coup.
- **Style** : **Message** pour un message normal, ou **Annonce** pour un message mis en
  avant, en couleur. Pour les annonces, le bot doit être modérateur (étape 4, point 2).
- Chaque moment (lancement, mises fermées, résultat, annulation) a son interrupteur et son
  texte. Les mots entre accolades, comme **{titre}**, sont remplacés par la vraie valeur :
  clique dessus pour les ajouter au texte. **Texte par défaut** remet le texte d'origine.
- **Tester** envoie un exemple dans ton chat, pour voir le rendu.

N'oublie pas de cliquer sur **Enregistrer** en bas.

---

## Mettre à jour

Quand une nouvelle version sort :

1. Télécharge le nouveau **twitch_kit.zip** (comme à l'étape 1).
2. N'oublie pas : clic droit → **Propriétés** → **Débloquer** → **OK**.
3. **Ferme OBS.**
4. Clic droit sur le zip → **Extraire tout…** → choisis **Documents** (le même endroit que
   la première fois) → **Extraire**. Si Windows demande quoi faire des fichiers qui
   existent déjà, choisis **Remplacer**.
5. Rouvre OBS.

Tes réglages sont gardés : tu n'as rien à refaire.
Si une vignette de la page d'accueil affiche **Autorisation à refaire**, ouvre-la et clique
sur son bouton **Autoriser**.

---

## Si quelque chose ne marche pas

**La page d'accueil ne s'ouvre pas.**
Vérifie qu'OBS est ouvert. Dans OBS → **Outils** → **Scripts**, clique sur
**obs_twitch_kit.lua**, puis sur **Démarrer maintenant**, et réessaie.

**Rien ne marche depuis une mise à jour.**
Tu as sûrement oublié de **Débloquer** le zip. Ferme OBS, recommence la mise à jour en
cochant bien **Débloquer**, puis rouvre OBS.

**Twitch affiche « redirect_mismatch » ou parle d'URL de redirection.**
L'adresse collée à l'étape 3-A n'est pas la bonne. Sur <https://dev.twitch.tv/console/apps>,
clique sur **Manage**, efface l'adresse, recopie-la avec le bouton **Copier** de la page
d'accueil, et clique sur **Save**.

**Une vignette affiche « Autorisation à refaire ».**
Ouvre-la et clique sur son bouton **Autoriser**. Ça arrive après certaines mises à jour, ou
si tu as changé ton mot de passe Twitch. Pour le bot, refais l'étape 4 à partir du point 5,
dans une **fenêtre de navigation privée**.

**Le bot n'annonce pas les sondages ou les prédictions.**
Ouvre la vignette **Sondages et prédictions dans le chat** sur la page d'accueil : elle dit
ce qui manque. Vérifie aussi que **Messages activés** est allumé dans ses **Réglages**, puis
clique sur **Tester**.

**Le bot écrit en message normal alors que tu as choisi « Annonce ».**
Le bot n'est pas modérateur de ta chaîne : dans ton chat, écris `/mod` suivi du pseudo du
bot, puis Entrée.

**Spotify affiche « INVALID_CLIENT ».**
Une des deux clés Spotify est fausse. Recopie-les (étape 5, points 5 et 6), puis
**Enregistrer**.

**Le bot est connecté avec ton compte à toi.**
Refais l'étape 4 à partir du point 5, bien dans une **fenêtre de navigation privée**.

**Ton antivirus bloque un fichier.**
Autorise le dossier `Documents\twitch_kit`. Tout fonctionne sur ton PC : rien n'est envoyé
ailleurs qu'à Twitch et Spotify.

**Toujours bloqué ?**
Dans OBS → **Outils** → **Scripts** → **obs_twitch_kit.lua**, clique sur
**Ouvrir le journal**. Envoie le texte qui s'affiche à la personne qui t'a donné l'outil.

---

🔒 **Ne partage jamais** les dossiers `config` et `data` qui se trouvent dans
`Documents\twitch_kit` : ils contiennent tes clés secrètes.
