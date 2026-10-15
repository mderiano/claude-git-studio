import type {
  BoxProps,
  ButtonProps,
  CodeProps,
  ElementConstructor,
  Elements,
  InputProps,
  MarkdownProps,
  RenderNode,
  RenderSurface,
  SelectOption,
  SelectProps,
  TextProps,
} from 'claude-code'

import type {
  GsBanner,
  GsCommitFile,
  GsConsoleEntry,
  GsDetail,
  GsDiff,
  GsLogOptions,
  GsNav,
  GsNavPatch,
  GsOp,
  GsSnapshot,
  GsStatusEntry,
  GsView,
} from '../types'
import { draft, setDraft } from './drafts'
import { hunkPatch, parseRefs, splitDiff } from './git'

/** What a helper draws: an element, a string, or nothing. */
export type Node = RenderNode | null

export type UI = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Code: ElementConstructor<CodeProps>
  Markdown: ElementConstructor<MarkdownProps>
  Input: ElementConstructor<InputProps> | null
  Select: ElementConstructor<SelectProps> | null
}

export function uiOf(table: Elements[RenderSurface]): UI {
  return {
    Box: table.Box,
    Text: table.Text,
    Button: table.Button,
    Code: table.Code,
    Markdown: table.Markdown,
    Input: 'Input' in table ? table.Input : null,
    Select: 'Select' in table ? table.Select : null,
  }
}

/** What the views may do: every call is the hooks module's, which alone holds the engine. */
export type Actions = {
  act: (op: GsOp, isConfirmed?: boolean) => Promise<boolean | null>
  refresh: () => Promise<void>
  showView: (view: GsView) => Promise<void>
  patchNav: (patch: GsNavPatch) => Promise<void>
  patchLog: (patch: Partial<GsLogOptions>) => Promise<void>
  toggleExpanded: (id: string) => Promise<boolean>
  toggleFile: (id: string, entry: GsStatusEntry) => Promise<void>
  openCommit: (sha: string, rowId?: string) => Promise<void>
  toggleCommitFile: (sha: string, file: GsCommitFile, isMerge: boolean) => Promise<void>
  openStash: (ref: string) => Promise<void>
  jumpToCommit: (sha: string) => Promise<void>
  togglePick: (sha: string) => Promise<void>
  fileHistory: (path: string) => Promise<void>
  useRepo: (path: string | null) => Promise<void>
  workDir: () => Promise<string>
  home: () => Promise<string>
  inform: (title: string, kind?: 'info' | 'error') => Promise<void>
  dismissBanner: () => Promise<void>
  dismissConfirm: () => Promise<void>
  suggestCommitMessage: () => Promise<void>
  askClaude: (text: string) => Promise<void>
  runConsole: (line: string) => Promise<void>
  clearConsole: () => Promise<void>
  copy: (text: string) => Promise<void>
  close: () => Promise<void>
}

export type Ctx = {
  cmd: Actions
  ui: UI
  width: number
  surface: RenderSurface
  nav: GsNav
  snap: GsSnapshot
  detail: GsDetail
  busy: string | null
  banner: GsBanner | null
  confirm: GsOp | null
  consoleEntries: GsConsoleEntry[]
  recent: string[]
}

// Text

/** One line of text, control characters dropped. */
export function line(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]+/g, ' ')
}

/** A block of text: newlines and tabs kept, other control characters dropped. */
export function block(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
}

export function cut(text: string, max: number): string {
  if (max <= 1) return text.length > 0 ? '…' : ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export const short = (sha: string): string => sha.slice(0, 7)

export function ago(unixSeconds: number): string {
  if (unixSeconds <= 0) return ''
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds))
  if (seconds < 60) return "à l'instant"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} j`
  if (days < 31) return `${Math.floor(days / 7)} sem`
  if (days < 365) return `${Math.floor(days / 30.44)} mois`
  const years = Math.floor(days / 365.25)
  return `${years} an${years > 1 ? 's' : ''}`
}

export function date(unixSeconds: number): string {
  if (unixSeconds <= 0) return ''
  const when = new Date(unixSeconds * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(when.getDate())}/${pad(when.getMonth() + 1)}/${when.getFullYear()} ${pad(when.getHours())}:${pad(when.getMinutes())}`
}

export const plural = (count: number, word: string): string => `${count} ${word}${count > 1 ? 's' : ''}`

/** A theme color per lane, so lanes follow the person's theme. */
export const LANE_COLORS = ['claude', 'suggestion', 'success', 'warning', 'merged', 'permission', 'planMode'] as const

// Controls

/** Runs a handler, turning a failure into a line where results show. */
export function guard(ctx: Ctx, run: () => unknown): Promise<void> {
  return (async () => {
    try {
      await run()
    } catch (error) {
      await ctx.cmd.inform(`Erreur : ${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  })()
}

export type ButtonOptions = {
  primary?: boolean
  dim?: boolean
  hotkey?: string
  plain?: boolean
  dismiss?: boolean
}

export function button(ctx: Ctx, key: string, label: string, run: () => unknown, options: ButtonOptions = {}): Node {
  const props: ButtonProps = { key, label, onPress: () => guard(ctx, run) }
  if (options.primary) props.variant = 'primary'
  if (options.dim) props.dimColor = true
  if (options.hotkey) props.hotkey = options.hotkey
  if (options.plain) props.plain = true
  if (options.dismiss) props.role = 'dismiss'
  return ctx.ui.Button(props)
}

/** A wrapping row of controls. */
export function bar(ctx: Ctx, children: Node[]): Node {
  const { Box } = ctx.ui
  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
      {children}
    </Box>
  )
}

export type FieldOptions = {
  label?: string
  placeholder?: string
  submitLabel?: string
  initial?: string
  onSubmit: (value: string) => unknown
}

/** A text field whose text lives in the drafts, so redraws keep what was typed. */
export function field(ctx: Ctx, id: string, options: FieldOptions): Node {
  const { Input, Text } = ctx.ui
  if (Input === null) return <Text dimColor>(saisie indisponible sur cette surface)</Text>
  const props: InputProps = {
    key: `in:${id}`,
    value: draft(id, options.initial ?? ''),
    onInput: value => setDraft(id, value),
    onSubmit: value => {
      setDraft(id, value)
      void guard(ctx, () => options.onSubmit(value))
    },
  }
  if (options.label) props.label = options.label
  if (options.placeholder) props.placeholder = options.placeholder
  if (options.submitLabel) props.submitLabel = options.submitLabel
  return Input(props)
}

export type ChoiceOptions = {
  label?: string
  value?: string
  onSelect?: (value: string) => unknown
}

/** A picker whose pick lives in the drafts unless `value` and `onSelect` are given. */
export function choice(ctx: Ctx, id: string, choices: SelectOption[], options: ChoiceOptions = {}): Node {
  const { Select, Text } = ctx.ui
  const unique = choices.filter((one, index) => choices.findIndex(other => other.value === one.value) === index)
  if (unique.length === 0) return null
  if (Select === null) return <Text dimColor>{options.label ?? ''} {unique[0]?.label ?? unique[0]?.value ?? ''}</Text>
  const current = options.value ?? draft(id, unique[0]?.value ?? '')
  const props: SelectProps = {
    key: `sel:${id}`,
    options: unique,
    value: unique.some(one => one.value === current) ? current : (unique[0]?.value ?? ''),
    onSelect: value => {
      setDraft(id, value)
      if (options.onSelect) void guard(ctx, () => options.onSelect?.(value))
    },
  }
  if (options.label) props.label = options.label
  return Select(props)
}

export function picked(ctx: Ctx, id: string, choices: SelectOption[]): string {
  const value = draft(id, choices[0]?.value ?? '')
  return choices.some(one => one.value === value) ? value : (choices[0]?.value ?? '')
}

// Pieces

export function section(ctx: Ctx, title: string, extra: Node[] = []): Node {
  const { Box, Text } = ctx.ui
  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1} marginTop={1}>
      <Text bold>{title}</Text>
      {extra}
    </Box>
  )
}

export function note(ctx: Ctx, text: string): Node {
  const { Text } = ctx.ui
  return <Text dimColor>{line(text)}</Text>
}

/** A commit's refs as colored chips. */
export function chips(ctx: Ctx, refs: string): Node[] {
  const { Text } = ctx.ui
  const remotes = ctx.snap.remotes.map(remote => remote.name)
  return parseRefs(refs, remotes).map(chip => {
    if (chip.kind === 'head') return <Text color="claude" bold>{`(${line(chip.name)}) `}</Text>
    if (chip.kind === 'detached') return <Text color="claude" bold>{'(HEAD) '}</Text>
    if (chip.kind === 'tag') return <Text color="warning">{`<${line(chip.name)}> `}</Text>
    if (chip.kind === 'remote') return <Text color="error">{`(${line(chip.name)}) `}</Text>
    return <Text color="success">{`(${line(chip.name)}) `}</Text>
  })
}

export function chipsWidth(ctx: Ctx, refs: string): number {
  const remotes = ctx.snap.remotes.map(remote => remote.name)
  return parseRefs(refs, remotes).reduce((sum, chip) => sum + chip.name.length + 3, 0)
}

const STATUS_COLOR: Record<string, string> = {
  A: 'success',
  M: 'warning',
  D: 'error',
  R: 'suggestion',
  C: 'suggestion',
  T: 'warning',
  U: 'error',
  '?': 'subtle',
}

export function statusColor(letter: string): string {
  return STATUS_COLOR[letter] ?? 'text'
}

export type HunkAction = { key: string; label: string; run: (patch: string) => unknown }

/** The diff whose key is `key` once loaded: per file, its hunks, each with optional actions. */
export function diffView(ctx: Ctx, diff: GsDiff | null, key: string, actions: HunkAction[] = []): Node {
  const { Box, Code, Text } = ctx.ui
  if (diff === null || diff.key !== key) return <Text dimColor>Chargement du diff…</Text>
  if (diff.text.trim() === '') return <Text dimColor>(aucune différence textuelle)</Text>
  const files = splitDiff(block(diff.text))
  const hasHunks = files.some(file => file.hunks.length > 0)
  if (!hasHunks) return <Code source={block(diff.text)} />
  const isMany = files.length > 1
  return (
    <Box flexDirection="column">
      {files.map((file, fileIndex) => (
        <Box flexDirection="column">
          {isMany ? <Text bold color="suggestion">{line(file.path)}</Text> : null}
          {file.hunks.length === 0 ? <Text dimColor>{line(file.header.split('\n').slice(-1)[0] ?? '')}</Text> : null}
          {actions.length === 0
            ? file.hunks.length > 0 ? <Code format="diff" source={file.hunks.join('\n')} path={file.path} /> : null
            : file.hunks.map((hunk, hunkIndex) => (
                <Box flexDirection="column">
                  {bar(
                    ctx,
                    actions.map(action =>
                      button(ctx, `${action.key}:${fileIndex}:${hunkIndex}`, action.label, () => action.run(hunkPatch(file.header, hunk)), {
                        dim: true,
                      }),
                    ),
                  )}
                  <Code format="diff" source={hunk} path={file.path} />
                </Box>
              ))}
        </Box>
      ))}
      {diff.truncated ? <Text dimColor>… diff tronqué (trop long pour le panneau)</Text> : null}
    </Box>
  )
}
