// The arrangements of the odd one out (model/odd-one.ts; ideas/
// goal-types.md, 1 つだけ違う): for each family a small and plainly
// regular arrangement of the same thing (a row, a ring, a grid), one
// member of it the odd one, and the cell by it where the reward appears.
// tools/generate_wilds.ts places them on the open land.
import { ODD_FAMILIES, type OddFamily } from "../model/odd-families.ts"

type Rng = { randomInt(n: number): number }

/** An arrangement: its members' cells, which is odd, the reward cell */
export type Arrangement = {
  family: OddFamily
  /** The members (cells from the top left of the arrangement) */
  cells: [number, number][]
  /** The index of the odd one among the cells */
  odd: number
  /** Where the reward appears: a free cell by the odd one */
  reward: [number, number]
  /** The size of the arrangement (cells) */
  w: number
  h: number
}

/** A row of n, `gap` cells apart, across or down */
const row = (n: number, gap: number, down: boolean) =>
  Array.from(
    { length: n },
    (_, k) => (down ? [0, k * gap] : [k * gap, 0]) as [number, number],
  )

/** A grid of cols x rows, every other cell */
const grid = (cols: number, rows: number) =>
  Array.from(
    { length: cols * rows },
    (_, k) => [(k % cols) * 2, Math.floor(k / cols) * 2] as [number, number],
  )

/** A fairy ring of 8 in 5x5, open between them (the middle can be walked) */
const FAIRY_RING: [number, number][] = [
  [1, 0],
  [3, 0],
  [4, 1],
  [4, 3],
  [3, 4],
  [1, 4],
  [0, 3],
  [0, 1],
]

/** The members of a family's arrangement (drawn: length, direction) */
export function shapeOf(rng: Rng, family: OddFamily): [number, number][] {
  const down = rng.randomInt(2) === 1
  switch (family) {
    case "tulip":
      return row(5 + rng.randomInt(2), 1, down)
    case "toadstool":
      return FAIRY_RING
    case "stonebird":
      return down ? grid(2, 3) : grid(3, 2)
    case "menhir":
      return row(4 + rng.randomInt(2), 2, down)
    case "post":
      return row(6 + rng.randomInt(2), 1, down)
    case "cairn":
      return row(4, 2, down)
    case "arrowstone":
      return grid(3, 3)
  }
}

/**
 * The arrangement of a family: its shape, one member the odd one (never
 * the first or the last of a row, so that the row reads before it) and
 * the reward cell by it: a corner-wise neighbour off the arrangement
 * (where the player who bumped into it doesn't stand), inside its bounds
 * and the one cell around them
 */
export function arrange(rng: Rng, family: OddFamily): Arrangement {
  const cells = shapeOf(rng, family)
  const w = Math.max(...cells.map(([x]) => x)) + 1
  const h = Math.max(...cells.map(([, y]) => y)) + 1
  const isRow = w === 1 || h === 1
  const odd = isRow
    ? 1 + rng.randomInt(cells.length - 2)
    : rng.randomInt(cells.length)
  const [ox, oy] = cells[odd]
  const member = (x: number, y: number) =>
    cells.some(([cx, cy]) => cx === x && cy === y)
  const corners: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
  const free = corners
    .map(([dx, dy]) => [ox + dx, oy + dy] as [number, number])
    .filter(([x, y]) => !member(x, y) && x >= -1 && y >= -1 && x <= w && y <= h)
  const reward = free[rng.randomInt(free.length)]
  return { family, cells, odd, reward, w, h }
}

export { ODD_FAMILIES }
