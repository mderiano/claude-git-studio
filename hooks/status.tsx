import type { GsStatusEntry, GsStep } from '../types'
import { clearDrafts, draft, fromFieldText } from './drafts'
import { bar, button, cut, diffView, field, line, note, section, statusColor } from './kit'
import type { Ctx, HunkAction, Node } from './kit'
import * as ops from './ops'

/** Where `git push` sends the checked-out branch: its upstream, else the default remote with `-u`. */
export function pushStepForHead(ctx: Ctx): GsStep | null {
  const head = ctx.snap.head
  if (!head || head.branch === null) return null
  if (head.upstream !== null) return { args: ['push'] }
  const remote = defaultRemote(ctx)
  return remote === null ? null : ops.pushStep(remote, head.branch, { setUpstream: true })
}

export function defaultRemote(ctx: Ctx): string | null {
  const names = ctx.snap.remotes.map(remote => remote.name)
  if (names.includes('origin')) return 'origin'
  return names[0] ?? null
}

type Kind = 's' | 'u' | '?' | 'c'

/** Rows drawn per section: a tree holds 100 000 characters in all. */
const ROW_LIMIT = 300

function rows(ctx: Ctx, kind: Kind, entries: GsStatusEntry[]): Node[] {
  const drawn: Node[] = entries.slice(0, ROW_LIMIT).map(entry => fileRow(ctx, kind, entry))
  if (entries.length > ROW_LIMIT) drawn.push(note(ctx, `… et ${entries.length - ROW_LIMIT} autres (voir la console : git status)`))
  return drawn
}

export function statusView(ctx: Ctx): Node {
  const { Box } = ctx.ui
  const entries = ctx.snap.status
  const conflicts = entries.filter(entry => entry.kind === 'conflict')
  const staged = entries.filter(entry => entry.kind === 'tracked' && entry.x !== '.')
  const unstaged = entries.filter(entry => entry.kind === 'tracked' && entry.y !== '.')
  const untracked = entries.filter(entry => entry.kind === 'untracked')
  const cmd = ctx.cmd

  return (
    <Box flexDirection="column">
      {commitBox(ctx, staged.length)}
      {conflicts.length > 0
        ? [
            section(ctx, `Conflits (${conflicts.length})`, [
              button(ctx, 'conflicts-claude', 'Résoudre avec Claude', () =>
                cmd.askClaude(`Résous les conflits git en cours dans ${ctx.snap.head?.root ?? 'ce dépôt'} (fichiers : ${conflicts
                    .map(entry => entry.path)
                    .join(', ')}). Explique chaque choix, puis marque les fichiers résolus avec git add, sans continuer l'opération.`,
                ),
              ),
            ]),
            ...rows(ctx, 'c', conflicts),
          ]
        : null}
      {section(ctx, `Indexés (${staged.length})`, staged.length > 0 ? [button(ctx, 'unstage-all', 'Tout désindexer', () => cmd.act(ops.unstageAll()), { dim: true })] : [])}
      {rows(ctx, 's', staged)}
      {section(
        ctx,
        `Modifiés (${unstaged.length})`,
        unstaged.length > 0
          ? [
              button(ctx, 'stage-tracked', 'Tout indexer', () => cmd.act(ops.stage(unstaged.map(entry => entry.path))), { dim: true }),
              button(ctx, 'discard-all', 'Tout annuler', () => cmd.act(ops.discardAll()), { dim: true }),
            ]
          : [],
      )}
      {rows(ctx, 'u', unstaged)}
      {section(
        ctx,
        `Non suivis (${untracked.length})`,
        untracked.length > 0
          ? [
              button(ctx, 'stage-all', 'Tout ajouter', () => cmd.act(ops.stageAll()), { dim: true }),
              button(ctx, 'clean-all', 'Tout supprimer', () => cmd.act(ops.cleanAll()), { dim: true }),
            ]
          : [],
      )}
      {rows(ctx, '?', untracked)}
      {entries.length === 0 ? note(ctx, 'Rien à commiter : la copie de travail est propre.') : null}
    </Box>
  )
}

function commitBox(ctx: Ctx, stagedCount: number): Node {
  const { Box, Text } = ctx.ui
  const cmd = ctx.cmd
  const head = ctx.snap.head
  const pushStep = pushStepForHead(ctx)

  const commit = async (options: ops.CommitOptions): Promise<void> => {
    const subject = fromFieldText(draft('commit-msg')).trim()
    const body = fromFieldText(draft('commit-body')).trim()
    const message = body === '' ? subject : `${subject}\n\n${body}`
    if (!options.amend && subject === '') {
      await cmd.inform('Écrivez un message de commit.', 'error')
      return
    }
    if (!options.amend && !options.all && stagedCount === 0) {
      await cmd.inform("Rien n'est indexé : indexez des fichiers, ou utilisez « Commit tout (-a) ».", 'error')
      return
    }
    const isOk = await cmd.act(ops.commit(message, options))
    if (isOk) clearDrafts('commit-msg', 'commit-body')
  }

  return (
    <Box flexDirection="column">
      <Text bold>
        Commit{head?.branch ? ` sur ${line(head.branch)}` : ''} <Text dimColor>({stagedCount} indexé{stagedCount > 1 ? 's' : ''})</Text>
      </Text>
      {field(ctx, 'commit-msg', {
        label: 'Sujet',
        placeholder: 'Message de commit (Entrée pour commiter)',
        submitLabel: 'commit',
        onSubmit: () => commit({}),
      })}
      {field(ctx, 'commit-body', {
        label: 'Description',
        placeholder: 'Optionnelle (⏎ pour un saut de ligne)',
        submitLabel: 'commit',
        onSubmit: () => commit({}),
      })}
      {bar(ctx, [
        button(ctx, 'commit', 'Commit', () => commit({}), { primary: true }),
        button(ctx, 'commit-all', 'Commit tout (-a)', () => commit({ all: true })),
        button(ctx, 'commit-amend', 'Amender le dernier', () => commit({ amend: true })),
        pushStep ? button(ctx, 'commit-push', 'Commit + push', () => commit({ push: pushStep })) : null,
        button(ctx, 'commit-ai', '✨ Message par Claude', () => cmd.suggestCommitMessage()),
        button(ctx, 'commit-review', 'Revue par Claude', () =>
          cmd.askClaude('Fais une revue de code des changements indexés (git diff --cached) de ce dépôt : bugs, risques, améliorations.'),
        ),
      ])}
    </Box>
  )
}

function letterOf(kind: Kind, entry: GsStatusEntry): string {
  if (kind === 's') return entry.x
  if (kind === 'u') return entry.y
  if (kind === 'c') return `${entry.x}${entry.y}`
  return '?'
}

function fileRow(ctx: Ctx, kind: Kind, entry: GsStatusEntry): Node {
  const { Box, Button, Text } = ctx.ui
  const cmd = ctx.cmd
  const id = `${kind}:${entry.path}`
  const isOpen = ctx.nav.file === id
  const letter = letterOf(kind, entry)
  const name = entry.orig ? `${entry.orig} → ${entry.path}` : entry.path
  const actions: Node[] = []
  const hunks: HunkAction[] = []

  if (kind === 's') {
    actions.push(button(ctx, `unstage:${entry.path}`, '−', () => cmd.act(ops.unstage(entry.orig ? [entry.path, entry.orig] : [entry.path])), { dim: true }))
    hunks.push({ key: `unstage-hunk:${entry.path}`, label: 'Désindexer ce hunk', run: patch => cmd.act(ops.unstageHunk(patch)) })
  } else if (kind === 'u') {
    actions.push(button(ctx, `stage:${entry.path}`, '+', () => cmd.act(ops.stage([entry.path])), { dim: true }))
    actions.push(button(ctx, `discard:${entry.path}`, '↺', () => cmd.act(ops.discard(entry.path)), { dim: true }))
    hunks.push({ key: `stage-hunk:${entry.path}`, label: 'Indexer ce hunk', run: patch => cmd.act(ops.stageHunk(patch)) })
    hunks.push({ key: `discard-hunk:${entry.path}`, label: 'Annuler ce hunk', run: patch => cmd.act(ops.discardHunk(patch)) })
  } else if (kind === '?') {
    actions.push(button(ctx, `add:${entry.path}`, '+', () => cmd.act(ops.stage([entry.path])), { dim: true }))
    actions.push(button(ctx, `remove:${entry.path}`, '✕', () => cmd.act(ops.removeUntracked(entry.path)), { dim: true }))
  } else {
    actions.push(button(ctx, `ours:${entry.path}`, 'Garder la courante', () => cmd.act(ops.takeOurs(entry.path)), { dim: true }))
    actions.push(button(ctx, `theirs:${entry.path}`, "Prendre l'entrante", () => cmd.act(ops.takeTheirs(entry.path)), { dim: true }))
    actions.push(button(ctx, `resolved:${entry.path}`, 'Marquer résolu', () => cmd.act(ops.markResolved(entry.path)), { dim: true }))
    if (entry.x === 'D' || entry.y === 'D') {
      actions.push(button(ctx, `rm:${entry.path}`, 'Supprimer', () => cmd.act(ops.removeConflicted(entry.path)), { dim: true }))
    }
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        <Button key={`file:${id}`} plain onPress={() => cmd.toggleFile(id, entry)}>
          {isOpen ? '▾ ' : '▸ '}
          <Text color={statusColor(letter.slice(0, 1))} bold>
            {letter.padEnd(2, ' ')}
          </Text>{' '}
          {cut(line(name), Math.max(12, ctx.width - 24))}
        </Button>
        {actions}
      </Box>
      {isOpen ? (
        <Box flexDirection="column" marginLeft={2}>
          {diffView(ctx, ctx.detail.diff, id, hunks)}
        </Box>
      ) : null}
    </Box>
  )
}
