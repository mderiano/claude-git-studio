import type { RenderElement } from 'claude-code'

import type { GsOperation, GsView } from '../types'
import { clearDrafts, draft } from './drafts'
import { quoteArg } from './git'
import { logView, reflogView } from './history'
import { bar, block, button, field, line, note, plural, section } from './kit'
import type { Ctx, Node } from './kit'
import * as ops from './ops'
import { consoleView, remotesView, stashView, worktreesView } from './places'
import { branchesView, tagsView } from './refs'
import { pushStepForHead, statusView } from './status'

const TABS: { view: GsView; label: string; hotkey: string }[] = [
  { view: 'status', label: 'Statut', hotkey: '1' },
  { view: 'log', label: 'Historique', hotkey: '2' },
  { view: 'branches', label: 'Branches', hotkey: '3' },
  { view: 'tags', label: 'Tags', hotkey: '4' },
  { view: 'worktrees', label: 'Worktrees', hotkey: '5' },
  { view: 'stash', label: 'Stash', hotkey: '6' },
  { view: 'remotes', label: 'Remotes', hotkey: '7' },
  { view: 'reflog', label: 'Reflog', hotkey: '8' },
  { view: 'console', label: 'Console', hotkey: '9' },
]

const OPERATION_LABEL: Record<GsOperation, string> = {
  merge: 'Merge en cours',
  rebase: 'Rebase en cours',
  am: 'git am en cours',
  'cherry-pick': 'Cherry-pick en cours',
  revert: 'Revert en cours',
  bisect: 'Bisect en cours',
}

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
          <Text dimColor>Tab/flèches : se déplacer · Entrée : activer · 1-9 : onglets · r : rafraîchir · Échap : revenir au prompt</Text>
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
  const head = ctx.snap.head
  const where = head?.root ?? ctx.snap.cwd
  const branch = head === null ? null : (head.branch ?? `HEAD détachée @ ${head.oid?.slice(0, 7) ?? '∅'}`)
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
        button(ctx, 'refresh', '⟳ Rafraîchir', () => cmd.refresh(), { hotkey: 'r', dim: true }),
        head ? button(ctx, 'fetch', '⇣ Fetch', () => cmd.act(ops.fetch(null)), { hotkey: 'f', dim: true }) : null,
        head?.branch && head.upstream ? button(ctx, 'pull', '↓ Pull', () => cmd.act(ops.pull('default')), { hotkey: 'p', dim: true }) : null,
        pushStep
          ? button(ctx, 'push', head?.ahead ? `↑ Push (${head.ahead})` : '↑ Push', () => cmd.act({ title: `Push de ${head?.branch ?? 'HEAD'}`, steps: [pushStep], network: true }), {
              hotkey: 'u',
              dim: true,
            })
          : null,
        button(ctx, 'repo-switch', '⇄ Dépôt…', () => cmd.toggleExpanded('repo-switch'), { dim: true }),
        button(ctx, 'close', 'Fermer', () => cmd.close(), { dim: true, dismiss: true }),
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
      const label = `${isTerminal ? `${tab.hotkey} ` : ''}${tab.label}${count > 0 ? ` (${count})` : ''}`
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
        button(ctx, 'confirm-yes', 'Confirmer', () => cmd.act(op, true), { primary: true }),
        button(ctx, 'confirm-no', 'Annuler', () => cmd.dismissConfirm()),
      ])}
    </Box>
  )
}

function operationBar(ctx: Ctx): Node {
  const { Box, Text } = ctx.ui
  const cmd = ctx.cmd
  const operation = ctx.snap.head?.operation ?? null
  if (operation === null) return null
  const conflicts = ctx.snap.status.filter(entry => entry.kind === 'conflict')
  const state =
    operation === 'bisect'
      ? ''
      : conflicts.length > 0
        ? ` — ${plural(conflicts.length, 'conflit')} à résoudre`
        : ' — aucun conflit restant, prêt à continuer'
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="error" paddingX={1} marginTop={1}>
      <Text color="warning" bold>
        ⚠ {OPERATION_LABEL[operation]}
        {state}
      </Text>
      {operation === 'bisect'
        ? bar(ctx, [
            button(ctx, 'bisect-good', 'HEAD est bon', () => cmd.act(ops.bisectMark('good', null, true)), { primary: true }),
            button(ctx, 'bisect-bad', 'HEAD est mauvais', () => cmd.act(ops.bisectMark('bad', null, true))),
            button(ctx, 'bisect-skip', 'Passer', () => cmd.act(ops.skipOperation('bisect'))),
            button(ctx, 'bisect-log', 'Journal', async () => {
              await cmd.runConsole('bisect log')
              await cmd.showView('console')
            }),
            button(ctx, 'bisect-reset', 'Terminer', () => cmd.act(ops.abortOperation('bisect')), { dim: true }),
          ])
        : bar(ctx, [
            button(ctx, 'op-continue', 'Continuer', () => cmd.act(ops.continueOperation(operation)), { primary: conflicts.length === 0 }),
            operation === 'merge' ? null : button(ctx, 'op-skip', 'Passer ce commit', () => cmd.act(ops.skipOperation(operation))),
            button(ctx, 'op-abort', 'Abandonner', () => cmd.act(ops.abortOperation(operation)), { dim: true }),
            conflicts.length > 0
              ? button(ctx, 'op-claude', 'Résoudre avec Claude', () =>
                  cmd.askClaude(`Un ${operation} est en cours dans ${ctx.snap.head?.root ?? 'ce dépôt'} avec des conflits (${conflicts
                      .map(entry => entry.path)
                      .join(', ')}). Résous-les en expliquant tes choix et marque-les résolus avec git add, sans lancer --continue.`,
                  ),
                )
              : null,
            conflicts.length > 0 && ctx.nav.view !== 'status' ? button(ctx, 'op-status', 'Voir les conflits', () => cmd.showView('status'), { dim: true }) : null,
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
  const open = async (value: string): Promise<void> => {
    const path = value.trim()
    if (path === '') {
      await cmd.inform('Indiquez le chemin du dépôt.', 'error')
      return
    }
    clearDrafts('repo-path')
    await cmd.useRepo(await expandHome(ctx, path))
  }
  const worktrees = ctx.snap.worktrees.filter(worktree => worktree.path !== ctx.snap.head?.root)
  return (
    <Box flexDirection="column">
      {bar(ctx, [
        field(ctx, 'repo-path', { label: 'Ouvrir le dépôt', placeholder: '~/code/projet', submitLabel: 'ouvrir', onSubmit: value => open(value) }),
        button(ctx, 'repo-open', 'Ouvrir', () => open(draft('repo-path'))),
        ctx.nav.repoPath !== null ? button(ctx, 'repo-session', 'Revenir au dossier de la session', () => cmd.useRepo(null), { dim: true }) : null,
      ])}
      {ctx.recent.length > 0
        ? bar(ctx, [
            <Text dimColor>Récents :</Text>,
            ...ctx.recent.map(path => button(ctx, `recent:${path}`, baseName(path), () => cmd.useRepo(path), { dim: true })),
          ])
        : null}
      {worktrees.length > 0
        ? bar(ctx, [
            <Text dimColor>Worktrees :</Text>,
            ...worktrees.map(worktree => button(ctx, `switch-wt:${worktree.path}`, baseName(worktree.path), () => cmd.useRepo(worktree.path), { dim: true })),
          ])
        : null}
    </Box>
  )
}

function noRepo(ctx: Ctx): Node {
  const { Box, Text } = ctx.ui
  const cmd = ctx.cmd
  if (ctx.snap.cwd === '') return note(ctx, 'Chargement…')
  const clone = async (): Promise<void> => {
    const url = draft('clone-url').trim()
    if (url === '') {
      await cmd.inform("Indiquez l'URL à cloner.", 'error')
      return
    }
    const dest = draft('clone-dest').trim() || (baseName(url).replace(/\.git$/, '') || 'depot')
    if (await cmd.act(ops.clone(url, dest))) {
      clearDrafts('clone-url', 'clone-dest')
      const base = await cmd.workDir()
      await cmd.useRepo(dest.startsWith('/') ? dest : `${base.replace(/\/+$/, '')}/${dest}`)
    }
  }
  return (
    <Box flexDirection="column">
      <Text color="warning">{line(ctx.snap.error ?? "Ce dossier n'est pas un dépôt git.")}</Text>
      <Text dimColor>{line(ctx.snap.cwd)}</Text>
      {section(ctx, 'Ouvrir un dépôt existant')}
      {repoPicker(ctx)}
      {section(ctx, 'Ou créer un dépôt ici')}
      {bar(ctx, [button(ctx, 'init', 'git init', () => cmd.act(ops.init()), { primary: true })])}
      {bar(ctx, [
        field(ctx, 'clone-url', { label: 'Cloner', placeholder: 'https://github.com/org/projet.git', submitLabel: 'cloner', onSubmit: () => clone() }),
        field(ctx, 'clone-dest', { placeholder: 'dossier (optionnel)', submitLabel: 'cloner', onSubmit: () => clone() }),
        button(ctx, 'clone', 'Cloner', () => clone()),
      ])}
    </Box>
  )
}
