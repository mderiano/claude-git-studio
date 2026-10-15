import type { GsDetail, GsLogOptions, GsNav, GsSnapshot, GsView } from '../types'

export const PANE = 'git-studio'

export const VIEWS: readonly GsView[] = ['status', 'log', 'branches', 'tags', 'worktrees', 'stash', 'remotes', 'reflog', 'console']

export const PAGE = 150

export const DEFAULT_LOG: GsLogOptions = { scope: 'all', limit: PAGE, mode: 'message', query: '' }

export const DEFAULT_NAV: GsNav = {
  view: 'status',
  repoPath: null,
  expanded: null,
  file: null,
  commitFile: null,
  picks: [],
  log: DEFAULT_LOG,
}

export const EMPTY_SNAP: GsSnapshot = {
  cwd: '',
  error: null,
  head: null,
  status: [],
  log: [],
  logHasMore: false,
  branches: [],
  tags: [],
  worktrees: [],
  stashes: [],
  remotes: [],
  reflog: [],
  loaded: [],
  at: 0,
}

export const EMPTY_DETAIL: GsDetail = { commit: null, diff: null }

/** The data each view draws, loaded when it shows. */
export const NEEDS: Record<GsView, GsView[]> = {
  status: ['remotes'],
  log: ['log', 'branches', 'remotes'],
  branches: ['branches', 'remotes'],
  tags: ['tags', 'remotes'],
  worktrees: ['worktrees', 'branches'],
  stash: ['stash'],
  remotes: ['remotes', 'branches'],
  reflog: ['reflog'],
  console: [],
}

export const VIEW_ALIASES: Record<string, GsView> = {
  status: 'status',
  statut: 'status',
  st: 'status',
  log: 'log',
  historique: 'log',
  history: 'log',
  graph: 'log',
  graphe: 'log',
  commits: 'log',
  branches: 'branches',
  branch: 'branches',
  br: 'branches',
  tags: 'tags',
  tag: 'tags',
  worktrees: 'worktrees',
  worktree: 'worktrees',
  wt: 'worktrees',
  stash: 'stash',
  stashes: 'stash',
  remotes: 'remotes',
  remote: 'remotes',
  reflog: 'reflog',
  console: 'console',
}

export const isView = (value: unknown): value is GsView => typeof value === 'string' && (VIEWS as readonly string[]).includes(value)

export function clip(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false }
  const cut = text.lastIndexOf('\n', limit)
  return { text: text.slice(0, cut > limit / 2 ? cut : limit), truncated: true }
}

export function withDefaults(nav: Partial<GsNav> | undefined): GsNav {
  return { ...DEFAULT_NAV, ...nav, log: { ...DEFAULT_LOG, ...nav?.log } }
}
