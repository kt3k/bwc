// The stray sheep (ideas/goal-types.md, 囲いに戻す): a small fold on the
// open land, its fence round it and one gateway, empty; a sheep grazing a
// few cells off. Herd it in and the gate swings shut on it (model/fold.ts).
// No new rule: the sheep runs from the player who comes within 3 cells
// (model/actor.ts, IdleDelegateFlee): straight away first (along the
// longer axis), else a step aside that takes it further; cornered, it
// trembles; out of range it grazes where it is. The trick is the angle to
// come at it from, with the terrain round it (rocks, trees, water, the
// fold's own fence): come at it wrong and it runs past the gateway, into
// a corner, or off into the open.
//
// A fold is a patch of the map as a ring is (13x11, the outermost cells
// open ground left as it was). The herding is solved as a game of two,
// in the game's own time: the sheep looks round whenever it stands still;
// out of its range the player takes a step (and it looks again); in range
// it runs, and while it moves the player takes PLAYER_STEPS steps. Where
// it may run either of two ways aside (the game picks one at random),
// both are tried (it must work either way). A sheep that leaves the patch
// is lost. The rounds to win, from the player's start, are counted by
// working back from the sheep in the fold (the rounds the sheep runs, its
// steps, are the herding counted for difficulty). tools/folds.test.ts
// has a bot herd the game's own sheep with the moves found.
//
// The patches are grids of characters:
//
//   .  ground        #  a tree or a rock     w  water
//   f  the fold's fence                      G  its gateway (ground)
//   P  inside the fold (ground)              O  the sheep (ground)
//   @  where the player comes from (ground)

/** The sheep's flight range (model/actor.ts, IdleDelegateFlee) */
export const FLIGHT = 3
/**
 * The player's steps while the sheep takes one: its speed is 1 to the
 * player's 2, but the player may be halfway through a step as it sets
 * off, so one is all that is sure
 */
export const PLAYER_STEPS = 1

export type FoldLayout = {
  /** The terrain: . # w f G P (the sheep kept apart) */
  rows: string[]
  /** The sheep's cell */
  sheep: [number, number]
  /** Where the player comes from */
  start: [number, number]
}

export type Fold = FoldLayout & {
  /** The rounds to win from the start, at the fewest */
  rounds: number
  /** The sheep's steps herding it in, at the fewest */
  herds: number
  /**
   * The share of the cells at the edge of its range that a first contact
   * from leaves it still to be herded in (the rest lose it)
   */
  angles: number
  /** The gateway, and the fold's inside (its bounds) */
  gate: [number, number]
  inside: [number, number, number, number]
  /** Where the reward appears: by the fold, walked to from the start */
  reward: [number, number]
}

export const FOLD_W = 13
export const FOLD_H = 11

/** Reads a patch drawn in characters */
export function parseFold(text: string[]): FoldLayout {
  let sheep: [number, number] = [0, 0]
  let start: [number, number] = [text[0].length >> 1, text.length - 1]
  const rows = text.map((row, y) =>
    [...row].map((c, x) => {
      if (c === "O") {
        sheep = [x, y]
        return "."
      }
      if (c === "@") {
        start = [x, y]
        return "."
      }
      return c
    }).join("")
  )
  return { rows, sheep, start }
}

/** Draws the patch back in characters (the sheep on it) */
export function drawFold(layout: FoldLayout): string[] {
  return layout.rows.map((row, y) =>
    [...row].map((c, x) =>
      x === layout.sheep[0] && y === layout.sheep[1] ? "O" : c
    ).join("")
  )
}

// ---------------------------------------------------------------------
// the herding

/** U D L R */
const STEP: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]
const LOST = -1

/** The game of the patch: its cells, and the sheep's flight */
class Herd {
  readonly w: number
  readonly h: number
  readonly n: number
  /** Walkable (by the player and the sheep) */
  readonly open: Uint8Array
  /** Inside the fold */
  readonly inside: Uint8Array
  constructor(layout: FoldLayout) {
    this.w = layout.rows[0].length
    this.h = layout.rows.length
    this.n = this.w * this.h
    this.open = new Uint8Array(this.n)
    this.inside = new Uint8Array(this.n)
    const cells = layout.rows.join("")
    for (let p = 0; p < this.n; p++) {
      this.open[p] = ".GP".includes(cells[p]) ? 1 : 0
      this.inside[p] = cells[p] === "P" ? 1 : 0
    }
  }
  xy(p: number): [number, number] {
    return [p % this.w, Math.floor(p / this.w)]
  }
  dist(a: number, b: number) {
    const [ax, ay] = this.xy(a), [bx, by] = this.xy(b)
    return Math.abs(ax - bx) + Math.abs(ay - by)
  }

  /**
   * Where the sheep at s may go with the player at p: [s] when it stays
   * (out of range, or cornered), LOST off the patch. As stepAway does
   * (model/steering.ts): the ways straight away, the longer axis first;
   * else the ways aside that take it further (any of them)
   */
  flee(p: number, s: number): number[] {
    const d = this.dist(p, s)
    if (d > FLIGHT) return [s]
    const [px, py] = this.xy(p), [sx, sy] = this.xy(s)
    const di = sx - px, dj = sy - py
    const ax: [number, number] | null = di !== 0 ? [Math.sign(di), 0] : null
    const ay: [number, number] | null = dj !== 0 ? [0, Math.sign(dj)] : null
    const away = (Math.abs(di) >= Math.abs(dj) ? [ax, ay] : [ay, ax])
      .filter((v): v is [number, number] => v !== null)
    /** The cell a step goes to: null if blocked, LOST off the patch */
    const to = ([vx, vy]: [number, number]): number | null => {
      const x = sx + vx, y = sy + vy
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return LOST
      const q = y * this.w + x
      return this.open[q] && q !== p ? q : null
    }
    for (const v of away) {
      const q = to(v)
      if (q !== null) return [q]
    }
    const aside: number[] = []
    for (const v of STEP) {
      if (away.some(([x, y]) => x === v[0] && y === v[1])) continue
      const q = to(v)
      if (q === null) continue
      if (q === LOST) {
        aside.push(LOST)
        continue
      }
      if (this.dist(p, q) > d) aside.push(q)
    }
    return aside.length > 0 ? aside : [s]
  }

  /** The cells the player can be at after up to PLAYER_STEPS steps */
  reach(p: number, s: number): number[] {
    const seen = new Map<number, number>([[p, 0]])
    const queue = [p]
    for (let k = 0; k < queue.length; k++) {
      const c = queue[k]
      const dc = seen.get(c)!
      if (dc >= PLAYER_STEPS) continue
      const [x, y] = this.xy(c)
      for (const [vx, vy] of STEP) {
        const nx = x + vx, ny = y + vy
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue
        const q = ny * this.w + nx
        if (!this.open[q] || q === s || seen.has(q)) continue
        seen.set(q, dc + 1)
        queue.push(q)
      }
    }
    return queue
  }

  /** The cells next to p the player can step to (round the sheep at s) */
  steps(p: number, s: number): number[] {
    const [x, y] = this.xy(p)
    const out: number[] = []
    for (const [vx, vy] of STEP) {
      const nx = x + vx, ny = y + vy
      if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue
      const q = ny * this.w + nx
      if (this.open[q] && q !== s) out.push(q)
    }
    return out
  }

  /**
   * The game, worked back from the sheep in the fold. The states are the
   * moments the sheep looks round (p * n + s): out of its range, the
   * player takes a step (and it looks again); in range, it runs (any of
   * its ways), and while it moves the player takes up to PLAYER_STEPS
   * steps. The rounds to win from each (Infinity: lost), the sheep's
   * steps among them, and the player's moves: `far`, the step out of
   * range; `after`, where to be once the sheep has run to r (p * n + r)
   */
  solve(): {
    rounds: Float64Array
    herds: Float64Array
    far: Int32Array
    after: Int32Array
  } {
    const n = this.n
    const rounds = new Float64Array(n * n).fill(Infinity)
    const herds = new Float64Array(n * n).fill(Infinity)
    const far = new Int32Array(n * n).fill(-1)
    const after = new Int32Array(n * n).fill(-1)
    const cells: number[] = []
    for (let p = 0; p < n; p++) if (this.open[p]) cells.push(p)
    const states: [number, number, number[] | null][] = []
    for (const p of cells) {
      for (const s of cells) {
        if (p === s || this.inside[s]) continue
        states.push([p, s, this.dist(p, s) > FLIGHT ? null : this.flee(p, s)])
      }
    }
    const reachOf = new Map<number, number[]>()
    const reach = (p: number, r: number) => {
      const key = p * n + r
      let out = reachOf.get(key)
      if (!out) reachOf.set(key, out = this.reach(p, r))
      return out
    }
    /** The best place to be once the sheep has run to r, from p */
    const best = (p: number, r: number): [number, number, number] => {
      if (r === LOST) return [Infinity, Infinity, -1]
      if (this.inside[r]) return [0, 0, p]
      let v = Infinity, h = Infinity, at = -1
      for (const q of reach(p, r)) {
        const k = q * n + r
        if (rounds[k] < v) [v, h, at] = [rounds[k], herds[k], q]
      }
      return [v, h, at]
    }
    for (let changed = true; changed;) {
      changed = false
      for (const [p, s, runs] of states) {
        const key = p * n + s
        let v = Infinity, h = Infinity
        if (!runs) {
          for (const q of this.steps(p, s)) {
            const k = q * n + s
            if (rounds[k] + 1 < v) [v, h] = [rounds[k] + 1, herds[k]]
          }
        } else {
          let worst = 0, worstH = 0
          for (const r of runs) {
            const [bv, bh] = best(p, r)
            if (bv > worst) worst = bv
            if (bh > worstH) worstH = bh
            if (worst === Infinity) break
          }
          if (worst < Infinity) [v, h] = [worst + 1, worstH + 1]
        }
        if (v < rounds[key]) {
          rounds[key] = v
          herds[key] = h
          changed = true
        }
      }
    }
    // the moves
    for (const [p, s, runs] of states) {
      const key = p * n + s
      if (rounds[key] === Infinity) continue
      if (!runs) {
        for (const q of this.steps(p, s)) {
          if (rounds[q * n + s] + 1 === rounds[key]) {
            far[key] = q
            break
          }
        }
      }
    }
    for (const p of cells) {
      for (const r of cells) {
        if (p === r || this.inside[r]) continue
        after[p * n + r] = best(p, r)[2]
      }
    }
    return { rounds, herds, far, after }
  }
}

/** The herding solved: the rounds and herds to win, and the moves */
export function solveFold(layout: FoldLayout) {
  const herd = new Herd(layout)
  const { rounds, herds, far, after } = herd.solve()
  const at = ([x, y]: [number, number]) => y * herd.w + x
  const key = at(layout.start) * herd.n + at(layout.sheep)
  return {
    herd,
    rounds: rounds[key],
    herds: herds[key],
    /**
     * The player's next cell: out of the sheep's range, the step to take
     * (null: none, or in range: wait for it to run); `running`, the sheep
     * is on its way to s: where to be by the time it gets there
     */
    next(
      p: [number, number],
      s: [number, number],
      running: boolean,
    ): [number, number] | null {
      const k = at(p) * herd.n + at(s)
      const q = running ? after[k] : far[k]
      return q < 0 ? null : herd.xy(q)
    },
    /** true if the herding can still be won from there (the sheep still) */
    winnable(p: [number, number], s: [number, number]): boolean {
      return rounds[at(p) * herd.n + at(s)] < Infinity
    },
  }
}

// ---------------------------------------------------------------------
// the generator

type Rng = { rng: () => number; randomInt: (n: number) => number }

/**
 * What a draft leans to: the fold out in the open, a few rocks about
 * (open); against water (shore); among trees and rocks (thicket); or
 * the sheep in a nook it must be drawn out of first (nook)
 */
export type FoldAim = "open" | "shore" | "thicket" | "nook"
export const FOLD_AIMS: readonly FoldAim[] = [
  "open",
  "shore",
  "thicket",
  "nook",
]

/** A patch drawn at random (not checked yet) */
export function draftFold(
  { rng, randomInt }: Rng,
  aim: FoldAim = FOLD_AIMS[randomInt(FOLD_AIMS.length)],
): FoldLayout {
  const W = FOLD_W, H = FOLD_H
  const g: string[][] = Array.from({ length: H }, () => Array(W).fill("."))
  const inner = (x: number, y: number) =>
    x >= 1 && y >= 1 && x < W - 1 && y < H - 1
  const reserved = new Set<string>()
  const keep = (x: number, y: number) => reserved.add(`${x},${y}`)
  const free = (x: number, y: number) =>
    inner(x, y) && g[y][x] === "." && !reserved.has(`${x},${y}`)
  // the fold: its inside iw x ih, the fence round it, the gateway on a side
  const iw = 2 + randomInt(2), ih = 2 + randomInt(2)
  const fx = 1 + randomInt(W - iw - 3), fy = 1 + randomInt(H - ih - 4)
  for (let y = fy; y <= fy + ih + 1; y++) {
    for (let x = fx; x <= fx + iw + 1; x++) {
      const edge = x === fx || y === fy || x === fx + iw + 1 ||
        y === fy + ih + 1
      g[y][x] = edge ? "f" : "P"
      keep(x, y)
    }
  }
  // the gateway: in the middle of a side (not a corner)
  const sides: [number, number, number, number][] = [] // x, y, out dx, dy
  for (let x = fx + 1; x <= fx + iw; x++) {
    sides.push([x, fy, 0, -1], [x, fy + ih + 1, 0, 1])
  }
  for (let y = fy + 1; y <= fy + ih; y++) {
    sides.push([fx, y, -1, 0], [fx + iw + 1, y, 1, 0])
  }
  const usable = sides.filter(([x, y, dx, dy]) => inner(x + dx, y + dy))
  const [gx, gy, odx, ody] = usable[randomInt(usable.length)]
  g[gy][gx] = "G"
  keep(gx + odx, gy + ody)
  // the sheep, 3 to 6 cells from the gateway, outside
  let sheep: [number, number] = [gx + odx * 3, gy + ody * 3]
  for (let n = 0; n < 50; n++) {
    const x = 1 + randomInt(W - 2), y = 1 + randomInt(H - 2)
    const d = Math.abs(x - gx) + Math.abs(y - gy)
    if (d < 3 || d > 6 || !free(x, y)) continue
    sheep = [x, y]
    break
  }
  if (!inner(...sheep) || g[sheep[1]][sheep[0]] !== ".") {
    sheep = [gx + odx * 2, gy + ody * 2]
  }
  keep(...sheep)
  const blob = (c: string, size: number) => {
    let x = 1 + randomInt(W - 2), y = 1 + randomInt(H - 2)
    for (let k = 0; k < size; k++) {
      if (free(x, y)) g[y][x] = c
      const [dx, dy] = STEP[randomInt(4)]
      x += dx
      y += dy
    }
  }
  if (aim === "shore") {
    // water along a side of the patch, wandering
    const side = randomInt(4)
    for (let k = 1; k < (side < 2 ? W - 1 : H - 1); k++) {
      const depth = 1 + randomInt(3)
      for (let e = 1; e <= depth; e++) {
        const [x, y] = side === 0
          ? [k, e]
          : side === 1
          ? [k, H - 1 - e]
          : side === 2
          ? [e, k]
          : [W - 1 - e, k]
        if (free(x, y)) g[y][x] = "w"
      }
    }
    for (let k = randomInt(3); k > 0; k--) blob("#", 2 + randomInt(3))
  } else if (aim === "thicket") {
    for (let k = 3 + randomInt(4); k > 0; k--) blob("#", 2 + randomInt(4))
  } else if (aim === "nook") {
    // rocks round the sheep on three sides
    const [sx, sy] = sheep
    const open = randomInt(4)
    STEP.forEach(([dx, dy], k) => {
      if (k !== open && free(sx + dx, sy + dy)) g[sy + dy][sx + dx] = "#"
    })
    for (let k = randomInt(4); k > 0; k--) blob("#", 2 + randomInt(3))
  } else {
    for (let k = 1 + randomInt(3); k > 0; k--) blob("#", 1 + randomInt(3))
    if (rng() < 0.5) blob("w", 2 + randomInt(4))
  }
  return { rows: g.map((row) => row.join("")), sheep, start: [W >> 1, H - 1] }
}

/** The fewest herds a fold may take, and the most rounds */
export const FOLD_MIN_HERDS = 3
export const FOLD_MAX_ROUNDS = 40
/** The most share of the approach cells a herding may start from */
export const FOLD_MAX_ANGLES = 0.75

/** Checks a draft: a fold when it's good, null when it's thrown away */
export function acceptFold(layout: FoldLayout): Fold | null {
  const [sx, sy] = layout.sheep
  if (layout.rows[sy][sx] !== ".") return null
  const [stx, sty] = layout.start
  if (layout.rows[sty][stx] !== ".") return null
  const solved = solveFold(layout)
  if (solved.rounds === Infinity || solved.rounds > FOLD_MAX_ROUNDS) {
    return null
  }
  if (solved.herds < FOLD_MIN_HERDS) return null
  // the angle matters: coming within its range from some sides, it runs
  // where it can't be herded in from any more (off the patch, into a
  // corner)
  const { herd } = solved
  let ring = 0, good = 0
  const s0 = sy * herd.w + sx
  for (let p = 0; p < herd.n; p++) {
    if (!herd.open[p] || herd.dist(p, s0) !== FLIGHT) continue
    ring++
    const ok = solved.winnable(herd.xy(p), layout.sheep)
    if (ok) good++
  }
  const angles = ring > 0 ? good / ring : 1
  if (angles > FOLD_MAX_ANGLES) return null
  // the gateway and the inside
  const cells = layout.rows.join("")
  const w = layout.rows[0].length
  const gi = cells.indexOf("G")
  const inside: [number, number, number, number] = [
    w,
    layout.rows.length,
    -1,
    -1,
  ]
  ;[...cells].forEach((c, p) => {
    if (c !== "P") return
    const x = p % w, y = Math.floor(p / w)
    inside[0] = Math.min(inside[0], x)
    inside[1] = Math.min(inside[1], y)
    inside[2] = Math.max(inside[2], x)
    inside[3] = Math.max(inside[3], y)
  })
  // the reward: by the gateway, outside, walked to from the start
  const gx = gi % w, gy = Math.floor(gi / w)
  let reward: [number, number] | null = null
  const near: [number, number][] = []
  for (let y = -3; y <= 3; y++) {
    for (let x = -3; x <= 3; x++) {
      if (Math.max(Math.abs(x), Math.abs(y)) >= 2) near.push([x, y])
    }
  }
  near.sort((a, b) =>
    Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1]) ||
    a[1] - b[1] || a[0] - b[0]
  )
  // any cell walked to from the start
  const flood = new Set<number>([sty * w + stx])
  const queue = [sty * w + stx]
  for (let k = 0; k < queue.length; k++) {
    const [x, y] = herd.xy(queue[k])
    for (const [dx, dy] of STEP) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= layout.rows.length) continue
      const q = ny * w + nx
      if (herd.open[q] && !flood.has(q)) {
        flood.add(q)
        queue.push(q)
      }
    }
  }
  for (const [ox, oy] of near) {
    const x = gx + ox, y = gy + oy
    if (layout.rows[y]?.[x] !== ".") continue
    if (!flood.has(y * w + x)) continue
    if (x === sx && y === sy) continue
    reward = [x, y]
    break
  }
  if (!reward) return null
  return {
    ...layout,
    rounds: solved.rounds,
    herds: solved.herds,
    angles,
    gate: [gx, gy],
    inside,
    reward,
  }
}
