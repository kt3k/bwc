// The bell out of reach (ideas/goal-types.md, 鐘を鳴らす): a bell on the
// open land where the player can't get to it, on an islet in a pond, on
// a sheet of ice, behind rocks. One rule more: the bell rings when
// anything bumps into it (model/bell.ts). Find what can get there: a
// boulder rolled at it, a stone slid over the ice, a way made through
// the water to walk up and knock on it yourself. The trick changes from
// bell to bell, from the terrain and the one-line rules alone, as the
// missing ring's does (tools/rings.ts).
//
// A bell is a patch of the map as a ring is (13x11, the outermost cells
// open ground left as it was), drawn at random and solved by the
// ring's simulator, which knows the bell ("A"): a thing that bumps into
// it, and the player bumping into it or sliding into it over the ice,
// ring it. A bell that walking up to and knocking on rings (a push or
// less), that a single push rings, or that wants nothing but walking,
// pushing a stone or flattening bushes (the signatures "-", "push",
// "bush", "push+bush") is thrown away: it is not out of reach.
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

export type Bell = Layout & {
  /** A shortest solution (U D L R moves), the fewest pushes */
  solution: string
  /** How many pushes (bushes flattened, bumps) it takes at the fewest */
  pushes: number
  /** The rules every solution uses */
  signature: Rule[]
  /** What rings the bell in the solution */
  by: ThingKind
  /** Where the reward appears: by the bell, walked to from the start */
  reward: [number, number]
}

/** The patch's size (a ring's), the open margin included */
export const BELL_W = RING_W
export const BELL_H = RING_H

/**
 * What a draft leans to: the bell on an islet in a pond (isle), in a
 * hedge of bushes (hedge), behind rocks with a gap of water or bushes
 * (wall), with a lane of ice to it (ice), or a bit of everything (mix).
 * The signature is what the solver finds, not this
 */
export type BellAim = "isle" | "hedge" | "wall" | "ice" | "mix"
export const BELL_AIMS: readonly BellAim[] = [
  "isle",
  "hedge",
  "wall",
  "ice",
  "mix",
]

type Rng = { rng: () => number; randomInt: (n: number) => number }

/** U D L R */
const D4: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]

/**
 * A patch drawn at random (not checked yet). The bell is closed in (a
 * pond, bushes, rocks), and a way to it is chosen: the line a thing
 * comes in on. On it, beyond the barrier, the things lean to lie: one
 * to go in first (sunk in the water, to be rolled over) and one to ring
 * the bell, or one a cell off the line (pushed onto it first), or one to
 * bank off a rock onto it. The rest is left to chance
 */
export function draftBell(
  { rng, randomInt }: Rng,
  aim: BellAim = BELL_AIMS[randomInt(BELL_AIMS.length)],
): Layout {
  const W = BELL_W, H = BELL_H
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
  // the bell, and the way in: k = 1 is the cell by the bell
  const bx = 3 + randomInt(W - 6), by = 2 + randomInt(H - 6)
  g[by][bx] = "A"
  keep(bx, by)
  const d = randomInt(4)
  const [ox, oy] = D4[d]
  const line = (k: number): [number, number] => [bx + ox * k, by + oy * k]
  /** Inside the margin, how far the line goes */
  let room = 1
  while (inner(...line(room + 1))) room++
  const things: Thing[] = []
  const putThing = (x: number, y: number, kind: ThingKind) => {
    if (!inner(x, y) || (g[y][x] !== "." && g[y][x] !== "i")) return false
    if (things.some((t) => t.x === x && t.y === y)) return false
    things.push({ kind, x, y })
    keep(x, y)
    return true
  }
  const kind = (stone: number): ThingKind => rng() < stone ? "stone" : "boulder"
  const mix = aim === "mix"
  const pick = <T>(xs: T[]) => xs[randomInt(xs.length)]
  // the barrier round the bell, r cells out; on the line, what is in the
  // way (water to fill, a bush to flatten for a boulder, or open)
  const barrier: BellAim = mix || aim === "ice"
    ? pick(["isle", "hedge", "wall"])
    : aim
  const r = barrier === "hedge" ? 1 : rng() < 0.6 ? 1 : 2
  const islet = barrier === "isle" && r === 2 && rng() < 0.5
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dy))
      const x = bx + dx, y = by + dy
      keep(x, y)
      if (ring === 0) continue
      if (barrier === "isle") {
        if (!islet || ring === r) set(x, y, "w")
      } else if (barrier === "hedge") {
        set(x, y, rng() < 0.75 ? "k" : "#")
      } else if (ring === r) set(x, y, "#")
      else if (rng() < 0.4) set(x, y, "w")
    }
  }
  // the way in through the barrier
  const gate = rng()
  for (let k = 1; k <= r; k++) {
    const [x, y] = line(k)
    if (barrier === "wall" && k === r) {
      g[y][x] = gate < 0.5 ? "w" : gate < 0.8 ? "k" : "."
    } else if (barrier === "hedge") g[y][x] = gate < 0.7 ? "k" : "w"
  }
  // a lane of ice up to the barrier (or over the islet)
  const lane = aim === "ice" || (mix && rng() < 0.5)
  if (lane) {
    const from = r + 1, to = Math.min(room, r + 2 + randomInt(4))
    for (let k = from; k <= to; k++) {
      const [x, y] = line(k)
      if (inner(x, y) && g[y][x] === ".") g[y][x] = "i"
      // its sides: ice too, or closed
      for (const side of [1, -1]) {
        const sx = x + oy * side, sy = y + ox * side
        if (!free(sx, sy)) continue
        const c = rng()
        g[sy][sx] = c < 0.35 ? "i" : c < 0.6 ? "#" : c < 0.75 ? "w" : "."
      }
    }
  }
  for (let k = 1; k <= room; k++) keep(...line(k))
  // the things on the line, beyond the barrier: one to go in first and
  // one to ring the bell
  const water = barrier === "isle" || g[line(r)[1]][line(r)[0]] === "w"
  const sinks = barrier === "isle" ? (islet ? 1 : r) : water ? 1 : 0
  let k = r + 1 + randomInt(2)
  for (let n = 0; n < sinks && k <= room; n++) {
    if (rng() < 0.7) putThing(...line(k), kind(0.6))
    else {
      // a cell off the line, pushed onto it first
      const side = rng() < 0.5 ? 1 : -1
      const [x, y] = line(k)
      putThing(x + oy * side, y + ox * side, kind(0.7))
    }
    k += 2 + randomInt(2)
  }
  if (k <= room && rng() < 0.6) putThing(...line(k), kind(lane ? 0.6 : 0.35))
  else {
    // a boulder banked off a rock onto the line (or a stone pushed on)
    const kk = Math.min(room, r + 2 + randomInt(3))
    const [x, y] = line(kk)
    const side = rng() < 0.5 ? 1 : -1
    const [px, py] = [oy * side, ox * side]
    const m = 2 + randomInt(3)
    if (inner(x - px, y - py) && free(x - px, y - py) && rng() < 0.6) {
      g[y - py][x - px] = "#"
    }
    if (!putThing(x + px * m, y + py * m, kind(0.2))) {
      putThing(x + px, y + py, "stone")
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
  // and a spare, sometimes
  if (rng() < 0.3) {
    for (let n = 0; n < 20; n++) {
      const x = 1 + randomInt(W - 2), y = 1 + randomInt(H - 2)
      if (free(x, y) && putThing(x, y, kind(0.5))) break
    }
  }
  return { rows: g.map((row) => row.join("")), things, start: [W >> 1, H - 1] }
}

/** The fewest and most pushes a bell may take */
export const BELL_MIN_PUSHES = 2
export const BELL_MAX_PUSHES = MAX_PUSHES

/** The signatures of a bell that is not out of reach */
const IN_REACH = new Set(["-", "push", "bush", "push+bush"])

/** Checks a draft: a bell when it's good, null when it's thrown away */
export function acceptBell(layout: Layout): Bell | null {
  const solved = solve(layout)
  if (!solved) return null
  if (solved.pushes < BELL_MIN_PUSHES || solved.pushes > BELL_MAX_PUSHES) {
    return null
  }
  const w = layout.rows[0].length
  const reach = walked(layout)
  const bell = layout.rows.join("").indexOf("A")
  const bx = bell % w, by = Math.floor(bell / w)
  // out of reach: no cell by the bell is walked to from the start
  if (D4.some(([dx, dy]) => reach.has((by + dy) * w + bx + dx))) return null
  const sig = signature(layout)
  if (!sig || IN_REACH.has(sigName(sig))) return null
  // the reward: by the bell, where you can walk from the start
  const near: [number, number][] = []
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= 2) near.push([dx, dy])
    }
  }
  near.sort((a, b) =>
    Math.max(Math.abs(a[0]), Math.abs(a[1])) -
      Math.max(Math.abs(b[0]), Math.abs(b[1])) ||
    Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1]) ||
    a[1] - b[1] || a[0] - b[0]
  )
  let reward: [number, number] | null = null
  for (const [dx, dy] of near) {
    const x = bx + dx, y = by + dy
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
    by: solved.fills,
    reward,
  }
}

/** Draws patches until one is good (at most `tries`) */
export function makeBell(r: Rng, tries = 200): Bell | null {
  for (let n = 0; n < tries; n++) {
    const bell = acceptBell(draftBell(r))
    if (bell) return bell
  }
  return null
}
