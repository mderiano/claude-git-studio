import type { GsNavPatch, GsOp, GsOperation, GsStep } from '../types'

/** Each function names one git action as data: what a button runs, and what it asks first. */

const step = (...args: string[]): GsStep => ({ args })

function op(title: string, steps: GsStep[], extra: Omit<GsOp, 'title' | 'steps'> = {}): GsOp {
  return { title, steps, ...extra }
}

const short = (sha: string): string => sha.slice(0, 7)

// Working tree and index

export const stage = (paths: string[]): GsOp =>
  op(paths.length === 1 ? `Indexer ${paths[0]}` : `Indexer ${paths.length} fichiers`, [step('add', '--', ...paths)])

export const stageAll = (): GsOp => op('Tout indexer', [step('add', '-A')])

export const unstage = (paths: string[]): GsOp =>
  op(paths.length === 1 ? `Désindexer ${paths[0]}` : `Désindexer ${paths.length} fichiers`, [step('reset', '-q', '--', ...paths)])

export const unstageAll = (): GsOp => op('Tout désindexer', [step('reset', '-q')])

export const discard = (path: string): GsOp =>
  op(`Annuler les modifications de ${path}`, [step('restore', '--worktree', '--', path)], {
    danger: `Annuler définitivement les modifications non indexées de ${path} ?`,
  })

export const discardAll = (): GsOp =>
  op('Annuler toutes les modifications', [step('restore', '--worktree', '--', ':/')], {
    danger: 'Annuler définitivement toutes les modifications non indexées des fichiers suivis ?',
  })

export const removeUntracked = (path: string): GsOp =>
  op(`Supprimer ${path}`, [step('clean', '-f', '-d', '--', path)], {
    danger: `Supprimer définitivement le fichier non suivi ${path} ?`,
  })

export const cleanAll = (): GsOp =>
  op('Supprimer les fichiers non suivis', [step('clean', '-f', '-d')], {
    danger: 'Supprimer définitivement tous les fichiers non suivis (les fichiers ignorés sont gardés) ?',
  })

export const takeOurs = (path: string): GsOp =>
  op(`Garder la version courante de ${path}`, [step('checkout', '--ours', '--', path), step('add', '--', path)])

export const takeTheirs = (path: string): GsOp =>
  op(`Prendre la version entrante de ${path}`, [step('checkout', '--theirs', '--', path), step('add', '--', path)])

export const markResolved = (path: string): GsOp => op(`Marquer ${path} résolu`, [step('add', '--', path)])

export const removeConflicted = (path: string): GsOp =>
  op(`Supprimer ${path}`, [step('rm', '-q', '--', path)], { danger: `Résoudre le conflit en supprimant ${path} ?` })

export const stageHunk = (patch: string): GsOp =>
  op('Indexer le hunk', [{ args: ['apply', '--cached', '--whitespace=nowarn', '-'], stdin: patch }])

export const unstageHunk = (patch: string): GsOp =>
  op('Désindexer le hunk', [{ args: ['apply', '--cached', '-R', '--whitespace=nowarn', '-'], stdin: patch }])

export const discardHunk = (patch: string): GsOp =>
  op('Annuler le hunk', [{ args: ['apply', '-R', '--whitespace=nowarn', '-'], stdin: patch }], {
    danger: 'Annuler définitivement ce hunk dans le fichier ?',
  })

export type CommitOptions = { amend?: boolean; all?: boolean; push?: GsStep | null }

export function commit(message: string, options: CommitOptions = {}): GsOp {
  const args = ['commit']
  if (options.all) args.push('-a')
  if (options.amend) args.push('--amend')
  if (message.trim() !== '') args.push('-m', message)
  else args.push('--no-edit')
  const steps = [{ args }]
  if (options.push) steps.push(options.push)
  const title = options.amend ? 'Amender le dernier commit' : options.push ? 'Commit et push' : 'Commit'
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

export const continueOperation = (operation: GsOperation): GsOp =>
  op(`Continuer le ${OPERATION_NAME[operation]}`, [step(OPERATION_NAME[operation], '--continue')])

export const abortOperation = (operation: GsOperation): GsOp =>
  operation === 'bisect'
    ? op('Terminer le bisect', [step('bisect', 'reset')])
    : op(`Abandonner le ${OPERATION_NAME[operation]}`, [step(OPERATION_NAME[operation], '--abort')], {
        danger: `Abandonner le ${OPERATION_NAME[operation]} en cours et revenir à l'état d'avant ?`,
      })

export const skipOperation = (operation: GsOperation): GsOp =>
  operation === 'bisect'
    ? op('Bisect : passer ce commit', [step('bisect', 'skip')])
    : op(`Passer le commit courant du ${OPERATION_NAME[operation]}`, [step(OPERATION_NAME[operation], '--skip')], {
        danger: `Passer (abandonner) le commit en cours d'application du ${OPERATION_NAME[operation]} ?`,
      })

export const bisectMark = (verdict: 'good' | 'bad', sha: string | null, isBisecting: boolean): GsOp => {
  const steps: GsStep[] = isBisecting ? [] : [step('bisect', 'start')]
  steps.push(sha === null ? step('bisect', verdict) : step('bisect', verdict, sha))
  return op(`Bisect : ${verdict === 'good' ? 'bon' : 'mauvais'}${sha ? ` (${short(sha)})` : ''}`, steps)
}

// Commits

export const checkoutDetached = (ref: string): GsOp =>
  op(`Checkout ${/^[0-9a-f]{40,64}$/.test(ref) ? short(ref) : ref} (HEAD détachée)`, [step('checkout', '--detach', ref)])

export function createBranch(name: string, start: string, checkout: boolean): GsOp {
  const steps = checkout ? [step('checkout', '-b', name, start)] : [step('branch', name, start)]
  return op(`Créer la branche ${name}${checkout ? ' et basculer dessus' : ''}`, steps)
}

export function createTag(name: string, target: string, message: string): GsOp {
  const args = message.trim() === '' ? ['tag', name, target] : ['tag', '-a', name, '-m', message, target]
  return op(`Créer le tag ${name}`, [{ args }])
}

/** Commits oldest first; merges take their first parent as mainline. */
export function cherryPick(shas: string[], hasMerge: boolean): GsOp {
  const args = ['cherry-pick', ...(hasMerge ? ['-m', '1'] : []), ...shas]
  return op(shas.length === 1 ? `Cherry-pick ${short(shas[0] ?? '')}` : `Cherry-pick de ${shas.length} commits`, [{ args }])
}

export function revert(shas: string[], hasMerge: boolean): GsOp {
  const args = ['revert', '--no-edit', ...(hasMerge ? ['-m', '1'] : []), ...shas]
  return op(shas.length === 1 ? `Revert ${short(shas[0] ?? '')}` : `Revert de ${shas.length} commits`, [{ args }])
}

export function reset(target: string, mode: 'soft' | 'mixed' | 'hard', branch: string | null): GsOp {
  const where = branch ?? 'HEAD'
  return op(`Reset ${mode} de ${where} sur ${short(target)}`, [step('reset', `--${mode}`, target)], mode === 'hard'
    ? { danger: `Reset --hard de ${where} sur ${short(target)} : les modifications non commitées seront perdues. Continuer ?` }
    : {})
}

export type MergeMode = 'ff' | 'no-ff' | 'ff-only' | 'squash'

export function merge(ref: string, mode: MergeMode, into: string | null): GsOp {
  const flags: Record<MergeMode, string[]> = {
    ff: ['--no-edit'],
    'no-ff': ['--no-ff', '--no-edit'],
    'ff-only': ['--ff-only'],
    squash: ['--squash'],
  }
  const label = /^[0-9a-f]{40,64}$/.test(ref) ? short(ref) : ref
  return op(`Merge ${mode === 'ff' ? '' : `${mode} `}de ${label} dans ${into ?? 'HEAD'}`, [step('merge', ...flags[mode], ref)])
}

export const rebase = (onto: string, branch: string | null): GsOp => {
  const label = /^[0-9a-f]{40,64}$/.test(onto) ? short(onto) : onto
  return op(`Rebase de ${branch ?? 'HEAD'} sur ${label}`, [step('rebase', onto)], {
    danger: `Rebase de ${branch ?? 'HEAD'} sur ${label} : l'historique de ${branch ?? 'HEAD'} sera réécrit. Continuer ?`,
  })
}

// Branches

export const switchBranch = (name: string): GsOp => op(`Basculer sur ${name}`, [step('checkout', name)])

export const trackRemote = (remoteBranch: string, local: string): GsOp =>
  op(`Créer ${local} qui suit ${remoteBranch}`, [step('checkout', '-b', local, '--track', remoteBranch)])

export const renameBranch = (from: string, to: string): GsOp =>
  op(`Renommer ${from} en ${to}`, [step('branch', '-m', from, to)], { then: { expanded: `branch:${to}` } })

export const deleteBranch = (name: string, force: boolean): GsOp =>
  op(`Supprimer la branche ${name}`, [step('branch', force ? '-D' : '-d', name)], {
    danger: force
      ? `Forcer la suppression de la branche ${name}, même si elle n'est pas fusionnée ?`
      : `Supprimer la branche ${name} ?`,
    then: { expanded: null },
  })

export const deleteRemoteBranch = (remote: string, branch: string): GsOp =>
  op(`Supprimer ${remote}/${branch}`, [step('push', remote, '--delete', branch)], {
    danger: `Supprimer la branche ${branch} sur le remote ${remote} ?`,
    network: true,
    then: { expanded: null },
  })

export const setUpstream = (branch: string, upstream: string): GsOp =>
  op(`Suivre ${upstream} depuis ${branch}`, [step('branch', `--set-upstream-to=${upstream}`, branch)])

export const unsetUpstream = (branch: string): GsOp =>
  op(`Retirer l'upstream de ${branch}`, [step('branch', '--unset-upstream', branch)])

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

export function push(remote: string, branch: string | null, options: PushOptions = {}): GsOp {
  const target = branch === null ? remote : `${branch} vers ${remote}`
  return op(`${options.force ? 'Push forcé' : 'Push'} de ${target}`, [pushStep(remote, branch, options)], {
    network: true,
    ...(options.force ? { danger: `Push forcé (--force-with-lease) de ${target} : l'historique distant sera réécrit. Continuer ?` } : {}),
  })
}

export type PullMode = 'default' | 'ff-only' | 'rebase' | 'merge'

export const pull = (mode: PullMode): GsOp => {
  const flags: Record<PullMode, string[]> = { default: [], 'ff-only': ['--ff-only'], rebase: ['--rebase'], merge: ['--no-rebase'] }
  return op(mode === 'default' ? 'Pull' : `Pull (${mode})`, [step('pull', ...flags[mode])], { network: true })
}

export const fetch = (remote: string | null): GsOp =>
  op(remote === null ? 'Fetch de tous les remotes' : `Fetch ${remote}`, [
    remote === null ? step('fetch', '--all', '--prune') : step('fetch', '--prune', remote),
  ], { network: true })

/** Fast-forwards a branch that is not checked out to its upstream. */
export const fastForward = (branch: string, remote: string, remoteBranch: string): GsOp =>
  op(`Mettre à jour ${branch} depuis ${remote}/${remoteBranch}`, [step('fetch', remote, `${remoteBranch}:${branch}`)], {
    network: true,
  })

// Tags

export const deleteTag = (name: string): GsOp =>
  op(`Supprimer le tag ${name}`, [step('tag', '-d', name)], { danger: `Supprimer le tag local ${name} ?`, then: { expanded: null } })

export const pushTag = (name: string, remote: string): GsOp =>
  op(`Push du tag ${name} vers ${remote}`, [step('push', remote, `refs/tags/${name}`)], { network: true })

export const pushAllTags = (remote: string): GsOp =>
  op(`Push de tous les tags vers ${remote}`, [step('push', remote, '--tags')], { network: true })

export const deleteRemoteTag = (name: string, remote: string): GsOp =>
  op(`Supprimer le tag ${name} sur ${remote}`, [step('push', remote, '--delete', `refs/tags/${name}`)], {
    danger: `Supprimer le tag ${name} sur le remote ${remote} ?`,
    network: true,
  })

// Worktrees

export function addWorktree(path: string, newBranch: string, ref: string): GsOp {
  const args = ['worktree', 'add']
  if (newBranch !== '') args.push('-b', newBranch)
  args.push(path)
  if (ref !== '') args.push(ref)
  return op(`Créer le worktree ${path}`, [{ args }])
}

export const removeWorktree = (path: string, force: boolean): GsOp =>
  op(`Supprimer le worktree ${path}`, [step('worktree', 'remove', ...(force ? ['--force'] : []), path)], {
    danger: force
      ? `Forcer la suppression du worktree ${path}, modifications non commitées comprises ?`
      : `Supprimer le worktree ${path} ?`,
    then: { expanded: null },
  })

export const lockWorktree = (path: string, lock: boolean): GsOp =>
  op(`${lock ? 'Verrouiller' : 'Déverrouiller'} ${path}`, [step('worktree', lock ? 'lock' : 'unlock', path)])

export const moveWorktree = (path: string, to: string): GsOp =>
  op(`Déplacer le worktree vers ${to}`, [step('worktree', 'move', path, to)], { then: { expanded: `worktree:${to}` } })

export const pruneWorktrees = (): GsOp => op('Nettoyer les worktrees orphelins', [step('worktree', 'prune', '-v')])

// Stash

export type StashMode = 'default' | 'untracked' | 'keep-index' | 'staged'

export function stashPush(message: string, mode: StashMode): GsOp {
  const args = ['stash', 'push']
  if (mode === 'untracked') args.push('--include-untracked')
  if (mode === 'keep-index') args.push('--keep-index')
  if (mode === 'staged') args.push('--staged')
  if (message.trim() !== '') args.push('-m', message)
  return op('Stash des modifications', [{ args }])
}

export const stashApply = (ref: string): GsOp => op(`Appliquer ${ref}`, [step('stash', 'apply', ref)])

export const stashPop = (ref: string): GsOp => op(`Pop ${ref}`, [step('stash', 'pop', ref)], { then: { expanded: null } })

export const stashDrop = (ref: string): GsOp =>
  op(`Supprimer ${ref}`, [step('stash', 'drop', ref)], { danger: `Supprimer définitivement ${ref} ?`, then: { expanded: null } })

export const stashBranch = (name: string, ref: string): GsOp =>
  op(`Créer la branche ${name} depuis ${ref}`, [step('stash', 'branch', name, ref)], { then: { expanded: null } })

export const stashClear = (): GsOp =>
  op('Supprimer tous les stashes', [step('stash', 'clear')], { danger: 'Supprimer définitivement tous les stashes ?' })

// Remotes

export const addRemote = (name: string, url: string): GsOp => op(`Ajouter le remote ${name}`, [step('remote', 'add', name, url)])

export const removeRemote = (name: string): GsOp =>
  op(`Supprimer le remote ${name}`, [step('remote', 'remove', name)], {
    danger: `Supprimer le remote ${name} et ses branches distantes locales ?`,
    then: { expanded: null },
  })

export const renameRemote = (from: string, to: string): GsOp =>
  op(`Renommer le remote ${from} en ${to}`, [step('remote', 'rename', from, to)], { then: { expanded: `remote:${to}` } })

export const setRemoteUrl = (name: string, url: string): GsOp =>
  op(`Changer l'URL de ${name}`, [step('remote', 'set-url', name, url)])

export const pruneRemote = (name: string): GsOp =>
  op(`Nettoyer les branches supprimées de ${name}`, [step('remote', 'prune', name)], { network: true })

// Repository

export const init = (): GsOp => op('Initialiser un dépôt git', [step('init')])

export const clone = (url: string, dest: string): GsOp =>
  op(`Cloner ${url}`, [dest === '' ? step('clone', url) : step('clone', url, dest)], { network: true })

export const withThen = (operation: GsOp, then: GsNavPatch): GsOp => ({ ...operation, then: { ...operation.then, ...then } })

export const restoreFile = (sha: string, path: string): GsOp =>
  op(`Restaurer ${path} depuis ${short(sha)}`, [step('checkout', sha, '--', path)], {
    danger: `Remplacer ${path} dans la copie de travail (et l'index) par sa version du commit ${short(sha)} ?`,
  })
