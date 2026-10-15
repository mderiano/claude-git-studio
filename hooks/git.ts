import type {
  GsBranch,
  GsCommit,
  GsCommitDetail,
  GsCommitFile,
  GsOperation,
  GsReflog,
  GsRemote,
  GsStash,
  GsStatusEntry,
  GsTag,
  GsWorktree,
} from '../types'

export type GitResult = { code: number; out: string; err: string }
export type GitRunOptions = { stdin?: string; timeoutMs?: number }
export type Git = (args: readonly string[], options?: GitRunOptions) => Promise<GitResult>

/** No prompt, no editor, no pager: every command answers on its own. */
export const GIT_ENV: Record<string, string> = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_EDITOR: 'true',
  GIT_SEQUENCE_EDITOR: 'true',
  GIT_MERGE_AUTOEDIT: 'no',
  GIT_PAGER: 'cat',
  PAGER: 'cat',
  // A refresh never takes index.lock from under the person's own git commands.
  GIT_OPTIONAL_LOCKS: '0',
}

export const GIT_BASE = [
  '--no-pager',
  '-c', 'color.ui=false',
  '-c', 'core.quotepath=false',
  '-c', 'log.showSignature=false',
  '-c', 'advice.detachedHead=false',
]

/** stdout and stderr together, trimmed, as a terminal would show them. */
export function output(result: GitResult): string {
  return [result.out.trim(), result.err.trim()].filter(Boolean).join('\n')
}

/** Splits `line` into `count` space-separated fields, the last keeping its spaces. */
function fields(line: string, count: number): string[] {
  const out: string[] = []
  let rest = line
  for (let index = 0; index < count - 1; index++) {
    const space = rest.indexOf(' ')
    if (space < 0) break
    out.push(rest.slice(0, space))
    rest = rest.slice(space + 1)
  }
  out.push(rest)
  return out
}

export type StatusHead = {
  oid: string | null
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  stash: number
}

/** `git status --porcelain=v2 --branch --show-stash -z`. */
export function parseStatus(raw: string): { head: StatusHead; entries: GsStatusEntry[] } {
  const head: StatusHead = { oid: null, branch: null, upstream: null, ahead: 0, behind: 0, stash: 0 }
  const entries: GsStatusEntry[] = []
  const tokens = raw.split('\0')
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] ?? ''
    if (token === '') continue
    if (token.startsWith('# ')) {
      const [key = '', value = ''] = fields(token.slice(2), 2)
      if (key === 'branch.oid') head.oid = value === '(initial)' ? null : value
      else if (key === 'branch.head') head.branch = value === '(detached)' ? null : value
      else if (key === 'branch.upstream') head.upstream = value
      else if (key === 'branch.ab') {
        const match = /^\+(\d+) -(\d+)$/.exec(value)
        if (match) {
          head.ahead = Number(match[1])
          head.behind = Number(match[2])
        }
      } else if (key === 'stash') head.stash = Number(value) || 0
      continue
    }
    const type = token[0]
    if (type === '1') {
      const f = fields(token, 9)
      const xy = f[1] ?? '..'
      entries.push({ path: f[8] ?? '', orig: null, x: xy[0] ?? '.', y: xy[1] ?? '.', kind: 'tracked' })
    } else if (type === '2') {
      const f = fields(token, 10)
      const xy = f[1] ?? '..'
      const orig = tokens[++index] ?? null
      entries.push({ path: f[9] ?? '', orig, x: xy[0] ?? '.', y: xy[1] ?? '.', kind: 'tracked' })
    } else if (type === 'u') {
      const f = fields(token, 11)
      const xy = f[1] ?? 'UU'
      entries.push({ path: f[10] ?? '', orig: null, x: xy[0] ?? 'U', y: xy[1] ?? 'U', kind: 'conflict' })
    } else if (type === '?') {
      entries.push({ path: token.slice(2), orig: null, x: '?', y: '?', kind: 'untracked' })
    }
  }
  return { head, entries }
}

/** What is in progress, from the names in the git directory. */
export function detectOperation(names: ReadonlySet<string>, isAm: boolean): GsOperation | null {
  if (names.has('rebase-merge')) return 'rebase'
  if (names.has('rebase-apply')) return isAm ? 'am' : 'rebase'
  if (names.has('MERGE_HEAD')) return 'merge'
  if (names.has('CHERRY_PICK_HEAD')) return 'cherry-pick'
  if (names.has('REVERT_HEAD')) return 'revert'
  if (names.has('BISECT_LOG')) return 'bisect'
  return null
}

export const LOG_FORMAT = '--format=%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%D%x1f%s'

export function parseLog(raw: string): GsCommit[] {
  const commits: GsCommit[] = []
  for (const record of raw.split('\x1e')) {
    const text = record.replace(/\n+$/, '')
    if (text === '') continue
    const parts = text.split('\x1f')
    const sha = parts[0] ?? ''
    if (!/^[0-9a-f]{7,64}$/.test(sha)) continue
    const parents = parts[1] ?? ''
    commits.push({
      sha,
      parents: parents === '' ? [] : parents.split(' '),
      author: parts[2] ?? '',
      email: parts[3] ?? '',
      time: Number(parts[4]) || 0,
      refs: parts[5] ?? '',
      subject: parts.slice(6).join(' '),
    })
  }
  return commits
}

export type RefChip = { kind: 'head' | 'branch' | 'remote' | 'tag' | 'detached'; name: string }

/** `%D` of a commit, as chips; `remotes` tells a remote branch from a local one. */
export function parseRefs(refs: string, remotes: readonly string[]): RefChip[] {
  const chips: RefChip[] = []
  for (const part of refs.split(', ')) {
    const ref = part.trim()
    if (ref === '' || ref === 'refs/stash') continue
    if (ref.startsWith('HEAD -> ')) chips.push({ kind: 'head', name: ref.slice(8) })
    else if (ref === 'HEAD') chips.push({ kind: 'detached', name: 'HEAD' })
    else if (ref.startsWith('tag: ')) chips.push({ kind: 'tag', name: ref.slice(5) })
    else if (ref.endsWith('/HEAD')) continue
    else if (remotes.some(remote => ref.startsWith(`${remote}/`))) chips.push({ kind: 'remote', name: ref })
    else chips.push({ kind: 'branch', name: ref })
  }
  return chips
}

export const BRANCH_FORMAT =
  '--format=%(refname)%1f%(refname:short)%1f%(objectname)%1f%(upstream:short)%1f%(upstream:track,nobracket)%1f%(HEAD)%1f%(committerdate:unix)%1f%(worktreepath)%1f%(symref)%1f%(contents:subject)'

export function parseBranches(raw: string): GsBranch[] {
  const branches: GsBranch[] = []
  for (const line of raw.split('\n')) {
    if (line === '') continue
    const [full = '', short = '', sha = '', upstream = '', track = '', head = '', time = '0', worktree = '', symref = '', ...subject] =
      line.split('\x1f')
    if (symref !== '') continue
    const remote = full.startsWith('refs/remotes/')
    const ahead = /ahead (\d+)/.exec(track)
    const behind = /behind (\d+)/.exec(track)
    branches.push({
      name: remote ? full.slice('refs/remotes/'.length) : short,
      remote,
      sha,
      upstream: upstream === '' ? null : upstream,
      ahead: ahead ? Number(ahead[1]) : 0,
      behind: behind ? Number(behind[1]) : 0,
      gone: track === 'gone',
      isHead: head === '*',
      time: Number(time) || 0,
      subject: subject.join(' '),
      worktree: worktree === '' ? null : worktree,
    })
  }
  return branches
}

export const TAG_FORMAT =
  '--format=%(refname:short)%1f%(objecttype)%1f%(objectname)%1f%(*objectname)%1f%(creatordate:unix)%1f%(contents:subject)'

export function parseTags(raw: string): GsTag[] {
  const tags: GsTag[] = []
  for (const line of raw.split('\n')) {
    if (line === '') continue
    const [name = '', type = '', object = '', peeled = '', time = '0', ...subject] = line.split('\x1f')
    tags.push({
      name,
      sha: peeled !== '' ? peeled : object,
      annotated: type === 'tag',
      subject: subject.join(' '),
      time: Number(time) || 0,
    })
  }
  return tags
}

/** `git worktree list --porcelain`. */
export function parseWorktrees(raw: string): GsWorktree[] {
  const list: GsWorktree[] = []
  let current: GsWorktree | null = null
  for (const line of raw.split('\n')) {
    if (line === '') {
      if (current) list.push(current)
      current = null
      continue
    }
    const space = line.indexOf(' ')
    const key = space < 0 ? line : line.slice(0, space)
    const value = space < 0 ? '' : line.slice(space + 1)
    if (key === 'worktree') {
      if (current) list.push(current)
      current = { path: value, head: null, branch: null, bare: false, detached: false, locked: null, prunable: null }
    } else if (current === null) {
      continue
    } else if (key === 'HEAD') current.head = value
    else if (key === 'branch') current.branch = value.replace(/^refs\/heads\//, '')
    else if (key === 'bare') current.bare = true
    else if (key === 'detached') current.detached = true
    else if (key === 'locked') current.locked = value === '' ? 'verrouillé' : value
    else if (key === 'prunable') current.prunable = value === '' ? 'supprimable' : value
  }
  if (current) list.push(current)
  return list
}

export const STASH_FORMAT = '--format=%gd%x1f%H%x1f%ct%x1f%gs'

export function parseStashes(raw: string): GsStash[] {
  const list: GsStash[] = []
  for (const line of raw.split('\n')) {
    if (line === '') continue
    const [ref = '', sha = '', time = '0', ...subject] = line.split('\x1f')
    list.push({ ref, sha, time: Number(time) || 0, subject: subject.join(' ') })
  }
  return list
}

/** `git remote -v`. */
export function parseRemotes(raw: string): GsRemote[] {
  const byName = new Map<string, GsRemote>()
  for (const line of raw.split('\n')) {
    const match = /^(\S+)\t(.*) \((fetch|push)\)$/.exec(line)
    if (!match) continue
    const name = match[1] ?? ''
    const url = match[2] ?? ''
    const remote = byName.get(name) ?? { name, fetch: '', push: '' }
    if (match[3] === 'fetch') remote.fetch = url
    else remote.push = url
    byName.set(name, remote)
  }
  return [...byName.values()]
}

export const REFLOG_FORMAT = '--format=%gd%x1f%H%x1f%ct%x1f%gs'

export function parseReflog(raw: string): GsReflog[] {
  const list: GsReflog[] = []
  for (const line of raw.split('\n')) {
    if (line === '') continue
    const [selector = '', sha = '', time = '0', ...subject] = line.split('\x1f')
    list.push({ selector, sha, time: Number(time) || 0, subject: subject.join(' ') })
  }
  return list
}

export const SHOW_FORMAT = '--format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ct%x1f%D%x1f%B'

export function parseShow(raw: string): Omit<GsCommitDetail, 'files'> | null {
  const parts = raw.split('\x1f')
  const sha = parts[0] ?? ''
  if (!/^[0-9a-f]{7,64}$/.test(sha)) return null
  const parents = parts[1] ?? ''
  return {
    sha,
    parents: parents === '' ? [] : parents.split(' '),
    author: parts[2] ?? '',
    email: parts[3] ?? '',
    time: Number(parts[4]) || 0,
    committer: parts[5] ?? '',
    ctime: Number(parts[6]) || 0,
    refs: parts[7] ?? '',
    body: parts.slice(8).join('\x1f').replace(/\s+$/, ''),
  }
}

/**
 * `--name-status -z` and `--numstat -z` of one commit, joined per file.
 * A rename reads `R100\0old\0new\0` in the first and `a\td\t\0old\0new\0` in the second.
 */
export function parseCommitFiles(nameStatus: string, numstat: string): GsCommitFile[] {
  const counts = new Map<string, { added: number; deleted: number; binary: boolean }>()
  const stats = numstat.split('\0')
  for (let index = 0; index < stats.length; index++) {
    const token = stats[index] ?? ''
    if (token === '') continue
    const [added = '', deleted = '', path = ''] = token.split('\t')
    let file = path
    if (path === '') {
      index += 2
      file = stats[index] ?? ''
    }
    counts.set(file, {
      added: added === '-' ? 0 : Number(added) || 0,
      deleted: deleted === '-' ? 0 : Number(deleted) || 0,
      binary: added === '-',
    })
  }
  const files: GsCommitFile[] = []
  const names = nameStatus.split('\0')
  for (let index = 0; index < names.length; index++) {
    const status = names[index] ?? ''
    if (status === '') continue
    let orig: string | null = null
    let path = names[++index] ?? ''
    if (status.startsWith('R') || status.startsWith('C')) {
      orig = path
      path = names[++index] ?? ''
    }
    const count = counts.get(path) ?? { added: 0, deleted: 0, binary: false }
    files.push({ status: status.slice(0, 1), path, orig, ...count })
  }
  return files
}

export type DiffFile = { path: string; header: string; hunks: string[] }

/** A diff split per file, each into its header lines and its hunks (each from its `@@` line). */
export function splitDiff(diff: string): DiffFile[] {
  const lines = diff.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  const files: { path: string; header: string[]; hunks: string[][] }[] = []
  let current: { path: string; header: string[]; hunks: string[][] } | null = null
  for (const line of lines) {
    const isStart = line.startsWith('diff --git ') || line.startsWith('diff --cc ') || line.startsWith('diff --combined ')
    if (isStart || current === null) {
      current = { path: isStart ? pathOfDiffLine(line) : '', header: [], hunks: [] }
      files.push(current)
    }
    if (line.startsWith('@@')) current.hunks.push([line])
    else if (current.hunks.length === 0) {
      current.header.push(line)
      if (line.startsWith('+++ b/')) current.path = line.slice(6)
      else if (line.startsWith('+++ ') && !line.startsWith('+++ /dev/null')) current.path = line.slice(4)
    } else current.hunks[current.hunks.length - 1]?.push(line)
  }
  return files.map(file => ({ path: file.path, header: file.header.join('\n'), hunks: file.hunks.map(hunk => hunk.join('\n')) }))
}

function pathOfDiffLine(line: string): string {
  const combined = /^diff --(?:cc|combined) (.+)$/.exec(line)
  if (combined) return combined[1] ?? ''
  const git = / b\/(.+)$/.exec(line)
  return git ? (git[1] ?? '') : ''
}

/** The patch `git apply` takes for one hunk of a file. */
export function hunkPatch(header: string, hunk: string): string {
  return `${header}\n${hunk}\n`
}

/** Splits a command line as a shell would, quotes and backslashes included; no expansion. */
export function splitArgs(line: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let started = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index] ?? ''
    if (quote === "'") {
      if (char === "'") quote = null
      else current += char
    } else if (quote === '"') {
      if (char === '"') quote = null
      else if (char === '\\' && index + 1 < line.length && '"\\$`'.includes(line[index + 1] ?? '')) current += line[++index] ?? ''
      else current += char
    } else if (char === "'" || char === '"') {
      quote = char
      started = true
    } else if (char === '\\' && index + 1 < line.length) {
      current += line[++index] ?? ''
      started = true
    } else if (/\s/.test(char)) {
      if (started) args.push(current)
      current = ''
      started = false
    } else {
      current += char
      started = true
    }
  }
  if (started) args.push(current)
  return args
}

/** Quotes one argument for display, as a shell would read it back. */
export function quoteArg(arg: string): string {
  return /^[\w@%+=:,./^~{}-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`
}
