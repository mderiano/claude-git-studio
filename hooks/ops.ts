import type { GsNavPatch, GsOp, GsOperation, GsStep } from '../types'
import type { Messages } from './i18n'

/** Each function names one git action as data: what a button runs, and what it asks first, in the strings `t` holds. */

const step = (...args: string[]): GsStep => ({ args })

function op(title: string, steps: GsStep[], extra: Omit<GsOp, 'title' | 'steps'> = {}): GsOp {
  return { title, steps, ...extra }
}

const short = (sha: string): string => sha.slice(0, 7)

// Working tree and index

export const stage = (t: Messages, paths: string[]): GsOp => op(t.ops.stage(paths), [step('add', '--', ...paths)])

export const stageAll = (t: Messages): GsOp => op(t.ops.stageAll, [step('add', '-A')])

export const unstage = (t: Messages, paths: string[]): GsOp => op(t.ops.unstage(paths), [step('reset', '-q', '--', ...paths)])

export const unstageAll = (t: Messages): GsOp => op(t.ops.unstageAll, [step('reset', '-q')])

export const discard = (t: Messages, path: string): GsOp =>
  op(t.ops.discard(path), [step('restore', '--worktree', '--', path)], {
    danger: t.ops.discardDanger(path),
  })

export const discardAll = (t: Messages): GsOp =>
  op(t.ops.discardAll, [step('restore', '--worktree', '--', ':/')], {
    danger: t.ops.discardAllDanger,
  })

export const removeUntracked = (t: Messages, path: string): GsOp =>
  op(t.ops.removeUntracked(path), [step('clean', '-f', '-d', '--', path)], {
    danger: t.ops.removeUntrackedDanger(path),
  })

export const cleanAll = (t: Messages): GsOp =>
  op(t.ops.cleanAll, [step('clean', '-f', '-d')], {
    danger: t.ops.cleanAllDanger,
  })

export const takeOurs = (t: Messages, path: string): GsOp =>
  op(t.ops.takeOurs(path), [step('checkout', '--ours', '--', path), step('add', '--', path)])

export const takeTheirs = (t: Messages, path: string): GsOp =>
  op(t.ops.takeTheirs(path), [step('checkout', '--theirs', '--', path), step('add', '--', path)])

export const markResolved = (t: Messages, path: string): GsOp => op(t.ops.markResolved(path), [step('add', '--', path)])

export const removeConflicted = (t: Messages, path: string): GsOp =>
  op(t.ops.removeConflicted(path), [step('rm', '-q', '--', path)], { danger: t.ops.removeConflictedDanger(path) })

export const stageHunk = (t: Messages, patch: string): GsOp =>
  op(t.ops.stageHunk, [{ args: ['apply', '--cached', '--whitespace=nowarn', '-'], stdin: patch }])

export const unstageHunk = (t: Messages, patch: string): GsOp =>
  op(t.ops.unstageHunk, [{ args: ['apply', '--cached', '-R', '--whitespace=nowarn', '-'], stdin: patch }])

export const discardHunk = (t: Messages, patch: string): GsOp =>
  op(t.ops.discardHunk, [{ args: ['apply', '-R', '--whitespace=nowarn', '-'], stdin: patch }], {
    danger: t.ops.discardHunkDanger,
  })

export type CommitOptions = { amend?: boolean; all?: boolean; push?: GsStep | null }

export function commit(t: Messages, message: string, options: CommitOptions = {}): GsOp {
  const args = ['commit']
  if (options.all) args.push('-a')
  if (options.amend) args.push('--amend')
  if (message.trim() !== '') args.push('-m', message)
  else args.push('--no-edit')
  const steps = [{ args }]
  if (options.push) steps.push(options.push)
  const title = options.amend ? t.ops.amend : options.push ? t.ops.commitPush : t.ops.commit
  return op(title, steps, options.push ? { network: true } : {})
}

// Operations in progress

const OPERATION_NAME: Record<GsOperation, string> = {
  merge: 'merge',
  rebase: 'rebase',
  am: 'am',
  'cherry-pick': 'cherry-pick',
  revert: 'revert',
  bisect: 'bisect',
}

export const continueOperation = (t: Messages, operation: GsOperation): GsOp =>
  op(t.ops.continueOperation(OPERATION_NAME[operation]), [step(OPERATION_NAME[operation], '--continue')])

export const abortOperation = (t: Messages, operation: GsOperation): GsOp =>
  operation === 'bisect'
    ? op(t.ops.endBisect, [step('bisect', 'reset')])
    : op(t.ops.abortOperation(OPERATION_NAME[operation]), [step(OPERATION_NAME[operation], '--abort')], {
        danger: t.ops.abortOperationDanger(OPERATION_NAME[operation]),
      })

export const skipOperation = (t: Messages, operation: GsOperation): GsOp =>
  operation === 'bisect'
    ? op(t.ops.bisectSkip, [step('bisect', 'skip')])
    : op(t.ops.skipOperation(OPERATION_NAME[operation]), [step(OPERATION_NAME[operation], '--skip')], {
        danger: t.ops.skipOperationDanger(OPERATION_NAME[operation]),
      })

export const bisectMark = (t: Messages, verdict: 'good' | 'bad', sha: string | null, isBisecting: boolean): GsOp => {
  const steps: GsStep[] = isBisecting ? [] : [step('bisect', 'start')]
  steps.push(sha === null ? step('bisect', verdict) : step('bisect', verdict, sha))
  return op(t.ops.bisectMark(verdict, sha === null ? null : short(sha)), steps)
}

// Commits

export const checkoutDetached = (t: Messages, ref: string): GsOp =>
  op(t.ops.checkoutDetached(/^[0-9a-f]{40,64}$/.test(ref) ? short(ref) : ref), [step('checkout', '--detach', ref)])

export function createBranch(t: Messages, name: string, start: string, checkout: boolean): GsOp {
  const steps = checkout ? [step('checkout', '-b', name, start)] : [step('branch', name, start)]
  return op(t.ops.createBranch(name, checkout), steps)
}

export function createTag(t: Messages, name: string, target: string, message: string): GsOp {
  const args = message.trim() === '' ? ['tag', name, target] : ['tag', '-a', name, '-m', message, target]
  return op(t.ops.createTag(name), [{ args }])
}

/** Commits oldest first; merges take their first parent as mainline. */
export function cherryPick(t: Messages, shas: string[], hasMerge: boolean): GsOp {
  const args = ['cherry-pick', ...(hasMerge ? ['-m', '1'] : []), ...shas]
  return op(t.ops.cherryPick(shas.length, short(shas[0] ?? '')), [{ args }])
}

export function revert(t: Messages, shas: string[], hasMerge: boolean): GsOp {
  const args = ['revert', '--no-edit', ...(hasMerge ? ['-m', '1'] : []), ...shas]
  return op(t.ops.revert(shas.length, short(shas[0] ?? '')), [{ args }])
}

export function reset(t: Messages, target: string, mode: 'soft' | 'mixed' | 'hard', branch: string | null): GsOp {
  const where = branch ?? 'HEAD'
  return op(t.ops.reset(mode, where, short(target)), [step('reset', `--${mode}`, target)], mode === 'hard'
    ? { danger: t.ops.resetHardDanger(where, short(target)) }
    : {})
}

export type MergeMode = 'ff' | 'no-ff' | 'ff-only' | 'squash'

export function merge(t: Messages, ref: string, mode: MergeMode, into: string | null): GsOp {
  const flags: Record<MergeMode, string[]> = {
    ff: ['--no-edit'],
    'no-ff': ['--no-ff', '--no-edit'],
    'ff-only': ['--ff-only'],
    squash: ['--squash'],
  }
  const label = /^[0-9a-f]{40,64}$/.test(ref) ? short(ref) : ref
  return op(t.ops.merge(label, mode === 'ff' ? null : mode, into ?? 'HEAD'), [step('merge', ...flags[mode], ref)])
}

export const rebase = (t: Messages, onto: string, branch: string | null): GsOp => {
  const label = /^[0-9a-f]{40,64}$/.test(onto) ? short(onto) : onto
  return op(t.ops.rebase(branch ?? 'HEAD', label), [step('rebase', onto)], {
    danger: t.ops.rebaseDanger(branch ?? 'HEAD', label),
  })
}

// Branches

export const switchBranch = (t: Messages, name: string): GsOp => op(t.ops.switchBranch(name), [step('checkout', name)])

export const trackRemote = (t: Messages, remoteBranch: string, local: string): GsOp =>
  op(t.ops.trackRemote(local, remoteBranch), [step('checkout', '-b', local, '--track', remoteBranch)])

export const renameBranch = (t: Messages, from: string, to: string): GsOp =>
  op(t.ops.renameBranch(from, to), [step('branch', '-m', from, to)], { then: { expanded: `branch:${to}` } })

export const deleteBranch = (t: Messages, name: string, force: boolean): GsOp =>
  op(t.ops.deleteBranch(name), [step('branch', force ? '-D' : '-d', name)], {
    danger: t.ops.deleteBranchDanger(name, force),
    then: { expanded: null },
  })

export const deleteRemoteBranch = (t: Messages, remote: string, branch: string): GsOp =>
  op(t.ops.deleteRemoteBranch(remote, branch), [step('push', remote, '--delete', branch)], {
    danger: t.ops.deleteRemoteBranchDanger(remote, branch),
    network: true,
    then: { expanded: null },
  })

export const setUpstream = (t: Messages, branch: string, upstream: string): GsOp =>
  op(t.ops.setUpstream(branch, upstream), [step('branch', `--set-upstream-to=${upstream}`, branch)])

export const unsetUpstream = (t: Messages, branch: string): GsOp =>
  op(t.ops.unsetUpstream(branch), [step('branch', '--unset-upstream', branch)])

export type PushOptions = { setUpstream?: boolean; force?: boolean; tags?: boolean }

export function pushStep(remote: string, branch: string | null, options: PushOptions = {}): GsStep {
  const args = ['push']
  if (options.setUpstream) args.push('-u')
  if (options.force) args.push('--force-with-lease')
  if (options.tags) args.push('--follow-tags')
  args.push(remote)
  if (branch !== null) args.push(branch)
  return { args }
}

export function push(t: Messages, remote: string, branch: string | null, options: PushOptions = {}): GsOp {
  const target = branch === null ? remote : t.ops.pushTarget(branch, remote)
  return op(t.ops.push(target, options.force === true), [pushStep(remote, branch, options)], {
    network: true,
    ...(options.force ? { danger: t.ops.pushDanger(target) } : {}),
  })
}

/** Pushes the checked-out branch with the step `pushStepForHead` chose. */
export const pushHead = (t: Messages, headStep: GsStep, branch: string | null): GsOp =>
  op(t.ops.push(branch ?? 'HEAD', false), [headStep], { network: true })

export type PullMode = 'default' | 'ff-only' | 'rebase' | 'merge'

export const pull = (t: Messages, mode: PullMode): GsOp => {
  const flags: Record<PullMode, string[]> = { default: [], 'ff-only': ['--ff-only'], rebase: ['--rebase'], merge: ['--no-rebase'] }
  return op(t.ops.pull(mode === 'default' ? null : mode), [step('pull', ...flags[mode])], { network: true })
}

export const fetch = (t: Messages, remote: string | null): GsOp =>
  op(remote === null ? t.ops.fetchAll : t.ops.fetch(remote), [
    remote === null ? step('fetch', '--all', '--prune') : step('fetch', '--prune', remote),
  ], { network: true })

/** Fast-forwards a branch that is not checked out to its upstream. */
export const fastForward = (t: Messages, branch: string, remote: string, remoteBranch: string): GsOp =>
  op(t.ops.fastForward(branch, `${remote}/${remoteBranch}`), [step('fetch', remote, `${remoteBranch}:${branch}`)], {
    network: true,
  })

// Tags

export const deleteTag = (t: Messages, name: string): GsOp =>
  op(t.ops.deleteTag(name), [step('tag', '-d', name)], { danger: t.ops.deleteTagDanger(name), then: { expanded: null } })

export const pushTag = (t: Messages, name: string, remote: string): GsOp =>
  op(t.ops.pushTag(name, remote), [step('push', remote, `refs/tags/${name}`)], { network: true })

export const pushAllTags = (t: Messages, remote: string): GsOp =>
  op(t.ops.pushAllTags(remote), [step('push', remote, '--tags')], { network: true })

export const deleteRemoteTag = (t: Messages, name: string, remote: string): GsOp =>
  op(t.ops.deleteRemoteTag(name, remote), [step('push', remote, '--delete', `refs/tags/${name}`)], {
    danger: t.ops.deleteRemoteTagDanger(name, remote),
    network: true,
  })

// Worktrees

export function addWorktree(t: Messages, path: string, newBranch: string, ref: string): GsOp {
  const args = ['worktree', 'add']
  if (newBranch !== '') args.push('-b', newBranch)
  args.push(path)
  if (ref !== '') args.push(ref)
  return op(t.ops.addWorktree(path), [{ args }])
}

export const removeWorktree = (t: Messages, path: string, force: boolean): GsOp =>
  op(t.ops.removeWorktree(path), [step('worktree', 'remove', ...(force ? ['--force'] : []), path)], {
    danger: t.ops.removeWorktreeDanger(path, force),
    then: { expanded: null },
  })

export const lockWorktree = (t: Messages, path: string, lock: boolean): GsOp =>
  op(t.ops.lockWorktree(path, lock), [step('worktree', lock ? 'lock' : 'unlock', path)])

export const moveWorktree = (t: Messages, path: string, to: string): GsOp =>
  op(t.ops.moveWorktree(to), [step('worktree', 'move', path, to)], { then: { expanded: `worktree:${to}` } })

export const pruneWorktrees = (t: Messages): GsOp => op(t.ops.pruneWorktrees, [step('worktree', 'prune', '-v')])

// Stash

export type StashMode = 'default' | 'untracked' | 'keep-index' | 'staged'

export function stashPush(t: Messages, message: string, mode: StashMode): GsOp {
  const args = ['stash', 'push']
  if (mode === 'untracked') args.push('--include-untracked')
  if (mode === 'keep-index') args.push('--keep-index')
  if (mode === 'staged') args.push('--staged')
  if (message.trim() !== '') args.push('-m', message)
  return op(t.ops.stashPush, [{ args }])
}

export const stashApply = (t: Messages, ref: string): GsOp => op(t.ops.stashApply(ref), [step('stash', 'apply', ref)])

export const stashPop = (t: Messages, ref: string): GsOp => op(t.ops.stashPop(ref), [step('stash', 'pop', ref)], { then: { expanded: null } })

export const stashDrop = (t: Messages, ref: string): GsOp =>
  op(t.ops.stashDrop(ref), [step('stash', 'drop', ref)], { danger: t.ops.stashDropDanger(ref), then: { expanded: null } })

export const stashBranch = (t: Messages, name: string, ref: string): GsOp =>
  op(t.ops.stashBranch(name, ref), [step('stash', 'branch', name, ref)], { then: { expanded: null } })

export const stashClear = (t: Messages): GsOp =>
  op(t.ops.stashClear, [step('stash', 'clear')], { danger: t.ops.stashClearDanger })

// Remotes

export const addRemote = (t: Messages, name: string, url: string): GsOp => op(t.ops.addRemote(name), [step('remote', 'add', name, url)])

export const removeRemote = (t: Messages, name: string): GsOp =>
  op(t.ops.removeRemote(name), [step('remote', 'remove', name)], {
    danger: t.ops.removeRemoteDanger(name),
    then: { expanded: null },
  })

export const renameRemote = (t: Messages, from: string, to: string): GsOp =>
  op(t.ops.renameRemote(from, to), [step('remote', 'rename', from, to)], { then: { expanded: `remote:${to}` } })

export const setRemoteUrl = (t: Messages, name: string, url: string): GsOp =>
  op(t.ops.setRemoteUrl(name), [step('remote', 'set-url', name, url)])

export const pruneRemote = (t: Messages, name: string): GsOp =>
  op(t.ops.pruneRemote(name), [step('remote', 'prune', name)], { network: true })

// Repository

export const init = (t: Messages): GsOp => op(t.ops.init, [step('init')])

export const clone = (t: Messages, url: string, dest: string): GsOp =>
  op(t.ops.clone(url), [dest === '' ? step('clone', url) : step('clone', url, dest)], { network: true })

export const withThen = (operation: GsOp, then: GsNavPatch): GsOp => ({ ...operation, then: { ...operation.then, ...then } })

export const restoreFile = (t: Messages, sha: string, path: string): GsOp =>
  op(t.ops.restoreFile(path, short(sha)), [step('checkout', sha, '--', path)], {
    danger: t.ops.restoreFileDanger(path, short(sha)),
  })
