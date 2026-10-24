// The dais to clear (ideas/goal-types.md, 空ける): a carved stone dais
// on the open land, a stone or a boulder sitting on it. Get it off and
// the dais is clear (model/clear.ts). Not putting but taking away; the
// trick is in where you can push it from: the dais sits in a nook, and a
// push from the way in only jams the thing against the back. The way
// behind it, or another way to knock it off, changes from dais to dais,
// from the terrain and the one-line rules alone, as for the missing ring
// (tools/rings.ts). No new rule.
//
// A dais is a patch of the map as a ring is (13x11, the outermost cells
// open ground left as it was), drawn at random and solved by the ring's
// simulator, which knows the dais ("D": the first thing of the layout
// sits on it; done when nothing is on it any more). Kept are those that
// take 2 to 6 pushes with a signature beyond "push".
import {
  type Layout,
  MAX_PUSHES,
  RING_H,
  RING_W,
  type Rule,
  sigName,
  signature,
  solve,
  type Thing,
  type ThingKind,
  walked,
} from "./rings.ts"

export type Clear = Layout & {
  /** A shortest solution (U D L R moves), the fewest pushes */
  solution: string
  /** How many pushes (and bushes flattened) it takes at the fewest */
  pushes: number
  /** The rules every solution uses */
  signature: Rule[]
  /** What sits on the dais */
  sits: ThingKind
  /** Where the reward appears: by the dais, walked to from the start */
  reward: [number, number]
}

/** The patch's size (a ring's), the open margin included */
export const CLEAR_W = RING_W
export const CLEAR_H = RING_H

/**
 * What a draft leans to: the back of the nook a bush, to be flattened
 * from behind (hedge); the dais between waters, front and back, to be
 * stood by once something is sunk (islet); or either with a sheet of
 * ice on the way (mix). (A back of open ground, or of water, lets a push
 * from the front clear the dais at once.)
 */
export type ClearAim = "hedge" | "islet" | "mix"
export const CLEAR_AIMS: readonly ClearAim[] = ["hedge", "islet", "mix"]

type Rng = { rng: () => number; randomInt: (n: number) => number }

/** U D L R */
const D4: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]

/**
 * A patch drawn at random (not checked yet): the dais in a nook (rocks
 * either side), a thing on it, its way in (the front) and its back, and
 * what makes the back hard to stand in
 */
export function draftClear(
  { rng, randomInt }: Rng,
  aim: ClearAim = CLEAR_AIMS[randomInt(CLEAR_AIMS.length)],
): Layout {
  const W = CLEAR_W, H = CLEAR_H
  const g: string[][] = Array.from({ length: H }, () => Array(W).fill("."))
  const inner = (x: number, y: number) =>
    x >= 1 && y >= 1 && x < W - 1 && y < H - 1
  const reserved = new Set<string>()
  const keep = (x: number, y: number) => reserved.add(`${x},${y}`)
  const free = (x: number, y: number) =>
    inner(x, y) && g[y][x] === "." && !reserved.has(`${x},${y}`)
  const set = (x: number, y: number, c: string) => {
    if (inner(x, y) && g[y][x] === ".") g[y][x] = c
  }
  const at = (x: number, y: number, c: string) => {
    if (inner(x, y)) g[y][x] = c
    keep(x, y)
  }
  const mix = aim === "mix"
  if (mix) aim = rng() < 0.5 ? "hedge" : "islet"
  const dx = 3 + randomInt(W - 6), dy = 2 + randomInt(H - 5)
  const [fx, fy] = D4[randomInt(4)]
  /** k cells out to the front (negative: to the back) */
  const out = (k: number): [number, number] => [dx + fx * k, dy + fy * k]
  /** The cell s to the side of the k-th out */
  const side = (k: number, s: number): [number, number] => [
    dx + fx * k + fy * s,
    dy + fy * k + fx * s,
  ]
  g[dy][dx] = "D"
  keep(dx, dy)
  const sits: ThingKind = rng() < 0.55 ? "stone" : "boulder"
  const things: Thing[] = [{ kind: sits, x: dx, y: dy }]
  const putThing = (x: number, y: number, kind: ThingKind) => {
    if (!inner(x, y) || (g[y][x] !== "." && g[y][x] !== "i")) return false
    if (things.some((t) => t.x === x && t.y === y)) return false
    things.push({ kind, x, y })
    keep(x, y)
    return true
  }
  const kind = (stone: number): ThingKind => rng() < stone ? "stone" : "boulder"
  // the nook: rocks either side of the dais (and of the back, often)
  for (const s of [1, -1]) {
    at(...side(0, s), "#")
    if (rng() < 0.7) at(...side(-1, s), "#")
  }
  keep(...out(1))
  if (aim === "hedge") {
    // the back a bush; behind it, a way round that is closed here and
    // there
    at(...out(-1), "k")
    for (const s of [1, -1, 0]) {
      if (rng() < 0.5) set(...side(-2, s), rng() < 0.6 ? "#" : "k")
    }
    for (const s of [2, -2]) if (rng() < 0.5) set(...side(-1, s), "#")
  } else if (aim === "islet") {
    // water in front and behind (and round, often): something to sink
    at(...out(1), "w")
    at(...out(-1), "w")
    for (const s of [1, -1]) {
      if (rng() < 0.6) set(...side(1, s), "w")
      if (rng() < 0.6) set(...side(-1, s), "w")
    }
    if (rng() < 0.5) set(...out(2), "w")
    for (let n = 1 + randomInt(2); n > 0; n--) {
      for (let m = 0; m < 20; m++) {
        const k = 2 + randomInt(3), s = randomInt(5) - 2
        const [x, y] = rng() < 0.5 ? side(k, s) : side(-k, s)
        if (free(x, y) && putThing(x, y, kind(0.6))) break
      }
    }
  }
  if (mix) {
    // a sheet of ice on the way round
    const w = 2 + randomInt(4), h = 2 + randomInt(3)
    const [x0, y0] = side(-2 - randomInt(2), randomInt(5) - 2)
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (free(x, y)) g[y][x] = "i"
      }
    }
  }
  // a few loose trees, rocks, bushes and puddles
  const scatter = (c: string, m: number) => {
    for (let n = 0; n < m; n++) {
      const x = 1 + randomInt(W - 2), y = 1 + randomInt(H - 2)
      if (free(x, y)) g[y][x] = c
    }
  }
  scatter("#", 1 + randomInt(4))
  scatter("k", randomInt(3))
  scatter("w", randomInt(2))
  return { rows: g.map((row) => row.join("")), things, start: [W >> 1, H - 1] }
}

/** The fewest and most pushes a dais may take */
export const CLEAR_MIN_PUSHES = 2
export const CLEAR_MAX_PUSHES = MAX_PUSHES

/** Checks a draft: a dais when it's good, null when it's thrown away */
export function acceptClear(layout: Layout): Clear | null {
  const solved = solve(layout)
  if (!solved) return null
  if (solved.pushes < CLEAR_MIN_PUSHES || solved.pushes > CLEAR_MAX_PUSHES) {
    return null
  }
  const sig = signature(layout)
  if (!sig || sig.length === 0 || sigName(sig) === "push") return null
  // the reward: by the dais, where you can walk from the start
  const w = layout.rows[0].length
  const reach = walked(layout)
  const dais = layout.rows.join("").indexOf("D")
  const dx = dais % w, dy = Math.floor(dais / w)
  const near: [number, number][] = []
  for (let y = -3; y <= 3; y++) {
    for (let x = -3; x <= 3; x++) {
      if (Math.max(Math.abs(x), Math.abs(y)) >= 2) near.push([x, y])
    }
  }
  near.sort((a, b) =>
    Math.max(Math.abs(a[0]), Math.abs(a[1])) -
      Math.max(Math.abs(b[0]), Math.abs(b[1])) ||
    Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1]) ||
    a[1] - b[1] || a[0] - b[0]
  )
  let reward: [number, number] | null = null
  for (const [ox, oy] of near) {
    const x = dx + ox, y = dy + oy
    if (layout.rows[y]?.[x] !== ".") continue
    if (!reach.has(y * w + x)) continue
    if (layout.things.some((t) => t.x === x && t.y === y)) continue
    reward = [x, y]
    break
  }
  if (!reward) return null
  return {
    ...layout,
    solution: solved.moves,
    pushes: solved.pushes,
    signature: sig,
    sits: layout.things[0].kind,
    reward,
  }
}

/** Draws patches until one is good (at most `tries`) */
export function makeClear(r: Rng, tries = 200): Clear | null {
  for (let n = 0; n < tries; n++) {
    const clear = acceptClear(draftClear(r))
    if (clear) return clear
  }
  return null
}
