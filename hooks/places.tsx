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
  const head = ctx.snap.head
  const list = ctx.snap.worktrees
  const main = list[0]?.path ?? head?.root ?? ''
  // Read when used, never at draw time: the branch typed since then names the folder.
  const suggestion = (): string =>
    main === '' ? '' : `${parentOf(main)}/${baseName(main)}-${draft('wt-branch').trim().replace(/[^\w.-]+/g, '-') || 'nouveau'}`
  const bases = [
    { value: '', label: 'HEAD' },
    ...ctx.snap.branches.map(branch => ({ value: branch.name, label: branch.name })),
  ]

  const create = async (): Promise<void> => {
    const path = draft('wt-path').trim() || suggestion()
    if (path === '') {
      await cmd.inform('Indiquez le chemin du nouveau worktree.', 'error')
      return
    }
    const newBranch = draft('wt-branch').trim()
    const base = picked(ctx, 'wt-base', bases)
    if (await cmd.act(ops.addWorktree(path, newBranch, base))) clearDrafts('wt-path', 'wt-branch')
  }

  return (
    <Box flexDirection="column">
      {note(ctx, "Un worktree extrait une autre branche dans un autre dossier, sans toucher à celui-ci. Laissez « nouvelle branche » vide pour extraire une branche existante.")}
      {bar(ctx, [
        field(ctx, 'wt-branch', { label: 'Nouvelle branche', placeholder: 'feature/x (optionnel)', submitLabel: 'créer', onSubmit: () => create() }),
        choice(ctx, 'wt-base', bases, { label: 'depuis / branche' }),
      ])}
      {bar(ctx, [
        field(ctx, 'wt-path', { label: 'Dossier', placeholder: `${parentOf(main)}/${baseName(main)}-<branche>`, submitLabel: 'créer', onSubmit: () => create() }),
        button(ctx, 'wt-create', 'Créer le worktree', () => create(), { primary: true }),
        button(ctx, 'wt-prune', 'Nettoyer les orphelins', () => cmd.act(ops.pruneWorktrees()), { dim: true }),
      ])}
      {section(ctx, `Worktrees (${list.length})`)}
      {list.map((worktree, index) => worktreeRow(ctx, worktree, index === 0))}
    </Box>
  )
}

function worktreeRow(ctx: Ctx, worktree: GsWorktree, isMain: boolean): Node {
  const { Box, Button, Text } = ctx.ui
  const cmd = ctx.cmd
  const id = `worktree:${worktree.path}`
  const isOpen = ctx.nav.expanded === id
  const isHere = ctx.snap.head?.root === worktree.path
  const what = worktree.bare ? 'dépôt nu' : worktree.branch ?? `détaché @ ${short(worktree.head ?? '')}`

  const move = async (): Promise<void> => {
    const to = draft(`wt-move:${worktree.path}`).trim()
    if (to === '') {
      await cmd.inform('Indiquez le nouveau dossier.', 'error')
      return
    }
    if (await cmd.act(ops.moveWorktree(worktree.path, to))) clearDrafts(`wt-move:${worktree.path}`)
  }

  return (
    <Box flexDirection="column">
      <Button key={`wt-row:${worktree.path}`} plain onPress={() => cmd.toggleExpanded(id)}>
        {isOpen ? '▾ ' : '▸ '}
        {isHere ? <Text color="claude" bold>● </Text> : '  '}
        <Text bold>{line(baseName(worktree.path))}</Text> <Text color="success">{line(what)}</Text>
        {isMain ? <Text dimColor> (principal)</Text> : ''}
        {worktree.locked !== null ? <Text color="warning"> 🔒</Text> : ''}
        {worktree.prunable !== null ? <Text color="error"> (orphelin)</Text> : ''}
        <Text dimColor> {cut(line(worktree.path), Math.max(10, ctx.width - 40))}</Text>
      </Button>
      {isOpen ? (
        <Box flexDirection="column" marginLeft={4} marginBottom={1}>
          {worktree.locked !== null ? note(ctx, `Verrouillé : ${worktree.locked}`) : null}
          {worktree.prunable !== null ? note(ctx, `Orphelin : ${worktree.prunable}`) : null}
          {bar(ctx, [
            isHere ? <Text color="claude">Ouvert dans le client</Text> : button(ctx, `wt-use:${worktree.path}`, 'Ouvrir dans le client', () => cmd.useRepo(worktree.path), { primary: true }),
            button(ctx, `wt-copy:${worktree.path}`, 'Copier le chemin', () => cmd.copy(worktree.path), { dim: true }),
            isMain
              ? null
              : button(ctx, `wt-lock:${worktree.path}`, worktree.locked === null ? 'Verrouiller' : 'Déverrouiller', () =>
                  cmd.act(ops.lockWorktree(worktree.path, worktree.locked === null)),
                { dim: true }),
          ])}
          {isMain
            ? null
            : bar(ctx, [
                field(ctx, `wt-move:${worktree.path}`, { label: 'Déplacer vers', placeholder: worktree.path, submitLabel: 'déplacer', onSubmit: () => move() }),
                button(ctx, `wt-remove:${worktree.path}`, 'Supprimer', () => cmd.act(ops.removeWorktree(worktree.path, false)), { dim: true }),
                button(ctx, `wt-remove-force:${worktree.path}`, 'Forcer la suppression', () => cmd.act(ops.removeWorktree(worktree.path, true)), { dim: true }),
              ])}
        </Box>
      ) : null}
    </Box>
  )
}

// Stash

const STASH_MODES: { value: ops.StashMode; label: string }[] = [
  { value: 'default', label: 'suivis seulement' },
  { value: 'untracked', label: '+ non suivis' },
  { value: 'keep-index', label: "en gardant l'index" },
  { value: 'staged', label: 'indexés seulement' },
]

const isStashMode = (value: string): value is ops.StashMode => STASH_MODES.some(mode => mode.value === value)

export function stashView(ctx: Ctx): Node {
  const { Box } = ctx.ui
  const cmd = ctx.cmd
  const push = async (): Promise<void> => {
    const mode = picked(ctx, 'stash-mode', STASH_MODES)
    if (await cmd.act(ops.stashPush(draft('stash-msg'), isStashMode(mode) ? mode : 'default'))) clearDrafts('stash-msg')
  }
  return (
    <Box flexDirection="column">
      {bar(ctx, [
        field(ctx, 'stash-msg', { label: 'Nouveau stash', placeholder: 'message (optionnel)', submitLabel: 'stash', onSubmit: () => push() }),
        choice(ctx, 'stash-mode', STASH_MODES),
        button(ctx, 'stash-push', 'Stash', () => push(), { primary: true }),
      ])}
      {section(ctx, `Stashes (${ctx.snap.stashes.length})`, ctx.snap.stashes.length > 0 ? [button(ctx, 'stash-clear', 'Tout supprimer', () => cmd.act(ops.stashClear()), { dim: true })] : [])}
      {ctx.snap.stashes.length === 0 ? note(ctx, 'Aucun stash.') : null}
      {ctx.snap.stashes.map(stash => stashRow(ctx, stash))}
    </Box>
  )
}

function stashRow(ctx: Ctx, stash: GsStash): Node {
  const { Box, Button, Text } = ctx.ui
  const cmd = ctx.cmd
  const isOpen = ctx.nav.expanded === `stash:${stash.ref}`
  const branchOut = async (): Promise<void> => {
    const name = draft(`stash-branch:${stash.ref}`).trim()
    if (name === '') {
      await cmd.inform('Donnez un nom à la branche.', 'error')
      return
    }
    if (await cmd.act(ops.stashBranch(name, stash.ref))) clearDrafts(`stash-branch:${stash.ref}`)
  }
  return (
    <Box flexDirection="column">
      <Button key={`stash-row:${stash.ref}`} plain onPress={() => cmd.openStash(stash.ref)}>
        {isOpen ? '▾ ' : '▸ '}
        <Text color="warning">{stash.ref}</Text> {cut(line(stash.subject), Math.max(10, ctx.width - 30))} <Text dimColor>· {ago(stash.time)}</Text>
      </Button>
      {isOpen ? (
        <Box flexDirection="column" marginLeft={4} marginBottom={1}>
          {bar(ctx, [
            button(ctx, `stash-apply:${stash.ref}`, 'Appliquer', () => cmd.act(ops.stashApply(stash.ref)), { primary: true }),
            button(ctx, `stash-pop:${stash.ref}`, 'Pop (appliquer et supprimer)', () => cmd.act(ops.stashPop(stash.ref))),
            button(ctx, `stash-drop:${stash.ref}`, 'Supprimer', () => cmd.act(ops.stashDrop(stash.ref)), { dim: true }),
          ])}
          {bar(ctx, [
            field(ctx, `stash-branch:${stash.ref}`, { label: 'Branche depuis ce stash', placeholder: 'nom', submitLabel: 'créer', onSubmit: () => branchOut() }),
            button(ctx, `stash-branch-go:${stash.ref}`, 'Créer', () => branchOut(), { dim: true }),
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
  const head = ctx.snap.head
  const remote = defaultRemote(ctx)
  const branch = head?.branch ?? null
  const add = async (): Promise<void> => {
    const name = draft('remote-name').trim()
    const url = draft('remote-url').trim()
    if (name === '' || url === '') {
      await cmd.inform('Indiquez le nom et l’URL du remote.', 'error')
      return
    }
    if (await cmd.act(ops.addRemote(name, url))) clearDrafts('remote-name', 'remote-url')
  }
  const pushStep = pushStepForHead(ctx)
  const pushOp = pushStep === null ? null : { title: `Push de ${branch ?? 'HEAD'}`, steps: [pushStep], network: true }

  return (
    <Box flexDirection="column">
      {bar(ctx, [
        button(ctx, 'remotes-fetch', 'Fetch tout', () => cmd.act(ops.fetch(null)), { primary: true }),
        button(ctx, 'remotes-pull', 'Pull', () => cmd.act(ops.pull('default'))),
        button(ctx, 'remotes-pull-ff', '--ff-only', () => cmd.act(ops.pull('ff-only')), { dim: true }),
        button(ctx, 'remotes-pull-rebase', '--rebase', () => cmd.act(ops.pull('rebase')), { dim: true }),
        button(ctx, 'remotes-pull-merge', '--no-rebase', () => cmd.act(ops.pull('merge')), { dim: true }),
      ])}
      {bar(ctx, [
        pushOp !== null ? button(ctx, 'remotes-push', branch === null ? 'Push' : `Push ${branch}`, () => cmd.act(pushOp)) : null,
        remote !== null && branch !== null
          ? button(ctx, 'remotes-push-force', 'Push forcé (--force-with-lease)', () => cmd.act(ops.push(remote, branch, { force: true })), { dim: true })
          : null,
        remote !== null ? button(ctx, 'remotes-push-tags', 'Push des tags', () => cmd.act(ops.pushAllTags(remote)), { dim: true }) : null,
      ])}
      {section(ctx, `Remotes (${ctx.snap.remotes.length})`)}
      {ctx.snap.remotes.length === 0 ? note(ctx, 'Aucun remote : ajoutez-en un ci-dessous.') : null}
      {ctx.snap.remotes.map(one => remoteRow(ctx, one))}
      {bar(ctx, [
        field(ctx, 'remote-name', { label: 'Ajouter', placeholder: 'origin', submitLabel: 'ajouter', onSubmit: () => add() }),
        field(ctx, 'remote-url', { placeholder: 'git@github.com:moi/projet.git', submitLabel: 'ajouter', onSubmit: () => add() }),
        button(ctx, 'remote-add', 'Ajouter le remote', () => add()),
      ])}
    </Box>
  )
}

function remoteRow(ctx: Ctx, remote: GsRemote): Node {
  const { Box, Button, Text } = ctx.ui
  const cmd = ctx.cmd
  const id = `remote:${remote.name}`
  const isOpen = ctx.nav.expanded === id
  const rename = async (): Promise<void> => {
    const to = draft(`remote-rename:${remote.name}`).trim()
    if (to === '' || to === remote.name) {
      await cmd.inform('Indiquez le nouveau nom.', 'error')
      return
    }
    if (await cmd.act(ops.renameRemote(remote.name, to))) clearDrafts(`remote-rename:${remote.name}`)
  }
  const setUrl = async (): Promise<void> => {
    const url = draft(`remote-url:${remote.name}`).trim()
    if (url === '') {
      await cmd.inform('Indiquez la nouvelle URL.', 'error')
      return
    }
    if (await cmd.act(ops.setRemoteUrl(remote.name, url))) clearDrafts(`remote-url:${remote.name}`)
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
          {remote.push !== remote.fetch ? note(ctx, `push : ${remote.push}`) : null}
          {bar(ctx, [
            button(ctx, `remote-fetch:${remote.name}`, `Fetch ${remote.name}`, () => cmd.act(ops.fetch(remote.name)), { primary: true }),
            button(ctx, `remote-prune:${remote.name}`, 'Nettoyer (prune)', () => cmd.act(ops.pruneRemote(remote.name)), { dim: true }),
            button(ctx, `remote-copy:${remote.name}`, "Copier l'URL", () => cmd.copy(remote.fetch), { dim: true }),
            button(ctx, `remote-remove:${remote.name}`, 'Supprimer', () => cmd.act(ops.removeRemote(remote.name)), { dim: true }),
          ])}
          {bar(ctx, [
            field(ctx, `remote-rename:${remote.name}`, { label: 'Renommer', placeholder: remote.name, submitLabel: 'renommer', onSubmit: () => rename() }),
            field(ctx, `remote-url:${remote.name}`, { label: 'URL', placeholder: remote.fetch, submitLabel: 'changer', onSubmit: () => setUrl() }),
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
  return (
    <Box flexDirection="column">
      {note(ctx, "N'importe quelle commande git, sans éditeur ni pager (bisect, blame, submodule, config, rebase --onto…).")}
      {bar(ctx, [
        field(ctx, 'console', {
          label: 'git',
          placeholder: 'log --stat -3',
          submitLabel: 'exécuter',
          onSubmit: async value => {
            if (value.trim() === '') return
            await cmd.runConsole(value)
            clearDrafts('console')
          },
        }),
        ctx.consoleEntries.length > 0 ? button(ctx, 'console-clear', 'Effacer', () => cmd.clearConsole(), { dim: true }) : null,
      ])}
      {ctx.consoleEntries.map((entry, index) => (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text color={entry.code === 0 ? 'success' : 'error'}>$ </Text>
            <Text bold>{line(entry.cmd)}</Text>
            <Text dimColor>
              {' '}
              · {entry.code === 0 ? 'ok' : `code ${entry.code}`} · {ago(Math.floor(entry.at / 1000))}
            </Text>
          </Text>
          {entry.output.trim() === '' ? (
            <Text dimColor>(aucune sortie)</Text>
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
