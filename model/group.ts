// The group of a puzzle run by levers (model/group-lever.ts,
// ideas/groups.md), as plain data: an arrangement of tokens on places,
// and levers moving them along cycles. Pulling x in the arrangement g
// gives g·x (the permutations of the places composed), so from e the
// arrangement is the product of the levers pulled, as kt3k/group's switch.
// The Moai's pose (its facing and its mirror state, the 8 of D4) is read
// from the arrangement of its four sides on the four world places.
import type { Dir } from "./types.ts"

// ---------------------------------------------------------------------
// arrangements and levers (pure)

/** arrangement[place] = the token at that place */
export type Arrangement = readonly number[]
/** Where things go: [[a, b, c]] moves a -> b -> c -> a */
export type Cycles = readonly (readonly number[])[]

/** The identity arrangement of n places */
export const identity = (n: number): number[] => [...Array(n).keys()]

/** How many places the cycles touch (the largest place + 1) */
export const placesOf = (cycles: Cycles): number =>
  Math.max(0, ...cycles.flat().map((p) => p + 1))

/** The token at the place (places never touched hold their own token) */
export const tokenAt = (arr: Arrangement, place: number): number =>
  arr[place] ?? place

/** The arrangement after pulling a lever of the cycles */
export function pull(arr: Arrangement, cycles: Cycles): number[] {
  const n = Math.max(arr.length, placesOf(cycles))
  const out = identity(n).map((p) => tokenAt(arr, p))
  for (const cycle of cycles) {
    cycle.forEach((from, k) => {
      out[cycle[(k + 1) % cycle.length]] = tokenAt(arr, from)
    })
  }
  return out
}

/** The arrangement after pulling the levers in order, from e */
export const pullAll = (levers: readonly Cycles[], n = 0): number[] =>
  levers.reduce<number[]>((arr, cycles) => pull(arr, cycles), identity(n))

/** true if the two arrangements put the same token at every place */
export function same(a: Arrangement, b: Arrangement): boolean {
  const n = Math.max(a.length, b.length)
  for (let p = 0; p < n; p++) {
    if (tokenAt(a, p) !== tokenAt(b, p)) return false
  }
  return true
}

/** true if every token is at its own place (e) */
export const isIdentity = (arr: Arrangement): boolean =>
  arr.every((t, p) => t === p)

/** How many pulls of the lever bring the arrangement back to e */
export function orderOf(cycles: Cycles): number {
  let arr = pull([], cycles)
  let n = 1
  while (!isIdentity(arr)) {
    arr = pull(arr, cycles)
    n++
  }
  return n
}

// ---------------------------------------------------------------------
// the Moai's pose

/** The world places of the Moai's sides: up, right, down, left (clockwise) */
export const MOAI_PLACES: readonly Dir[] = ["up", "right", "down", "left"]
/**
 * The Moai's sides, the tokens: at the start it faces down (its face at
 * place 2), its right at the left (3), its back up (0), its left right (1)
 */
export const MOAI_FACE = 2, MOAI_RIGHT = 3
/** The Moai's turn lever: a quarter turn clockwise (seen from above) */
export const TURN: Cycles = [[0, 1, 2, 3]]
/** The Moai's mirror lever: its left and right swapped (the world's) */
export const MIRROR: Cycles = [[1, 3]]

/** Where the Moai of the arrangement faces, and if it is mirrored */
export function moaiPose(arr: Arrangement): { dir: Dir; mirrored: boolean } {
  const placeOf = (token: number) =>
    [0, 1, 2, 3].find((p) => tokenAt(arr, p) === token) ?? token
  const face = placeOf(MOAI_FACE)
  return {
    dir: MOAI_PLACES[face],
    // unmirrored, its right is a quarter turn clockwise from its face
    mirrored: placeOf(MOAI_RIGHT) !== (face + 1) % 4,
  }
}

/** The growth stage of a pose: up, right, down, left; then mirrored +1 */
export function poseStage(arr: Arrangement): number {
  const { dir, mirrored } = moaiPose(arr)
  return MOAI_PLACES.indexOf(dir) * 2 + (mirrored ? 1 : 0)
}

/**
 * The stages of the mural (`group-mural`): the 6 patterns of the stones,
 * then the 8 poses of the Moai (from MURAL_POSE, by poseStage), then the
 * plaque of the odd one out and the plaque lit
 */
export const MURAL_POSE = 6
export const MURAL_PLAQUE = 14
