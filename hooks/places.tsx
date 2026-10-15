import type { GsRemote, GsStash, GsWorktree } from '../types'
import { clearDrafts, draft } from './drafts'
import { ago, bar, block, button, choice, cut, diffView, field, line, note, picked, section, short } from './kit'
import type { Ctx, Node } from './kit'
import * as ops from './ops'
import { defaultRemote, pushStepForHead } from './status'

function baseName(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] ?? path
}

function parentOf(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const index = trimmed.lastIndexOf('/')
  return index <= 0 ? '/' : trimmed.slice(0, index)
}

// Worktrees

export function worktreesView(ctx: Ctx): Node {
  const { Box } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const head = ctx.snap.head
  const list = ctx.snap.worktrees
  const main = list[0]?.path ?? head?.root ?? ''
  // Read when used, never at draw time: the branch typed since then names the folder.
  const suggestion = (): string =>
    main === '' ? '' : `${parentOf(main)}/${baseName(main)}-${draft('wt-branch').trim().replace(/[^\w.-]+/g, '-') || t.worktrees.newFolder}`
  const bases = [
    { value: '', label: 'HEAD' },
    ...ctx.snap.branches.map(branch => ({ value: branch.name, label: branch.name })),
  ]

  const create = async (): Promise<void> => {
    const path = draft('wt-path').trim() || suggestion()
    if (path === '') {
      await cmd.inform(t.worktrees.pathMissing, 'error')
      return
    }
    const newBranch = draft('wt-branch').trim()
    const base = picked(ctx, 'wt-base', bases)
    if (await cmd.act(ops.addWorktree(t, path, newBranch, base))) clearDrafts('wt-path', 'wt-branch')
  }

  return (
    <Box flexDirection="column">
      {note(ctx, t.worktrees.note)}
      {bar(ctx, [
        field(ctx, 'wt-branch', { label: t.common.newBranch, placeholder: t.worktrees.branchPlaceholder, submitLabel: t.common.createSubmit, onSubmit: () => create() }),
        choice(ctx, 'wt-base', bases, { label: t.worktrees.base }),
      ])}
      {bar(ctx, [
        field(ctx, 'wt-path', { label: t.worktrees.folder, placeholder: t.worktrees.folderPlaceholder(`${parentOf(main)}/${baseName(main)}`), submitLabel: t.common.createSubmit, onSubmit: () => create() }),
        button(ctx, 'wt-create', t.worktrees.create, () => create(), { primary: true }),
        button(ctx, 'wt-prune', t.worktrees.prune, () => cmd.act(ops.pruneWorktrees(t)), { dim: true }),
      ])}
      {section(ctx, t.worktrees.list(list.length))}
      {list.map((worktree, index) => worktreeRow(ctx, worktree, index === 0))}
    </Box>
  )
}

function worktreeRow(ctx: Ctx, worktree: GsWorktree, isMain: boolean): Node {
  const { Box, Button, Text } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const id = `worktree:${worktree.path}`
  const isOpen = ctx.nav.expanded === id
  const isHere = ctx.snap.head?.root === worktree.path
  const what = worktree.bare ? t.worktrees.bare : worktree.branch ?? t.worktrees.detached(short(worktree.head ?? ''))

  const move = async (): Promise<void> => {
    const to = draft(`wt-move:${worktree.path}`).trim()
    if (to === '') {
      await cmd.inform(t.worktrees.folderMissing, 'error')
      return
    }
    if (await cmd.act(ops.moveWorktree(t, worktree.path, to))) clearDrafts(`wt-move:${worktree.path}`)
  }

  return (
    <Box flexDirection="column">
      <Button key={`wt-row:${worktree.path}`} plain onPress={() => cmd.toggleExpanded(id)}>
        {isOpen ? '▾ ' : '▸ '}
        {isHere ? <Text color="claude" bold>● </Text> : '  '}
        <Text bold>{line(baseName(worktree.path))}</Text> <Text color="success">{line(what)}</Text>
        {isMain ? <Text dimColor>{t.worktrees.main}</Text> : ''}
        {worktree.locked !== null ? <Text color="warning"> 🔒</Text> : ''}
        {worktree.prunable !== null ? <Text color="error">{t.worktrees.prunable}</Text> : ''}
        <Text dimColor> {cut(line(worktree.path), Math.max(10, ctx.width - 40))}</Text>
      </Button>
      {isOpen ? (
        <Box flexDirection="column" marginLeft={4} marginBottom={1}>
          {worktree.locked !== null ? note(ctx, t.worktrees.locked(worktree.locked)) : null}
          {worktree.prunable !== null ? note(ctx, t.worktrees.prunableWhy(worktree.prunable)) : null}
          {bar(ctx, [
            isHere ? <Text color="claude">{t.worktrees.shown}</Text> : button(ctx, `wt-use:${worktree.path}`, t.worktrees.open, () => cmd.useRepo(worktree.path), { primary: true }),
            button(ctx, `wt-copy:${worktree.path}`, t.worktrees.copyPath, () => cmd.copy(worktree.path), { dim: true }),
            isMain
              ? null
              : button(ctx, `wt-lock:${worktree.path}`, worktree.locked === null ? t.worktrees.lock : t.worktrees.unlock, () =>
                  cmd.act(ops.lockWorktree(t, worktree.path, worktree.locked === null)),
                { dim: true }),
          ])}
          {isMain
            ? null
            : bar(ctx, [
                field(ctx, `wt-move:${worktree.path}`, { label: t.worktrees.moveTo, placeholder: worktree.path, submitLabel: t.worktrees.moveSubmit, onSubmit: () => move() }),
                button(ctx, `wt-remove:${worktree.path}`, t.worktrees.remove, () => cmd.act(ops.removeWorktree(t, worktree.path, false)), { dim: true }),
                button(ctx, `wt-remove-force:${worktree.path}`, t.worktrees.forceRemove, () => cmd.act(ops.removeWorktree(t, worktree.path, true)), { dim: true }),
              ])}
        </Box>
      ) : null}
    </Box>
  )
}

// Stash

const STASH_MODES: ops.StashMode[] = ['default', 'untracked', 'keep-index', 'staged']

const isStashMode = (value: string): value is ops.StashMode => STASH_MODES.some(mode => mode === value)

export function stashView(ctx: Ctx): Node {
  const { Box } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const modes = STASH_MODES.map(mode => ({ value: mode, label: t.stash.modes[mode] }))
  const push = async (): Promise<void> => {
    const mode = picked(ctx, 'stash-mode', modes)
    if (await cmd.act(ops.stashPush(t, draft('stash-msg'), isStashMode(mode) ? mode : 'default'))) clearDrafts('stash-msg')
  }
  return (
    <Box flexDirection="column">
      {bar(ctx, [
        field(ctx, 'stash-msg', { label: t.stash.newStash, placeholder: t.stash.messagePlaceholder, submitLabel: t.stash.submit, onSubmit: () => push() }),
        choice(ctx, 'stash-mode', modes),
        button(ctx, 'stash-push', t.stash.stash, () => push(), { primary: true }),
      ])}
      {section(ctx, t.stash.list(ctx.snap.stashes.length), ctx.snap.stashes.length > 0 ? [button(ctx, 'stash-clear', t.stash.dropAll, () => cmd.act(ops.stashClear(t)), { dim: true })] : [])}
      {ctx.snap.stashes.length === 0 ? note(ctx, t.stash.none) : null}
      {ctx.snap.stashes.map(stash => stashRow(ctx, stash))}
    </Box>
  )
}

function stashRow(ctx: Ctx, stash: GsStash): Node {
  const { Box, Button, Text } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const isOpen = ctx.nav.expanded === `stash:${stash.ref}`
  const branchOut = async (): Promise<void> => {
    const name = draft(`stash-branch:${stash.ref}`).trim()
    if (name === '') {
      await cmd.inform(t.common.nameBranch, 'error')
      return
    }
    if (await cmd.act(ops.stashBranch(t, name, stash.ref))) clearDrafts(`stash-branch:${stash.ref}`)
  }
  return (
    <Box flexDirection="column">
      <Button key={`stash-row:${stash.ref}`} plain onPress={() => cmd.openStash(stash.ref)}>
        {isOpen ? '▾ ' : '▸ '}
        <Text color="warning">{stash.ref}</Text> {cut(line(stash.subject), Math.max(10, ctx.width - 30))} <Text dimColor>· {ago(t, stash.time)}</Text>
      </Button>
      {isOpen ? (
        <Box flexDirection="column" marginLeft={4} marginBottom={1}>
          {bar(ctx, [
            button(ctx, `stash-apply:${stash.ref}`, t.stash.apply, () => cmd.act(ops.stashApply(t, stash.ref)), { primary: true }),
            button(ctx, `stash-pop:${stash.ref}`, t.stash.pop, () => cmd.act(ops.stashPop(t, stash.ref))),
            button(ctx, `stash-drop:${stash.ref}`, t.stash.drop, () => cmd.act(ops.stashDrop(t, stash.ref)), { dim: true }),
          ])}
          {bar(ctx, [
            field(ctx, `stash-branch:${stash.ref}`, { label: t.stash.branchFrom, placeholder: t.stash.namePlaceholder, submitLabel: t.common.createSubmit, onSubmit: () => branchOut() }),
            button(ctx, `stash-branch-go:${stash.ref}`, t.common.create, () => branchOut(), { dim: true }),
          ])}
          {diffView(ctx, ctx.detail.diff, `stash:${stash.ref}`)}
        </Box>
      ) : null}
    </Box>
  )
}

// Remotes

export function remotesView(ctx: Ctx): Node {
  const { Box } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const head = ctx.snap.head
  const remote = defaultRemote(ctx)
  const branch = head?.branch ?? null
  const add = async (): Promise<void> => {
    const name = draft('remote-name').trim()
    const url = draft('remote-url').trim()
    if (name === '' || url === '') {
      await cmd.inform(t.remotes.nameAndUrlMissing, 'error')
      return
    }
    if (await cmd.act(ops.addRemote(t, name, url))) clearDrafts('remote-name', 'remote-url')
  }
  const pushStep = pushStepForHead(ctx)
  const pushOp = pushStep === null ? null : ops.pushHead(t, pushStep, branch)

  return (
    <Box flexDirection="column">
      {bar(ctx, [
        button(ctx, 'remotes-fetch', t.common.fetchAll, () => cmd.act(ops.fetch(t, null)), { primary: true }),
        button(ctx, 'remotes-pull', t.common.pull, () => cmd.act(ops.pull(t, 'default'))),
        button(ctx, 'remotes-pull-ff', '--ff-only', () => cmd.act(ops.pull(t, 'ff-only')), { dim: true }),
        button(ctx, 'remotes-pull-rebase', '--rebase', () => cmd.act(ops.pull(t, 'rebase')), { dim: true }),
        button(ctx, 'remotes-pull-merge', '--no-rebase', () => cmd.act(ops.pull(t, 'merge')), { dim: true }),
      ])}
      {bar(ctx, [
        pushOp !== null ? button(ctx, 'remotes-push', t.remotes.push(branch), () => cmd.act(pushOp)) : null,
        remote !== null && branch !== null
          ? button(ctx, 'remotes-push-force', t.remotes.forcePush, () => cmd.act(ops.push(t, remote, branch, { force: true })), { dim: true })
          : null,
        remote !== null ? button(ctx, 'remotes-push-tags', t.remotes.pushTags, () => cmd.act(ops.pushAllTags(t, remote)), { dim: true }) : null,
      ])}
      {section(ctx, t.remotes.list(ctx.snap.remotes.length))}
      {ctx.snap.remotes.length === 0 ? note(ctx, t.remotes.none) : null}
      {ctx.snap.remotes.map(one => remoteRow(ctx, one))}
      {bar(ctx, [
        field(ctx, 'remote-name', { label: t.remotes.add, placeholder: 'origin', submitLabel: t.remotes.addSubmit, onSubmit: () => add() }),
        field(ctx, 'remote-url', { placeholder: t.remotes.urlPlaceholder, submitLabel: t.remotes.addSubmit, onSubmit: () => add() }),
        button(ctx, 'remote-add', t.remotes.addRemote, () => add()),
      ])}
    </Box>
  )
}

function remoteRow(ctx: Ctx, remote: GsRemote): Node {
  const { Box, Button, Text } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const id = `remote:${remote.name}`
  const isOpen = ctx.nav.expanded === id
  const rename = async (): Promise<void> => {
    const to = draft(`remote-rename:${remote.name}`).trim()
    if (to === '' || to === remote.name) {
      await cmd.inform(t.remotes.newNameMissing, 'error')
      return
    }
    if (await cmd.act(ops.renameRemote(t, remote.name, to))) clearDrafts(`remote-rename:${remote.name}`)
  }
  const setUrl = async (): Promise<void> => {
    const url = draft(`remote-url:${remote.name}`).trim()
    if (url === '') {
      await cmd.inform(t.remotes.newUrlMissing, 'error')
      return
    }
    if (await cmd.act(ops.setRemoteUrl(t, remote.name, url))) clearDrafts(`remote-url:${remote.name}`)
  }
  return (
    <Box flexDirection="column">
      <Button key={`remote-row:${remote.name}`} plain onPress={() => cmd.toggleExpanded(id)}>
        {isOpen ? '▾ ' : '▸ '}
        <Text bold color="error">
          {line(remote.name)}
        </Text>{' '}
        <Text dimColor>{cut(line(remote.fetch), Math.max(10, ctx.width - remote.name.length - 8))}</Text>
      </Button>
      {isOpen ? (
        <Box flexDirection="column" marginLeft={4} marginBottom={1}>
          {remote.push !== remote.fetch ? note(ctx, t.remotes.pushUrl(remote.push)) : null}
          {bar(ctx, [
            button(ctx, `remote-fetch:${remote.name}`, t.remotes.fetch(remote.name), () => cmd.act(ops.fetch(t, remote.name)), { primary: true }),
            button(ctx, `remote-prune:${remote.name}`, t.remotes.prune, () => cmd.act(ops.pruneRemote(t, remote.name)), { dim: true }),
            button(ctx, `remote-copy:${remote.name}`, t.remotes.copyUrl, () => cmd.copy(remote.fetch), { dim: true }),
            button(ctx, `remote-remove:${remote.name}`, t.remotes.remove, () => cmd.act(ops.removeRemote(t, remote.name)), { dim: true }),
          ])}
          {bar(ctx, [
            field(ctx, `remote-rename:${remote.name}`, { label: t.common.rename, placeholder: remote.name, submitLabel: t.common.renameSubmit, onSubmit: () => rename() }),
            field(ctx, `remote-url:${remote.name}`, { label: t.remotes.url, placeholder: remote.fetch, submitLabel: t.remotes.changeSubmit, onSubmit: () => setUrl() }),
          ])}
        </Box>
      ) : null}
    </Box>
  )
}

// Console

export function consoleView(ctx: Ctx): Node {
  const { Box, Code, Text } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  return (
    <Box flexDirection="column">
      {note(ctx, t.console.note)}
      {bar(ctx, [
        field(ctx, 'console', {
          label: 'git',
          placeholder: 'log --stat -3',
          submitLabel: t.console.runSubmit,
          onSubmit: async value => {
            if (value.trim() === '') return
            await cmd.runConsole(value)
            clearDrafts('console')
          },
        }),
        ctx.consoleEntries.length > 0 ? button(ctx, 'console-clear', t.console.clear, () => cmd.clearConsole(), { dim: true }) : null,
      ])}
      {ctx.consoleEntries.map((entry, index) => (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text color={entry.code === 0 ? 'success' : 'error'}>$ </Text>
            <Text bold>{line(entry.cmd)}</Text>
            <Text dimColor>
              {' '}
              · {entry.code === 0 ? t.console.ok : t.console.code(entry.code)} · {ago(t, Math.floor(entry.at / 1000))}
            </Text>
          </Text>
          {entry.output.trim() === '' ? (
            <Text dimColor>{t.console.noOutput}</Text>
          ) : /^(diff --git|@@ )/m.test(entry.output) && index === 0 ? (
            diffView(ctx, { key: 'console', text: entry.output, truncated: false }, 'console')
          ) : (
            <Code source={block(entry.output)} />
          )}
        </Box>
      ))}
    </Box>
  )
}
