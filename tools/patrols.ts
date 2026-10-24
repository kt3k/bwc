// The patrol's way (ideas/goal-types.md, 巡回の道を変える): a patrol on
// the open land walking to and fro on a straight lane (it turns back at
// whatever it bumps into, model/actor.ts), and further along the same
// line, out of its reach, a beacon only the patrol can light, by
// bumping into it (model/patrol-post.ts). Water and bushes cut the lane
// short of it. Move where it turns: fill the water (sink a thing in it)
// and flatten the bushes, and it walks on to the beacon. No new rule
// (the patrol, the push into water and the bush are the game's). The
// trick is in how to get a thing into the water across the lane: through
// a gap in the lane's walls, rolled along a side line, from the far side.
//
// A patrol's lane is a patch of the map as a ring is (13x11, the
// outermost cells open ground left as it was), drawn at random and
// solved by the ring's simulator, which knows the patrol ("J") and the
// beacon ("L"): done when nothing stands between them (water neither,
// until filled). The patrol isn't simulated: nothing lies in its lane at
// the start, and the solutions put nothing there but into the water.
// Kept are those that take 2 to 6 pushes with a signature beyond "push"
// and "bush" alone.
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

export type Patrol = Layout & {
  /** A shortest solution (U D L R moves), the fewest pushes */
  solution: string
  /** How many pushes (and bushes flattened) it takes at the fewest */
  pushes: number
  /** The rules every solution uses */
  signature: Rule[]
  /** Which way the beacon lies from the patrol: U D L R */
  dir: "up" | "down" | "left" | "right"
  /** Where the reward appears: by the beacon, walked to from the start */
  reward: [number, number]
}

/** The patch's size (a ring's), the open margin included */
export const PATROL_W = RING_W
export const PATROL_H = RING_H

type Rng = { rng: () => number; randomInt: (n: number) => number }

/** U D L R */
const D4: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]
const DIRS = ["up", "down", "left", "right"] as const

/**
 * What a draft leans to: water across the lane, a gap in its walls
 * there (moat); bushes too (hedge); the things to sink far, or behind
 * something (far); or a bit of everything (mix)
 */
export type PatrolAim = "moat" | "hedge" | "far" | "mix"
export const PATROL_AIMS: readonly PatrolAim[] = ["moat", "hedge", "far", "mix"]

/** A patch drawn at random (not checked yet) */
export function draftPatrol(
  { rng, randomInt }: Rng,
  aim: PatrolAim = PATROL_AIMS[randomInt(PATROL_AIMS.length)],
): Layout {
  const W = PATROL_W, H = PATROL_H
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
  // the patrol and the beacon, len cells apart, a rock behind the patrol
  let jx = 0, jy = 0, d = 0, len = 0
  for (let n = 0; n < 100; n++) {
    d = randomInt(4)
    len = 5 + randomInt(5)
    jx = 1 + randomInt(W - 2), jy = 1 + randomInt(H - 3)
    const lx = jx + D4[d][0] * len, ly = jy + D4[d][1] * len
    const bx = jx - D4[d][0], by = jy - D4[d][1]
    if (inner(lx, ly) && ly < H - 2 && inner(bx, by)) break
  }
  const [dx, dy] = D4[d]
  /** The k-th cell of the lane (0: the patrol, len: the beacon) */
  const line = (k: number): [number, number] => [jx + dx * k, jy + dy * k]
  const side = (k: number, s: number): [number, number] => [
    jx + dx * k + dy * s,
    jy + dy * k + dx * s,
  ]
  g[jy][jx] = "J"
  g[line(len)[1]][line(len)[0]] = "L"
  g[line(-1)[1]][line(-1)[0]] = "#"
  for (let k = -1; k <= len; k++) keep(...line(k))
  const mix = aim === "mix"
  // where it turns now: water across the lane, 1 or 2 deep, 2 cells or
  // more from the patrol (it has room to walk)
  const k0 = 2 + randomInt(Math.max(1, len - 3))
  const deep = rng() < 0.35 && k0 + 1 < len ? 2 : 1
  const water = new Set<number>()
  for (let k = k0; k < k0 + deep; k++) {
    const [x, y] = line(k)
    g[y][x] = "w"
    water.add(k)
  }
  // bushes on the lane, past the water (hedge)
  if (aim === "hedge" || (mix && rng() < 0.5)) {
    for (let n = 1 + randomInt(2); n > 0; n--) {
      const k = 1 + randomInt(len - 1)
      const [x, y] = line(k)
      if (g[y][x] === ".") g[y][x] = "k"
    }
  }
  // the walls either side of the lane, a gap by the water (often)
  const gapAt = new Set<string>()
  if (aim !== "far" || rng() < 0.4) {
    const k = k0 + randomInt(deep)
    gapAt.add(`${k},${rng() < 0.5 ? 1 : -1}`)
  }
  for (let k = 0; k < len; k++) {
    for (const s of [1, -1]) {
      const [x, y] = side(k, s)
      keep(x, y)
      if (gapAt.has(`${k},${s}`)) continue
      const r = rng()
      if (r < 0.7) set(x, y, "#")
      else if (r < 0.8) set(x, y, "w")
      else if (r < 0.88) set(x, y, "k")
    }
  }
  const things: Thing[] = []
  const putThing = (x: number, y: number, kind: ThingKind) => {
    if (!inner(x, y) || (g[y][x] !== "." && g[y][x] !== "i")) return false
    if (things.some((t) => t.x === x && t.y === y)) return false
    if (reserved.has(`${x},${y}`)) return false
    things.push({ kind, x, y })
    return true
  }
  const kind = (stone: number): ThingKind => rng() < stone ? "stone" : "boulder"
  // the things to sink: out from the gap, on its line, or off it
  for (const key of gapAt) {
    const [k, s] = key.split(",").map(Number)
    const out = 2 + randomInt(aim === "far" ? 4 : 2)
    const [x, y] = side(k, s * out)
    if (rng() < 0.7) putThing(x, y, kind(0.6))
    else putThing(x + dx, y + dy, kind(0.8))
  }
  // and spares, near
  for (let n = deep + randomInt(2); n > 0; n--) {
    for (let m = 0; m < 20; m++) {
      const x = 1 + randomInt(W - 2), y = 1 + randomInt(H - 2)
      if (free(x, y) && putThing(x, y, kind(0.5))) break
    }
  }
  // a sheet of ice, sometimes (off the lane)
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

/** The fewest and most pushes a patrol's way may take */
export const PATROL_MIN_PUSHES = 2
export const PATROL_MAX_PUSHES = MAX_PUSHES

/** The signatures of a way too easy to open */
const EASY = new Set(["-", "push", "bush"])

/** Which way the beacon lies from the patrol */
export function dirOf(layout: Layout): Patrol["dir"] {
  const w = layout.rows[0].length
  const cells = layout.rows.join("")
  const j = cells.indexOf("J"), l = cells.indexOf("L")
  const dx = Math.sign(l % w - j % w)
  const dy = Math.sign(Math.floor(l / w) - Math.floor(j / w))
  return DIRS[D4.findIndex(([x, y]) => x === dx && y === dy)]
}

/** Checks a draft: a patrol's way when it's good, null when thrown away */
export function acceptPatrol(layout: Layout): Patrol | null {
  const solved = solve(layout)
  if (!solved) return null
  if (
    solved.pushes < PATROL_MIN_PUSHES || solved.pushes > PATROL_MAX_PUSHES
  ) return null
  const sig = signature(layout)
  if (!sig || EASY.has(sigName(sig))) return null
  // the reward: by the beacon, where you can walk from the start
  const w = layout.rows[0].length
  const reach = walked(layout)
  const l = layout.rows.join("").indexOf("L")
  const lx = l % w, ly = Math.floor(l / w)
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
    const x = lx + ox, y = ly + oy
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
