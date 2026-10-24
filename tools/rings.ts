// The missing ring (ideas/goal-types.md, 欠けた輪): a ring of stones on
// the open land with one place empty, and a stone lying near. Get a
// stone into the gap and the ring is whole. The trick changes from ring
// to ring, from the terrain and the one-line rules alone:
//
// - push: a stone moves one cell when pushed
// - roll: a boulder rolls until something stops it
// - ice: on ice, things slide until something stops them
// - sink: a thing pushed into water sinks, and the water becomes floor
// - bush: a bush, pushed, falls flat and can be walked
//
// A ring is a small patch of the map (13x11, the outermost cells open
// ground that is left as it was): the ring (3x3, the heart in the
// middle), the stone and maybe a spare, and the terrain round them. The
// patch is drawn at random and solved (generate-and-test, as
// tools/minipuzzles.ts does); one that can't be solved, or is too easy,
// is thrown away.
//
// Each ring has a signature: the rules every solution uses. A rule is
// tried switched off (no stone moves, no boulder rolls, no one goes on
// the ice, the water takes nothing, no bush falls); if the ring can no
// longer be solved, the rule is in the signature. A ring whose signature
// is only "push" (walk to the stone and push it in) is thrown away, as
// is one that a single push solves.
//
// The patches are grids of characters:
//
//   .  ground        #  a tree or a rock     w  water     i  ice
//   k  a bush        o  a ring stone         O  the heart (the middle)
//   _  the gap (the empty place of the ring)
//   S  a stone       B  a boulder            (s, b: the same on ice)
//   @  where the player comes from (ground)
//   A  a bell (tools/bells.ts): rung by a thing that bumps into it
//      (the player's knock doesn't ring it)
//   P  the empty plinth of a pair (tools/pairs.ts): a gap that takes
//      only a thing of the kind its twin holds
//   Y  the twin plinth, holding a stone   Z  holding a boulder
//
// The simulator follows the game's rules (model/actor.ts: the boulder's
// roll, the stone's shove, the ice, the player flattening a bush) and
// is checked against them in tools/rings.test.ts.

export type Rule = "push" | "roll" | "ice" | "sink" | "bush"
export const RULES: readonly Rule[] = ["push", "roll", "ice", "sink", "bush"]
export type Rules = Record<Rule, boolean>
const ALL: Rules = { push: true, roll: true, ice: true, sink: true, bush: true }

export type ThingKind = "stone" | "boulder"
export type Thing = { kind: ThingKind; x: number; y: number }

export type Layout = {
  /** The terrain: . # w i k o O _ (the things are kept apart) */
  rows: string[]
  things: Thing[]
  /** Where the player comes from */
  start: [number, number]
}

export type Ring = Layout & {
  /** A shortest solution (U D L R moves), the fewest pushes */
  solution: string
  /** How many pushes (and bushes flattened) it takes at the fewest */
  pushes: number
  /** The rules every solution uses */
  signature: Rule[]
  /** The kind of the thing that fills the gap in the solution */
  fills: ThingKind
  /** Where the reward appears: by the ring, walked to from the start */
  reward: [number, number]
}

/** The patch's size, the open margin included */
export const RING_W = 13
export const RING_H = 11

/** Reads a patch drawn in characters */
export function parse(text: string[]): Layout {
  const things: Thing[] = []
  let start: [number, number] = [text[0].length >> 1, text.length - 1]
  const rows = text.map((row, y) =>
    [...row].map((c, x) => {
      if (c === "S" || c === "B" || c === "s" || c === "b") {
        things.push({
          kind: c.toLowerCase() === "s" ? "stone" : "boulder",
          x,
          y,
        })
        return c === "S" || c === "B" ? "." : "i"
      }
      if (c === "@") {
        start = [x, y]
        return "."
      }
      return c
    }).join("")
  )
  return { rows, things, start }
}

/** Draws the patch back in characters (the things on it) */
export function draw(layout: Layout): string[] {
  return layout.rows.map((row, y) =>
    [...row].map((c, x) => {
      const t = layout.things.find((t) => t.x === x && t.y === y)
      if (!t) return c
      const ch = t.kind === "stone" ? "s" : "b"
      return c === "i" ? ch : ch.toUpperCase()
    }).join("")
  )
}

// ---------------------------------------------------------------------
// the simulator

/** What a cell is to the simulator (0: ground) */
const SOLID = 1, WATER = 2, ICE = 3, BUSH = 4
const MOVES = "UDLR"
const STEP: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]

type State = {
  /** The player's cell */
  p: number
  /** The things' cells (-1: sunk, crushed or gone off the patch) */
  t: number[]
  /** The water cells filled by a sunk thing (a bit each) */
  fm: number
  /** The bushes pushed flat (a bit each) */
  bm: number
  /** The thing that rang the bell (unset: not yet) */
  r?: number
}

class Sim {
  readonly kind: Uint8Array
  /** The bit of a water cell or a bush */
  readonly bit: Int8Array
  /** The next cell in each direction (-1 off the patch) */
  readonly nbr: Int32Array[]
  readonly stone: boolean[]
  readonly slot: number
  /** The kind the slot takes (a pair's plinth), null: any */
  readonly want: ThingKind | null
  /** The bell's cell (-1: none) */
  readonly bell: number
  readonly rules: Rules
  constructor(layout: Layout, rules: Rules) {
    const w = layout.rows[0].length, h = layout.rows.length
    const cells = layout.rows.join("")
    this.kind = new Uint8Array(w * h)
    this.bit = new Int8Array(w * h).fill(-1)
    let waters = 0, bushes = 0
    for (let p = 0; p < w * h; p++) {
      const c = cells[p]
      if ("#oOAYZ".includes(c)) {
        this.kind[p] = SOLID
      } else if (c === "w") {
        this.kind[p] = WATER
        this.bit[p] = waters++
      } else if (c === "k") {
        this.kind[p] = BUSH
        this.bit[p] = bushes++
      } // no one goes on the ice while it's switched off
      else if (c === "i") this.kind[p] = rules.ice ? ICE : SOLID
    }
    if (waters > 30 || bushes > 30) throw new RangeError("too many to count")
    this.nbr = STEP.map(([dx, dy]) => {
      const a = new Int32Array(w * h)
      for (let p = 0; p < w * h; p++) {
        const x = p % w + dx, y = Math.floor(p / w) + dy
        a[p] = x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x
      }
      return a
    })
    this.stone = layout.things.map((t) => t.kind === "stone")
    this.slot = cells.includes("_") ? cells.indexOf("_") : cells.indexOf("P")
    this.want = cells.includes("Y")
      ? "stone"
      : cells.includes("Z")
      ? "boulder"
      : null
    this.bell = cells.indexOf("A")
    this.rules = rules
  }

  water(s: State, p: number) {
    return this.kind[p] === WATER && ((s.fm >>> this.bit[p]) & 1) === 0
  }
  bush(s: State, p: number) {
    return this.kind[p] === BUSH && ((s.bm >>> this.bit[p]) & 1) === 0
  }
  /** Stops anyone: a tree or rock, the ring, an upright bush */
  solid(s: State, p: number) {
    return this.kind[p] === SOLID || this.bush(s, p)
  }
  thingAt(t: number[], p: number, except = -1) {
    for (let n = 0; n < t.length; n++) if (t[n] === p && n !== except) return n
    return -1
  }
  /** The player can walk into the cell */
  open(s: State, p: number) {
    return p >= 0 && !this.solid(s, p) && !this.water(s, p) &&
      this.thingAt(s.t, p) < 0
  }

  /**
   * The thing pushed: a stone moves a cell (and on over ice), a boulder
   * rolls on till it is stopped, crushing what stands in its way (as
   * model/actor.ts does). Into water it sinks and fills it. Null when
   * nothing happens
   */
  shove(s: State, n: number, d: number): State | null {
    const t = [...s.t]
    let fm = s.fm
    let changed = false
    for (let at = t[n];;) {
      const q = this.nbr[d][at]
      if (q < 0) {
        // off the patch: out of play (the land beyond is unknown)
        t[n] = -1
        changed = true
        break
      }
      if (q === s.p) break
      if (q === this.bell) {
        // it bumps into the bell, and stops against it: the bell rings
        return { ...s, t, fm, r: n }
      }
      const other = this.thingAt(t, q, n)
      if (other >= 0) {
        if (this.stone[n]) break
        t[other] = -1 // a boulder crushes it
        changed = true
      }
      if (this.water(s, q)) {
        if (!this.rules.sink) break
        fm |= 1 << this.bit[q]
        t[n] = -1
        changed = true
        break
      }
      if (this.solid(s, q)) break
      at = q
      t[n] = q
      changed = true
      if (this.stone[n] && this.kind[q] !== ICE) break
    }
    return changed ? { ...s, t, fm } : null
  }

  /** One move of the player (0-3: U D L R), and whether it was a push */
  step(s: State, d: number): [State, boolean] | null {
    const q = this.nbr[d][s.p]
    if (q < 0) return null
    const n = this.thingAt(s.t, q)
    if (n >= 0) {
      if (this.stone[n] ? !this.rules.push : !this.rules.roll) return null
      const t = this.shove(s, n, d)
      return t ? [t, true] : null
    }
    if (this.bush(s, q)) {
      if (!this.rules.bush) return null
      return [{ ...s, bm: s.bm | (1 << this.bit[q]) }, true]
    }
    const p = this.walk(s, s.p, d)
    return p < 0 ? null : [{ ...s, p }, false]
  }

  /**
   * Where a walk from p goes (0-3: U D L R), -1 if it's no walk (a push
   * or a wall). On the ice, on till something stops you or the ice ends
   */
  walk(s: State, from: number, d: number): number {
    const q = this.nbr[d][from]
    if (!this.open(s, q)) return -1
    let p = q
    while (this.kind[p] === ICE) {
      const r = this.nbr[d][p]
      if (r < 0 || !this.open(s, r)) break
      p = r
    }
    return p
  }

  /**
   * The cells the player can walk between both ways, each named by its
   * lowest cell (strongly connected components, by Tarjan): standing
   * anywhere in one, the player has the same future. -1: not walkable
   */
  parts(s: State): Int16Array {
    const n = this.kind.length
    const rep = new Int16Array(n).fill(-1)
    const index = new Int16Array(n).fill(-1)
    const low = new Int16Array(n)
    const onStack = new Uint8Array(n)
    const stack: number[] = []
    let counter = 0
    const open = (p: number) =>
      !this.solid(s, p) && !this.water(s, p) && this.thingAt(s.t, p) < 0
    for (let root = 0; root < n; root++) {
      if (index[root] >= 0 || !open(root)) continue
      // iterative Tarjan: [cell, next direction to try]
      const work: [number, number][] = [[root, 0]]
      index[root] = low[root] = counter++
      stack.push(root)
      onStack[root] = 1
      while (work.length > 0) {
        const top = work[work.length - 1]
        const [v, d] = top
        if (d < 4) {
          top[1]++
          const w = this.walk(s, v, d)
          if (w < 0) continue
          if (index[w] < 0) {
            index[w] = low[w] = counter++
            stack.push(w)
            onStack[w] = 1
            work.push([w, 0])
          } else if (onStack[w]) low[v] = Math.min(low[v], index[w])
          continue
        }
        work.pop()
        if (work.length > 0) {
          const u = work[work.length - 1][0]
          low[u] = Math.min(low[u], low[v])
        }
        if (low[v] === index[v]) {
          const part: number[] = []
          for (let w = -1; w !== v;) {
            w = stack.pop()!
            onStack[w] = 0
            part.push(w)
          }
          const name = Math.min(...part)
          for (const w of part) rep[w] = name
        }
      }
    }
    return rep
  }

  done(s: State) {
    if (this.bell >= 0) return s.r !== undefined
    if (this.slot < 0) return false
    const n = this.thingAt(s.t, this.slot)
    return n >= 0 && (!this.want || this.stone[n] === (this.want === "stone"))
  }

  /** What did it: the thing in the gap, or the thing that rang the bell */
  doneBy(s: State): ThingKind {
    const n = this.bell >= 0 ? s.r! : this.thingAt(s.t, this.slot)
    return this.stone[n] ? "stone" : "boulder"
  }
}

function startOf(layout: Layout): State {
  const w = layout.rows[0].length
  return {
    p: layout.start[1] * w + layout.start[0],
    t: layout.things.map((t) => t.y * w + t.x),
    fm: 0,
    bm: 0,
  }
}

/** The search's limit (states): a patch with more is thrown away */
const LIMIT = 50_000

export type Solution = {
  moves: string
  pushes: number
  /** The kind of the thing that fills the gap (or rings the bell) */
  fills: ThingKind
}

/**
 * A search for the fewest pushes (a bush flattened counts as a push;
 * walking is free, 0-1 BFS) that put a thing into the gap (or ring the
 * bell with one, if there is a bell), up to `most`
 * pushes. "none" when it can't be done, "limit" when the search grew
 * past its limit
 */
export function search(
  layout: Layout,
  rules: Rules = ALL,
  most = MAX_PUSHES,
): Solution | "none" | "limit" {
  let sim: Sim
  try {
    sim = new Sim(layout, rules)
  } catch {
    return "limit"
  }
  if (sim.slot < 0 && sim.bell < 0) return "none"
  // a state is where everything lies and the part the player is in
  type Config = { rep: Int16Array; members: Map<number, number[]> }
  const configs = new Map<string, Config>()
  const configOf = (s: State) => {
    const kc = `${s.t.join(".")}.${s.fm}.${s.bm}`
    let c = configs.get(kc)
    if (!c) {
      const rep = sim.parts(s)
      const members = new Map<number, number[]>()
      rep.forEach((r, p) => {
        if (r < 0) return
        if (!members.has(r)) members.set(r, [])
        members.get(r)!.push(p)
      })
      c = { rep, members }
      configs.set(kc, c)
    }
    return [kc, c] as const
  }
  const keyOf = (s: State) => {
    const [kc, c] = configOf(s)
    return `${kc}@${c.rep[s.p]}`
  }
  const from = startOf(layout)
  const fromKey = keyOf(from)
  const cost = new Map<string, number>([[fromKey, 0]])
  const states = new Map<string, State>([[fromKey, from]])
  /** How each state was first come to: the state, the cell, the move */
  const parent = new Map<string, [string, number, number]>()
  /** The walk from where the player stands to `at`, within the part */
  const walkTo = (s: State, at: number): string => {
    const back = new Map<number, [number, number]>([[s.p, [-1, -1]]])
    const queue = [s.p]
    for (let k = 0; k < queue.length && !back.has(at); k++) {
      for (let e = 0; e < 4; e++) {
        const w = sim.walk(s, queue[k], e)
        if (w < 0 || back.has(w)) continue
        back.set(w, [queue[k], e])
        queue.push(w)
      }
    }
    let path = ""
    for (let c = at; back.get(c)![0] >= 0; c = back.get(c)![0]) {
      path = MOVES[back.get(c)![1]] + path
    }
    return path
  }
  /** The moves from the start to the state */
  const movesTo = (key: string): string => {
    const came = parent.get(key)
    if (!came) return ""
    const [prev, at, d] = came
    return movesTo(prev) + walkTo(states.get(prev)!, at) + MOVES[d]
  }
  let front = [fromKey]
  let back: string[] = []
  for (let level = 0; front.length > 0 && level < most; level++) {
    for (let k = 0; k < front.length; k++) {
      const ks = front[k]
      if (cost.get(ks)! < level) continue
      const s = states.get(ks)!
      const [, c] = configOf(s)
      const part = c.rep[s.p]
      for (const at of c.members.get(part)!) {
        const here = { ...s, p: at }
        for (let d = 0; d < 4; d++) {
          let t: State
          let pushed = false
          const w = sim.walk(s, at, d)
          if (w >= 0) {
            if (c.rep[w] === part) continue
            t = { ...s, p: w }
          } else {
            const r = sim.step(here, d)
            if (!r) continue
            t = r[0]
            pushed = true
            if (sim.done(t)) {
              return {
                moves: movesTo(ks) + walkTo(s, at) + MOVES[d],
                pushes: level + 1,
                fills: sim.doneBy(t),
              }
            }
          }
          const cc = level + (pushed ? 1 : 0)
          const kt = keyOf(t)
          if ((cost.get(kt) ?? Infinity) <= cc) continue
          cost.set(kt, cc)
          states.set(kt, t)
          parent.set(kt, [ks, at, d])
          if (cost.size > LIMIT || configs.size > LIMIT / 3) return "limit"
          if (pushed) back.push(kt)
          else front.push(kt)
        }
      }
    }
    front = back
    back = []
  }
  return "none"
}

/**
 * The fewest pushes (a bush flattened counts as a push) that put a
 * thing into the gap, and the moves; null when it can't be done in
 * `most` pushes
 */
export function solve(
  layout: Layout,
  rules: Rules = ALL,
  most = MAX_PUSHES,
): Solution | null {
  const r = search(layout, rules, most)
  return typeof r === "string" ? null : r
}

/** Plays the moves; true if a thing ends up in the gap (the bell rings) */
export function check(layout: Layout, moves: string): boolean {
  return trace(layout, moves).at(-1)?.done ?? false
}

/** Where everything is after a move (cells as y * width + x) */
export type Snapshot = {
  player: number
  /** The things' cells (-1: gone) */
  things: number[]
  /** The water cells filled */
  filled: number[]
  /** The bushes flattened */
  flat: number[]
  done: boolean
}

/** Plays the moves, where everything is after each (till it's done) */
export function trace(layout: Layout, moves: string): Snapshot[] {
  const sim = new Sim(layout, ALL)
  let s = startOf(layout)
  const cells = (kind: number, mask: number) =>
    [...sim.kind.keys()].filter((p) =>
      sim.kind[p] === kind && ((mask >>> sim.bit[p]) & 1) === 1
    )
  const out: Snapshot[] = []
  for (const m of moves) {
    s = sim.step(s, MOVES.indexOf(m))?.[0] ?? s
    out.push({
      player: s.p,
      things: [...s.t],
      filled: cells(WATER, s.fm),
      flat: cells(BUSH, s.bm),
      done: sim.done(s),
    })
    if (sim.done(s)) break
  }
  return out
}

/**
 * How many pushes a ring is given, a rule switched off, before it counts
 * as not solved without that rule
 */
export const SIG_PUSHES = 10

/**
 * The rules every solution uses: switched off, the ring can't be solved
 * (in SIG_PUSHES pushes). Null when a search grew past its limit
 */
export function signature(layout: Layout): Rule[] | null {
  const sig: Rule[] = []
  for (const rule of RULES) {
    const r = search(layout, { ...ALL, [rule]: false }, SIG_PUSHES)
    if (r === "limit") return null
    if (r === "none") sig.push(rule)
  }
  return sig
}

/** The signature as one word, e.g. "roll+sink" ("-" when empty) */
export const sigName = (sig: readonly Rule[]) => sig.join("+") || "-"

/**
 * The cells walked to from the start without pushing anything (on ice
 * you slide, so some are only passed over)
 */
export function walked(layout: Layout): Set<number> {
  const sim = new Sim(layout, ALL)
  const from = startOf(layout)
  const seen = new Set([from.p])
  const queue = [from]
  for (let k = 0; k < queue.length; k++) {
    for (let d = 0; d < 4; d++) {
      const r = sim.step(queue[k], d)
      if (!r || r[1] || seen.has(r[0].p)) continue
      seen.add(r[0].p)
      queue.push(r[0])
    }
  }
  return seen
}

// ---------------------------------------------------------------------
// the generator

type Rng = { rng: () => number; randomInt: (n: number) => number }

/** The ring's 8 cells round its heart, clockwise from the top left */
const AROUND: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
]

/**
 * What a draft leans to: water round the ring or the stone (sink),
 * bushes (bush), a sheet of ice (ice), a boulder to bank off a rock
 * (roll), or a bit of everything (mix). The signature is what the
 * solver finds, not this
 */
export type Aim = "sink" | "bush" | "ice" | "roll" | "mix"
export const AIMS: readonly Aim[] = ["sink", "bush", "ice", "roll", "mix"]

/** The way out of the gap (away from the heart), by the gap's place */
const OUT: [number, number][][] = [
  [[0, -1], [-1, 0]],
  [[0, -1]],
  [[0, -1], [1, 0]],
  [[1, 0]],
  [[0, 1], [1, 0]],
  [[0, 1]],
  [[0, 1], [-1, 0]],
  [[-1, 0]],
]

/**
 * A patch drawn at random (not checked yet). The things and the
 * terrain lean to lie on the line out of the gap (the way a thing has
 * to come in), or to be one push off it, so that more drafts can be
 * solved; the rest is left to chance
 */
export function draft(
  { rng, randomInt }: Rng,
  aim: Aim = AIMS[randomInt(AIMS.length)],
): Layout {
  const W = RING_W, H = RING_H
  const g: string[][] = Array.from({ length: H }, () => Array(W).fill("."))
  /** Inside the margin */
  const inner = (x: number, y: number) =>
    x >= 1 && y >= 1 && x < W - 1 && y < H - 1
  const reserved = new Set<string>()
  const keep = (x: number, y: number) => reserved.add(`${x},${y}`)
  const free = (x: number, y: number) =>
    inner(x, y) && g[y][x] === "." && !reserved.has(`${x},${y}`)
  // the ring, with room round it
  const moat = rng() < { sink: 0.6, bush: 0.3, ice: 0, roll: 0, mix: 0.2 }[aim]
  const gap = randomInt(8)
  // the line out of the gap: k = 1 is the cell in front of it
  const outs = OUT[gap]
  const [ox, oy] = outs[randomInt(outs.length)]
  // room on the line for a thing or two (four cells, or three)
  const room = moat ? 4 : 3
  let cx = 0, cy = 0
  for (let n = 0; n < 100; n++) {
    cx = 3 + randomInt(W - 6), cy = 3 + randomInt(H - 6)
    const x = cx + AROUND[gap][0] + ox * room
    const y = cy + AROUND[gap][1] + oy * room
    if (inner(x, y)) break
  }
  const line = (k: number): [number, number] => [
    cx + AROUND[gap][0] + ox * k,
    cy + AROUND[gap][1] + oy * k,
  ]
  g[cy][cx] = "O"
  AROUND.forEach(([dx, dy], n) => {
    g[cy + dy][cx + dx] = n === gap ? "_" : "o"
  })
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) keep(cx + dx, cy + dy)
  }
  const material = (): string => {
    const r = rng()
    if (aim === "sink") return r < 0.85 ? "w" : "#"
    if (aim === "bush") return r < 0.8 ? "k" : "#"
    return r < 0.35 ? "w" : r < 0.7 ? "k" : "#"
  }
  /** Draws the edge of a rectangle in the material */
  const wall = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || y === y0 || y === y1
        if (edge && inner(x, y) && g[y][x] === ".") g[y][x] = material()
      }
    }
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) keep(x, y)
    }
  }
  const things: Thing[] = []
  const putThing = (x: number, y: number, k: ThingKind) => {
    things.push({ kind: k, x, y })
    keep(x, y)
  }
  const kind = (stone: number): ThingKind => rng() < stone ? "stone" : "boulder"
  const onLine = (k: number) => {
    const [x, y] = line(k)
    return inner(x, y) && g[y][x] === "." &&
      !things.some((t) => t.x === x && t.y === y)
  }
  let stoneSpot: [number, number] | null = null
  if (moat) {
    // the ring closed in, right round it (water, bushes): something
    // goes in first, in front of the gap
    wall(cx - 2, cy - 2, cx + 2, cy + 2)
    const [x, y] = line(1)
    g[y][x] = aim === "sink" || (aim === "mix" && rng() < 0.5) ? "w" : "k"
  } else if (rng() < { sink: 1, bush: 1, ice: 0.2, roll: 0.1, mix: 0.6 }[aim]) {
    // the stone closed in, on the line or near it
    const k = 2 + randomInt(4)
    const [lx, ly] = line(k)
    const w = 1 + randomInt(3), h = 1 + randomInt(3)
    const x0 = lx - 1 - randomInt(w), y0 = ly - 1 - randomInt(h)
    if (x0 >= 1 && y0 >= 1 && x0 + w + 1 < W - 1 && y0 + h + 1 < H - 1) {
      // not over the ring, nor the cell in front of the gap
      const [ex, ey] = line(1)
      let clash = false
      for (let y = y0; y <= y0 + h + 1; y++) {
        for (let x = x0; x <= x0 + w + 1; x++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) <= 1) clash = true
          if (x === ex && y === ey) clash = true
        }
      }
      if (!clash) {
        wall(x0, y0, x0 + w + 1, y0 + h + 1)
        stoneSpot = rng() < 0.6
          ? [lx, ly]
          : [x0 + 1 + randomInt(w), y0 + 1 + randomInt(h)]
      }
    }
  }
  // a sheet of ice, often over the line
  if (rng() < { sink: 0.1, bush: 0.1, ice: 1, roll: 0.1, mix: 0.4 }[aim]) {
    const w = 2 + randomInt(5), h = 2 + randomInt(4)
    const [lx, ly] = line(1 + randomInt(4))
    const x0 = lx - randomInt(w), y0 = ly - randomInt(h)
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (inner(x, y) && g[y][x] === "." && !isRingCell(g, x, y)) {
          g[y][x] = "i"
        }
      }
    }
  }
  // a boulder to bank off a rock onto the line
  if (aim === "roll" || (aim === "mix" && rng() < 0.3)) {
    const k = 2 + randomInt(4)
    const [lx, ly] = line(k)
    const side = rng() < 0.5 ? 1 : -1
    // across the line: the rock on one side, the boulder on the other
    const [px, py] = [oy * side, ox * side]
    const m = 2 + randomInt(3)
    if (
      inner(lx + px, ly + py) && inner(lx - px * m, ly - py * m) &&
      g[ly + py][lx + px] === "." && g[ly - py * m][lx - px * m] === "."
    ) {
      g[ly + py][lx + px] = "#"
      keep(lx, ly)
      stoneSpot = [lx - px * m, ly - py * m]
    }
  }
  // a few loose trees, rocks, bushes and puddles, off the line
  for (let k = 1; inner(...line(k)); k++) keep(...line(k))
  const scatter = (c: string, n: number) => {
    for (let k = 0; k < n; k++) {
      const x = 1 + randomInt(W - 2), y = 1 + randomInt(H - 2)
      if (free(x, y)) g[y][x] = c
    }
  }
  scatter("#", aim === "roll" ? 2 + randomInt(5) : randomInt(5))
  scatter("k", aim === "roll" ? 0 : randomInt(aim === "bush" ? 4 : 3))
  scatter("w", randomInt(aim === "mix" ? 3 : 2))
  const loose = (): [number, number] | null => {
    for (let n = 0; n < 50; n++) {
      const x = 1 + randomInt(W - 2), y = 1 + randomInt(H - 2)
      if (
        (g[y][x] === "." || g[y][x] === "i") && !reserved.has(`${x},${y}`)
      ) return [x, y]
    }
    return null
  }
  // the stone
  const firstKind = kind(aim === "roll" ? 0 : aim === "ice" ? 0.7 : 0.5)
  if (moat) {
    // beyond the water on the line, a spare in front of it to sink,
    // and the stone further out (or off the line)
    if (onLine(2)) putThing(...line(2), kind(0.3))
    // (off the line by a cell, a stone: pushed onto it first)
    const k2 = inner(...line(5)) && rng() < 0.5 ? 5 : 4
    const [x2, y2] = line(k2)
    const side = rng() < 0.5 ? 1 : -1
    const [x3, y3] = [x2 + oy * side, y2 + ox * side]
    if (rng() < 0.3 && free(x3, y3)) putThing(x3, y3, "stone")
    else if (onLine(k2)) putThing(x2, y2, firstKind)
  }
  if (things.length === 0) {
    let at = stoneSpot
    if (!at && rng() < 0.5) {
      const k = 2 + randomInt(5)
      if (onLine(k)) at = line(k)
    }
    at ??= loose()
    if (at) putThing(at[0], at[1], firstKind)
  }
  // and a spare or two
  const spares = aim === "sink" && !moat
    ? 1 + randomInt(2)
    : randomInt(aim === "mix" ? 3 : 2)
  for (let n = 0; n < spares; n++) {
    const at = loose()
    if (at) putThing(at[0], at[1], kind(aim === "roll" ? 0 : 0.5))
  }
  const rows = g.map((r) => r.join(""))
  return { rows, things, start: [W >> 1, H - 1] }
}

const isRingCell = (g: string[][], x: number, y: number) =>
  g[y][x] === "o" || g[y][x] === "O" || g[y][x] === "_"

/** The fewest and most pushes a ring may take */
export const MIN_PUSHES = 2
export const MAX_PUSHES = 6

/** Checks a draft: a ring when it's good, null when it's thrown away */
export function accept(layout: Layout): Ring | null {
  if (layout.things.length === 0) return null
  const solved = solve(layout)
  if (!solved) return null
  if (solved.pushes < MIN_PUSHES || solved.pushes > MAX_PUSHES) return null
  const sig = signature(layout)
  if (!sig || sig.length === 0 || sigName(sig) === "push") return null
  // the reward: by the ring, where you can walk from the start
  const w = layout.rows[0].length
  const reach = walked(layout)
  const heart = layout.rows.join("").indexOf("O")
  const hx = heart % w, hy = Math.floor(heart / w)
  let reward: [number, number] | null = null
  // nearest first, straight out from the heart before aslant
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
  for (const [dx, dy] of near) {
    const x = hx + dx, y = hy + dy
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
    fills: solved.fills,
    reward,
  }
}

/** Draws patches until one is good (at most `tries`) */
export function makeRing(r: Rng, tries = 200): Ring | null {
  for (let n = 0; n < tries; n++) {
    const ring = accept(draft(r))
    if (ring) return ring
  }
  return null
}
