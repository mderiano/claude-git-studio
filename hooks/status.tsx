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
  if (entries.length > ROW_LIMIT) drawn.push(note(ctx, ctx.t.status.more(entries.length - ROW_LIMIT)))
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
  const t = ctx.t

  return (
    <Box flexDirection="column">
      {commitBox(ctx, staged.length)}
      {conflicts.length > 0
        ? [
            section(ctx, t.status.conflicts(conflicts.length), [
              button(ctx, 'conflicts-claude', t.common.resolveWithClaude, () =>
                cmd.askClaude(t.claude.resolveConflicts(ctx.snap.head?.root, conflicts.map(entry => entry.path))),
              ),
            ]),
            ...rows(ctx, 'c', conflicts),
          ]
        : null}
      {section(ctx, t.status.staged(staged.length), staged.length > 0 ? [button(ctx, 'unstage-all', t.status.unstageAll, () => cmd.act(ops.unstageAll(t)), { dim: true })] : [])}
      {rows(ctx, 's', staged)}
      {section(
        ctx,
        t.status.modified(unstaged.length),
        unstaged.length > 0
          ? [
              button(ctx, 'stage-tracked', t.status.stageAll, () => cmd.act(ops.stage(t, unstaged.map(entry => entry.path))), { dim: true }),
              button(ctx, 'discard-all', t.status.discardAll, () => cmd.act(ops.discardAll(t)), { dim: true }),
            ]
          : [],
      )}
      {rows(ctx, 'u', unstaged)}
      {section(
        ctx,
        t.status.untracked(untracked.length),
        untracked.length > 0
          ? [
              button(ctx, 'stage-all', t.status.addAll, () => cmd.act(ops.stageAll(t)), { dim: true }),
              button(ctx, 'clean-all', t.status.deleteAll, () => cmd.act(ops.cleanAll(t)), { dim: true }),
            ]
          : [],
      )}
      {rows(ctx, '?', untracked)}
      {entries.length === 0 ? note(ctx, t.status.clean) : null}
    </Box>
  )
}

function commitBox(ctx: Ctx, stagedCount: number): Node {
  const { Box, Text } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const head = ctx.snap.head
  const pushStep = pushStepForHead(ctx)

  const commit = async (options: ops.CommitOptions): Promise<void> => {
    const subject = fromFieldText(draft('commit-msg')).trim()
    const body = fromFieldText(draft('commit-body')).trim()
    const message = body === '' ? subject : `${subject}\n\n${body}`
    if (!options.amend && subject === '') {
      await cmd.inform(t.status.writeMessage, 'error')
      return
    }
    if (!options.amend && !options.all && stagedCount === 0) {
      await cmd.inform(t.status.nothingStaged, 'error')
      return
    }
    const isOk = await cmd.act(ops.commit(t, message, options))
    if (isOk) clearDrafts('commit-msg', 'commit-body')
  }

  return (
    <Box flexDirection="column">
      <Text bold>
        {t.status.commitTo(head?.branch ? line(head.branch) : null)} <Text dimColor>{t.status.stagedCount(stagedCount)}</Text>
      </Text>
      {field(ctx, 'commit-msg', {
        label: t.status.subject,
        placeholder: t.status.subjectPlaceholder,
        submitLabel: t.status.commitSubmit,
        onSubmit: () => commit({}),
      })}
      {field(ctx, 'commit-body', {
        label: t.status.body,
        placeholder: t.status.bodyPlaceholder,
        submitLabel: t.status.commitSubmit,
        onSubmit: () => commit({}),
      })}
      {bar(ctx, [
        button(ctx, 'commit', t.status.commit, () => commit({}), { primary: true }),
        button(ctx, 'commit-all', t.status.commitAll, () => commit({ all: true })),
        button(ctx, 'commit-amend', t.status.amend, () => commit({ amend: true })),
        pushStep ? button(ctx, 'commit-push', t.status.commitPush, () => commit({ push: pushStep })) : null,
        button(ctx, 'commit-ai', t.status.claudeMessage, () => cmd.suggestCommitMessage()),
        button(ctx, 'commit-review', t.status.claudeReview, () => cmd.askClaude(t.claude.review)),
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
  const t = ctx.t
  const id = `${kind}:${entry.path}`
  const isOpen = ctx.nav.file === id
  const letter = letterOf(kind, entry)
  const name = entry.orig ? `${entry.orig} → ${entry.path}` : entry.path
  const actions: Node[] = []
  const hunks: HunkAction[] = []

  if (kind === 's') {
    actions.push(button(ctx, `unstage:${entry.path}`, '−', () => cmd.act(ops.unstage(t, entry.orig ? [entry.path, entry.orig] : [entry.path])), { dim: true }))
    hunks.push({ key: `unstage-hunk:${entry.path}`, label: t.status.unstageHunk, run: patch => cmd.act(ops.unstageHunk(t, patch)) })
  } else if (kind === 'u') {
    actions.push(button(ctx, `stage:${entry.path}`, '+', () => cmd.act(ops.stage(t, [entry.path])), { dim: true }))
    actions.push(button(ctx, `discard:${entry.path}`, '↺', () => cmd.act(ops.discard(t, entry.path)), { dim: true }))
    hunks.push({ key: `stage-hunk:${entry.path}`, label: t.status.stageHunk, run: patch => cmd.act(ops.stageHunk(t, patch)) })
    hunks.push({ key: `discard-hunk:${entry.path}`, label: t.status.discardHunk, run: patch => cmd.act(ops.discardHunk(t, patch)) })
  } else if (kind === '?') {
    actions.push(button(ctx, `add:${entry.path}`, '+', () => cmd.act(ops.stage(t, [entry.path])), { dim: true }))
    actions.push(button(ctx, `remove:${entry.path}`, '✕', () => cmd.act(ops.removeUntracked(t, entry.path)), { dim: true }))
  } else {
    actions.push(button(ctx, `ours:${entry.path}`, t.status.keepCurrent, () => cmd.act(ops.takeOurs(t, entry.path)), { dim: true }))
    actions.push(button(ctx, `theirs:${entry.path}`, t.status.takeIncoming, () => cmd.act(ops.takeTheirs(t, entry.path)), { dim: true }))
    actions.push(button(ctx, `resolved:${entry.path}`, t.status.markResolved, () => cmd.act(ops.markResolved(t, entry.path)), { dim: true }))
    if (entry.x === 'D' || entry.y === 'D') {
      actions.push(button(ctx, `rm:${entry.path}`, t.common.delete, () => cmd.act(ops.removeConflicted(t, entry.path)), { dim: true }))
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
