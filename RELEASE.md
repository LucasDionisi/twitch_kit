# Publier une nouvelle version

Aide-mémoire pour toi (pas pour le streamer). Une « version », c'est un **tag** git : le
pousser suffit, GitHub fabrique le zip et crée la release tout seul
(`.github/workflows/release.yml`).

## 1. Tester avant de publier

1. Double-clic sur `start_server_debug.bat` (ferme OBS avant, sinon le port est déjà pris).
2. Ouvre <http://127.0.0.1:8787/> et vérifie que la page d'accueil et ce que tu as ajouté
   marchent.
3. Ferme la fenêtre du serveur.

## 2. Envoyer le code sur `main`

```bash
cd /c/Github/twitch_kit
git status                 # rien dans config/, data/ ou runtime/ ne doit apparaître
git add .
git commit -m "Ce qui a changé"
git push
```

## 3. Choisir le numéro de version

Format `vMAJEUR.MINEUR.CORRECTIF`, toujours plus grand que le précédent :

| Ce que tu livres | Exemple |
| --- | --- |
| une correction de bug | `v0.1.0` → `v0.1.1` |
| une nouvelle fonctionnalité | `v0.1.1` → `v0.2.0` |
| un gros changement (le streamer doit refaire quelque chose) | `v0.2.0` → `v1.0.0` |

Dernier tag publié : `git tag --sort=-v:refname | head -1`.

## 4. Créer et pousser le tag

```bash
git tag v0.2.0
git push origin v0.2.0
```

Le tag se pose sur le dernier commit : fais-le **après** le `git push` de l'étape 2.

## 5. Vérifier sur GitHub

1. Onglet **Actions** → le run **Release** tourne (environ 1 min) et doit finir en vert ✅.
2. Onglet **Releases** (colonne de droite de la page du repo) → la version apparaît avec
   `twitch_kit.zip`.
3. Tu peux éditer la release (icône crayon) pour réécrire les notes en langage simple :
   c'est ce que lira le streamer.

## 6. Prévenir le streamer

Envoie-lui le lien de la release. Pour mettre à jour, il suit la section « Mettre à jour »
du README : télécharger le zip, **Débloquer**, fermer OBS, extraire par-dessus. Ses clés et
ses autorisations sont gardées (`config/` et `data/` ne sont jamais dans le zip).

Si la version ajoute des permissions Twitch (`SCOPES` dans `src/server.js`), dis-lui qu'il
devra recliquer sur **Autoriser** : la page d'accueil affichera « Autorisation à refaire ».

## Si le run Release échoue (croix rouge ❌)

1. Actions → clique sur le run → **release** → l'étape en rouge pour lire l'erreur.
2. `Resource not accessible by integration` / `403` : **Settings → Actions → General →
   Workflow permissions → Read and write permissions**, puis sur la page du run :
   **Re-run jobs → Re-run all jobs**.
3. Si l'erreur venait du code (il faut un nouveau commit), supprime le tag et repose-le sur
   le commit corrigé :

   ```bash
   git push                            # le commit de correction
   git tag -d v0.2.0                   # supprime le tag en local
   git push origin --delete v0.2.0     # et sur GitHub
   git tag v0.2.0
   git push origin v0.2.0
   ```

   Si une release à moitié créée existe déjà pour ce tag, supprime-la d'abord dans
   **Releases** (Edit → Delete).

## À savoir

- Le zip contient : le script OBS, les lanceurs, `src/`, `overlays/`, `README.md`,
  `VERSION` (le numéro du tag, affiché en bas de la page d'accueil) et `runtime/node.exe`.
  Un nouveau fichier ou dossier à livrer doit être ajouté dans l'étape « Assembler le zip »
  du workflow.
- Node est pris dans la dernière version de la branche `NODE_MAJOR` (en tête du workflow) :
  à monter quand une nouvelle LTS sort.
- Ce fichier, `CLAUDE.md` et `.github/` restent sur GitHub et ne vont pas dans le zip.
