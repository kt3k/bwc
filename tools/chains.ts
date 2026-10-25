// The chain of trades (ideas/goal-types.md, 連鎖させる; 欲しがる者に渡す is
// its first link): two or three travellers sitting still on the open
// land, each with a picture of what they want in a bubble over their
// head (a jar, a sack, a wheel, a cask). Bring it to rest on the mat in
// front of them and they take it and put down what they have, on the
// same mat: the thing the next one wants. The last one gives the reward
// (model/chain.ts).
//
// The things are pushed by the one-line rules alone (tools/rings.ts): a
// jar and a sack move a cell when pushed, as a stone does; a wheel and a
// cask roll till something stops them, as a boulder does (rolled at
// someone, they stop on the mat at their feet). All sink in water and
// make it floor. Giving adds no rule: the mat is a ring's gap that takes
// only the one thing wanted (Layout.give).
//
// A chain is a patch of the map (CHAIN_W x CHAIN_H, the outermost cells
// open ground left as it was). It is drawn at random and solved link by
// link, as the player would: from where the last link left everything
// (the water filled, the bushes flat, the player where they stood), the
// thing laid on the mat; and again each link from a fresh place (the
// terrain as drawn, the spares back where they were: the place loaded
// again), so that a link can always be done. Kept are chains of 2 or 3
// links, each link 2 to 6 pushes from a fresh place (the thing laid is
// never brought in a push), 5 to 14 pushes in all, whose signature (the
// rules some link can't be done without, tools/rings.ts signature, link
// by link) is more than "push".
//
// The patch's characters are a ring's (tools/rings.ts), and:
//
//   V  one who wants a thing (solid)     M  the mat in front of them
//
// The things on it carry what they are (`goods`), the spares (stones,
// boulders) none.
import {
  type Layout,
  MAX_PUSHES,
  type Rule,
  RULES,
  sigName,
  signature,
  solve,
  type Thing,
  type ThingKind,
  trace,
  walked,
} from "./rings.ts"

/** What the travellers want and give */
export type Goods = "jar" | "sack" | "wheel" | "cask"
export const GOODS: readonly Goods[] = ["jar", "sack", "wheel", "cask"]
/** How each moves: a jar and a sack as a stone, a wheel and a cask roll */
export const GOODS_KIND: Record<Goods, ThingKind> = {
  jar: "stone",
  sack: "stone",
  wheel: "boulder",
  cask: "boulder",
}

/** A thing of a chain: a good, or a spare (no `goods`) */
export type ChainThing = Thing & { goods?: Goods }

/** The way one faces: their mat is the next cell that way */
export type Facing = "up" | "down" | "left" | "right"
export const FACINGS: readonly Facing[] = ["up", "down", "left", "right"]
const STEP_OF: Record<Facing, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}

/** One link: one who wants a thing, where, facing which way */
export type Link = {
  /** Their cell (V) */
  at: [number, number]
  /** The way they face (the mat M is in front of them) */
  dir: Facing
  /** What they want */
  want: Goods
}

/** A layout whose things carry what they are */
export type GoodsLayout = Omit<Layout, "things"> & { things: ChainThing[] }

export type ChainLayout = GoodsLayout & {
  things: ChainThing[]
  /** The links in order: the first one's thing lies on the patch */
  links: Link[]
}

export type Chain = ChainLayout & {
  /**
   * A solution (U D L R moves), link after link, each link the fewest
   * pushes from where the last one left everything
   */
  solution: string
  /** How many pushes (and bushes flattened) the solution takes */
  pushes: number
  /** The pushes of each link, from a fresh place */
  linkPushes: number[]
  /** The rules some link can't be done without (from a fresh place) */
  signature: Rule[]
  /** The rules each link can't be done without (from a fresh place) */
  linkSignatures: Rule[][]
  /** Where the reward appears: by the last one, walked to from the start */
  reward: [number, number]
}

/** The patch's size, the open margin included */
export const CHAIN_W = 19
export const CHAIN_H = 13

/** The mat of a link: the cell in front of them */
export const matOf = (link: Link): [number, number] => {
  const [dx, dy] = STEP_OF[link.dir]
  return [link.at[0] + dx, link.at[1] + dy]
}

/** What the k-th one gives: what the next one wants (none: the last) */
export const givesOf = (chain: ChainLayout, k: number): Goods | undefined =>
  chain.links[k + 1]?.want

/** Where everything is between links */
type Place = {
  rows: string[]
  things: ChainThing[]
  start: [number, number]
}

/**
 * The patch as the simulator takes it for the k-th link: their mat the
 * gap (taking only their thing), the other mats ground
 */
export function stageOf(
  chain: ChainLayout,
  k: number,
  place: Place,
): GoodsLayout {
  const [mx, my] = matOf(chain.links[k])
  const rows = place.rows.map((row, y) =>
    [...row].map((c, x) => c === "M" ? (x === mx && y === my ? "_" : ".") : c)
      .join("")
  )
  const give = place.things.findIndex((t) => t.goods === chain.links[k].want)
  return { rows, things: place.things, start: place.start, give }
}

/**
 * The place a fresh k-th link starts from: the terrain as drawn, the
 * spares where they lay, the player at the way in, and the thing the
 * last one laid on their mat (the first link: the first thing where it
 * lies)
 */
export function freshPlace(chain: ChainLayout, k: number): Place {
  const spares = chain.things.filter((t) => !t.goods)
  const things: ChainThing[] = k === 0
    ? [...chain.things.filter((t) => t.goods === chain.links[0].want)]
    : [laid(chain, k - 1)]
  return {
    rows: chain.rows,
    things: [...things, ...spares],
    start: chain.start,
  }
}

/** The thing the k-th one lays on their mat: what the next one wants */
function laid(chain: ChainLayout, k: number): ChainThing {
  const goods = chain.links[k + 1].want
  const [x, y] = matOf(chain.links[k])
  return { kind: GOODS_KIND[goods], goods, x, y }
}

/**
 * The place after the moves of the k-th link that end with their thing
 * on their mat: the water filled and the bushes flat stay so, the thing
 * is taken, and the next is laid on the mat
 */
export function after(
  chain: ChainLayout,
  k: number,
  place: Place,
  moves: string,
): Place {
  const stage = stageOf(chain, k, place)
  const end = trace(stage, moves).at(-1)
  if (!end?.done) throw new Error(`link ${k} isn't done by ${moves}`)
  const w = place.rows[0].length
  const filled = new Set([...end.filled, ...end.flat])
  const rows = place.rows.map((row, y) =>
    [...row].map((c, x) => filled.has(y * w + x) ? "." : c).join("")
  )
  const things: ChainThing[] = []
  place.things.forEach((t, n) => {
    const at = end.things[n]
    if (at < 0 || n === stage.give) return
    things.push({ ...t, x: at % w, y: Math.floor(at / w) })
  })
  if (k + 1 < chain.links.length) things.unshift(laid(chain, k))
  return {
    rows,
    things,
    start: [end.player % w, Math.floor(end.player / w)],
  }
}

export type ChainSolution = {
  /** The moves of each link */
  links: string[]
  /** The pushes of each link */
  pushes: number[]
}

/**
 * Solves the chain link by link, each from where the last left
 * everything (the fewest pushes for each). Null when a link can't be
 * done
 */
export function solveChain(chain: ChainLayout): ChainSolution | null {
  let place: Place = freshPlace(chain, 0)
  const links: string[] = [], pushes: number[] = []
  for (let k = 0; k < chain.links.length; k++) {
    const solved = solve(stageOf(chain, k, place))
    if (!solved) return null
    links.push(solved.moves)
    pushes.push(solved.pushes)
    place = after(chain, k, place, solved.moves)
  }
  return { links, pushes }
}

/**
 * Plays the moves of a whole chain (link after link, each link's moves
 * ending when it is done); how many links are done
 */
export function linksDone(chain: ChainLayout, moves: string): number {
  let place: Place = freshPlace(chain, 0)
  let k = 0
  let rest = moves
  while (k < chain.links.length && rest.length > 0) {
    const stage = stageOf(chain, k, place)
    const steps = trace(stage, rest)
    const end = steps.at(-1)
    if (!end?.done) return k
    const used = rest.slice(0, steps.length)
    place = after(chain, k, place, used)
    rest = rest.slice(steps.length)
    k++
  }
  return k
}

// ---------------------------------------------------------------------
// the generator

type Rng = { rng: () => number; randomInt: (n: number) => number }

/**
 * What a link leans to: its thing across water (water), behind bushes
 * (bush), out on the ice (ice), off its line, to be banked onto it
 * (bank), or far, among loose rocks and trees (far)
 */
export type LinkAim = "water" | "bush" | "ice" | "bank" | "far"
export const LINK_AIMS: readonly LinkAim[] = [
  "water",
  "bush",
  "ice",
  "bank",
  "far",
]

const D4: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]

/**
 * A chain drawn at random (not checked yet), of `n` links. The first
 * one sits somewhere, their thing out along the line straight into
 * their mat (or a cell off it), past what makes it hard; each next one
 * sits so that the line into their mat passes the last one's mat (or a
 * cell off it), with something hard on the way too
 */
export function draftChain(
  { rng, randomInt }: Rng,
  n = rng() < 0.5 ? 2 : 3,
): ChainLayout {
  const W = CHAIN_W, H = CHAIN_H
  const g: string[][] = Array.from({ length: H }, () => Array(W).fill("."))
  const inner = (x: number, y: number) =>
    x >= 1 && y >= 1 && x < W - 1 && y < H - 1
  const reserved = new Set<string>()
  const keep = (x: number, y: number) => reserved.add(`${x},${y}`)
  const isKept = (x: number, y: number) => reserved.has(`${x},${y}`)
  const free = (x: number, y: number) =>
    inner(x, y) && g[y][x] === "." && !isKept(x, y)
  const set = (x: number, y: number, c: string) => {
    if (inner(x, y) && g[y][x] === "." && !isKept(x, y)) g[y][x] = c
  }
  const order = [...GOODS]
  for (let k = order.length - 1; k > 0; k--) {
    const r = randomInt(k + 1)
    ;[order[k], order[r]] = [order[r], order[k]]
  }
  const goods = order.slice(0, n)
  const things: ChainThing[] = []
  const thingAt = (x: number, y: number) =>
    things.some((t) => t.x === x && t.y === y)
  const putThing = (x: number, y: number, kind: ThingKind, gd?: Goods) => {
    if (!inner(x, y) || (g[y][x] !== "." && g[y][x] !== "i")) return false
    if (thingAt(x, y) || isKept(x, y)) return false
    things.push(gd ? { kind, x, y, goods: gd } : { kind, x, y })
    keep(x, y)
    return true
  }
  const links: Link[] = []
  /** Seats one: false if it doesn't fit */
  const seat = (x: number, y: number, dir: Facing) => {
    const [dx, dy] = STEP_OF[dir]
    const mx = x + dx, my = y + dy
    // room for the bubble over their head and to come at the mat
    if (!inner(x, y) || !inner(mx, my) || y < 2) return false
    if (!free(x, y) || !free(mx, my) || thingAt(mx, my)) return false
    for (const [ex, ey] of D4) {
      if (g[y + ey]?.[x + ex] === "V" || g[my + ey]?.[mx + ex] === "V") {
        return false
      }
    }
    g[y][x] = "V"
    g[my][mx] = "M"
    keep(x, y)
    keep(mx, my)
    return true
  }
  /**
   * Draws what makes a link hard on its line, from the mat out to its
   * thing at s (k: 1 is the cell in front of the mat), and where the
   * thing is to be: on the line at s, or a cell off it (side)
   */
  const hard = (
    line: (k: number) => [number, number],
    perp: [number, number],
    s: number,
    side: number,
    kind: ThingKind,
    aim: LinkAim,
  ) => {
    for (let k = 1; k <= s + 1; k++) keep(...line(k))
    const across = (k: number, half: number, c: string) => {
      const [x, y] = line(k)
      for (let q = -half; q <= half; q++) {
        if (q === 0) continue
        set(x + perp[0] * q, y + perp[1] * q, c)
      }
    }
    const lay = (k: number, c: string) => {
      const [x, y] = line(k)
      if (inner(x, y) && g[y][x] === "." && !thingAt(x, y)) g[y][x] = c
    }
    const k0 = 1 + randomInt(Math.max(1, s - 2))
    if (aim === "water" || aim === "bush") {
      const c = aim === "water" ? "w" : "k"
      const depth = aim === "water" && s - k0 >= 3 && rng() < 0.4 ? 2 : 1
      for (let k = k0; k < k0 + depth && k < s; k++) {
        lay(k, c)
        across(k, 1 + randomInt(2), c)
      }
      if (aim === "water") {
        // a spare to sink first, by the line on the far side
        const [x, y] = line(Math.min(s - 1, k0 + depth))
        const q = rng() < 0.5 ? 1 : -1
        const spare: ThingKind = rng() < 0.7 ? "stone" : "boulder"
        if (!putThing(x + perp[0] * q, y + perp[1] * q, spare)) {
          putThing(x - perp[0] * q, y - perp[1] * q, spare)
        }
        if (depth === 2) {
          const [fx, fy] = line(s + 1)
          putThing(fx + perp[0] * q, fy + perp[1] * q, "stone")
        }
      }
    } else if (aim === "ice") {
      const w = 3 + randomInt(3), h = 3 + randomInt(3)
      const [lx, ly] = line(k0)
      const x0 = lx - randomInt(w), y0 = ly - randomInt(h)
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
          if (inner(x, y) && g[y][x] === "." && !thingAt(x, y)) {
            const [mx, my] = line(0)
            if (x === mx && y === my) continue
            g[y][x] = "i"
          }
        }
      }
    } else if (aim === "bank" && kind === "boulder" && side !== 0) {
      // the rock that stops it on the line, across from where it lies
      const [x, y] = line(s)
      const bx = x - perp[0] * side, by = y - perp[1] * side
      if (inner(bx, by) && !thingAt(bx, by)) {
        g[by][bx] = "#"
        keep(bx, by)
      }
    } else if (aim === "far") {
      for (let m = 0; m < 2; m++) {
        const k = 1 + randomInt(Math.max(1, s - 1))
        across(k, 1, rng() < 0.5 ? "#" : "k")
      }
    }
  }
  // the first one, and their thing
  {
    let ok = false
    for (let t = 0; t < 50 && !ok; t++) {
      const dir = FACINGS[randomInt(4)]
      ok = seat(2 + randomInt(W - 4), 2 + randomInt(H - 4), dir)
      if (ok) links.push({ at: [0, 0], dir, want: goods[0] })
    }
    if (!ok) {
      return {
        rows: g.map((r) => r.join("")),
        things,
        start: [W >> 1, H - 1],
        links: [],
      }
    }
    // (where they sat)
    const y = g.findIndex((row) => row.includes("V"))
    links[0].at = [g[y].indexOf("V"), y]
  }
  const lineOf = (link: Link) => {
    const [mx, my] = matOf(link)
    const [dx, dy] = STEP_OF[link.dir]
    return (k: number): [number, number] => [mx + dx * k, my + dy * k]
  }
  const perpOf = (link: Link): [number, number] => {
    const [dx, dy] = STEP_OF[link.dir]
    return [dy, dx]
  }
  {
    const link = links[0]
    const line = lineOf(link), perp = perpOf(link)
    const kind = GOODS_KIND[goods[0]]
    const aim = LINK_AIMS[randomInt(LINK_AIMS.length)]
    let s = 3 + randomInt(3)
    while (s > 2 && !inner(...line(s))) s--
    const side = aim === "bank" || rng() < 0.4 ? (rng() < 0.5 ? 1 : -1) : 0
    hard(line, perp, s, side, kind, aim)
    const [x, y] = line(s)
    const far = aim === "bank" && kind === "boulder" ? 2 + randomInt(2) : 1
    if (
      side === 0 ||
      !putThing(
        x + perp[0] * side * far,
        y + perp[1] * side * far,
        kind,
        goods[0],
      )
    ) putThing(x, y, kind, goods[0])
  }
  // the next ones: the line into each one's mat passes the last mat
  for (let k = 1; k < n; k++) {
    const prev = matOf(links[k - 1])
    let ok = false
    for (let t = 0; t < 60 && !ok; t++) {
      const dir = FACINGS[randomInt(4)]
      const [dx, dy] = STEP_OF[dir]
      const s = 3 + randomInt(4)
      const side = rng() < 0.4 ? (rng() < 0.5 ? 1 : -1) : 0
      const perp: [number, number] = [dy, dx]
      // prev = mat + d * s + perp * side
      const mx = prev[0] - dx * s - perp[0] * side
      const my = prev[1] - dy * s - perp[1] * side
      const x = mx - dx, y = my - dy
      // the line between must be open so far
      let clear = true
      for (let q = 1; q <= s + 1; q++) {
        const lx = mx + dx * q, ly = my + dy * q
        if (!inner(lx, ly)) {
          if (q <= s) clear = false
          continue
        }
        if (g[ly][lx] === "V" || g[ly][lx] === "M") {
          if (!(side === 0 && q === s)) clear = false
        }
      }
      if (!clear) continue
      if (!seat(x, y, dir)) continue
      ok = true
      const link: Link = { at: [x, y], dir, want: goods[k] }
      links.push(link)
      const kind = GOODS_KIND[goods[k]]
      const aims = side !== 0 && kind === "boulder"
        ? LINK_AIMS
        : LINK_AIMS.filter((a) => a !== "bank")
      hard(lineOf(link), perp, s, side, kind, aims[randomInt(aims.length)])
    }
    if (!ok) break
  }
  // a few loose trees, rocks, bushes and puddles
  const scatter = (c: string, m: number) => {
    for (let q = 0; q < m; q++) {
      const x = 1 + randomInt(W - 2), y = 1 + randomInt(H - 2)
      if (free(x, y) && !thingAt(x, y)) g[y][x] = c
    }
  }
  scatter("#", 2 + randomInt(5))
  scatter("k", randomInt(3))
  scatter("w", randomInt(2))
  // the way in stays open
  g[H - 1][W >> 1] = "."
  return {
    rows: g.map((row) => row.join("")),
    things,
    start: [W >> 1, H - 1],
    links,
  }
}

/** The fewest and most pushes a link may take (from a fresh place) */
export const LINK_MIN_PUSHES = 2
export const LINK_MAX_PUSHES = MAX_PUSHES
/** The fewest and most pushes a whole chain may take, link after link */
export const CHAIN_MIN_PUSHES = 5
export const CHAIN_MAX_PUSHES = 14

/** The signatures in one, in the order of the rules */
const union = (sigs: Rule[][]): Rule[] =>
  RULES.filter((r) => sigs.some((s) => s.includes(r)))

/** Checks a draft: a chain when it's good, null when it's thrown away */
export function acceptChain(chain: ChainLayout): Chain | null {
  const n = chain.links.length
  if (n < 2 || n > 3) return null
  // each link from a fresh place: 2 to 6 pushes, and its signature
  const linkPushes: number[] = []
  const linkSignatures: Rule[][] = []
  for (let k = 0; k < n; k++) {
    const stage = stageOf(chain, k, freshPlace(chain, k))
    if (stage.give! < 0) return null
    const solved = solve(stage)
    if (!solved) return null
    if (solved.pushes < LINK_MIN_PUSHES || solved.pushes > LINK_MAX_PUSHES) {
      return null
    }
    const sig = signature(stage)
    if (!sig) return null
    linkPushes.push(solved.pushes)
    linkSignatures.push(sig)
  }
  const sig = union(linkSignatures)
  if (sig.length === 0 || sigName(sig) === "push") return null
  // the whole chain, link after link as the player would
  const solved = solveChain(chain)
  if (!solved) return null
  const pushes = solved.pushes.reduce((a, b) => a + b, 0)
  if (pushes < CHAIN_MIN_PUSHES || pushes > CHAIN_MAX_PUSHES) return null
  // the reward: by the last one, where you can walk from the start
  const w = chain.rows[0].length
  const reach = walked({ ...chain, rows: chain.rows.map(groundMats) })
  const [lx, ly] = chain.links[n - 1].at
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
    const x = lx + dx, y = ly + dy
    if (chain.rows[y]?.[x] !== ".") continue
    if (!reach.has(y * w + x)) continue
    if (chain.things.some((t) => t.x === x && t.y === y)) continue
    reward = [x, y]
    break
  }
  if (!reward) return null
  return {
    ...chain,
    solution: solved.links.join(""),
    pushes,
    linkPushes,
    signature: sig,
    linkSignatures,
    reward,
  }
}

const groundMats = (row: string) => row.replace(/M/g, ".")

/** Draws chains until one is good (at most `tries`) */
export function makeChain(r: Rng, tries = 400): Chain | null {
  for (let n = 0; n < tries; n++) {
    const chain = acceptChain(draftChain(r))
    if (chain) return chain
  }
  return null
}

/** The name a chain is counted by: its signature and its length */
export const chainName = (chain: Chain) =>
  `${sigName(chain.signature)} ${chain.links.length}`
