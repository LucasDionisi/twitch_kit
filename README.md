# Twitch Kit

Des outils pour ton stream Twitch, qui se lancent tout seuls avec OBS.
Rien à installer : tout est dans le dossier que tu télécharges.

Ce guide se fait **une seule fois**, en 15 minutes environ. Tu as besoin de :

- OBS Studio sur un PC Windows ;
- ton compte Twitch, avec la **double authentification activée** (Twitch l'exige pour
  l'étape 3 — Paramètres → Sécurité et confidentialité) ;
- *facultatif* : un second compte Twitch pour le bot, un compte Spotify.

---

## 1. Télécharger

1. Va dans la section **Releases** de cette page GitHub (colonne de droite) et télécharge
   **`twitch_kit.zip`** de la version la plus récente.
2. **Avant d'extraire** : clic droit sur le zip → **Propriétés** → coche **Débloquer** en
   bas de la fenêtre → **OK**. Sans ça, Windows peut bloquer les fichiers téléchargés.
3. Clic droit → **Extraire tout**, dans un dossier où il restera, par exemple
   `Documents\twitch_kit`.

> Ne déplace plus ce dossier ensuite : OBS retient son emplacement.

## 2. Brancher sur OBS

1. Dans OBS : menu **Outils** → **Scripts**.
2. Clique sur le **+** en bas à gauche et choisis le fichier **`obs_twitch_kit.lua`** dans
   le dossier `twitch_kit`.
3. Clique sur **Ouvrir la page d'accueil** : ton navigateur s'ouvre sur
   <http://127.0.0.1:8787/>.

**Mets cette page en favori** : c'est là que tout se règle. Elle ne marche que quand OBS
est ouvert.

Le script est mémorisé par **collection de scènes** : si tu changes de collection dans OBS,
refais l'étape 2.

## 3. Connecter ta chaîne Twitch

Twitch demande de créer une « application » pour que les outils aient le droit de lire ta
chaîne. C'est gratuit et ça ne se voit nulle part.

1. Va sur <https://dev.twitch.tv/console/apps> et connecte-toi avec ton compte de streamer.
2. Clique sur **Enregistrer votre application** (*Register Your Application*).
3. Remplis :
   - **Nom** : ce que tu veux, mais unique sur Twitch (ex. `twitchkit-tonpseudo`) ;
   - **URL de redirection OAuth** : sur la page d'accueil, carte **Chaîne Twitch**, clique
     sur **Copier** à côté de l'adresse, puis colle-la ici. Elle doit être exactement
     `http://localhost:8787/auth/callback` ;
   - **Catégorie** : *Broadcaster Suite* ;
   - **Type de client** : *Confidentiel* (*Confidential*).
4. Clique sur **Créer**, puis sur **Gérer** à côté de ton application.
5. Copie l'**ID client** et colle-le dans le champ **Client ID** de la page d'accueil.
6. Clique sur **Nouveau secret**, copie-le et colle-le dans le champ **Secret**.
   (Twitch ne le montre qu'une fois : si tu le perds, refais « Nouveau secret ».)
7. Clique sur **Enregistrer**, puis sur **Autoriser ma chaîne** et accepte.

La carte affiche **Connecté : ton pseudo**. C'est fini pour l'essentiel.

## 4. Le compte du bot *(facultatif)*

Le bot écrit dans ton chat sous son propre nom.

1. Crée un second compte Twitch pour le bot.
2. Dans ton chat, tape `/mod pseudodubot` pour le passer modérateur.
3. Sur la page d'accueil, carte **Compte du bot** : écris son pseudo et **Enregistrer**.
4. Ouvre une **fenêtre de navigation privée** (Ctrl+Maj+N), connecte-toi à Twitch **avec le
   compte du bot**, puis colle dans cette fenêtre l'adresse donnée par la carte (bouton
   **Copier**) et accepte.

La navigation privée évite que Twitch autorise ton compte principal à la place. Si ça
arrive quand même, rien n'est enregistré : recommence simplement.

## 5. Spotify *(facultatif)*

Pour afficher la musique en cours. Un compte gratuit suffit.

1. Va sur <https://developer.spotify.com/dashboard> et clique sur **Create app**.
2. Remplis :
   - **App name** et **App description** : ce que tu veux ;
   - **Redirect URIs** : copie l'adresse depuis la carte **Spotify** de la page d'accueil,
     colle-la et clique sur **Add**. Elle doit être exactement
     `http://127.0.0.1:8787/auth/spotify/callback` ;
   - coche **Web API**, accepte les conditions, **Save**.
3. Dans **Settings**, copie le **Client ID**, puis clique sur **View client secret** et
   copie le secret.
4. Colle les deux dans la carte **Spotify**, **Enregistrer**, puis **Autoriser Spotify**.

## 6. Ajouter les outils dans OBS

La section **Fonctionnalités** de la page d'accueil liste les outils disponibles. Pour
chacun, elle donne l'adresse à copier et la taille de la source.

Dans OBS, pour chaque outil :

1. Dans ta scène, **+** → **Navigateur**.
2. Colle l'adresse dans **URL**, mets la **largeur** et la **hauteur** indiquées.
3. **Fichier local** : décoché.
4. **Éteindre la source quand elle n'est pas visible** : décoché.

## Mettre à jour

1. Télécharge le nouveau `twitch_kit.zip` (et pense à **Débloquer**, voir étape 1).
2. Ferme OBS.
3. Extrais-le **au même endroit**, en acceptant de remplacer les fichiers.

Tes clés et tes autorisations sont gardées : rien à refaire.

## En cas de problème

| Ce que tu vois | Quoi faire |
| --- | --- |
| La page d'accueil ne s'ouvre pas | Vérifie qu'OBS est ouvert et que `obs_twitch_kit.lua` est dans Outils → Scripts. Sinon, clique sur **Démarrer maintenant** dans ce même panneau. |
| Rien ne démarre après une mise à jour | Tu as sûrement oublié **Débloquer** le zip : refais l'étape 1 puis redémarre OBS. |
| « redirect_mismatch » ou « URL de redirection invalide » chez Twitch | L'adresse collée dans l'application Twitch n'est pas exactement celle de la page d'accueil. Recopie-la avec le bouton **Copier**. |
| « Autorisation à refaire » | Clique à nouveau sur **Autoriser** dans la carte concernée. Ça arrive après une mise à jour qui ajoute une fonctionnalité, ou si tu as changé ton mot de passe Twitch. |
| « INVALID_CLIENT » chez Spotify | Le Client ID ou le secret est faux : recolle-les dans la carte Spotify. |
| Le bot est connecté avec le mauvais compte | Refais l'étape 4 dans une fenêtre de **navigation privée**. |
| Ton antivirus bloque un fichier du dossier | Autorise le dossier `twitch_kit` : tout tourne sur ton PC, rien n'est envoyé ailleurs qu'à Twitch et Spotify. |

Si rien de tout ça n'aide, dans OBS → Outils → Scripts → `obs_twitch_kit.lua`, clique sur
**Ouvrir le journal** et envoie son contenu à la personne qui t'a donné l'outil.

> Ne partage jamais le dossier `config` ni le dossier `data` : ils contiennent tes clés et
> tes autorisations.
