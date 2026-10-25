// The statue's gaze (ideas/goal-types.md, 視線を通す): a statue (a moai
// head sunk to the chin) on the open land looking straight ahead at two
// trunkless legs of stone a few cells off, the line between cluttered. One rule more: the statue sees straight
// ahead, and anything solid in the line blocks it (a tree, a rock, an
// upright bush, a stone, a boulder; water and the ground don't). Clear
// the line and the statue sees the legs (model/gaze.ts). The trick
// is in getting each thing out of the line: pushed out sideways where a
// side is open (and a place to push from), sunk in a pool on the line,
// crushed by a boulder that rolls on into the water, the bushes pushed
// flat, from the terrain and the one-line rules alone, as for the
// missing ring (tools/rings.ts).
//
// A gaze is a patch of the map as a ring is (13x11, the outermost cells
// open ground left as it was), drawn at random and solved by the ring's
// simulator, which knows the statue ("E") and the legs ("T"). Kept
// are those that take 2 to 6 pushes with a signature beyond "push" and
// "bush" alone.
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

export type Gaze = Layout & {
  /** A shortest solution (U D L R moves), the fewest pushes */
  solution: string
  /** How many pushes (and bushes flattened) it takes at the fewest */
  pushes: number
  /** The rules every solution uses */
  signature: Rule[]
  /** Where the statue looks: U D L R */
  dir: "up" | "down" | "left" | "right"
  /** Where the reward appears: by the statue, walked to from the start */
  reward: [number, number]
}

/** The patch's size (a ring's), the open margin included */
export const GAZE_W = RING_W
export const GAZE_H = RING_H

type Rng = { rng: () => number; randomInt: (n: number) => number }

/** U D L R */
const D4: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]
const DIRS = ["up", "down", "left", "right"] as const

/**
 * What a draft leans to: the line walled in on both sides, a pool on it
 * to sink what is in the way (pool); walled in, with a gap here and
 * there to push things out through (gaps); hedged with bushes (hedge);
 * or a bit of everything (mix)
 */
export type GazeAim = "pool" | "gaps" | "hedge" | "mix"
export const GAZE_AIMS: readonly GazeAim[] = ["pool", "gaps", "hedge", "mix"]

/** A patch drawn at random (not checked yet) */
export function draftGaze(
  { rng, randomInt }: Rng,
  aim: GazeAim = GAZE_AIMS[randomInt(GAZE_AIMS.length)],
): Layout {
  const W = GAZE_W, H = GAZE_H
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
  // the statue and the legs, len cells apart
  let ex = 0, ey = 0, d = 0, len = 0
  for (let n = 0; n < 100; n++) {
    d = randomInt(4)
    len = 4 + randomInt(5)
    ex = 1 + randomInt(W - 2), ey = 1 + randomInt(H - 3)
    const tx = ex + D4[d][0] * len, ty = ey + D4[d][1] * len
    if (inner(tx, ty) && ty < H - 2) break
  }
  const [dx, dy] = D4[d]
  /** The k-th cell of the line (0: the statue, len: the legs) */
  const line = (k: number): [number, number] => [ex + dx * k, ey + dy * k]
  const side = (k: number, s: number): [number, number] => [
    ex + dx * k + dy * s,
    ey + dy * k + dx * s,
  ]
  g[ey][ex] = "E"
  g[line(len)[1]][line(len)[0]] = "T"
  for (let k = 0; k <= len; k++) keep(...line(k))
  const mix = aim === "mix"
  const sideOf = (): string => {
    const r = rng()
    if (aim === "hedge" || (mix && r < 0.3)) return r < 0.6 ? "k" : "#"
    if (aim === "gaps") return r < 0.75 ? "#" : "."
    return r < 0.65 ? "#" : r < 0.8 ? "w" : "."
  }
  // the walls either side of the line
  for (let k = 1; k < len; k++) {
    for (const s of [1, -1]) {
      const [x, y] = side(k, s)
      set(x, y, sideOf())
      keep(x, y)
    }
  }
  // a pool on the line (sight goes over water)
  if (aim === "pool" || (mix && rng() < 0.5)) {
    const k = 1 + randomInt(len - 1)
    const [x, y] = line(k)
    g[y][x] = "w"
    if (rng() < 0.4 && k + 1 < len) {
      const [x2, y2] = line(k + 1)
      g[y2][x2] = "w"
    }
  }
  // what is in the way, on the line
  const things: Thing[] = []
  const putThing = (x: number, y: number, kind: ThingKind) => {
    if (!inner(x, y) || (g[y][x] !== "." && g[y][x] !== "i")) return false
    if (things.some((t) => t.x === x && t.y === y)) return false
    things.push({ kind, x, y })
    return true
  }
  const blocks = 1 + randomInt(3)
  for (let n = 0, tries = 0; n < blocks && tries < 30; tries++) {
    const k = 1 + randomInt(len - 1)
    const [x, y] = line(k)
    if (g[y][x] !== ".") continue
    const r = rng()
    if (r < 0.2 && aim !== "pool") g[y][x] = "k"
    else if (!putThing(x, y, r < 0.65 ? "stone" : "boulder")) continue
    n++
  }
  // a spare thing or two near (to sink, or to roll in)
  for (let n = randomInt(3); n > 0; n--) {
    for (let m = 0; m < 20; m++) {
      const x = 1 + randomInt(W - 2), y = 1 + randomInt(H - 2)
      if (free(x, y) && putThing(x, y, rng() < 0.5 ? "stone" : "boulder")) {
        break
      }
    }
  }
  // a sheet of ice, sometimes
  if (mix && rng() < 0.5) {
    const w = 2 + randomInt(4), h = 2 + randomInt(3)
    const x0 = 1 + randomInt(W - 2), y0 = 1 + randomInt(H - 3)
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) if (free(x, y)) g[y][x] = "i"
    }
  }
  // a few loose trees, rocks, bushes and puddles
  const scatter = (c: string, m: number) => {
    for (let n = 0; n < m; n++) {
      const x = 1 + randomInt(W - 2), y = 1 + randomInt(H - 2)
      if (free(x, y) && !things.some((t) => t.x === x && t.y === y)) {
        g[y][x] = c
      }
    }
  }
  scatter("#", 1 + randomInt(4))
  scatter("k", randomInt(3))
  scatter("w", randomInt(2))
  return { rows: g.map((row) => row.join("")), things, start: [W >> 1, H - 1] }
}

/** The fewest and most pushes a gaze may take */
export const GAZE_MIN_PUSHES = 2
export const GAZE_MAX_PUSHES = MAX_PUSHES

/** The signatures of a line too easy to clear */
const EASY = new Set(["-", "push", "bush"])

/** Where the statue of the layout looks */
export function dirOf(layout: Layout): Gaze["dir"] {
  const w = layout.rows[0].length
  const cells = layout.rows.join("")
  const e = cells.indexOf("E"), t = cells.indexOf("T")
  const dx = Math.sign(t % w - e % w)
  const dy = Math.sign(Math.floor(t / w) - Math.floor(e / w))
  return DIRS[D4.findIndex(([x, y]) => x === dx && y === dy)]
}

/** Checks a draft: a gaze when it's good, null when it's thrown away */
export function acceptGaze(layout: Layout): Gaze | null {
  const solved = solve(layout)
  if (!solved) return null
  if (solved.pushes < GAZE_MIN_PUSHES || solved.pushes > GAZE_MAX_PUSHES) {
    return null
  }
  const sig = signature(layout)
  if (!sig || EASY.has(sigName(sig))) return null
  // the reward: by the statue, where you can walk from the start
  const w = layout.rows[0].length
  const reach = walked(layout)
  const e = layout.rows.join("").indexOf("E")
  const ex = e % w, ey = Math.floor(e / w)
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
    const x = ex + ox, y = ey + oy
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
    dir: dirOf(layout),
    reward,
  }
}
