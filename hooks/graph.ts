/**
 * A commit graph drawn one row per commit, as tig does: each lane takes two
 * columns (its glyph, then the connector to the next lane), a commit is `●`
 * (`○` for a merge), and lanes that fork or join turn with box-drawing corners.
 */

export type GraphCell = { ch: string; color: number }
export type GraphRow = GraphCell[]

type Dirs = { up: boolean; down: boolean; left: boolean; right: boolean }

const GLYPHS: Record<string, string> = {
  '1100': '│',
  '0011': '─',
  '1111': '┼',
  '1010': '╯',
  '1001': '╰',
  '0110': '╮',
  '0101': '╭',
  '1110': '┤',
  '1101': '├',
  '1011': '┴',
  '0111': '┬',
  '1000': '╵',
  '0100': '╷',
  '0010': '─',
  '0001': '─',
  '0000': ' ',
}

function glyph(dirs: Dirs): string {
  const key = `${+dirs.up}${+dirs.down}${+dirs.left}${+dirs.right}`
  return GLYPHS[key] ?? ' '
}

export type GraphCommit = { sha: string; parents: readonly string[] }

/** Lanes are colored by the order they opened in; `colors` is how many there are. */
export function buildGraph(commits: readonly GraphCommit[], colors = 7): GraphRow[] {
  let lanes: (string | null)[] = []
  let laneColors: number[] = []
  let opened = 0
  const rows: GraphRow[] = []

  for (const commit of commits) {
    const before = lanes.slice()
    const beforeColors = laneColors.slice()
    let col = lanes.indexOf(commit.sha)
    if (col === -1) {
      col = lanes.indexOf(null)
      if (col === -1) {
        col = lanes.length
        lanes.push(null)
        laneColors.push(0)
      }
      laneColors[col] = opened++ % colors
      before[col] = null
    }

    const converging: number[] = []
    lanes.forEach((sha, index) => {
      if (index !== col && sha === commit.sha) converging.push(index)
    })
    for (const index of converging) lanes[index] = null

    const [first, ...rest] = commit.parents
    lanes[col] = first ?? null

    const targets: number[] = []
    for (const parent of rest) {
      let lane = lanes.indexOf(parent)
      if (lane === -1) {
        lane = -1
        for (let index = col + 1; index < lanes.length; index++) {
          if (lanes[index] === null && !converging.includes(index)) {
            lane = index
            break
          }
        }
        if (lane === -1) {
          lane = lanes.length
          lanes.push(null)
          laneColors.push(0)
        }
        lanes[lane] = parent
        laneColors[lane] = opened++ % colors
      }
      targets.push(lane)
    }

    const width = Math.max(before.length, lanes.length, col + 1)
    const dirs: Dirs[] = Array.from({ length: width }, (_, index) => ({
      up: (before[index] ?? null) !== null,
      down: (lanes[index] ?? null) !== null,
      left: false,
      right: false,
    }))
    const bridge: (number | null)[] = Array.from({ length: width }, () => null)
    const color = (index: number): number => laneColors[index] ?? beforeColors[index] ?? 0

    const join = (end: number, endColor: number): void => {
      const low = Math.min(col, end)
      const high = Math.max(col, end)
      for (let index = low + 1; index < high; index++) {
        const cell = dirs[index]
        if (cell) {
          cell.left = true
          cell.right = true
        }
      }
      for (let index = low; index < high; index++) {
        if (bridge[index] === null) bridge[index] = endColor
      }
      const cell = dirs[end]
      if (cell) {
        if (end > col) cell.left = true
        else cell.right = true
      }
    }
    for (const index of converging) join(index, beforeColors[index] ?? 0)
    for (const index of targets) join(index, color(index))

    const row: GraphRow = []
    for (let index = 0; index < width; index++) {
      if (index === col) {
        row.push({ ch: commit.parents.length > 1 ? '○' : '●', color: color(col) })
      } else {
        const cell = dirs[index] ?? { up: false, down: false, left: false, right: false }
        const isVertical = cell.up || cell.down
        const ownColor = isVertical ? (cell.down ? color(index) : (beforeColors[index] ?? 0)) : (bridge[index] ?? bridge[index - 1] ?? 0)
        row.push({ ch: glyph(cell), color: ownColor })
      }
      const link = bridge[index] ?? null
      row.push({ ch: link === null ? ' ' : '─', color: link ?? 0 })
    }
    while (row.length > 0 && row[row.length - 1]?.ch === ' ') row.pop()
    rows.push(row)

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop()
      laneColors.pop()
    }
    lanes = lanes.slice()
    laneColors = laneColors.slice()
  }
  return rows
}

/** The row as plain text, for tests and narrow surfaces. */
export function graphText(row: GraphRow): string {
  return row.map(cell => cell.ch).join('')
}
