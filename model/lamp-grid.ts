// The lamp grids (docs/group-representations.md, 案 1; ideas/groups.md),
// as plain data: a permutation shown as its permutation matrix, an n x n
// grid of lamps with two states each, lit or unlit.
//
// Row i is thing i, column j is place j: the lamp (i, j) is lit when
// thing i is at place j. The state is the arrangement of model/group.ts,
// arrangement[place] = the thing at that place, at first the identity
// (the diagonal lit). So every row and every column has exactly one lit
// lamp, whatever the levers did.
//
// A lever is the GROUPS lever (`group-lever`, model/group-lever.ts): its
// cycles are cycles of the places, the columns. [[0, 1]] swaps the lit
// lamps of columns 1 and 2; [[0, 1, 2]] moves the lit lamp of column 1
// to column 2, of 2 to 3 and of 3 to 1. Each lit lamp stays in its row
// (the thing is the same, its place changes). As permutations of the
// places this is the right action of kt3k/group's switch, g -> g·x: from
// e, the grid shows x1·x2·... for the levers pulled x1, x2, ...
//
// No drawing and no props here (model/lamp-room.ts has the lamps), so
// the tools and the tests can use it.
import {
  type Arrangement,
  type Cycles,
  identity,
  pull,
  tokenAt,
} from "./group.ts"

export type { Arrangement, Cycles }

/** The message of a lamp room's door when the lamps match the plaques */
export const LAMPS_TEXT = "THE LAMPS ARE LIT AS ON THE PLAQUES"

/** true if the lamp of row `row` (a thing), column `col` (a place) is lit */
export const isLit = (arr: Arrangement, row: number, col: number): boolean =>
  tokenAt(arr, col) === row

/** The lamps of the n x n grid, row by row: true is lit */
export const lampMatrix = (arr: Arrangement, n: number): boolean[][] =>
  identity(n).map((row) => identity(n).map((col) => isLit(arr, row, col)))

/** true if every row and every column of the grid has exactly one lit lamp */
export function isPermutationMatrix(m: readonly (readonly boolean[])[]) {
  const n = m.length
  for (let k = 0; k < n; k++) {
    if (m[k].length !== n) return false
    if (m[k].filter((lit) => lit).length !== 1) return false
    if (m.filter((row) => row[k]).length !== 1) return false
  }
  return true
}

/** The arrangement of n places, as a key */
export const keyOf = (arr: Arrangement, n: number) =>
  identity(n).map((p) => tokenAt(arr, p)).join(",")

/**
 * Every arrangement the levers reach from e (pulls only, no inverses: a
 * lever pulled its order times comes back, so that is the whole group
 * they generate), each with a shortest word of lever indices, the first
 * found in the levers' order
 */
export function reachable(
  levers: readonly Cycles[],
  n: number,
): Map<string, { arr: number[]; word: number[] }> {
  const start = identity(n)
  const seen = new Map([[keyOf(start, n), {
    arr: start,
    word: [] as number[],
  }]])
  const queue = [start]
  while (queue.length) {
    const arr = queue.shift()!
    const { word } = seen.get(keyOf(arr, n))!
    levers.forEach((cycles, k) => {
      const next = pull(arr, cycles)
      const key = keyOf(next, n)
      if (seen.has(key)) return
      seen.set(key, { arr: next, word: [...word, k] })
      queue.push(next)
    })
  }
  return seen
}

/** The arrangement after pulling the levers of the word (indices), from e */
export const evalLevers = (
  levers: readonly Cycles[],
  word: readonly number[],
  n: number,
): number[] =>
  word.reduce<number[]>((arr, k) => pull(arr, levers[k]), identity(n))

/** true if every two levers give the same grid in either order */
export function commutes(levers: readonly Cycles[], n: number): boolean {
  const all = [...reachable(levers, n).values()].map((r) => r.arr)
  return all.every((a) =>
    all.every((b) => {
      // a·b and b·a, as arrangements: pull b's cycles after a ...
      const ab = composeArr(a, b, n), ba = composeArr(b, a, n)
      return keyOf(ab, n) === keyOf(ba, n)
    })
  )
}

/**
 * a·b: the arrangement of pulling the word of a, then the word of b (b
 * acts on the places of a: the thing at place p in a goes where b sends p)
 */
export function composeArr(a: Arrangement, b: Arrangement, n: number) {
  // b as a permutation of places: b[q] = the place whose thing went to q
  const out: number[] = Array(n)
  for (let q = 0; q < n; q++) out[q] = tokenAt(a, tokenAt(b, q))
  return out
}

/**
 * A target for the room: an arrangement `want` pulls away (or the
 * farthest, if nearer), and, where the levers don't commute, one whose
 * shortest word pulled the other way round lights another pattern (so
 * the order of the pulls matters), as near to `want` pulls as there is
 */
export function pickTarget(
  levers: readonly Cycles[],
  n: number,
  want = 4,
): { arr: number[]; word: number[] } {
  const all = [...reachable(levers, n).values()]
  const far = Math.max(...all.map((r) => r.word.length))
  const d = Math.min(want, far)
  const at = (k: number) => all.filter((r) => r.word.length === k)
  // the nearest distance to the wanted one, down, with an order that matters
  for (let k = d; k > 0; k--) {
    const ordered = at(k).find((r) =>
      keyOf(evalLevers(levers, [...r.word].reverse(), n), n) !==
        keyOf(r.arr, n)
    )
    if (ordered) return ordered
  }
  return at(d)[0]
}

/** The lever's cycles as the signs write them, columns from 1: (1 2)(3 4) */
export const cyclesText = (cycles: Cycles) =>
  cycles.map((c) => `(${c.map((p) => p + 1).join(" ")})`).join("")
