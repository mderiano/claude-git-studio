import type { RenderElement } from 'claude-code'

import type { GsView } from '../types'
import { clearDrafts, draft } from './drafts'
import { quoteArg } from './git'
import { logView, reflogView } from './history'
import { bar, block, button, field, line, note, section } from './kit'
import type { Ctx, Node } from './kit'
import * as ops from './ops'
import { consoleView, remotesView, stashView, worktreesView } from './places'
import { branchesView, tagsView } from './refs'
import { pushStepForHead, statusView } from './status'

const TABS: { view: GsView; hotkey: string }[] = [
  { view: 'status', hotkey: '1' },
  { view: 'log', hotkey: '2' },
  { view: 'branches', hotkey: '3' },
  { view: 'tags', hotkey: '4' },
  { view: 'worktrees', hotkey: '5' },
  { view: 'stash', hotkey: '6' },
  { view: 'remotes', hotkey: '7' },
  { view: 'reflog', hotkey: '8' },
  { view: 'console', hotkey: '9' },
]

export function paneTree(ctx: Ctx, isFocused: boolean): RenderElement {
  const { Box, Text } = ctx.ui
  return (
    <Box flexDirection="column">
      {header(ctx)}
      {ctx.nav.expanded === 'repo-switch' ? (
        <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
          {repoPicker(ctx)}
        </Box>
      ) : null}
      {ctx.snap.head ? tabs(ctx) : null}
      {confirmBar(ctx)}
      {operationBar(ctx)}
      {resultBar(ctx)}
      <Box flexDirection="column" marginTop={1}>
        {ctx.snap.head ? body(ctx) : noRepo(ctx)}
      </Box>
      {ctx.surface === 'terminal' && isFocused ? (
        <Box marginTop={1}>
          <Text dimColor>{ctx.t.pane.keys}</Text>
        </Box>
      ) : null}
    </Box>
  )
}

function body(ctx: Ctx): Node {
  switch (ctx.nav.view) {
    case 'status':
      return statusView(ctx)
    case 'log':
      return logView(ctx)
    case 'branches':
      return branchesView(ctx)
    case 'tags':
      return tagsView(ctx)
    case 'worktrees':
      return worktreesView(ctx)
    case 'stash':
      return stashView(ctx)
    case 'remotes':
      return remotesView(ctx)
    case 'reflog':
      return reflogView(ctx)
    case 'console':
      return consoleView(ctx)
    default:
      return statusView(ctx)
  }
}

function header(ctx: Ctx): Node {
  const { Box, Text } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const head = ctx.snap.head
  const where = head?.root ?? ctx.snap.cwd
  const branch = head === null ? null : (head.branch ?? t.pane.detached(head.oid?.slice(0, 7) ?? '∅'))
  const pushStep = pushStepForHead(ctx)
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        {branch === null ? <Text bold>Git Studio</Text> : <Text bold color="claude">⎇ {line(branch)}</Text>}
        {head?.upstream ? <Text dimColor>→ {line(head.upstream)}</Text> : null}
        {head && head.ahead > 0 ? <Text color="success">↑{head.ahead}</Text> : null}
        {head && head.behind > 0 ? <Text color="warning">↓{head.behind}</Text> : null}
        {head?.isLinkedWorktree ? <Text color="permission">[worktree]</Text> : null}
        {ctx.busy ? <Text color="suggestion">⏳ {line(ctx.busy)}…</Text> : null}
      </Box>
      {where !== '' ? (
        <Text dimColor wrap="truncate-start">
          {line(where)}
        </Text>
      ) : null}
      {bar(ctx, [
        button(ctx, 'refresh', t.pane.refresh, () => cmd.refresh(), { hotkey: 'r', dim: true }),
        head ? button(ctx, 'fetch', t.pane.fetch, () => cmd.act(ops.fetch(t, null)), { hotkey: 'f', dim: true }) : null,
        head?.branch && head.upstream ? button(ctx, 'pull', t.pane.pull, () => cmd.act(ops.pull(t, 'default')), { hotkey: 'p', dim: true }) : null,
        pushStep
          ? button(ctx, 'push', t.pane.push(head?.ahead ?? 0), () => cmd.act(ops.pushHead(t, pushStep, head?.branch ?? null)), {
              hotkey: 'u',
              dim: true,
            })
          : null,
        button(ctx, 'repo-switch', t.pane.repo, () => cmd.toggleExpanded('repo-switch'), { dim: true }),
        button(ctx, 'close', t.pane.close, () => cmd.close(), { dim: true, dismiss: true }),
      ])}
    </Box>
  )
}

function tabs(ctx: Ctx): Node {
  const cmd = ctx.cmd
  const counts: Partial<Record<GsView, number>> = {
    status: ctx.snap.status.length,
    stash: ctx.snap.head?.stashCount ?? 0,
  }
  const isTerminal = ctx.surface === 'terminal'
  return bar(
    ctx,
    TABS.map(tab => {
      const count = counts[tab.view] ?? 0
      const label = `${isTerminal ? `${tab.hotkey} ` : ''}${ctx.t.pane.tabs[tab.view]}${count > 0 ? ` (${count})` : ''}`
      const isActive = ctx.nav.view === tab.view
      return button(ctx, `tab:${tab.view}`, label, () => cmd.showView(tab.view), { hotkey: tab.hotkey, primary: isActive, dim: !isActive })
    }),
  )
}

function confirmBar(ctx: Ctx): Node {
  const { Box, Text } = ctx.ui
  const cmd = ctx.cmd
  const op = ctx.confirm
  if (op === null) return null
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1} marginTop={1}>
      <Text color="warning" bold>
        ⚠ {line(op.danger ?? op.title)}
      </Text>
      <Text dimColor>{block(op.steps.map(step => `$ git ${step.args.map(quoteArg).join(' ')}`).join('\n'))}</Text>
      {bar(ctx, [
        button(ctx, 'confirm-yes', ctx.t.pane.confirm, () => cmd.act(op, true), { primary: true }),
        button(ctx, 'confirm-no', ctx.t.pane.cancel, () => cmd.dismissConfirm()),
      ])}
    </Box>
  )
}

function operationBar(ctx: Ctx): Node {
  const { Box, Text } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const operation = ctx.snap.head?.operation ?? null
  if (operation === null) return null
  const conflicts = ctx.snap.status.filter(entry => entry.kind === 'conflict')
  const state =
    operation === 'bisect'
      ? ''
      : conflicts.length > 0
        ? t.pane.conflictsLeft(conflicts.length)
        : t.pane.readyToContinue
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="error" paddingX={1} marginTop={1}>
      <Text color="warning" bold>
        ⚠ {t.pane.operations[operation]}
        {state}
      </Text>
      {operation === 'bisect'
        ? bar(ctx, [
            button(ctx, 'bisect-good', t.pane.headGood, () => cmd.act(ops.bisectMark(t, 'good', null, true)), { primary: true }),
            button(ctx, 'bisect-bad', t.pane.headBad, () => cmd.act(ops.bisectMark(t, 'bad', null, true))),
            button(ctx, 'bisect-skip', t.pane.skip, () => cmd.act(ops.skipOperation(t, 'bisect'))),
            button(ctx, 'bisect-log', t.pane.bisectLog, async () => {
              await cmd.runConsole('bisect log')
              await cmd.showView('console')
            }),
            button(ctx, 'bisect-reset', t.pane.endBisect, () => cmd.act(ops.abortOperation(t, 'bisect')), { dim: true }),
          ])
        : bar(ctx, [
            button(ctx, 'op-continue', t.pane.continue, () => cmd.act(ops.continueOperation(t, operation)), { primary: conflicts.length === 0 }),
            operation === 'merge' ? null : button(ctx, 'op-skip', t.pane.skipCommit, () => cmd.act(ops.skipOperation(t, operation))),
            button(ctx, 'op-abort', t.pane.abort, () => cmd.act(ops.abortOperation(t, operation)), { dim: true }),
            conflicts.length > 0
              ? button(ctx, 'op-claude', t.common.resolveWithClaude, () =>
                  cmd.askClaude(t.claude.resolveOperation(operation, ctx.snap.head?.root, conflicts.map(entry => entry.path))),
                )
              : null,
            conflicts.length > 0 && ctx.nav.view !== 'status' ? button(ctx, 'op-status', t.pane.showConflicts, () => cmd.showView('status'), { dim: true }) : null,
          ])}
    </Box>
  )
}

function resultBar(ctx: Ctx): Node {
  const { Box, Code, Text } = ctx.ui
  const cmd = ctx.cmd
  const banner = ctx.banner
  if (banner === null) return null
  const color = banner.kind === 'ok' ? 'success' : banner.kind === 'error' ? 'error' : 'suggestion'
  const icon = banner.kind === 'ok' ? '✓' : banner.kind === 'error' ? '✗' : 'ℹ'
  return (
    <Box flexDirection="column" marginTop={1}>
      {bar(ctx, [
        <Text color={color} bold>
          {icon} {line(banner.title)}
        </Text>,
        button(ctx, 'banner-close', '×', () => cmd.dismissBanner(), { dim: true }),
      ])}
      {banner.output.trim() === '' ? null : <Code source={block(banner.output)} />}
    </Box>
  )
}

function baseName(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || path
}

async function expandHome(ctx: Ctx, path: string): Promise<string> {
  if (path !== '~' && !path.startsWith('~/')) return path
  const home = await ctx.cmd.home()
  return home === '' ? path : `${home}${path.slice(1)}`
}

function repoPicker(ctx: Ctx): Node {
  const { Box, Text } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const open = async (value: string): Promise<void> => {
    const path = value.trim()
    if (path === '') {
      await cmd.inform(t.pane.repoPathMissing, 'error')
      return
    }
    clearDrafts('repo-path')
    await cmd.useRepo(await expandHome(ctx, path))
  }
  const worktrees = ctx.snap.worktrees.filter(worktree => worktree.path !== ctx.snap.head?.root)
  return (
    <Box flexDirection="column">
      {bar(ctx, [
        field(ctx, 'repo-path', { label: t.pane.openRepo, placeholder: t.pane.repoPlaceholder, submitLabel: t.pane.openSubmit, onSubmit: value => open(value) }),
        button(ctx, 'repo-open', t.pane.open, () => open(draft('repo-path'))),
        ctx.nav.repoPath !== null ? button(ctx, 'repo-session', t.pane.backToSession, () => cmd.useRepo(null), { dim: true }) : null,
      ])}
      {ctx.recent.length > 0
        ? bar(ctx, [
            <Text dimColor>{t.pane.recent}</Text>,
            ...ctx.recent.map(path => button(ctx, `recent:${path}`, baseName(path), () => cmd.useRepo(path), { dim: true })),
          ])
        : null}
      {worktrees.length > 0
        ? bar(ctx, [
            <Text dimColor>{t.pane.worktrees}</Text>,
            ...worktrees.map(worktree => button(ctx, `switch-wt:${worktree.path}`, baseName(worktree.path), () => cmd.useRepo(worktree.path), { dim: true })),
          ])
        : null}
    </Box>
  )
}

function noRepo(ctx: Ctx): Node {
  const { Box, Text } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  if (ctx.snap.cwd === '') return note(ctx, t.pane.loading)
  const clone = async (): Promise<void> => {
    const url = draft('clone-url').trim()
    if (url === '') {
      await cmd.inform(t.pane.cloneUrlMissing, 'error')
      return
    }
    const dest = draft('clone-dest').trim() || (baseName(url).replace(/\.git$/, '') || t.pane.cloneFolder)
    if (await cmd.act(ops.clone(t, url, dest))) {
      clearDrafts('clone-url', 'clone-dest')
      const base = await cmd.workDir()
      await cmd.useRepo(dest.startsWith('/') ? dest : `${base.replace(/\/+$/, '')}/${dest}`)
    }
  }
  return (
    <Box flexDirection="column">
      <Text color="warning">{line(ctx.snap.error ?? t.common.notARepo)}</Text>
      <Text dimColor>{line(ctx.snap.cwd)}</Text>
      {section(ctx, t.pane.openExisting)}
      {repoPicker(ctx)}
      {section(ctx, t.pane.createHere)}
      {bar(ctx, [button(ctx, 'init', 'git init', () => cmd.act(ops.init(t)), { primary: true })])}
      {bar(ctx, [
        field(ctx, 'clone-url', { label: t.pane.clone, placeholder: t.pane.clonePlaceholder, submitLabel: t.pane.cloneSubmit, onSubmit: () => clone() }),
        field(ctx, 'clone-dest', { placeholder: t.pane.cloneDest, submitLabel: t.pane.cloneSubmit, onSubmit: () => clone() }),
        button(ctx, 'clone', t.pane.clone, () => clone()),
      ])}
    </Box>
  )
}
