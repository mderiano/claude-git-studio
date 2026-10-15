import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer, UiOpenResult } from 'claude-code'

import type {
  GsCommitFile,
  GsDiff,
  GsHead,
  GsLogOptions,
  GsNav,
  GsNavPatch,
  GsOp,
  GsSnapshot,
  GsStatusEntry,
  GsView,
} from '../types'
import { setDraft, toFieldText } from './drafts'
import {
  BRANCH_FORMAT,
  GIT_BASE,
  GIT_ENV,
  LOG_FORMAT,
  REFLOG_FORMAT,
  SHOW_FORMAT,
  STASH_FORMAT,
  TAG_FORMAT,
  detectOperation,
  output,
  parseBranches,
  parseCommitFiles,
  parseLog,
  parseReflog,
  parseRemotes,
  parseShow,
  parseStashes,
  parseStatus,
  parseTags,
  parseWorktrees,
  quoteArg,
  splitArgs,
} from './git'
import type { Git, GitRunOptions } from './git'
import { uiOf } from './kit'
import type { Actions, Ctx } from './kit'
import { DEFAULT_LOG, DEFAULT_NAV, EMPTY_DETAIL, EMPTY_SNAP, NEEDS, PANE, VIEWS, VIEW_ALIASES, clip, isView, withDefaults } from './model'
import { paneTree } from './pane'

type $ = EngineInterface

const navAtom = atom({ plugin: 'git-studio', key: 'nav' } as const, DEFAULT_NAV)
const snapAtom = atom({ plugin: 'git-studio', key: 'snap' } as const, EMPTY_SNAP)
const detailAtom = atom({ plugin: 'git-studio', key: 'detail' } as const, EMPTY_DETAIL)
const busyAtom = atom({ plugin: 'git-studio', key: 'busy' } as const, null)
const bannerAtom = atom({ plugin: 'git-studio', key: 'banner' } as const, null)
const confirmAtom = atom({ plugin: 'git-studio', key: 'confirm' } as const, null)
const consoleAtom = atom({ plugin: 'git-studio', key: 'console' } as const, [])

const DIFF_LIMIT = 40_000
const OUTPUT_LIMIT = 6_000

// git

function gitIn($: $, cwd: string): Git {
  return async (args, options: GitRunOptions = {}) => {
    const init: { cwd: string; env: Record<string, string>; timeoutMs: number; stdin?: string } = {
      cwd,
      env: GIT_ENV,
      timeoutMs: options.timeoutMs ?? 60_000,
    }
    if (options.stdin !== undefined) init.stdin = options.stdin
    try {
      const ran = await $.process.run(['git', ...GIT_BASE, ...args], init)
      return { code: ran.exitCode, out: ran.stdout, err: ran.stderr }
    } catch (error) {
      return { code: -1, out: '', err: error instanceof Error ? error.message : String(error) }
    }
  }
}

async function readNav($: $): Promise<GsNav> {
  return withDefaults(await read($, navAtom))
}

async function readSnap($: $): Promise<GsSnapshot> {
  return { ...EMPTY_SNAP, ...(await read($, snapAtom)) }
}

async function patchNav($: $, patch: GsNavPatch): Promise<void> {
  await update($, navAtom, value => ({ ...withDefaults(value), ...patch }))
}

async function patchLog($: $, patch: Partial<GsLogOptions>): Promise<void> {
  await update($, navAtom, value => {
    const nav = withDefaults(value)
    return { ...nav, log: { ...nav.log, ...patch } }
  })
}

/** The directory the client works on: the chosen repository, else the session's. */
async function workDir($: $): Promise<string> {
  const nav = await readNav($)
  return nav.repoPath ?? (await $.session.cwd())
}

/** git in the repository's top level once known, so status paths read as pathspecs. */
async function repoGit($: $): Promise<Git> {
  const snap = await readSnap($)
  const dir = await workDir($)
  return gitIn($, snap.cwd === dir && snap.head ? snap.head.root : dir)
}

// Loading

type Base = { error: string | null; head: GsHead | null; status: GsStatusEntry[] }

async function loadBase($: $, dir: string): Promise<Base> {
  const where = await gitIn($, dir)(['rev-parse', '--path-format=absolute', '--show-toplevel', '--absolute-git-dir', '--git-common-dir'])
  if (where.code !== 0) {
    return { error: where.err.trim() || "Ce dossier n'est pas un dépôt git.", head: null, status: [] }
  }
  const [root = dir, gitDir = '', commonDir = ''] = where.out.trim().split('\n')
  const [status, names] = await Promise.all([
    gitIn($, root)(['status', '--porcelain=v2', '--branch', '--show-stash', '-z']),
    $.fs.list(gitDir).then(
      entries => new Set(entries.map(entry => entry.name)),
      () => new Set<string>(),
    ),
  ])
  if (status.code !== 0) return { error: output(status), head: null, status: [] }
  const isAm = names.has('rebase-apply') ? await $.fs.exists(`${gitDir}/rebase-apply/applying`).catch(() => false) : false
  const parsed = parseStatus(status.out)
  return {
    error: null,
    status: parsed.entries,
    head: {
      root,
      gitDir,
      commonDir,
      isLinkedWorktree: commonDir !== '' && commonDir !== gitDir,
      branch: parsed.head.branch,
      oid: parsed.head.oid,
      upstream: parsed.head.upstream,
      ahead: parsed.head.ahead,
      behind: parsed.head.behind,
      stashCount: parsed.head.stash,
      operation: detectOperation(names, isAm),
    },
  }
}

async function loadLog(git: Git, log: GsLogOptions): Promise<Partial<GsSnapshot>> {
  const args = ['log', '--date-order', LOG_FORMAT, `-n${log.limit + 1}`]
  const query = log.query.trim()
  if (query !== '' && log.mode === 'message') args.push(`--grep=${query}`, '-i')
  if (query !== '' && log.mode === 'author') args.push(`--author=${query}`, '-i')
  if (query !== '' && log.mode === 'content') args.push(`-S${query}`)
  if (log.scope === 'all') args.push('--branches', '--remotes', '--tags', 'HEAD')
  else if (log.scope === 'head') args.push('HEAD')
  else args.push(log.scope)
  if (query !== '' && log.mode === 'path') args.push('--', query)
  const ran = await git(args)
  if (ran.code !== 0) return { log: [], logHasMore: false }
  const commits = parseLog(ran.out)
  return { log: commits.slice(0, log.limit), logHasMore: commits.length > log.limit }
}

async function loadPart(git: Git, part: GsView, nav: GsNav): Promise<Partial<GsSnapshot>> {
  switch (part) {
    case 'log':
      return loadLog(git, nav.log)
    case 'branches':
      return { branches: parseBranches((await git(['for-each-ref', '--sort=-committerdate', BRANCH_FORMAT, 'refs/heads', 'refs/remotes'])).out) }
    case 'tags':
      return { tags: parseTags((await git(['for-each-ref', '--sort=-creatordate', TAG_FORMAT, 'refs/tags'])).out) }
    case 'worktrees':
      return { worktrees: parseWorktrees((await git(['worktree', 'list', '--porcelain'])).out) }
    case 'stash':
      return { stashes: parseStashes((await git(['stash', 'list', STASH_FORMAT])).out) }
    case 'remotes':
      return { remotes: parseRemotes((await git(['remote', '-v'])).out) }
    case 'reflog': {
      const ran = await git(['reflog', 'show', REFLOG_FORMAT, '-n150', 'HEAD'])
      return { reflog: ran.code === 0 ? parseReflog(ran.out) : [] }
    }
    default:
      return {}
  }
}

let lastStatus: string | undefined

function showStatusLine($: $, head: GsHead | null, status: readonly GsStatusEntry[]): void {
  let text: string | undefined
  if (head) {
    const parts = [`⎇ ${head.branch ?? `HEAD détachée ${head.oid?.slice(0, 7) ?? ''}`.trim()}`]
    if (head.ahead > 0) parts.push(`↑${head.ahead}`)
    if (head.behind > 0) parts.push(`↓${head.behind}`)
    if (status.length > 0) parts.push(`●${status.length}`)
    if (head.operation) parts.push(head.operation.toUpperCase())
    text = parts.join(' ')
  }
  if (text === lastStatus) return
  lastStatus = text
  $.ui.status(text)
}

let queue: Promise<void> = Promise.resolve()

/** Reloads the head, the status and what the shown view draws; calls run one after another. */
function refresh($: $, parts?: readonly GsView[]): Promise<void> {
  queue = queue
    .then(() => reload($, parts))
    .catch(error => {
      $.ui.log(`git-studio: refresh failed: ${error instanceof Error ? error.message : String(error)}`, { to: 'debug' })
    })
  return queue
}

async function reload($: $, parts?: readonly GsView[]): Promise<void> {
  const nav = await readNav($)
  const dir = nav.repoPath ?? (await $.session.cwd())
  const base = await loadBase($, dir)
  const previous = await readSnap($)
  const isSameRepo = previous.cwd === dir
  const next: GsSnapshot = {
    ...(isSameRepo ? previous : EMPTY_SNAP),
    cwd: dir,
    error: base.error,
    head: base.head,
    status: base.status,
    at: Date.now(),
  }
  if (base.head) {
    const git = gitIn($, base.head.root)
    const wanted = [...new Set(parts ?? NEEDS[nav.view])]
    const loaded = await Promise.all(wanted.map(part => loadPart(git, part, nav)))
    Object.assign(next, ...loaded)
    next.loaded = [...new Set([...(isSameRepo ? previous.loaded : []), ...wanted])]
  } else {
    next.loaded = []
  }
  // An unchanged repository redraws nothing.
  const isSame = JSON.stringify({ ...previous, at: 0 }) === JSON.stringify({ ...next, at: 0 })
  if (!isSame) await update($, snapAtom, () => next)
  showStatusLine($, base.head, base.status)
}

async function refreshStatusLine($: $): Promise<void> {
  const base = await loadBase($, await workDir($))
  showStatusLine($, base.head, base.status)
}

let fingerprint = ''

/** Reloads when something outside the pane moved HEAD, a ref or a file. */
async function poll($: $): Promise<void> {
  if (running) return
  const pane = (await $.ui.panes()).find(one => one.id === PANE)
  if (!pane || !pane.isShown) return
  const git = gitIn($, await workDir($))
  const [status, refs] = await Promise.all([
    git(['status', '--porcelain=v2', '--branch', '--show-stash', '-z']),
    git(['for-each-ref', '--format=%(refname) %(objectname)']),
  ])
  const print = `${status.code}\n${status.out}\n${refs.out}`
  if (print === fingerprint) return
  const isFirst = fingerprint === ''
  fingerprint = print
  if (!isFirst) await refresh($)
}

let pollTimer: Timer | null = null

function startPolling($: $): void {
  pollTimer?.cancel()
  pollTimer = $.clock.every(4_000, () => {
    void poll($).catch(() => undefined)
  })
}

// Operations

let running = false

/**
 * Runs `op`, or asks first when it carries a `danger` question.
 * Resolves whether it succeeded, or null while the question waits.
 */
async function act($: $, op: GsOp, isConfirmed = false): Promise<boolean | null> {
  if (op.danger && !isConfirmed) {
    await update($, confirmAtom, () => op)
    return null
  }
  return execute($, op)
}

async function execute($: $, op: GsOp): Promise<boolean> {
  if (running) {
    $.ui.toast('Une opération git est déjà en cours.')
    return false
  }
  running = true
  let isOk = true
  try {
    await update($, confirmAtom, () => null)
    await update($, busyAtom, () => op.title)
    const git = await repoGit($)
    const lines: string[] = []
    for (const step of op.steps) {
      const options: GitRunOptions = { timeoutMs: op.network ? 600_000 : 120_000 }
      if (step.stdin !== undefined) options.stdin = step.stdin
      const ran = await git(step.args, options)
      const text = output(ran)
      lines.push(`$ git ${step.args.map(quoteArg).join(' ')}${text === '' ? '' : `\n${text}`}`)
      if (ran.code !== 0 && !step.allowFail) {
        isOk = false
        break
      }
    }
    const at = Date.now()
    await update($, bannerAtom, () => ({
      kind: isOk ? 'ok' : 'error',
      title: isOk ? op.title : `Échec : ${op.title}`,
      output: clip(lines.join('\n\n'), OUTPUT_LIMIT).text,
      at,
    }))
    if (isOk) {
      if (op.then) await patchNav($, op.then)
      $.clock.after(10_000, () => {
        void update($, bannerAtom, banner => (banner !== null && banner.at === at ? null : banner))
      })
    }
  } finally {
    running = false
    await update($, busyAtom, () => null)
  }
  await refresh($)
  const nav = await readNav($)
  if (nav.view === 'status' && nav.file !== null) await reloadFileDiff($)
  if (nav.expanded !== null && nav.expanded.startsWith('commit:')) {
    const detail = await read($, detailAtom)
    const sha = nav.expanded.slice('commit:'.length)
    if (detail.commit?.sha !== sha) await loadCommit($, sha)
  }
  return isOk
}

async function inform($: $, title: string, kind: 'info' | 'error' = 'info'): Promise<void> {
  await update($, bannerAtom, () => ({ kind, title, output: '', at: Date.now() }))
}

// Navigation

async function showView($: $, view: GsView): Promise<void> {
  await patchNav($, { view, expanded: null, commitFile: null })
  await refresh($)
}

async function recentRepos($: $): Promise<string[]> {
  const recent = await $.store.get('recent-repos')
  return Array.isArray(recent) ? recent.filter((one): one is string => typeof one === 'string') : []
}

async function useRepo($: $, path: string | null): Promise<void> {
  await patchNav($, { repoPath: path, expanded: null, file: null, commitFile: null, picks: [] })
  await update($, detailAtom, () => EMPTY_DETAIL)
  fingerprint = ''
  await refresh($)
  if (path !== null) {
    const list = await recentRepos($)
    await $.store.set('recent-repos', [path, ...list.filter(one => one !== path)].slice(0, 8))
  }
}

async function toggleExpanded($: $, id: string): Promise<boolean> {
  const nav = await readNav($)
  const isOpening = nav.expanded !== id
  await patchNav($, { expanded: isOpening ? id : null, commitFile: null })
  return isOpening
}

async function setDiff($: $, key: string, text: string): Promise<void> {
  const clipped = clip(text, DIFF_LIMIT)
  const diff: GsDiff = { key, text: clipped.text, truncated: clipped.truncated }
  await update($, detailAtom, detail => ({ ...EMPTY_DETAIL, ...detail, diff }))
}

/** Opens or closes the diff of a status file: `s:` staged, `u:` unstaged, `?:` untracked, `c:` conflicted. */
async function toggleFile($: $, id: string, entry: GsStatusEntry): Promise<void> {
  const nav = await readNav($)
  if (nav.file === id) {
    await patchNav($, { file: null })
    return
  }
  await patchNav($, { file: id })
  await loadFileDiff($, id, entry)
}

async function loadFileDiff($: $, id: string, entry: GsStatusEntry): Promise<void> {
  const git = await repoGit($)
  const paths = entry.orig ? [entry.path, entry.orig] : [entry.path]
  const kind = id.slice(0, 1)
  let text: string
  if (kind === 's') text = (await git(['diff', '--cached', '--no-ext-diff', '-M', '--', ...paths])).out
  else if (kind === '?') {
    text = entry.path.endsWith('/')
      ? (await git(['ls-files', '--others', '--exclude-standard', '--', entry.path])).out
      : (await git(['diff', '--no-ext-diff', '--no-index', '--', '/dev/null', entry.path])).out
  } else text = (await git(['diff', '--no-ext-diff', '--', ...paths])).out
  await setDiff($, id, text)
}

/** Reloads the open status file's diff after its hunks moved; closes it once the file is gone from that list. */
async function reloadFileDiff($: $): Promise<void> {
  const nav = await readNav($)
  if (nav.file === null) return
  const id = nav.file
  const kind = id.slice(0, 1)
  const path = id.slice(2)
  const snap = await readSnap($)
  const entry = snap.status.find(
    one =>
      one.path === path &&
      ((kind === 's' && one.kind === 'tracked' && one.x !== '.') ||
        (kind === 'u' && one.kind === 'tracked' && one.y !== '.') ||
        (kind === '?' && one.kind === 'untracked') ||
        (kind === 'c' && one.kind === 'conflict')),
  )
  if (!entry) {
    await patchNav($, { file: null })
    return
  }
  await loadFileDiff($, id, entry)
}

async function loadCommit($: $, sha: string): Promise<void> {
  const git = await repoGit($)
  const shown = await git(['show', '-s', SHOW_FORMAT, sha])
  const meta = parseShow(shown.out)
  if (meta === null) {
    await inform($, `Commit introuvable : ${output(shown) || sha}`, 'error')
    return
  }
  const range = meta.parents.length > 1 ? [`${sha}^1`, sha] : null
  const [names, stats] = await Promise.all(
    range
      ? [git(['diff', '--name-status', '-z', '-M', ...range]), git(['diff', '--numstat', '-z', '-M', ...range])]
      : [
          git(['diff-tree', '-r', '-z', '--no-commit-id', '--name-status', '-M', '--root', sha]),
          git(['diff-tree', '-r', '-z', '--no-commit-id', '--numstat', '-M', '--root', sha]),
        ],
  )
  const files = parseCommitFiles(names.out, stats.out)
  await update($, detailAtom, detail => ({ ...EMPTY_DETAIL, ...detail, commit: { ...meta, files } }))
}

async function openCommit($: $, sha: string, rowId?: string): Promise<void> {
  const isOpening = await toggleExpanded($, rowId ?? `commit:${sha}`)
  if (isOpening) await loadCommit($, sha)
}

async function toggleCommitFile($: $, sha: string, file: GsCommitFile, isMerge: boolean): Promise<void> {
  const nav = await readNav($)
  if (nav.commitFile === file.path) {
    await patchNav($, { commitFile: null })
    return
  }
  await patchNav($, { commitFile: file.path })
  const git = await repoGit($)
  const paths = file.orig ? [file.path, file.orig] : [file.path]
  const ran = isMerge
    ? await git(['diff', '--no-ext-diff', '-M', `${sha}^1`, sha, '--', ...paths])
    : await git(['show', '--no-ext-diff', '--format=', '-M', sha, '--', ...paths])
  await setDiff($, `commit:${sha}:${file.path}`, ran.out)
}

async function openStash($: $, ref: string): Promise<void> {
  const isOpening = await toggleExpanded($, `stash:${ref}`)
  if (!isOpening) return
  const ran = await (await repoGit($))(['stash', 'show', '-p', '--include-untracked', '--no-ext-diff', ref])
  await setDiff($, `stash:${ref}`, ran.code === 0 ? ran.out : output(ran))
}

/** Shows a commit open in the log, wherever the person was. */
async function jumpToCommit($: $, sha: string): Promise<void> {
  const nav = await readNav($)
  await patchNav($, { view: 'log', expanded: `commit:${sha}`, commitFile: null })
  if (nav.view !== 'log') await refresh($)
  await loadCommit($, sha)
  await $.ui.scroll({ in: PANE, to: { key: `row:${sha}` }, block: 'start' }).catch(() => undefined)
}

async function togglePick($: $, sha: string): Promise<void> {
  await update($, navAtom, value => {
    const nav = withDefaults(value)
    return { ...nav, picks: nav.picks.includes(sha) ? nav.picks.filter(one => one !== sha) : [...nav.picks, sha] }
  })
}

async function fileHistory($: $, path: string): Promise<void> {
  await patchLog($, { mode: 'path', query: path, limit: DEFAULT_LOG.limit })
  setDraft('log-query', path)
  await patchNav($, { view: 'log', expanded: null, commitFile: null })
  await refresh($)
}

// Claude

/** Writes a commit message for what is staged, in the repository's own style, into the message fields. */
async function suggestCommitMessage($: $): Promise<void> {
  if (running) return
  const git = await repoGit($)
  const staged = await git(['diff', '--cached', '--no-ext-diff', '--stat', '-p', '-M'])
  if (staged.out.trim() === '') {
    await inform($, "Rien n'est indexé : indexez d'abord les changements à commiter.", 'error')
    return
  }
  const recent = await git(['log', '-n12', '--format=%s'])
  await update($, busyAtom, () => 'Claude rédige le message de commit')
  try {
    const result = await $.model.complete({
      model: 'haiku',
      maxTokens: 600,
      timeoutMs: 90_000,
      system:
        'You write git commit messages. Answer with the message alone: a subject line of at most 72 characters, then, only when it helps, a blank line and a short body. No code fences, no quotes, no commentary.',
      prompt: [
        'Recent commit subjects of this repository (match their language, tone and conventions such as Conventional Commits prefixes):',
        recent.out.trim() || '(no commits yet: write in English)',
        '',
        'Staged changes:',
        clip(staged.out, 60_000).text,
      ].join('\n'),
    })
    if (result.isAnswered) {
      const text = result.text.trim().replace(/^```\w*\n?|\n?```$/g, '').trim()
      const [subject = '', ...rest] = text.split('\n')
      setDraft('commit-msg', subject.trim())
      setDraft('commit-body', toFieldText(rest.join('\n').trim()))
      $.ui.invalidate('ui.render')
    } else {
      await inform($, `Claude n'a pas pu rédiger le message (${result.reason}).`, 'error')
    }
  } finally {
    await update($, busyAtom, () => null)
  }
}

// Console

async function runConsole($: $, line: string): Promise<void> {
  const args = splitArgs(line.trim().replace(/^git\s+/, ''))
  if (args.length === 0 || running) return
  running = true
  const shown = `git ${args.map(quoteArg).join(' ')}`
  try {
    await update($, busyAtom, () => shown)
    const ran = await (await repoGit($))(args, { timeoutMs: 600_000 })
    const entry = { cmd: shown, code: ran.code, output: clip(output(ran), 20_000).text, at: Date.now() }
    await update($, consoleAtom, list => [entry, ...list].slice(0, 15))
  } finally {
    running = false
    await update($, busyAtom, () => null)
  }
  await refresh($)
}

/** `/git <args>`: runs one command and answers its output as text. */
async function runOnce($: $, line: string): Promise<string> {
  const args = splitArgs(line.trim().replace(/^git\s+/, ''))
  const ran = await (await repoGit($))(args, { timeoutMs: 600_000 })
  const text = clip(output(ran), 30_000)
  void refresh($)
  return `$ git ${args.map(quoteArg).join(' ')}\n${text.text}${text.truncated ? '\n… (sortie tronquée)' : ''}${ran.code === 0 ? '' : `\n(code de sortie ${ran.code})`}`
}

// Pane

async function openPane($: $, view?: GsView): Promise<UiOpenResult> {
  if (view) await patchNav($, { view, expanded: null, commitFile: null })
  const opened = await $.ui.open({ id: PANE, title: 'Git', focus: true, columns: 110 })
  void refresh($)
  return opened
}

/** Everything a view may do, bound to this drawing's engine. */
function actionsFor($: $): Actions {
  return {
    act: (op, isConfirmed) => act($, op, isConfirmed),
    refresh: () => refresh($),
    showView: view => showView($, view),
    patchNav: patch => patchNav($, patch),
    patchLog: patch => patchLog($, patch),
    toggleExpanded: id => toggleExpanded($, id),
    toggleFile: (id, entry) => toggleFile($, id, entry),
    openCommit: (sha, rowId) => openCommit($, sha, rowId),
    toggleCommitFile: (sha, file, isMerge) => toggleCommitFile($, sha, file, isMerge),
    openStash: ref => openStash($, ref),
    jumpToCommit: sha => jumpToCommit($, sha),
    togglePick: sha => togglePick($, sha),
    fileHistory: path => fileHistory($, path),
    useRepo: path => useRepo($, path),
    workDir: () => workDir($),
    home: async () => (await $.env.get('HOME')) ?? '',
    inform: (title, kind) => inform($, title, kind),
    dismissBanner: async () => {
      await update($, bannerAtom, () => null)
    },
    dismissConfirm: async () => {
      await update($, confirmAtom, () => null)
    },
    suggestCommitMessage: () => suggestCommitMessage($),
    askClaude: async text => {
      await $.prompt.submit({ text, asUser: true })
    },
    runConsole: line => runConsole($, line),
    clearConsole: async () => {
      await update($, consoleAtom, () => [])
    },
    copy: async text => {
      const copied = await $.ui.copy({ text })
      if (!copied.isCopied) await inform($, `Copie impossible ici : ${text}`)
    },
    close: () => $.ui.close({ id: PANE }),
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'git',
      description: 'Git Studio : ouvre le client git (graphe, branches, tags, worktrees, stash…) ou lance « /git <commande> »',
      argumentHint: '[status|log|branches|tags|worktrees|stash|remotes|reflog|console] ou [commande git]',
      immediate: true,
    })
    await $.tool.register({
      name: 'open',
      description:
        "Opens the user's Git Studio pane (a visual git client inside Claude Code) on a view, optionally with one commit open. Use it when the user wants to see or browse git history, branches, tags, worktrees, stashes, remotes or the reflog visually.",
      inputSchema: {
        type: 'object',
        properties: {
          view: { type: 'string', enum: [...VIEWS], description: 'The view to show; `log` is the commit graph.' },
          commit: { type: 'string', description: 'A commit, branch or tag to open in the log view.' },
        },
      },
    })
    startPolling($)
    void refreshStatusLine($).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'git' }, async ($, e) => {
    const args = e.args.trim()
    const view = args === '' ? undefined : VIEW_ALIASES[args.toLowerCase()]
    if (args === '' || view !== undefined) {
      const opened = await openPane($, view)
      return opened.isPlaced ? {} : { text: `Git Studio est ouvert mais attend de la place pour s'afficher : ${opened.reason}` }
    }
    return { text: await runOnce($, args) }
  })

  on('tool.call', { tool: 'mcp__git-studio__open' }, async ($, e) => {
    const view = isView(e.view) ? e.view : 'log'
    const ref = typeof e.commit === 'string' ? e.commit.trim() : ''
    const opened = await openPane($, ref === '' ? view : 'log')
    if (ref !== '') {
      const resolved = await gitIn($, await workDir($))(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
      const sha = resolved.out.trim()
      if (resolved.code !== 0 || sha === '') return { result: `Git Studio est ouvert, mais « ${ref} » ne désigne aucun commit.` }
      await jumpToCommit($, sha)
      return { result: `Git Studio est ouvert sur le commit ${sha.slice(0, 7)}.` }
    }
    return { result: opened.isPlaced ? `Git Studio est ouvert sur la vue ${view}.` : `Git Studio est ouvert (${opened.reason}).` }
  }).catch(() => ({ result: "Git Studio n'a pas pu s'ouvrir : l'utilisateur peut taper /git." }))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
    void (isOpen ? refresh($) : refreshStatusLine($)).catch(() => undefined)
    return done
  })

  on('ui.render', { component: 'Pane', requestId: 'git-studio' }, async ($, e) => {
    const [nav, snap, detail, busy, banner, confirm, consoleEntries, recent] = await Promise.all([
      read($, navAtom),
      read($, snapAtom),
      read($, detailAtom),
      read($, busyAtom),
      read($, bannerAtom),
      read($, confirmAtom),
      read($, consoleAtom),
      recentRepos($),
    ])
    const ctx: Ctx = {
      cmd: actionsFor($),
      ui: uiOf($.ui.resolve(e)),
      width: Math.max(40, e.props.bodyColumns - 1),
      surface: e.surface,
      nav: withDefaults(nav),
      snap: { ...EMPTY_SNAP, ...snap },
      detail: { ...EMPTY_DETAIL, ...detail },
      busy,
      banner,
      confirm,
      consoleEntries,
      recent,
    }
    return paneTree(ctx, e.props.isFocused)
  })
}
