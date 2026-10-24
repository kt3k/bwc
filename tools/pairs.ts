// The pair (ideas/goal-types.md, 対をそろえる): two plinths side by side
// on the open land, one holding a stone or a boulder, the other empty.
// Put the same on the empty one and the pair is whole (model/pair.ts).
// The trick starts with what to put: a thing of the other kind always
// lies near, and it can be brought too; the one that makes the pair is
// the harder of the two to bring. Then how, from the terrain and the one-line
// rules alone, as for the missing ring (tools/rings.ts).
//
// A pair is a patch of the map as a ring is (13x11, the outermost cells
// open ground left as it was). It is drawn from a ring's draft
// (tools/rings.ts draft): the gap becomes the empty plinth ("P"), the
// stone of the ring behind it its twin ("Y" holding a stone, "Z" a
// boulder: a backstop, as the heart was), and the rest of the ring open
// ground. The ring's simulator solves it: the plinth takes only a thing
// of its twin's kind, at rest on it. Kept are those that take 2 to 6
// pushes, where the other kind can be brought to the plinth too (the
// wrong answer is there to be tried), with a signature beyond "push"
// (or "push" alone when the wrong kind is the easier one to bring).
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

export type Pair = Layout & {
  /** A shortest solution (U D L R moves), the fewest pushes */
  solution: string
  /** How many pushes (and bushes flattened) it takes at the fewest */
  pushes: number
  /** The rules every solution uses */
  signature: Rule[]
  /** The kind the twin holds: what makes the pair */
  want: ThingKind
  /** How many pushes the other kind takes to the plinth (the decoy) */
  decoy: number
  /** Where the reward appears: by the pair, walked to from the start */
  reward: [number, number]
}

/** The patch's size (a ring's), the open margin included */
export const PAIR_W = RING_W
export const PAIR_H = RING_H

type Rng = { rng: () => number; randomInt: (n: number) => number }

const D4: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]

/** The twin's character, by the kind it holds */
const TWIN: Record<ThingKind, string> = { stone: "Y", boulder: "Z" }

/** The layout with the twin holding the kind */
export function withWant(layout: Layout, want: ThingKind): Layout {
  return {
    ...layout,
    rows: layout.rows.map((row) => row.replace(/[YZ]/, TWIN[want])),
  }
}

/** The kind the twin of the layout holds */
export const wantOf = (layout: Layout): ThingKind =>
  layout.rows.some((row) => row.includes("Z")) ? "boulder" : "stone"

/**
 * What a draft leans to: the wanted kind across water (water), behind
 * bushes (bush), out on the ice (ice), off the way in, to be banked
 * onto it (bank), or far, among loose rocks and trees (far)
 */
export type PairAim = "water" | "bush" | "ice" | "bank" | "far"
export const PAIR_AIMS: readonly PairAim[] = [
  "water",
  "bush",
  "ice",
  "bank",
  "far",
]

/**
 * A patch drawn at random (not checked yet). The plinth and its twin
 * behind it; the way in, the line straight into the plinth from the
 * front (the twin stops a boulder on it); the wanted kind out along
 * it, past what makes it hard; and the decoy, the other kind, on the
 * line from a side, a rock beyond the plinth to stop it there
 */
export function draftPair(
  { rng, randomInt }: Rng,
  aim: PairAim = PAIR_AIMS[randomInt(PAIR_AIMS.length)],
): Layout {
  const W = PAIR_W, H = PAIR_H
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
  const want: ThingKind = rng() < 0.5 ? "stone" : "boulder"
  const other: ThingKind = want === "stone" ? "boulder" : "stone"
  // the plinth, its twin behind it (d: the way the line in goes out)
  let px = 0, py = 0, d = 0
  for (let n = 0; n < 100; n++) {
    px = 3 + randomInt(W - 6), py = 2 + randomInt(H - 5), d = randomInt(4)
    if (inner(px - D4[d][0], py - D4[d][1])) break
  }
  const [ox, oy] = D4[d]
  g[py][px] = "P"
  g[py - oy][px - ox] = TWIN[want]
  const line = (k: number): [number, number] => [px + ox * k, py + oy * k]
  let room = 0
  while (inner(...line(room + 1))) room++
  for (let k = 0; k <= room; k++) keep(...line(k))
  keep(px - ox, py - oy)
  const things: Thing[] = []
  const putThing = (x: number, y: number, kind: ThingKind) => {
    if (!inner(x, y) || (g[y][x] !== "." && g[y][x] !== "i")) return false
    if (things.some((t) => t.x === x && t.y === y)) return false
    things.push({ kind, x, y })
    keep(x, y)
    return true
  }
  /** Across the line at k: the cell and `half` either side */
  const across = (k: number, half: number, c: string) => {
    const [x, y] = line(k)
    for (let s = -half; s <= half; s++) set(x + oy * s, y + ox * s, c)
  }
  // what makes the wanted kind hard, out along the line
  const k0 = 1 + randomInt(2)
  let far = k0 + 2
  if (aim === "water" || aim === "bush") {
    const c = aim === "water" ? "w" : "k"
    const depth = 1 + randomInt(aim === "water" ? 2 : 1)
    for (let k = k0; k < k0 + depth && k <= room; k++) {
      const [x, y] = line(k)
      g[y][x] = c
      across(k, 1 + randomInt(3), c)
    }
    far = k0 + depth + 1 + randomInt(2)
    // a spare to sink, a cell off the line on the near side of the far
    // one (or on it)
    if (aim === "water" && rng() < 0.8) {
      const [x, y] = line(far - 1)
      const side = rng() < 0.5 ? 1 : -1
      if (!putThing(x + oy * side, y + ox * side, "stone")) {
        putThing(x - oy * side, y - ox * side, "stone")
      }
      if (depth === 2) putThing(...line(far + 2), "stone")
    }
  } else if (aim === "ice") {
    const w = 3 + randomInt(4), h = 3 + randomInt(3)
    const [lx, ly] = line(1 + randomInt(2))
    const x0 = lx - randomInt(w), y0 = ly - randomInt(h)
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (inner(x, y) && g[y][x] === ".") g[y][x] = "i"
      }
    }
    for (let n = randomInt(3); n > 0; n--) {
      const x = x0 + randomInt(w), y = y0 + randomInt(h)
      if (
        free(x, y) || (inner(x, y) && g[y][x] === "i" &&
          !reserved.has(`${x},${y}`))
      ) g[y][x] = "#"
    }
    far = 2 + randomInt(4)
  } else if (aim === "bank") {
    far = 2 + randomInt(3)
  } else far = 3 + randomInt(4)
  far = Math.min(far, room)
  // the wanted kind: on the line, a cell off it, or banked onto it
  {
    const [x, y] = line(far)
    const side = rng() < 0.5 ? 1 : -1
    if (aim === "bank") {
      const m = 2 + randomInt(3)
      if (inner(x + oy * side, y + ox * side)) {
        g[y + ox * side][x + oy * side] = "#"
      }
      putThing(x - oy * side * m, y - ox * side * m, want)
    } else if (aim === "ice" || rng() < 0.5) {
      if (!putThing(x - oy * side, y - ox * side, want)) putThing(x, y, want)
    } else putThing(x, y, want)
  }
  // the decoy, on the line from a side, a rock beyond the plinth
  {
    const side = rng() < 0.5 ? 1 : -1
    const [sx, sy] = [oy * side, ox * side]
    if (inner(px - sx, py - sy) && g[py - sy][px - sx] === ".") {
      g[py - sy][px - sx] = "#"
    }
    const k = other === "stone" ? 2 : 2 + randomInt(4)
    putThing(px + sx * k, py + sy * k, other)
  }
  // a few loose trees, rocks, bushes and puddles
  const scatter = (c: string, m: number) => {
    for (let n = 0; n < m; n++) {
      const x = 1 + randomInt(W - 2), y = 1 + randomInt(H - 2)
      if (free(x, y)) g[y][x] = c
    }
  }
  scatter("#", (aim === "far" ? 3 : 1) + randomInt(4))
  scatter("k", randomInt(3))
  scatter("w", randomInt(2))
  return { rows: g.map((row) => row.join("")), things, start: [W >> 1, H - 1] }
}

/** The fewest and most pushes a pair may take */
export const PAIR_MIN_PUSHES = 2
export const PAIR_MAX_PUSHES = MAX_PUSHES

/**
 * Checks a draft: a pair when it's good (the twin holding the kind that
 * makes a good one, the harder of the two first), null when it's thrown
 * away
 */
export function acceptPair(layout: Layout): Pair | null {
  const want = wantOf(layout)
  const kinds = new Set(layout.things.map((t) => t.kind))
  if (kinds.size < 2) return null
  const solved = solve(layout)
  if (!solved) return null
  if (solved.pushes < PAIR_MIN_PUSHES || solved.pushes > PAIR_MAX_PUSHES) {
    return null
  }
  // the decoy: the other kind can be brought too, and no harder
  const wrong = solve(withWant(layout, want === "stone" ? "boulder" : "stone"))
  if (!wrong || wrong.pushes > solved.pushes) return null
  const decoy = wrong.pushes
  const pair = layout
  // walk up and push the stone on: kept only when the wrong kind is the
  // easier one, so that the trick is in seeing what makes the pair
  const sig = signature(pair)
  if (!sig || sig.length === 0) return null
  if (sigName(sig) === "push" && decoy >= solved.pushes) return null
  // the reward: by the pair, where you can walk from the start
  const w = pair.rows[0].length
  const reach = walked(pair)
  const slot = pair.rows.join("").indexOf("P")
  const px = slot % w, py = Math.floor(slot / w)
  const near: [number, number][] = []
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
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
    const x = px + dx, y = py + dy
    if (pair.rows[y]?.[x] !== ".") continue
    if (!reach.has(y * w + x)) continue
    if (pair.things.some((t) => t.x === x && t.y === y)) continue
    reward = [x, y]
    break
  }
  if (!reward) return null
  return {
    ...pair,
    solution: solved.moves,
    pushes: solved.pushes,
    signature: sig,
    want,
    decoy,
    reward,
  }
}

/** Draws patches until one is good (at most `tries`) */
export function makePair(r: Rng, tries = 200): Pair | null {
  for (let n = 0; n < tries; n++) {
    const pair = acceptPair(draftPair(r))
    if (pair) return pair
  }
  return null
}
