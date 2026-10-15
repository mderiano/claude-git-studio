# Git Studio

[Français](README.md) · **English**

A complete git client in a Claude Code pane, in the terminal and in the desktop app: the commit graph, the status with hunk staging, branches, tags, worktrees, the stash, remotes and the reflog, with merge, rebase, cherry-pick, reset, bisect, and a console for everything else.

The pane speaks English or French: the `language` option picks one (`en` by default, `fr` for French, see [Language](#language)).

## Opening it

- **`/git`** opens the pane; **`/git log`** (or `status`, `branches`, `tags`, `worktrees`, `stash`, `remotes`, `reflog`, `console`) opens it on that view.
- **`/git <command>`** runs a git command and shows its output in the conversation: `/git log --oneline -5`.
- **Claude** can open it on its own (tool `mcp__git-studio__open`): "show me commit abc123 in Git Studio".

In the terminal, while the pane has the focus: `1` to `9` switch tabs, `r` refreshes, `f` fetches, `p` pulls, `u` pushes, Tab and the arrows move, Escape returns to the prompt.

## The views

- **Status**: staged, modified, untracked and conflicted files, each with its diff. Stage, unstage or discard a file, everything, or **a single hunk**. Commit (subject and body), commit `-a`, amend, commit + push. One button has Claude write the message in the repository's style, another asks it to review the staged changes. Conflicts resolve with the current version, the incoming one, or by marking the file resolved.
- **History**: the commit graph, one row per commit, for all branches, the current one or a chosen one, filtered by message, author, file or content (`-S`). A click opens the commit: author, parents, refs, message, files and their diffs. From a commit: detached checkout, **cherry-pick**, revert, merge, rebase, reset soft / mixed / hard, bisect, a new branch or tag, restoring a file to that version, a file's history, an explanation by Claude. Several commits can be selected for one cherry-pick or revert, applied oldest first.
- **Branches**: create (from HEAD or any branch, switching to it or not), switch, merge (ff, `--no-ff`, `--squash`), rebase the current branch onto it, fast-forward without checking out, push (the upstream is set on the first push), force push `--force-with-lease`, rename, set or unset the upstream, delete. For a remote branch: create the local branch that tracks it, check out, merge, rebase, delete it on the remote.
- **Tags**: create a lightweight or annotated tag on any ref, check out, show the commit, branch from the tag, push one tag or all, delete locally or on the remote.
- **Worktrees**: create (new branch or existing one), open a worktree in the pane, copy its path, lock, move, remove, prune.
- **Stash**: create (tracked files, with untracked ones, keeping the index, or the index alone), show the diff, apply, pop, drop, branch from a stash.
- **Remotes**: fetch, pull (default, `--ff-only`, `--rebase`, `--no-rebase`), push, force push, push tags, add, rename, change the URL, prune, remove.
- **Reflog**: every position HEAD took, with a commit's actions, to recover work lost after a reset or a rebase.
- **Console**: any other git command (blame, submodule, config, `rebase --onto`…), with the history of its output.

At the top of the pane: the branch, its upstream, how far ahead and behind it is, and the operation in progress (merge, rebase, cherry-pick, revert, am, bisect) with Continue, Skip, Abort and "Resolve with Claude". "Repository…" opens another repository (a path, a recent one, a worktree); outside a repository, the pane offers `git init` and clone.

The pane refreshes by itself: every 4 seconds while it shows, and at the end of each of Claude's turns. The status line under the prompt shows the branch, ahead, behind and the number of changed files.

Every destructive action (deleting a branch, tag, worktree, stash or remote, reset `--hard`, discarding changes, force push, rebase, aborting an operation…) asks for a confirmation that shows the exact git command. Each command's output shows under the header.

## Installing

In a Claude Code session started in a terminal:

```
/plugin install git-studio --marketplace mderiano/claude-git-studio
```

Answer `y` to add the marketplace, then pick the "user" scope to have it in all your sessions (terminal and desktop app), and the interface language.

Or from the command line:

```sh
claude plugin marketplace add mderiano/claude-git-studio
claude plugin install git-studio@claude-git-studio --scope user
```

To update: `claude plugin marketplace update claude-git-studio`, then `claude plugin update git-studio@claude-git-studio` and `/reload-plugins` in an open session.

### Language

The interface is in English by default. To switch it to French (`fr`) or back to English (`en`), in Claude Code:

```
/plugin configure git-studio@claude-git-studio
```

Or from the command line, then `/reload-plugins` in an open session:

```sh
echo '{"language":"fr"}' | claude plugin configure git-studio@claude-git-studio --values-stdin
```

### Requirements

It needs Claude Code 2.1.295 or later (`claude update`), since the plugin uses the function hooks API (still in early access), and git 2.35 or later.

### Developing

```sh
claude --plugin-dir /path/to/claude-git-studio   # load the folder for one session
claude plugin validate /path/to/claude-git-studio
claude plugin test /path/to/claude-git-studio
```

`tests/fixtures.ts` holds real git output recorded on a demo repository.

## Limits

- Claude Code runs git **without the repository's hooks** when a plugin runs it: a commit made from the pane triggers neither `pre-commit` nor `commit-msg`.
- Nothing interactive: no editor and no keyboard input, so no `rebase -i` or `add -p` (hunk staging is in the Status view), and no password prompt during a push; use an SSH agent or a credential helper.
- The history loads 150 commits at a time; each status section shows its first 300 files, and a diff is cut at 40,000 characters.

## License

MIT
