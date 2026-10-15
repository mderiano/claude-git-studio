# Git Studio

**Français** · [English](README.en.md)

Un client git complet dans un panneau de Claude Code, dans le terminal comme dans l’app de bureau : le graphe des commits, le statut avec staging par hunk, les branches, les tags, les worktrees, le stash, les remotes et le reflog, avec merge, rebase, cherry-pick, reset, bisect et une console pour tout le reste.

L’interface du panneau est en français.

## Ouvrir

- **`/git`** ouvre le panneau ; **`/git log`** (ou `status`, `branches`, `tags`, `worktrees`, `stash`, `remotes`, `reflog`, `console`) l’ouvre sur cette vue.
- **`/git <commande>`** exécute une commande git et affiche sa sortie dans la conversation : `/git log --oneline -5`.
- **Claude** peut l’ouvrir lui-même (outil `mcp__git-studio__open`) : « montre-moi le commit abc123 dans Git Studio ».

Dans le terminal, quand le panneau a le focus : `1` à `9` changent d’onglet, `r` rafraîchit, `f` fetch, `p` pull, `u` push, Tab et les flèches se déplacent, Échap revient au prompt.

## Les vues

- **Statut** : fichiers indexés, modifiés, non suivis et en conflit, avec le diff de chacun. Indexer, désindexer ou annuler un fichier, tout, ou **un seul hunk**. Commit (sujet et description), commit `-a`, amend, commit + push. Un bouton fait rédiger le message par Claude dans le style du dépôt, un autre lui demande une revue des changements indexés. Les conflits se résolvent avec la version courante, la version entrante, ou en marquant le fichier résolu.
- **Historique** : le graphe des commits, une ligne par commit, pour toutes les branches, la branche courante ou une branche choisie, filtrable par message, auteur, fichier ou contenu (`-S`). Un clic ouvre le commit : auteur, parents, refs, message, fichiers et leurs diffs. Depuis un commit : checkout détaché, **cherry-pick**, revert, merge, rebase, reset soft / mixed / hard, bisect, nouvelle branche ou nouveau tag, restaurer un fichier à cette version, historique d’un fichier, explication par Claude. Plusieurs commits se sélectionnent pour un cherry-pick ou un revert groupé, appliqués du plus ancien au plus récent.
- **Branches** : créer (depuis HEAD ou n’importe quelle branche, avec ou sans bascule), basculer, merge (ff, `--no-ff`, `--squash`), rebase de la branche courante dessus, mise à jour fast-forward sans checkout, push (upstream posé au premier push), push forcé `--force-with-lease`, renommer, choisir ou retirer l’upstream, supprimer. Pour une branche distante : créer la branche locale qui la suit, checkout, merge, rebase, la supprimer sur le remote.
- **Tags** : créer un tag léger ou annoté sur n’importe quelle ref, checkout, voir le commit, créer une branche depuis le tag, push d’un tag ou de tous, supprimer en local ou sur le remote.
- **Worktrees** : créer (nouvelle branche ou branche existante), ouvrir un worktree dans le panneau, copier son chemin, verrouiller, déplacer, supprimer, nettoyer les orphelins.
- **Stash** : créer (fichiers suivis, avec les non suivis, en gardant l’index, ou l’index seul), voir le diff, appliquer, pop, supprimer, créer une branche depuis un stash.
- **Remotes** : fetch, pull (par défaut, `--ff-only`, `--rebase`, `--no-rebase`), push, push forcé, push des tags, ajouter, renommer, changer l’URL, prune, supprimer.
- **Reflog** : chaque position de HEAD, avec les actions d’un commit, pour retrouver un travail perdu après un reset ou un rebase.
- **Console** : toute autre commande git (blame, submodule, config, `rebase --onto`…), avec l’historique des sorties.

En haut du panneau : la branche, son upstream, l’avance et le retard, et l’opération en cours (merge, rebase, cherry-pick, revert, am, bisect) avec Continuer, Passer, Abandonner et « Résoudre avec Claude ». « Dépôt… » ouvre un autre dépôt (un chemin, un dépôt récent, un worktree) ; hors d’un dépôt, le panneau propose `git init` et le clone.

Le panneau se met à jour seul : toutes les 4 secondes tant qu’il est affiché, et à la fin de chaque tour de Claude. La ligne de statut sous le prompt montre la branche, l’avance, le retard et le nombre de fichiers modifiés.

Chaque action destructrice (supprimer une branche, un tag, un worktree, un stash ou un remote, reset `--hard`, annuler des modifications, push forcé, rebase, abandonner une opération…) demande une confirmation qui montre la commande git exacte. La sortie de chaque commande s’affiche sous l’en-tête.

## Installation

Dans une session Claude Code lancée dans un terminal :

```
/plugin install git-studio --marketplace mderiano/claude-git-studio
```

Réponds `y` pour ajouter la marketplace, puis choisis la portée « user » pour l’avoir dans toutes tes sessions (terminal et app de bureau).

Ou en ligne de commande :

```sh
claude plugin marketplace add mderiano/claude-git-studio
claude plugin install git-studio@claude-git-studio --scope user
```

Mettre à jour : `claude plugin marketplace update claude-git-studio`, puis `claude plugin update git-studio@claude-git-studio` et `/reload-plugins` dans une session ouverte.

Il faut Claude Code 2.1.295 ou plus récent (`claude update`), car le plugin utilise l’API des hooks de fonctions (encore en accès anticipé), et git 2.35 ou plus récent.

### Développer

```sh
claude --plugin-dir /chemin/vers/claude-git-studio   # charger le dossier pour une session
claude plugin validate /chemin/vers/claude-git-studio
claude plugin test /chemin/vers/claude-git-studio
```

`tests/fixtures.ts` contient de vraies sorties git, enregistrées sur un dépôt de démonstration.

## Limites

- Claude Code lance git **sans les hooks du dépôt** quand c’est un plugin qui l’exécute : un commit fait depuis le panneau ne déclenche ni `pre-commit` ni `commit-msg`.
- Rien d’interactif : pas d’éditeur ni de saisie au clavier, donc pas de `rebase -i` ni de `add -p` (le staging par hunk est dans la vue Statut), et pas de mot de passe demandé pendant un push ; utilise un agent SSH ou un credential helper.
- L’historique se charge par pages de 150 commits ; chaque section du statut montre ses 300 premiers fichiers, et un diff est coupé à 40 000 caractères.

## Licence

MIT
