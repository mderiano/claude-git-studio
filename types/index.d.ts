export type GsView =
  | 'status'
  | 'log'
  | 'branches'
  | 'tags'
  | 'worktrees'
  | 'stash'
  | 'remotes'
  | 'reflog'
  | 'console'

export type GsOperation = 'merge' | 'rebase' | 'am' | 'cherry-pick' | 'revert' | 'bisect'

/** One git invocation of an operation, its arguments after `git`. */
export type GsStep = { args: string[]; stdin?: string; allowFail?: boolean }

/** What a button runs: one or more git steps, maybe behind a confirmation. */
export type GsOp = {
  title: string
  steps: GsStep[]
  /** The question asked before running; absent, the op runs at once. */
  danger?: string
  /** Fetch, pull, push, clone: a long timeout. */
  network?: boolean
  /** Navigation applied once every step succeeded. */
  then?: GsNavPatch
}

export type GsHead = {
  root: string
  gitDir: string
  commonDir: string
  isLinkedWorktree: boolean
  branch: string | null
  oid: string | null
  upstream: string | null
  ahead: number
  behind: number
  stashCount: number
  operation: GsOperation | null
}

export type GsStatusEntry = {
  path: string
  orig: string | null
  /** Index status letter, `.` when unchanged. */
  x: string
  /** Worktree status letter, `.` when unchanged. */
  y: string
  kind: 'tracked' | 'untracked' | 'conflict'
}

export type GsCommit = {
  sha: string
  parents: string[]
  author: string
  email: string
  time: number
  refs: string
  subject: string
}

export type GsBranch = {
  name: string
  remote: boolean
  sha: string
  upstream: string | null
  ahead: number
  behind: number
  gone: boolean
  isHead: boolean
  time: number
  subject: string
  worktree: string | null
}

export type GsTag = {
  name: string
  sha: string
  annotated: boolean
  subject: string
  time: number
}

export type GsWorktree = {
  path: string
  head: string | null
  branch: string | null
  bare: boolean
  detached: boolean
  locked: string | null
  prunable: string | null
}

export type GsStash = { ref: string; sha: string; time: number; subject: string }

export type GsRemote = { name: string; fetch: string; push: string }

export type GsReflog = { selector: string; sha: string; subject: string; time: number }

export type GsLogOptions = {
  /** `all`, `head`, or a ref name. */
  scope: string
  limit: number
  mode: 'message' | 'author' | 'path' | 'content'
  query: string
}

export type GsSnapshot = {
  cwd: string
  error: string | null
  head: GsHead | null
  status: GsStatusEntry[]
  log: GsCommit[]
  logHasMore: boolean
  branches: GsBranch[]
  tags: GsTag[]
  worktrees: GsWorktree[]
  stashes: GsStash[]
  remotes: GsRemote[]
  reflog: GsReflog[]
  loaded: GsView[]
  at: number
}

export type GsNav = {
  view: GsView
  /** The repository the client works on; null, the session's directory. */
  repoPath: string | null
  /** The open row: `commit:<sha>`, `branch:<name>`, `tag:<name>`, ... */
  expanded: string | null
  /** The status file whose diff shows: `s:<path>`, `u:<path>`, `?:<path>`, `c:<path>`. */
  file: string | null
  /** The file of the open commit whose diff shows. */
  commitFile: string | null
  /** Commits picked in the log for a cherry-pick or revert of several. */
  picks: string[]
  log: GsLogOptions
}

export type GsNavPatch = {
  view?: GsView
  repoPath?: string | null
  expanded?: string | null
  file?: string | null
  commitFile?: string | null
  picks?: string[]
}

export type GsCommitFile = {
  status: string
  path: string
  orig: string | null
  added: number
  deleted: number
  binary: boolean
}

export type GsCommitDetail = {
  sha: string
  parents: string[]
  author: string
  email: string
  time: number
  committer: string
  ctime: number
  refs: string
  body: string
  files: GsCommitFile[]
}

export type GsDiff = {
  /** What it shows: a status file id, `commit:<sha>:<path>`, `stash:<ref>`. */
  key: string
  text: string
  truncated: boolean
}

export type GsDetail = {
  commit: GsCommitDetail | null
  diff: GsDiff | null
}

export type GsBanner = {
  kind: 'ok' | 'error' | 'info'
  title: string
  output: string
  at: number
}

export type GsConsoleEntry = { cmd: string; code: number; output: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'git-studio': {
      nav: GsNav
      snap: GsSnapshot
      detail: GsDetail
      busy: string | null
      banner: GsBanner | null
      confirm: GsOp | null
      console: GsConsoleEntry[]
    }
  }
}
