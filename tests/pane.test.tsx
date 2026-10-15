import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

import { GIT_BASE } from '../hooks/git'
import { VIEWS } from '../hooks/model'
import { FIXTURES, MERGE_SHA, ROOT } from './fixtures'

type Call = { args: string[]; stdin?: string }

const SURFACES = ['terminal', 'desktop'] as const

function ran(stdout: string, exitCode = 0): ProcessRunResult {
  return { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
}

/** A repository served from recorded git output; every git call is kept in `calls`, every prompt sent to Claude in `prompts`. */
function world(on: On): { calls: Call[]; opened: string[]; prompts: string[]; descriptions: string[] } {
  const calls: Call[] = []
  const opened: string[] = []
  const prompts: string[] = []
  const descriptions: string[] = []
  mock.store(on)
  mock.env(on, { HOME: '/home/ada' })
  mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: ROOT }))
  on('command.register', ($, e) => {
    descriptions.push(e.description)
    return { value: { command: e.name } }
  })
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)
    return { text: e.text }
  })
  on('tool.register', ($, e) => ({ value: { tool: `mcp__git-studio__${e.name}` } }))
  on('fs.list', () => ({ value: [] }))
  on('fs.exists', () => ({ value: false }))
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: [{ id: 'git-studio', title: 'Git', isShown: true, isFocused: true, isPlaced: true }] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', ($, e) => {
    const args = e.argv.slice(1 + GIT_BASE.length)
    const call: Call = { args: [...args] }
    if (e.init?.stdin !== undefined) call.stdin = e.init.stdin
    calls.push(call)
    if (args[0] === 'rev-parse' && args[1] === '--path-format=absolute') return { value: ran(`${ROOT}\n${ROOT}/.git\n${ROOT}/.git\n`) }
    const hit = FIXTURES[args.join('\u0001')]
    return { value: hit ? { ...hit, isStdoutTruncated: false, isStderrTruncated: false } : ran('') }
  })
  return { calls, opened, prompts, descriptions }
}

async function mountPane($: Engine, surface: (typeof SURFACES)[number]) {
  const ui = await $.ui.mount({
    plugin: 'git-studio',
    surface,
    component: 'Pane',
    requestId: 'git-studio',
    props: {
      title: 'Git',
      isFocused: true,
      bodyColumns: 100,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
    viewport: { columns: 140, rows: 45, isFullscreen: true },
  })
  await ui.press({ key: 'refresh' })
  return ui
}

const lines = (calls: Call[]): string[] => calls.map(call => call.args.join(' '))

describe('Git Studio pane', () => {
  test('every view draws a tree each surface accepts', { timeoutMs: 30_000 }, async ($, on) => {
    world(on)
    for (const surface of SURFACES) {
      const ui = await mountPane($, surface)
      expect(await ui.find({ text: /main/ })).toBeDefined()
      for (const view of VIEWS) {
        await ui.press({ key: `tab:${view}` })
        expect(await ui.drawn()).toBeDefined()
      }
      await ui.unmount()
    }
  })

  test('the log draws the graph, opens a commit and cherry-picks it', { timeoutMs: 20_000 }, async ($, on) => {
    const { calls } = world(on)
    for (const surface of SURFACES) {
      const ui = await mountPane($, surface)
      await ui.press({ key: 'tab:log' })
      expect(await ui.find({ text: '○─┴─╮ ' })).toBeDefined()
      await ui.press({ key: `row:${MERGE_SHA}` })
      expect(await ui.find({ text: "Merge branch 'feature/login'" })).toBeDefined()
      await ui.press({ key: `cfile:${MERGE_SHA}:login.js` })
      expect(await ui.drawn()).toBeDefined()
      await ui.press({ key: `cherry-pick:${MERGE_SHA}` })
      expect(lines(calls)).toContain(`cherry-pick -m 1 ${MERGE_SHA}`)
      await ui.unmount()
    }
  })

  test('the status stages one hunk and commits with the typed message', { timeoutMs: 20_000 }, async ($, on) => {
    const { calls } = world(on)
    for (const surface of SURFACES) {
      calls.length = 0
      const ui = await mountPane($, surface)
      // The open file is the session's: the first surface left it open.
      if ((await ui.find({ key: 'stage-hunk:app.js:0:0' })) === undefined) await ui.press({ key: 'file:u:app.js' })
      await ui.press({ key: 'stage-hunk:app.js:0:0' })
      const apply = calls.find(call => call.args[0] === 'apply')
      expect(apply?.args).toEqual(['apply', '--cached', '--whitespace=nowarn', '-'])
      expect(apply?.stdin).toContain('+more')
      await ui.input({ key: 'in:commit-msg', text: 'feat: hello', kind: 'change' })
      await ui.input({ key: 'in:commit-body', text: 'first ⏎ second', kind: 'change' })
      await ui.press({ key: 'commit' })
      expect(calls.some(call => call.args[0] === 'commit' && call.args[2] === 'feat: hello\n\nfirst\nsecond')).toBe(true)
      await ui.unmount()
    }
  })

  test('a destructive action waits for its confirmation', { timeoutMs: 20_000 }, async ($, on) => {
    const { calls } = world(on)
    const ui = await mountPane($, 'desktop')
    await ui.press({ key: 'tab:branches' })
    await ui.press({ key: 'branch-row:feature/login' })
    await ui.press({ key: 'delete:feature/login' })
    expect(lines(calls)).not.toContain('branch -d feature/login')
    expect(await ui.find({ key: 'confirm-yes' })).toBeDefined()
    await ui.press({ key: 'confirm-no' })
    expect(await ui.find({ key: 'confirm-yes' })).toBeUndefined()
    await ui.press({ key: 'delete:feature/login' })
    await ui.press({ key: 'confirm-yes' })
    expect(lines(calls)).toContain('branch -d feature/login')
  })

  test('branches, tags, worktrees and stashes act on their rows', { timeoutMs: 20_000 }, async ($, on) => {
    const { calls } = world(on)
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: 'tab:branches' })
    await ui.input({ key: 'in:new-branch', text: 'feature/new', kind: 'change' })
    await ui.press({ key: 'new-branch-switch' })
    expect(lines(calls)).toContain('checkout -b feature/new HEAD')
    await ui.press({ key: 'branch-row:feature/api' })
    await ui.press({ key: 'merge-noff:feature/api' })
    expect(lines(calls)).toContain('merge --no-ff --no-edit feature/api')
    await ui.press({ key: 'tab:tags' })
    await ui.input({ key: 'in:new-tag', text: 'v2.0', kind: 'change' })
    await ui.input({ key: 'in:new-tag-msg', text: 'Release 2', kind: 'change' })
    await ui.press({ key: 'new-tag-create' })
    expect(lines(calls)).toContain('tag -a v2.0 -m Release 2 HEAD')
    await ui.press({ key: 'tab:worktrees' })
    await ui.input({ key: 'in:wt-branch', text: 'spike', kind: 'change' })
    await ui.press({ key: 'wt-create' })
    expect(lines(calls)).toContain('worktree add -b spike /work/demo/repo-spike')
    await ui.press({ key: 'tab:stash' })
    await ui.press({ key: 'stash-row:stash@{0}' })
    expect(await ui.find({ key: 'stash-pop:stash@{0}' })).toBeDefined()
    await ui.press({ key: 'stash-pop:stash@{0}' })
    expect(lines(calls)).toContain('stash pop stash@{0}')
  })

  test('/git opens the pane on a view, or runs a git command', { timeoutMs: 20_000 }, async ($, on) => {
    const { opened } = world(on)
    await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
    const typed = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 140 } } as const
    await $.command.run({ command: 'git', args: 'branches', ...typed })
    expect(opened).toContain('git-studio')
    const answer = await $.command.run({ command: 'git', args: 'remote -v', ...typed })
    expect(answer.text).toContain('origin\t../origin.git (fetch)')
  })
})

/** What the pane draws and sends in each language, on the demo repository. */
const SPOKEN = {
  en: {
    description: /^Git Studio: opens the git client/,
    tab: 'History',
    refresh: '⟳ Refresh',
    staged: 'Staged (2)',
    commitTitle: /^Commit to main/,
    review: /^Do a code review of the staged changes/,
    date: /<ada@example\.com> · \d{4}-\d{2}-\d{2} \d{2}:\d{2}/,
    danger: '⚠ Delete branch feature/login?',
    confirm: 'Confirm',
    done: '✓ Delete branch feature/login',
  },
  fr: {
    description: /^Git Studio : ouvre le client git/,
    tab: 'Historique',
    refresh: '⟳ Rafraîchir',
    staged: 'Indexés (2)',
    commitTitle: /^Commit sur main/,
    review: /^Fais une revue de code des changements indexés/,
    date: /<ada@example\.com> · \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/,
    danger: '⚠ Supprimer la branche feature/login ?',
    confirm: 'Confirmer',
    done: '✓ Supprimer la branche feature/login',
  },
} as const

describe('Git Studio in each language', () => {
  for (const language of ['en', 'fr'] as const) {
    const said = SPOKEN[language]
    test(`the pane speaks ${language} on each surface`, { options: { language }, timeoutMs: 30_000 }, async ($, on) => {
      const { calls, prompts, descriptions } = world(on)
      await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
      expect(descriptions[0]).toMatch(said.description)
      for (const surface of SURFACES) {
        const ui = await mountPane($, surface)
        expect((await ui.find({ key: 'tab:log' }))?.text).toBe(surface === 'terminal' ? `2 ${said.tab}` : said.tab)
        expect((await ui.find({ key: 'refresh' }))?.text).toBe(said.refresh)
        await ui.press({ key: 'tab:status' })
        expect(await ui.find({ text: said.staged })).toBeDefined()
        expect(await ui.find({ text: said.commitTitle })).toBeDefined()
        await ui.press({ key: 'commit-review' })
        expect(prompts.at(-1)).toMatch(said.review)
        await ui.press({ key: 'tab:log' })
        await ui.press({ key: `row:${MERGE_SHA}` })
        expect(await ui.find({ text: said.date })).toBeDefined()
        await ui.press({ key: 'tab:branches' })
        await ui.press({ key: 'branch-row:feature/login' })
        await ui.press({ key: 'delete:feature/login' })
        expect(await ui.find({ text: said.danger })).toBeDefined()
        expect((await ui.find({ key: 'confirm-yes' }))?.text).toBe(said.confirm)
        await ui.press({ key: 'confirm-yes' })
        expect(lines(calls)).toContain('branch -d feature/login')
        expect(await ui.find({ text: said.done })).toBeDefined()
        await ui.press({ key: 'banner-close' })
        await ui.unmount()
      }
    })
  }

  test('with no language set, the pane is in English', { timeoutMs: 20_000 }, async ($, on) => {
    world(on)
    for (const surface of SURFACES) {
      const ui = await mountPane($, surface)
      expect((await ui.find({ key: 'refresh' }))?.text).toBe(SPOKEN.en.refresh)
      await ui.unmount()
    }
  })
})
