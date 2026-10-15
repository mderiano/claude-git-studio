/**
 * What the person typed into the pane's fields, kept in the module so typing
 * redraws nothing; a field is drawn with its draft, so any redraw keeps it.
 */
export const drafts: Record<string, string> = {}

export function draft(id: string, fallback = ''): string {
  return drafts[id] ?? fallback
}

export function setDraft(id: string, value: string): void {
  drafts[id] = value
}

export function clearDrafts(...ids: string[]): void {
  for (const id of ids) drafts[id] = ''
}

/** A field holds one line: newlines show as ⏎ and come back on the way out. */
export function toFieldText(text: string): string {
  return text.replace(/\r?\n/g, ' ⏎ ')
}

export function fromFieldText(text: string): string {
  return text.replace(/[ \t]*⏎[ \t]*/g, '\n')
}
