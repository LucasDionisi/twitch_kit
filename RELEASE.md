# Branches et publication

Aide-mémoire pour toi (pas pour le streamer) : comment organiser les branches au quotidien,
puis comment publier une version. Une « version », c'est un **tag** git : le pousser
suffit, GitHub fabrique le zip et crée la release tout seul
(`.github/workflows/release.yml`).

## Les branches

| Branche | Rôle | Qui y écrit |
| --- | --- | --- |
| `main` | ce qui est publié : chaque tag `v*` est posé ici | seulement des fusions depuis `develop` (ou un correctif urgent) |
| `develop` | la prochaine version en cours, doit toujours démarrer | les fusions des branches de fonctionnalité |
| `feature/<nom>` | une fonctionnalité ou une correction, le temps de la faire | toi, en direct |

Le chemin d'une modif : `feature/xxx` → `develop` → `main` → tag.

Nommage : court, en minuscules, avec des tirets. Par exemple `feature/chat-overlay`,
`feature/spotify-now-playing` ou `feature/fix-refresh-token`.

### Créer `develop` (une seule fois)

```bash
cd /c/Github/twitch_kit
git switch main
git pull
git switch -c develop
git push -u origin develop
```

### Commencer une fonctionnalité

Toujours partir d'un `develop` à jour :

```bash
git switch develop
git pull
git switch -c feature/chat-overlay
```

Puis tu travailles et commites autant que tu veux :

```bash
git status                 # rien dans config/, data/ ou runtime/ ne doit apparaître
git add .
git commit -m "Overlay chat : affichage des messages"
git push -u origin feature/chat-overlay    # le -u seulement au premier push de la branche
```

Pousser la branche n'est pas obligatoire, mais ça sert de sauvegarde sur GitHub.

### Changer de branche

```bash
git branch                 # liste les branches locales (* = la branche actuelle)
git branch -a              # avec celles de GitHub
git switch develop         # aller sur une branche existante
git switch -c feature/xxx  # en créer une nouvelle depuis la branche actuelle
```

Avant de changer de branche, `git status` doit être propre. Sinon :

- **le travail est fini ou presque** : commite-le (`git add .` puis `git commit -m "…"`) ;
- **c'est du brouillon que tu veux mettre de côté** : range-le avec `git stash`, change de
  branche, puis au retour ressors-le avec `git stash pop` (`git stash list` montre ce qui
  est rangé).

Si tu n'y fais pas attention, git refuse de changer de branche, ou les modifs non
commitées te suivent sur l'autre branche.

### Récupérer les nouveautés de `develop` dans sa fonctionnalité

C'est utile quand une autre fonctionnalité a été fusionnée entre-temps :

```bash
git switch develop
git pull
git switch feature/chat-overlay
git merge develop
```

En cas de conflit, git liste les fichiers concernés. Ouvre-les (VS Code propose « Accept
Current / Incoming / Both »), corrige, puis lance `git add .` et `git commit`. Pour
abandonner la fusion : `git merge --abort`.

### Terminer une fonctionnalité

1. Teste-la (voir « Tester » plus bas).
2. Fusionne-la dans `develop` :

   ```bash
   git switch develop
   git pull
   git merge --no-ff feature/chat-overlay     # --no-ff garde la fonctionnalité groupée dans l'historique
   git push
   ```

3. Supprime la branche, qui ne sert plus :

   ```bash
   git branch -d feature/chat-overlay                 # en local
   git push origin --delete feature/chat-overlay      # sur GitHub (si tu l'avais poussée)
   ```

   `-d` refuse de supprimer une branche qui n'a pas été fusionnée : c'est une sécurité.
   Pour jeter pour de bon une branche ratée, il faut utiliser `-D`.

### Correctif urgent sur la version publiée

Un bug est en prod et `develop` contient des choses pas prêtes ? Pars de `main` :

```bash
git switch main
git pull
git switch -c feature/fix-crash-spotify
# ... correction, commit ...
git switch main
git merge --no-ff feature/fix-crash-spotify
git push
git switch develop
git merge main              # pour que develop ait aussi la correction
git push
git branch -d feature/fix-crash-spotify
```

Ensuite, publie le correctif (étapes 3 à 6 ci-dessous, avec un numéro de correctif).

## Publier une version

### 1. Tester avant de publier

Sur `develop`, avec tout ce qui doit partir :

1. Double-clic sur `start_server_debug.bat` (ferme OBS avant, sinon le port est déjà pris).
2. Ouvre <http://127.0.0.1:8787/> et vérifie que la page d'accueil et ce que tu as ajouté
   marchent.
3. Ferme la fenêtre du serveur.

### 2. Fusionner `develop` dans `main`

```bash
git switch develop
git pull
git status                 # doit être propre
git switch main
git pull
git merge --no-ff develop -m "Version 0.2.0"
git push
git switch develop         # pour ne pas continuer à travailler sur main par erreur
```

### 3. Choisir le numéro de version

Format `vMAJEUR.MINEUR.CORRECTIF`, toujours plus grand que le précédent :

| Ce que tu livres | Exemple |
| --- | --- |
| une correction de bug | `v0.1.0` → `v0.1.1` |
| une nouvelle fonctionnalité | `v0.1.1` → `v0.2.0` |
| un gros changement (le streamer doit refaire quelque chose) | `v0.2.0` → `v1.0.0` |

Dernier tag publié : `git tag --sort=-v:refname | head -1`.

### 4. Créer et pousser le tag

Le tag se pose **sur `main`**, après le `git push` de l'étape 2 :

```bash
git switch main
git tag v0.2.0
git push origin v0.2.0
git switch develop
```

### 5. Vérifier sur GitHub

1. Onglet **Actions** : le run **Release** tourne (environ 1 min) et doit finir en vert ✅.
2. Onglet **Releases** (colonne de droite de la page du repo) : la version apparaît avec
   `twitch_kit.zip`.
3. Tu peux éditer la release (icône crayon) pour réécrire les notes en langage simple :
   c'est ce que lira le streamer.

### 6. Prévenir le streamer

Envoie-lui le lien de la release. Pour mettre à jour, il suit la section « Mettre à jour »
du README : télécharger le zip, **Débloquer**, fermer OBS, extraire par-dessus. Ses clés et
ses autorisations sont gardées (`config/` et `data/` ne sont jamais dans le zip).

Si la version ajoute des permissions Twitch (`SCOPES` dans `src/server.js`), dis-lui qu'il
devra recliquer sur **Autoriser** : la page d'accueil affichera « Autorisation à refaire ».

## Si le run Release échoue (croix rouge ❌)

1. Dans Actions, clique sur le run, puis sur **release**, puis sur l'étape en rouge pour
   lire l'erreur.
2. Si l'erreur est `Resource not accessible by integration` ou `403` : va dans
   **Settings → Actions → General → Workflow permissions**, choisis **Read and write
   permissions**, puis sur la page du run : **Re-run jobs → Re-run all jobs**.
3. Si l'erreur venait du code (il faut un nouveau commit), corrige sur `develop`, refusionne
   dans `main` (étape 2), puis supprime le tag et repose-le sur le commit corrigé :

   ```bash
   git switch main
   git tag -d v0.2.0                   # supprime le tag en local
   git push origin --delete v0.2.0     # et sur GitHub
   git tag v0.2.0
   git push origin v0.2.0
   git switch develop
   ```

   Si une release à moitié créée existe déjà pour ce tag, supprime-la d'abord dans
   **Releases** (Edit → Delete).

## Commandes de dépannage

| Situation | Commande |
| --- | --- |
| Sur quelle branche suis-je ? | `git branch --show-current` |
| Voir l'historique de toutes les branches | `git log --oneline --graph --all -20` |
| Qu'est-ce qui a changé et n'est pas commité ? | `git diff` |
| Annuler les modifs non commitées d'un fichier | `git restore chemin/du/fichier` |
| J'ai commité sur la mauvaise branche (pas encore poussé) | crée la bonne branche avec `git switch -c feature/xxx` : le commit vient avec. Puis `git switch develop` et `git reset --hard origin/develop` pour remettre `develop` comme sur GitHub |
| Nettoyer les branches supprimées sur GitHub | `git fetch --prune` |

## À savoir

- Le zip contient : le script OBS, les lanceurs, `src/`, `overlays/`, `README.md`,
  `VERSION` (le numéro du tag, affiché en bas de la page d'accueil) et `runtime/node.exe`.
  Un nouveau fichier ou dossier à livrer doit être ajouté dans l'étape « Assembler le zip »
  du workflow.
- Node est pris dans la dernière version de la branche `NODE_MAJOR` (en tête du workflow) :
  à monter quand une nouvelle LTS sort.
- Ce fichier, `CLAUDE.md` et `.github/` restent sur GitHub et ne vont pas dans le zip.
- Le workflow Release ne se déclenche que sur un tag : pousser `develop` ou une branche de
  fonctionnalité ne publie rien.
