// Small movement helpers shared by the NPC delegates: which way is
// toward a cell, one step away from a threat, and a bounded path search.
import { DIRS, DOWN, LEFT, nextGrid, RIGHT, UP } from "../util/dir.ts"
import type { Actor } from "./actor.ts"
import type { Dir, IField } from "./types.ts"

/**
 * Returns the directions that bring (0, 0) closer to (di, dj), the axis
 * with the larger distance first.
 */
export function dirsToward(di: number, dj: number): Dir[] {
  const dirI: Dir | null = di !== 0 ? (di > 0 ? RIGHT : LEFT) : null
  const dirJ: Dir | null = dj !== 0 ? (dj > 0 ? DOWN : UP) : null
  return (Math.abs(di) >= Math.abs(dj) ? [dirI, dirJ] : [dirJ, dirI]).filter((
    d,
  ): d is Dir => d !== null)
}

/** The manhattan distance between two cells */
export function manhattan(i0: number, j0: number, i1: number, j1: number) {
  return Math.abs(i0 - i1) + Math.abs(j0 - j1)
}

/** Turns the actor toward the given cell (no move) */
export function face(actor: Actor, i: number, j: number) {
  const dir = dirsToward(i - actor.i, j - actor.j)[0]
  if (dir) {
    actor.setDir(dir)
  }
}

/**
 * Takes one step that widens the manhattan distance from (fi, fj):
 * straight away first, then a free sidestep chosen by `pick`. Returns
 * false when cornered (no such step).
 */
export function stepAway(
  actor: Actor,
  field: IField,
  fi: number,
  fj: number,
  pick: (dirs: Dir[]) => Dir,
  speed?: 1 | 2 | 4 | 8 | 16,
): boolean {
  const dist = manhattan(actor.i, actor.j, fi, fj)
  const away = dirsToward(actor.i - fi, actor.j - fj)
  for (const dir of away) {
    const [ni, nj] = actor.nextGrid(dir)
    if (field.canEnter(ni, nj)) {
      actor.tryMove("go", dir, field, undefined, speed)
      return true
    }
  }
  const sideways = DIRS.filter((d) => {
    const [ni, nj] = nextGrid(actor.i, actor.j, d)
    return !away.includes(d) && field.canEnter(ni, nj) &&
      manhattan(ni, nj, fi, fj) > dist
  })
  if (sideways.length > 0) {
    actor.tryMove("go", pick(sideways), field, undefined, speed)
    return true
  }
  return false
}

/**
 * Takes one step toward (ti, tj) through free cells, trying the
 * sideways directions when the straight ones are blocked. Returns false
 * when no step was possible.
 */
export function stepToward(
  actor: Actor,
  field: IField,
  ti: number,
  tj: number,
  speed?: 1 | 2 | 4 | 8 | 16,
): boolean {
  for (const dir of dirsToward(ti - actor.i, tj - actor.j)) {
    const [ni, nj] = actor.nextGrid(dir)
    if (field.canEnter(ni, nj)) {
      actor.tryMove("go", dir, field, undefined, speed)
      return true
    }
  }
  return false
}

/**
 * Breadth first search from (si, sj) to the nearest goal cell over the
 * passable cells, visiting at most `limit` cells. Returns the directions
 * to walk (empty when already at a goal), or null when unreachable.
 */
export function findPath(
  si: number,
  sj: number,
  isGoal: (i: number, j: number) => boolean,
  passable: (i: number, j: number) => boolean,
  limit = 600,
): Dir[] | null {
  if (isGoal(si, sj)) {
    return []
  }
  const from = new Map<string, [number, number, Dir]>()
  const start = `${si}.${sj}`
  const seen = new Set<string>([start])
  const queue: [number, number][] = [[si, sj]]
  for (let n = 0; n < queue.length && n < limit; n++) {
    const [i, j] = queue[n]
    for (const dir of DIRS) {
      const [ni, nj] = nextGrid(i, j, dir)
      const key = `${ni}.${nj}`
      if (seen.has(key) || !passable(ni, nj)) {
        continue
      }
      seen.add(key)
      from.set(key, [i, j, dir])
      if (isGoal(ni, nj)) {
        const path: Dir[] = []
        let k = key
        while (k !== start) {
          const [pi, pj, d] = from.get(k)!
          path.unshift(d)
          k = `${pi}.${pj}`
        }
        return path
      }
      queue.push([ni, nj])
    }
  }
  return null
}
