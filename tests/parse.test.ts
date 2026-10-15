import { describe, expect, test } from 'claude-code/testing'

import {
  BRANCH_FORMAT,
  LOG_FORMAT,
  REFLOG_FORMAT,
  SHOW_FORMAT,
  STASH_FORMAT,
  TAG_FORMAT,
  detectOperation,
  hunkPatch,
  parseBranches,
  parseCommitFiles,
  parseLog,
  parseReflog,
  parseRefs,
  parseRemotes,
  parseShow,
  parseStashes,
  parseStatus,
  parseTags,
  parseWorktrees,
  quoteArg,
  splitArgs,
  splitDiff,
} from '../hooks/git'
import { buildGraph, graphText } from '../hooks/graph'
import { en } from '../hooks/i18n'
import * as ops from '../hooks/ops'
import { FIXTURES, MERGE_SHA, PLAIN_SHA, ROOT } from './fixtures'

const out = (...args: string[]): string => FIXTURES[args.join('\u0001')]?.stdout ?? ''

describe('parsers on real git output', () => {
  test('status: branch, upstream, ahead, stash, and each kind of entry', () => {
    const { head, entries } = parseStatus(out('status', '--porcelain=v2', '--branch', '--show-stash', '-z'))
    expect(head).toMatchObject({ branch: 'main', upstream: 'origin/main', ahead: 1, behind: 0, stash: 1 })
    expect(entries).toEqual([
      { path: 'README.md', orig: null, x: '.', y: 'M', kind: 'tracked' },
      { path: 'app.js', orig: null, x: 'M', y: 'M', kind: 'tracked' },
      { path: 'auth.js', orig: 'login.js', x: 'R', y: '.', kind: 'tracked' },
      { path: 'notes.txt', orig: null, x: '?', y: '?', kind: 'untracked' },
    ])
  })

  test('status: conflicts and a detached, unborn head', () => {
    const raw = ['# branch.oid (initial)', '# branch.head (detached)', 'u UU N... 100644 100644 100644 100644 a b c my file.txt', ''].join('\0')
    const { head, entries } = parseStatus(raw)
    expect(head.oid).toBe(null)
    expect(head.branch).toBe(null)
    expect(entries).toEqual([{ path: 'my file.txt', orig: null, x: 'U', y: 'U', kind: 'conflict' }])
  })

  test('log, refs and graph', () => {
    const commits = parseLog(out('log', '--date-order', LOG_FORMAT, '-n151', '--branches', '--remotes', '--tags', 'HEAD'))
    expect(commits).toHaveLength(11)
    const merge = commits.find(commit => commit.sha === MERGE_SHA)
    expect(merge?.parents).toHaveLength(2)
    expect(parseRefs(merge?.refs ?? '', ['origin'])).toEqual([
      { kind: 'tag', name: 'v1.0' },
      { kind: 'branch', name: 'hotfix' },
    ])
    expect(parseRefs('HEAD -> main, origin/main, origin/HEAD, tag: v2', ['origin'])).toEqual([
      { kind: 'head', name: 'main' },
      { kind: 'remote', name: 'origin/main' },
      { kind: 'tag', name: 'v2' },
    ])
    const rows = buildGraph(commits).map(graphText)
    expect(rows[0]).toBe('●')
    expect(rows[4]).toBe('○─┴─╮')
    expect(rows[8]).toBe('●───╯')
  })

  test('graph: an octopus merge opens a lane per parent and joins them again', () => {
    const rows = buildGraph([
      { sha: 'o', parents: ['a', 'b', 'c'] },
      { sha: 'a', parents: ['r'] },
      { sha: 'b', parents: ['r'] },
      { sha: 'c', parents: ['r'] },
      { sha: 'r', parents: [] },
    ]).map(graphText)
    expect(rows).toEqual(['○─┬─╮', '● │ │', '│ ● │', '│ │ ●', '●─┴─╯'])
  })

  test('branches, tags, worktrees, stashes, remotes, reflog', () => {
    const branches = parseBranches(out('for-each-ref', '--sort=-committerdate', BRANCH_FORMAT, 'refs/heads', 'refs/remotes'))
    expect(branches.find(branch => branch.isHead)).toMatchObject({ name: 'main', upstream: 'origin/main', ahead: 1, worktree: ROOT })
    expect(branches.filter(branch => branch.remote).map(branch => branch.name)).toEqual(['origin/main', 'origin/feature/api'])
    const tags = parseTags(out('for-each-ref', '--sort=-creatordate', TAG_FORMAT, 'refs/tags'))
    expect(tags.map(tag => [tag.name, tag.annotated, tag.sha === MERGE_SHA])).toEqual([
      ['v1.0', true, true],
      ['v0.9', false, false],
    ])
    const worktrees = parseWorktrees(out('worktree', 'list', '--porcelain'))
    expect(worktrees.map(worktree => [worktree.path, worktree.branch])).toEqual([
      [ROOT, 'main'],
      ['/work/demo/repo-hotfix', 'hotfix'],
    ])
    expect(parseStashes(out('stash', 'list', STASH_FORMAT))).toMatchObject([{ ref: 'stash@{0}', subject: 'On main: WIP experiment' }])
    expect(parseRemotes(out('remote', '-v'))).toEqual([{ name: 'origin', fetch: '../origin.git', push: '../origin.git' }])
    expect(parseReflog(out('reflog', 'show', REFLOG_FORMAT, '-n150', 'HEAD'))[0]).toMatchObject({ selector: 'HEAD@{0}' })
  })

  test('commit details and their files, renames included', () => {
    const shown = parseShow(out('show', '-s', SHOW_FORMAT, MERGE_SHA))
    expect(shown).toMatchObject({ sha: MERGE_SHA, author: 'Ada Lovelace', body: "Merge branch 'feature/login'" })
    const files = parseCommitFiles(
      out('diff-tree', '-r', '-z', '--no-commit-id', '--name-status', '-M', '--root', PLAIN_SHA),
      out('diff-tree', '-r', '-z', '--no-commit-id', '--numstat', '-M', '--root', PLAIN_SHA),
    )
    expect(files).toEqual([{ status: 'M', path: 'login.js', orig: null, added: 1, deleted: 0, binary: false }])
    expect(parseCommitFiles('R087\0old.js\0new.js\0', '3\t1\t\0old.js\0new.js\0')).toEqual([
      { status: 'R', path: 'new.js', orig: 'old.js', added: 3, deleted: 1, binary: false },
    ])
  })

  test('diffs split per file and hunk, and a hunk makes a patch', () => {
    const files = splitDiff(out('diff', '--no-ext-diff', '--', 'app.js'))
    expect(files).toHaveLength(1)
    expect(files[0]?.path).toBe('app.js')
    expect(files[0]?.hunks).toHaveLength(1)
    const patch = hunkPatch(files[0]?.header ?? '', files[0]?.hunks[0] ?? '')
    expect(patch.startsWith('diff --git a/app.js b/app.js\n')).toBe(true)
    expect(patch.endsWith('+more\n')).toBe(true)
    const stash = splitDiff(out('stash', 'show', '-p', '--include-untracked', '--no-ext-diff', 'stash@{0}'))
    expect(stash.map(file => file.path)).toEqual(['app.js'])
  })

  test('operations in progress', () => {
    expect(detectOperation(new Set(['MERGE_HEAD']), false)).toBe('merge')
    expect(detectOperation(new Set(['rebase-merge', 'MERGE_HEAD']), false)).toBe('rebase')
    expect(detectOperation(new Set(['rebase-apply']), true)).toBe('am')
    expect(detectOperation(new Set(['CHERRY_PICK_HEAD']), false)).toBe('cherry-pick')
    expect(detectOperation(new Set(['HEAD']), false)).toBe(null)
  })

  test('command lines split and quote as a shell would', () => {
    expect(splitArgs(`log --format="%h %s" -n 3 'a b' c\\ d`)).toEqual(['log', '--format=%h %s', '-n', '3', 'a b', 'c d'])
    expect(quoteArg('feature/x')).toBe('feature/x')
    expect(quoteArg("it's")).toBe(`'it'\\''s'`)
  })
})

describe('operations', () => {
  test('dangerous ones ask first, safe ones do not', () => {
    expect(ops.deleteBranch(en, 'x', false).danger).toBeDefined()
    expect(ops.reset(en, 'a'.repeat(40), 'hard', 'main').danger).toBeDefined()
    expect(ops.reset(en, 'a'.repeat(40), 'soft', 'main').danger).toBeUndefined()
    expect(ops.cherryPick(en, ['a'.repeat(40)], false).danger).toBeUndefined()
    expect(ops.push(en, 'origin', 'main', { force: true }).danger).toBeDefined()
  })

  test('each builds the git command it names', () => {
    expect(ops.cherryPick(en, ['a', 'b'], true).steps[0]?.args).toEqual(['cherry-pick', '-m', '1', 'a', 'b'])
    expect(ops.merge(en, 'feature', 'no-ff', 'main').steps[0]?.args).toEqual(['merge', '--no-ff', '--no-edit', 'feature'])
    expect(ops.createTag(en, 'v1', 'HEAD', 'Release').steps[0]?.args).toEqual(['tag', '-a', 'v1', '-m', 'Release', 'HEAD'])
    expect(ops.createTag(en, 'v1', 'HEAD', ' ').steps[0]?.args).toEqual(['tag', 'v1', 'HEAD'])
    expect(ops.addWorktree(en, '../x', 'feat', 'main').steps[0]?.args).toEqual(['worktree', 'add', '-b', 'feat', '../x', 'main'])
    expect(ops.commit(en, 'msg', { amend: true }).steps[0]?.args).toEqual(['commit', '--amend', '-m', 'msg'])
    expect(ops.commit(en, '', { amend: true }).steps[0]?.args).toEqual(['commit', '--amend', '--no-edit'])
    expect(ops.stashPush(en, 'wip', 'untracked').steps[0]?.args).toEqual(['stash', 'push', '--include-untracked', '-m', 'wip'])
    expect(ops.fastForward(en, 'dev', 'origin', 'dev').steps[0]?.args).toEqual(['fetch', 'origin', 'dev:dev'])
    expect(ops.stageHunk(en, 'patch').steps[0]).toEqual({ args: ['apply', '--cached', '--whitespace=nowarn', '-'], stdin: 'patch' })
  })
})
