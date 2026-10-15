import type { GsCommit, GsCommitDetail, GsCommitFile, GsLogOptions } from '../types'
import { clearDrafts, draft, setDraft } from './drafts'
import { buildGraph } from './graph'
import type { GraphRow } from './graph'
import {
  LANE_COLORS,
  ago,
  bar,
  block,
  button,
  chips,
  chipsWidth,
  choice,
  cut,
  date,
  diffView,
  field,
  line,
  note,
  short,
  statusColor,
} from './kit'
import type { Ctx, Node } from './kit'
import * as ops from './ops'

const PAGE = 150

const MODES: GsLogOptions['mode'][] = ['message', 'author', 'path', 'content']

const isMode = (value: string): value is GsLogOptions['mode'] => MODES.some(mode => mode === value)

export function logView(ctx: Ctx): Node {
  const { Box } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const options = ctx.nav.log
  const commits = ctx.snap.log
  const isFiltered = options.query.trim() !== ''
  const graph = isFiltered ? null : buildGraph(commits, LANE_COLORS.length)
  const locals = ctx.snap.branches.filter(branch => !branch.remote).map(branch => ({ value: branch.name, label: branch.name }))
  const scopes = [{ value: 'all', label: t.log.allBranches }, { value: 'head', label: t.log.currentBranch }, ...locals]
  if (!scopes.some(scope => scope.value === options.scope)) scopes.push({ value: options.scope, label: options.scope })
  const expandedSha = ctx.nav.expanded?.startsWith('commit:') ? ctx.nav.expanded.slice('commit:'.length) : null
  const isOutside = expandedSha !== null && !commits.some(commit => commit.sha === expandedSha)

  return (
    <Box flexDirection="column">
      {bar(ctx, [
        choice(ctx, 'log-scope', scopes, {
          label: t.log.scope,
          value: options.scope,
          onSelect: async value => {
            await cmd.patchLog({ scope: value, limit: PAGE })
            await cmd.refresh()
          },
        }),
        choice(ctx, 'log-mode', MODES.map(mode => ({ value: mode, label: t.log.modes[mode] })), {
          label: t.log.filter,
          value: options.mode,
          onSelect: async value => {
            if (!isMode(value)) return
            await cmd.patchLog({ mode: value })
            if (options.query.trim() !== '') await cmd.refresh()
          },
        }),
        field(ctx, 'log-query', {
          placeholder: t.log.search,
          initial: options.query,
          submitLabel: t.log.searchSubmit,
          onSubmit: async value => {
            await cmd.patchLog({ query: value.trim(), limit: PAGE })
            await cmd.refresh()
          },
        }),
        isFiltered
          ? button(
              ctx,
              'log-clear',
              t.log.clearFilter,
              async () => {
                setDraft('log-query', '')
                await cmd.patchLog({ query: '', limit: PAGE })
                await cmd.refresh()
              },
              { dim: true },
            )
          : null,
      ])}
      {picksBar(ctx)}
      {isOutside && expandedSha !== null ? (
        <Box flexDirection="column" marginTop={1}>
          {note(ctx, t.log.outside)}
          {commitDetail(ctx, expandedSha)}
        </Box>
      ) : null}
      {commits.length === 0 ? note(ctx, isFiltered ? t.log.noMatch : t.log.noCommits) : null}
      {commits.map((commit, index) => commitRow(ctx, commit, graph?.[index] ?? null))}
      {ctx.snap.logHasMore
        ? button(ctx, 'log-more', t.log.loadMore(PAGE), async () => {
            await cmd.patchLog({ limit: options.limit + PAGE })
            await cmd.refresh()
          })
        : null}
    </Box>
  )
}

function graphNode(ctx: Ctx, row: GraphRow | null, max: number): { node: Node; width: number } {
  const { Text } = ctx.ui
  if (row === null || row.length === 0) return { node: null, width: 0 }
  const isCut = row.length > max
  const cells = isCut ? row.slice(0, Math.max(1, max - 1)) : row
  const spans: { text: string; color: number }[] = []
  for (const cell of cells) {
    const last = spans[spans.length - 1]
    if (last && (last.color === cell.color || cell.ch === ' ')) last.text += cell.ch
    else spans.push({ text: cell.ch, color: cell.color })
  }
  return {
    node: (
      <Text>
        {spans.map(span => (
          <Text color={LANE_COLORS[span.color % LANE_COLORS.length] ?? 'text'}>{span.text}</Text>
        ))}
        {isCut ? '…' : ''}{' '}
      </Text>
    ),
    width: cells.length + (isCut ? 1 : 0) + 1,
  }
}

function commitRow(ctx: Ctx, commit: GsCommit, row: GraphRow | null): Node {
  const { Box, Button, Text } = ctx.ui
  const cmd = ctx.cmd
  const isOpen = ctx.nav.expanded === `commit:${commit.sha}`
  const isPicked = ctx.nav.picks.includes(commit.sha)
  const graph = graphNode(ctx, row, Math.max(8, Math.floor(ctx.width / 3)))
  const room = ctx.width - graph.width - 2
  const meta = ` · ${line(commit.author)} · ${ago(ctx.t, commit.time)}`
  const refsWidth = chipsWidth(ctx, commit.refs)
  const hasMeta = room - 8 - refsWidth - meta.length > 24
  const subjectRoom = Math.max(10, room - 8 - refsWidth - (hasMeta ? meta.length : 0) - (isPicked ? 2 : 0))

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {graph.node}
        <Button key={`row:${commit.sha}`} plain onPress={() => cmd.openCommit(commit.sha)}>
          {isPicked ? <Text color="success">✓ </Text> : ''}
          <Text color="warning">{short(commit.sha)}</Text> {chips(ctx, commit.refs)}
          {cut(line(commit.subject), subjectRoom)}
          {hasMeta ? <Text dimColor>{meta}</Text> : ''}
        </Button>
      </Box>
      {isOpen ? (
        <Box flexDirection="column" marginLeft={Math.min(graph.width, 10)}>
          {commitDetail(ctx, commit.sha)}
        </Box>
      ) : null}
    </Box>
  )
}

function picksBar(ctx: Ctx): Node {
  const { Text } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const picks = ctx.nav.picks
  if (picks.length === 0) return null
  const position = (sha: string): number => ctx.snap.log.findIndex(commit => commit.sha === sha)
  const oldestFirst = [...picks].sort((a, b) => position(b) - position(a))
  const hasMerge = picks.some(sha => (ctx.snap.log.find(commit => commit.sha === sha)?.parents.length ?? 1) > 1)
  const into = ctx.snap.head?.branch ?? 'HEAD'
  return bar(ctx, [
    <Text color="success">{t.log.picked(picks.length)}</Text>,
    button(
      ctx,
      'picks-cherry-pick',
      t.log.cherryPickInto(into),
      async () => {
        if (await cmd.act(ops.cherryPick(t, oldestFirst, hasMerge))) await cmd.patchNav({ picks: [] })
      },
      { primary: true },
    ),
    button(ctx, 'picks-revert', t.log.revert, async () => {
      if (await cmd.act(ops.revert(t, [...oldestFirst].reverse(), hasMerge))) await cmd.patchNav({ picks: [] })
    }),
    button(ctx, 'picks-clear', t.log.clearPicks, () => cmd.patchNav({ picks: [] }), { dim: true }),
  ])
}

/** A commit open in the log or the reflog: its facts, files and every action on it. */
export function commitDetail(ctx: Ctx, sha: string): Node {
  const { Box, Text } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const detail = ctx.detail.commit
  if (detail === null || detail.sha !== sha) return <Text dimColor>{t.log.loadingCommit}</Text>
  const added = detail.files.reduce((sum, file) => sum + file.added, 0)
  const deleted = detail.files.reduce((sum, file) => sum + file.deleted, 0)

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
      {bar(ctx, [
        <Text bold color="warning">{detail.sha}</Text>,
        button(ctx, `copy:${sha}`, t.log.copyHash, () => cmd.copy(detail.sha), { dim: true }),
        ctx.nav.view !== 'log' ? button(ctx, `in-log:${sha}`, t.log.showInLog, () => cmd.jumpToCommit(sha), { dim: true }) : null,
      ])}
      <Text>
        {line(detail.author)} <Text dimColor>&lt;{line(detail.email)}&gt; · {date(t, detail.time)} ({ago(t, detail.time)})</Text>
      </Text>
      {detail.committer !== detail.author ? (
        <Text dimColor>{t.log.committedBy(line(detail.committer), date(t, detail.ctime))}</Text>
      ) : null}
      {detail.refs !== '' ? <Text>{chips(ctx, detail.refs)}</Text> : null}
      {detail.parents.length === 0
        ? note(ctx, t.log.rootCommit)
        : bar(ctx, [
            <Text dimColor>{detail.parents.length > 1 ? t.log.parentsMerge : t.log.parent}</Text>,
            ...detail.parents.map(parent => button(ctx, `parent:${sha}:${parent}`, short(parent), () => cmd.jumpToCommit(parent), { dim: true })),
          ])}
      <Box marginY={1}>
        <Text>{block(detail.body)}</Text>
      </Box>
      <Text bold>
        {t.log.files(detail.files.length)}{' '}
        <Text color="success">+{added}</Text> <Text color="error">−{deleted}</Text>
        {detail.parents.length > 1 ? <Text dimColor>{t.log.againstFirstParent}</Text> : ''}
      </Text>
      {detail.files.map(file => commitFileRow(ctx, detail, file))}
      {commitActions(ctx, detail)}
    </Box>
  )
}

function commitFileRow(ctx: Ctx, detail: GsCommitDetail, file: GsCommitFile): Node {
  const { Box, Button, Text } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const isOpen = ctx.nav.commitFile === file.path
  const name = file.orig ? `${file.orig} → ${file.path}` : file.path
  return (
    <Box flexDirection="column">
      <Button key={`cfile:${detail.sha}:${file.path}`} plain onPress={() => cmd.toggleCommitFile(detail.sha, file, detail.parents.length > 1)}>
        {isOpen ? '▾ ' : '▸ '}
        <Text color={statusColor(file.status)} bold>
          {file.status}
        </Text>{' '}
        {cut(line(name), Math.max(12, ctx.width - 34))}{' '}
        {file.binary ? <Text dimColor>{t.log.binary}</Text> : <Text color="success">+{file.added}</Text>}
        {file.binary ? '' : ' '}
        {file.binary ? '' : <Text color="error">−{file.deleted}</Text>}
      </Button>
      {isOpen ? (
        <Box flexDirection="column" marginLeft={2}>
          {bar(ctx, [
            button(ctx, `restore:${detail.sha}:${file.path}`, t.log.restoreVersion, () => cmd.act(ops.restoreFile(t, detail.sha, file.path)), {
              dim: true,
            }),
            button(ctx, `file-log:${detail.sha}:${file.path}`, t.log.fileHistory, () => cmd.fileHistory(file.path), { dim: true }),
          ])}
          {diffView(ctx, ctx.detail.diff, `commit:${detail.sha}:${file.path}`)}
        </Box>
      ) : null}
    </Box>
  )
}

function commitActions(ctx: Ctx, detail: GsCommitDetail): Node {
  const { Box, Text } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const sha = detail.sha
  const head = ctx.snap.head
  const current = head?.branch ?? null
  const isMerge = detail.parents.length > 1
  const isPicked = ctx.nav.picks.includes(sha)
  const isBisecting = head?.operation === 'bisect'

  const createBranch = async (checkout: boolean): Promise<void> => {
    const name = draft(`branch-at:${sha}`).trim()
    if (name === '') {
      await cmd.inform(t.common.nameNewBranch, 'error')
      return
    }
    if (await cmd.act(ops.createBranch(t, name, sha, checkout))) clearDrafts(`branch-at:${sha}`)
  }
  const createTag = async (): Promise<void> => {
    const name = draft(`tag-at:${sha}`).trim()
    if (name === '') {
      await cmd.inform(t.common.nameTag, 'error')
      return
    }
    if (await cmd.act(ops.createTag(t, name, sha, draft(`tag-msg:${sha}`)))) clearDrafts(`tag-at:${sha}`, `tag-msg:${sha}`)
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {bar(ctx, [
        button(ctx, `checkout:${sha}`, t.common.checkoutDetached, () => cmd.act(ops.checkoutDetached(t, sha))),
        button(ctx, `cherry-pick:${sha}`, t.log.cherryPick, () => cmd.act(ops.cherryPick(t, [sha], isMerge)), { primary: true }),
        button(ctx, `revert:${sha}`, t.log.revert, () => cmd.act(ops.revert(t, [sha], isMerge))),
        button(ctx, `pick:${sha}`, isPicked ? t.log.inPicks : t.log.addToPicks, () => cmd.togglePick(sha)),
        current !== null ? button(ctx, `merge:${sha}`, t.common.mergeInto(current), () => cmd.act(ops.merge(t, sha, 'ff', current))) : null,
        current !== null ? button(ctx, `rebase:${sha}`, t.common.rebaseOnto(current), () => cmd.act(ops.rebase(t, sha, current))) : null,
      ])}
      {bar(ctx, [
        <Text dimColor>{t.log.resetHere(current ?? 'HEAD')}</Text>,
        button(ctx, `reset-soft:${sha}`, 'soft', () => cmd.act(ops.reset(t, sha, 'soft', current)), { dim: true }),
        button(ctx, `reset-mixed:${sha}`, 'mixed', () => cmd.act(ops.reset(t, sha, 'mixed', current)), { dim: true }),
        button(ctx, `reset-hard:${sha}`, 'hard', () => cmd.act(ops.reset(t, sha, 'hard', current)), { dim: true }),
        <Text dimColor>{t.log.bisect}</Text>,
        button(ctx, `bisect-good:${sha}`, t.log.good, () => cmd.act(ops.bisectMark(t, 'good', sha, isBisecting)), { dim: true }),
        button(ctx, `bisect-bad:${sha}`, t.log.bad, () => cmd.act(ops.bisectMark(t, 'bad', sha, isBisecting)), { dim: true }),
      ])}
      {bar(ctx, [
        field(ctx, `branch-at:${sha}`, { label: t.log.branch, placeholder: t.log.branchPlaceholder, submitLabel: t.common.createSubmit, onSubmit: () => createBranch(false) }),
        button(ctx, `branch-create:${sha}`, t.common.create, () => createBranch(false)),
        button(ctx, `branch-switch:${sha}`, t.common.createAndSwitch, () => createBranch(true)),
      ])}
      {bar(ctx, [
        field(ctx, `tag-at:${sha}`, { label: t.log.tag, placeholder: 'v1.2.3', submitLabel: t.common.createSubmit, onSubmit: () => createTag() }),
        field(ctx, `tag-msg:${sha}`, { placeholder: t.common.tagMessage, submitLabel: t.common.createSubmit, onSubmit: () => createTag() }),
        button(ctx, `tag-create:${sha}`, t.common.createTag, () => createTag()),
      ])}
      {bar(ctx, [
        button(ctx, `explain:${sha}`, t.log.explain, () => cmd.askClaude(t.claude.explain(sha, short(sha)))),
      ])}
    </Box>
  )
}

export function reflogView(ctx: Ctx): Node {
  const { Box, Button, Text } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const entries = ctx.snap.reflog
  return (
    <Box flexDirection="column">
      {note(ctx, t.log.reflogNote)}
      {entries.length === 0 ? note(ctx, t.log.reflogEmpty) : null}
      {entries.map(entry => {
        const id = `reflog:${entry.selector}`
        const isOpen = ctx.nav.expanded === id
        return (
          <Box flexDirection="column">
            <Button key={`reflog-row:${entry.selector}`} plain onPress={() => cmd.openCommit(entry.sha, id)}>
              {isOpen ? '▾ ' : '▸ '}
              <Text dimColor>{entry.selector}</Text> <Text color="warning">{short(entry.sha)}</Text>{' '}
              {cut(line(entry.subject), Math.max(16, ctx.width - 36))} <Text dimColor>· {ago(t, entry.time)}</Text>
            </Button>
            {isOpen ? (
              <Box flexDirection="column" marginLeft={2}>
                {commitDetail(ctx, entry.sha)}
              </Box>
            ) : null}
          </Box>
        )
      })}
    </Box>
  )
}
