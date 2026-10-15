import type { GsBranch, GsTag } from '../types'
import { clearDrafts, draft } from './drafts'
import { ago, bar, button, choice, cut, field, line, note, picked, section, short } from './kit'
import type { Ctx, Node } from './kit'
import * as ops from './ops'
import { defaultRemote } from './status'

/** `origin/feature/x` read against the remotes: `['origin', 'feature/x']`. */
export function splitRemoteRef(ref: string, remotes: readonly string[]): [string, string] | null {
  const remote = [...remotes].sort((a, b) => b.length - a.length).find(name => ref.startsWith(`${name}/`))
  return remote === undefined ? null : [remote, ref.slice(remote.length + 1)]
}

async function showHistoryOf(ctx: Ctx, ref: string): Promise<void> {
  const cmd = ctx.cmd
  await cmd.patchLog({ scope: ref, query: '', limit: 150 })
  await cmd.patchNav({ view: 'log', expanded: null, commitFile: null })
  await cmd.refresh()
}

export function branchesView(ctx: Ctx): Node {
  const { Box } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const locals = ctx.snap.branches.filter(branch => !branch.remote)
  const remoteBranches = ctx.snap.branches.filter(branch => branch.remote)
  const current = ctx.snap.head?.branch ?? null
  const bases = [
    { value: 'HEAD', label: current === null ? 'HEAD' : `HEAD (${current})` },
    ...locals.map(branch => ({ value: branch.name, label: branch.name })),
    ...remoteBranches.map(branch => ({ value: branch.name, label: branch.name })),
  ]
  const create = async (checkout: boolean): Promise<void> => {
    const name = draft('new-branch').trim()
    if (name === '') {
      await cmd.inform(t.common.nameNewBranch, 'error')
      return
    }
    if (await cmd.act(ops.createBranch(t, name, picked(ctx, 'new-branch-base', bases), checkout))) clearDrafts('new-branch')
  }

  return (
    <Box flexDirection="column">
      {bar(ctx, [
        field(ctx, 'new-branch', { label: t.common.newBranch, placeholder: t.branches.branchPlaceholder, submitLabel: t.common.createSubmit, onSubmit: () => create(false) }),
        choice(ctx, 'new-branch-base', bases, { label: t.branches.from }),
        button(ctx, 'new-branch-create', t.common.create, () => create(false)),
        button(ctx, 'new-branch-switch', t.common.createAndSwitch, () => create(true), { primary: true }),
      ])}
      {section(ctx, t.branches.local(locals.length))}
      {locals.length === 0 ? note(ctx, t.branches.noLocal) : null}
      {locals.map(branch => localRow(ctx, branch))}
      {section(ctx, t.branches.remote(remoteBranches.length), [
        button(ctx, 'fetch-all-branches', t.common.fetchAll, () => cmd.act(ops.fetch(t, null)), { dim: true }),
      ])}
      {remoteBranches.length === 0 ? note(ctx, t.branches.noRemote) : null}
      {remoteBranches.map(branch => remoteRow(ctx, branch))}
    </Box>
  )
}

function branchLabel(ctx: Ctx, branch: GsBranch, isOpen: boolean): Node[] {
  const { Text } = ctx.ui
  const track = branch.upstream === null ? '' : ` → ${branch.upstream}${branch.gone ? ctx.t.branches.gone : ''}`
  const fixed = branch.name.length + track.length + 12
  return [
    isOpen ? '▾ ' : '▸ ',
    branch.isHead ? <Text color="claude" bold>● </Text> : '  ',
    <Text color={branch.isHead ? 'claude' : branch.remote ? 'error' : 'success'} bold={branch.isHead}>
      {line(branch.name)}
    </Text>,
    branch.ahead > 0 ? <Text color="success"> ↑{branch.ahead}</Text> : '',
    branch.behind > 0 ? <Text color="warning"> ↓{branch.behind}</Text> : '',
    <Text dimColor>
      {line(track)} · {cut(line(branch.subject), Math.max(10, ctx.width - fixed - 12))} · {ago(ctx.t, branch.time)}
    </Text>,
  ]
}

function localRow(ctx: Ctx, branch: GsBranch): Node {
  const { Box, Button } = ctx.ui
  const id = `branch:${branch.name}`
  const isOpen = ctx.nav.expanded === id
  return (
    <Box flexDirection="column">
      <Button key={`branch-row:${branch.name}`} plain onPress={() => ctx.cmd.toggleExpanded(id)}>
        {branchLabel(ctx, branch, isOpen)}
      </Button>
      {isOpen ? (
        <Box flexDirection="column" marginLeft={4} marginBottom={1}>
          {localActions(ctx, branch)}
        </Box>
      ) : null}
    </Box>
  )
}

function localActions(ctx: Ctx, branch: GsBranch): Node {
  const { Box, Text } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const head = ctx.snap.head
  const current = head?.branch ?? null
  const remoteNames = ctx.snap.remotes.map(remote => remote.name)
  const remote = defaultRemote(ctx)
  const upstream = branch.upstream === null ? null : splitRemoteRef(branch.upstream, remoteNames)
  const pushRemote = upstream?.[0] ?? remote
  const remoteChoices = ctx.snap.branches.filter(one => one.remote).map(one => ({ value: one.name, label: one.name }))
  const elsewhere = branch.worktree !== null && branch.worktree !== head?.root ? branch.worktree : null

  const rename = async (): Promise<void> => {
    const to = draft(`rename:${branch.name}`).trim()
    if (to === '' || to === branch.name) {
      await cmd.inform(t.branches.newNameMissing, 'error')
      return
    }
    if (await cmd.act(ops.renameBranch(t, branch.name, to))) clearDrafts(`rename:${branch.name}`)
  }

  return (
    <Box flexDirection="column">
      {elsewhere !== null
        ? bar(ctx, [
            <Text color="permission">{t.branches.checkedOutIn(line(elsewhere))}</Text>,
            button(ctx, `open-wt:${branch.name}`, t.branches.openWorktree, () => cmd.useRepo(elsewhere), { dim: true }),
          ])
        : null}
      {branch.isHead
        ? bar(ctx, [
            button(ctx, `pull:${branch.name}`, t.common.pull, () => cmd.act(ops.pull(t, 'default')), { primary: true }),
            button(ctx, `pull-rebase:${branch.name}`, 'Pull --rebase', () => cmd.act(ops.pull(t, 'rebase'))),
            button(ctx, `pull-ff:${branch.name}`, 'Pull --ff-only', () => cmd.act(ops.pull(t, 'ff-only'))),
          ])
        : bar(ctx, [
            elsewhere === null ? button(ctx, `switch:${branch.name}`, t.branches.switch, () => cmd.act(ops.switchBranch(t, branch.name)), { primary: true }) : null,
            current !== null ? button(ctx, `merge:${branch.name}`, t.common.mergeInto(current), () => cmd.act(ops.merge(t, branch.name, 'ff', current))) : null,
            current !== null ? button(ctx, `merge-noff:${branch.name}`, '--no-ff', () => cmd.act(ops.merge(t, branch.name, 'no-ff', current)), { dim: true }) : null,
            current !== null ? button(ctx, `merge-squash:${branch.name}`, '--squash', () => cmd.act(ops.merge(t, branch.name, 'squash', current)), { dim: true }) : null,
            current !== null ? button(ctx, `rebase-onto:${branch.name}`, t.common.rebaseOnto(current), () => cmd.act(ops.rebase(t, branch.name, current))) : null,
            upstream !== null && elsewhere === null
              ? button(ctx, `ff:${branch.name}`, t.branches.updateFrom(branch.upstream ?? ''), () => cmd.act(ops.fastForward(t, branch.name, upstream[0], upstream[1])))
              : null,
          ])}
      {bar(ctx, [
        pushRemote !== null
          ? button(ctx, `push:${branch.name}`, t.branches.pushTo(pushRemote), () =>
              cmd.act(ops.push(t, pushRemote, branch.name, { setUpstream: branch.upstream === null })),
            )
          : null,
        pushRemote !== null
          ? button(ctx, `push-force:${branch.name}`, t.branches.forcePush, () => cmd.act(ops.push(t, pushRemote, branch.name, { force: true })), { dim: true })
          : null,
        button(ctx, `log:${branch.name}`, t.common.history, () => showHistoryOf(ctx, branch.name), { dim: true }),
        button(ctx, `tip:${branch.name}`, t.common.lastCommit(short(branch.sha)), () => cmd.jumpToCommit(branch.sha), { dim: true }),
      ])}
      {bar(ctx, [
        field(ctx, `rename:${branch.name}`, { label: t.common.rename, placeholder: branch.name, submitLabel: t.common.renameSubmit, onSubmit: () => rename() }),
        button(ctx, `rename-go:${branch.name}`, t.common.rename, () => rename(), { dim: true }),
      ])}
      {remoteChoices.length > 0
        ? bar(ctx, [
            choice(ctx, `upstream:${branch.name}`, [{ value: '', label: t.branches.none }, ...remoteChoices], {
              label: t.branches.upstream,
              value: branch.upstream ?? '',
              onSelect: value =>
                value === '' ? (branch.upstream === null ? undefined : cmd.act(ops.unsetUpstream(t, branch.name))) : cmd.act(ops.setUpstream(t, branch.name, value)),
            }),
          ])
        : null}
      {branch.isHead
        ? null
        : bar(ctx, [
            button(ctx, `delete:${branch.name}`, t.common.delete, () => cmd.act(ops.deleteBranch(t, branch.name, false)), { dim: true }),
            button(ctx, `delete-force:${branch.name}`, t.common.forceDelete, () => cmd.act(ops.deleteBranch(t, branch.name, true)), { dim: true }),
          ])}
    </Box>
  )
}

function remoteRow(ctx: Ctx, branch: GsBranch): Node {
  const { Box, Button } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const id = `rbranch:${branch.name}`
  const isOpen = ctx.nav.expanded === id
  const current = ctx.snap.head?.branch ?? null
  const split = splitRemoteRef(branch.name, ctx.snap.remotes.map(remote => remote.name))
  const localName = split?.[1] ?? branch.name
  const hasLocal = ctx.snap.branches.some(one => !one.remote && one.name === localName)

  return (
    <Box flexDirection="column">
      <Button key={`rbranch-row:${branch.name}`} plain onPress={() => cmd.toggleExpanded(id)}>
        {branchLabel(ctx, branch, isOpen)}
      </Button>
      {isOpen ? (
        <Box flexDirection="column" marginLeft={4} marginBottom={1}>
          {bar(ctx, [
            hasLocal
              ? button(ctx, `switch-local:${branch.name}`, t.branches.switchTo(localName), () => cmd.act(ops.switchBranch(t, localName)), { primary: true })
              : button(ctx, `track:${branch.name}`, t.branches.track(localName), () => cmd.act(ops.trackRemote(t, branch.name, localName)), { primary: true }),
            button(ctx, `checkout-r:${branch.name}`, t.common.checkoutDetached, () => cmd.act(ops.checkoutDetached(t, branch.name))),
            current !== null ? button(ctx, `merge-r:${branch.name}`, t.common.mergeInto(current), () => cmd.act(ops.merge(t, branch.name, 'ff', current))) : null,
            current !== null ? button(ctx, `rebase-r:${branch.name}`, t.common.rebaseOnto(current), () => cmd.act(ops.rebase(t, branch.name, current))) : null,
          ])}
          {bar(ctx, [
            button(ctx, `log-r:${branch.name}`, t.common.history, () => showHistoryOf(ctx, branch.name), { dim: true }),
            button(ctx, `tip-r:${branch.name}`, t.common.lastCommit(short(branch.sha)), () => cmd.jumpToCommit(branch.sha), { dim: true }),
            split !== null
              ? button(ctx, `delete-r:${branch.name}`, t.common.deleteOn(split[0]), () => cmd.act(ops.deleteRemoteBranch(t, split[0], split[1])), { dim: true })
              : null,
          ])}
        </Box>
      ) : null}
    </Box>
  )
}

export function tagsView(ctx: Ctx): Node {
  const { Box, Button, Text } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const remote = defaultRemote(ctx)
  const create = async (): Promise<void> => {
    const name = draft('new-tag').trim()
    if (name === '') {
      await cmd.inform(t.common.nameTag, 'error')
      return
    }
    const target = draft('new-tag-target').trim() || 'HEAD'
    if (await cmd.act(ops.createTag(t, name, target, draft('new-tag-msg')))) clearDrafts('new-tag', 'new-tag-target', 'new-tag-msg')
  }

  return (
    <Box flexDirection="column">
      {bar(ctx, [
        field(ctx, 'new-tag', { label: t.tags.newTag, placeholder: 'v1.2.3', submitLabel: t.common.createSubmit, onSubmit: () => create() }),
        field(ctx, 'new-tag-target', { label: t.tags.on, placeholder: 'HEAD', submitLabel: t.common.createSubmit, onSubmit: () => create() }),
        field(ctx, 'new-tag-msg', { placeholder: t.common.tagMessage, submitLabel: t.common.createSubmit, onSubmit: () => create() }),
        button(ctx, 'new-tag-create', t.common.createTag, () => create(), { primary: true }),
        remote !== null ? button(ctx, 'push-tags', t.tags.pushAll(remote), () => cmd.act(ops.pushAllTags(t, remote)), { dim: true }) : null,
      ])}
      {section(ctx, t.tags.list(ctx.snap.tags.length))}
      {ctx.snap.tags.length === 0 ? note(ctx, t.tags.none) : null}
      {ctx.snap.tags.map(tag => {
        const id = `tag:${tag.name}`
        const isOpen = ctx.nav.expanded === id
        return (
          <Box flexDirection="column">
            <Button key={`tag-row:${tag.name}`} plain onPress={() => cmd.toggleExpanded(id)}>
              {isOpen ? '▾ ' : '▸ '}
              <Text color="warning" bold>
                {line(tag.name)}
              </Text>{' '}
              <Text dimColor>
                {tag.annotated ? '◆ ' : ''}
                {short(tag.sha)} · {cut(line(tag.subject), Math.max(10, ctx.width - tag.name.length - 30))} · {ago(t, tag.time)}
              </Text>
            </Button>
            {isOpen ? (
              <Box flexDirection="column" marginLeft={4} marginBottom={1}>
                {tagActions(ctx, tag, remote)}
              </Box>
            ) : null}
          </Box>
        )
      })}
    </Box>
  )
}

function tagActions(ctx: Ctx, tag: GsTag, remote: string | null): Node {
  const { Box } = ctx.ui
  const cmd = ctx.cmd
  const t = ctx.t
  const branchFrom = async (): Promise<void> => {
    const name = draft(`tag-branch:${tag.name}`).trim()
    if (name === '') {
      await cmd.inform(t.common.nameBranch, 'error')
      return
    }
    if (await cmd.act(ops.createBranch(t, name, tag.name, true))) clearDrafts(`tag-branch:${tag.name}`)
  }
  return (
    <Box flexDirection="column">
      {bar(ctx, [
        button(ctx, `tag-checkout:${tag.name}`, t.common.checkoutDetached, () => cmd.act(ops.checkoutDetached(t, tag.name)), { primary: true }),
        button(ctx, `tag-commit:${tag.name}`, t.tags.showCommit, () => cmd.jumpToCommit(tag.sha)),
        remote !== null ? button(ctx, `tag-push:${tag.name}`, t.tags.pushTo(remote), () => cmd.act(ops.pushTag(t, tag.name, remote))) : null,
      ])}
      {bar(ctx, [
        field(ctx, `tag-branch:${tag.name}`, { label: t.tags.branchFrom, placeholder: 'hotfix/…', submitLabel: t.common.createSubmit, onSubmit: () => branchFrom() }),
        button(ctx, `tag-branch-go:${tag.name}`, t.common.createAndSwitch, () => branchFrom(), { dim: true }),
      ])}
      {bar(ctx, [
        button(ctx, `tag-delete:${tag.name}`, t.common.delete, () => cmd.act(ops.deleteTag(t, tag.name)), { dim: true }),
        remote !== null
          ? button(ctx, `tag-delete-remote:${tag.name}`, t.common.deleteOn(remote), () => cmd.act(ops.deleteRemoteTag(t, tag.name, remote)), { dim: true })
          : null,
      ])}
    </Box>
  )
}
