// Generates the WILDS: an island region east of the world, grown
// organically instead of drawn with rectangles (see
// ideas/organic-maps.md). The existing world is left as it is.
//
// The pipeline:
//
// 1. one island-wide height and moisture field (fBm value noise with
//    domain warping and a coastal falloff), so the land runs across the
//    block borders with no seams
// 2. rivers: dropped on high ground, they flow downhill to the sea or
//    pool into lakes, and wet the land around them
// 3. terrain from height x moisture (sea, sand, meadow, forest, hills,
//    rock), smoothed by a majority filter so it reads in shapes
// 4. the anchors of tools/wilds_plan.json (arrival, villages, landmarks)
//    plus a few camps, snapped to fitting land
// 5. roads: a spanning tree over the anchors plus a couple of loops,
//    each routed by A* around water and rock (bridges where rivers are
//    crossed), so they wind with the land
// 6. the towns, each by its layout in the plan (crossroads, ring around
//    a pond, walled grid, market street with fields; the land, streets
//    and walls are laid before the roads, so the roads join the streets
//    and come in by the gates): houses facing the streets, plazas,
//    stalls, and townsfolk who live by their roles
// 7. scatter by density and spacing (Poisson disc): trees in forests,
//    rocks on hills, flowers by the water, coins far from the roads,
//    animals where they belong
// 8. every walkable cell is made reachable from the arrival, or filled
//
// It also adds the "W" portal room to the START island.
//
// Usage: deno -A tools/generate_wilds.ts
import { seed } from "../util/random.ts"
import { loadCatalog } from "../model/catalog.ts"
import { createRooms } from "./rooms.ts"
import { Palette } from "../util/palette.ts"
import { encodePng } from "./png.ts"
import { fbm, hash, smoothstep } from "./noise.ts"
import { type Kind, MAKERS } from "./minipuzzles.ts"

type Spawn = { i: number; j: number; type: string; data?: unknown }
type Anchor = { x: number; y: number; name: string }
type Plan = {
  seed: string
  origin: { i: number; j: number }
  blocks: { w: number; h: number }
  arrival: { x: number; y: number; name: string }
  villages: {
    x: number
    y: number
    name: string
    houses: number
    /** crossroads (default), ring, walled or market */
    layout?: string
  }[]
  landmarks: { x: number; y: number; name: string; kind: string }[]
  camps: number
  cave: { x: number; y: number; name: string }
  /** the pier of the bridge to the CITY (the row is fixed) */
  east: { y: number; name: string }
}

const plan: Plan = JSON.parse(
  await Deno.readTextFile(new URL("./wilds_plan.json", import.meta.url)),
)
const BLOCK = 200
const W = plan.blocks.w * BLOCK
const H = plan.blocks.h * BLOCK
const OI = plan.origin.i
const OJ = plan.origin.j
const { rng, randomInt, shuffle } = seed(plan.seed)

const catalog = await loadCatalog(
  new URL("../static/catalog/base.json", import.meta.url).href,
  ["base.json"],
)

// ---------------------------------------------------------------------
// 1. height and moisture

const idx = (x: number, y: number) => y * W + x
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H
const height = new Float32Array(W * H)
const flow = new Float32Array(W * H)
const moist = new Float32Array(W * H)
const S = hash(plan.seed.length, 7, 3) * 1000 | 0
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    // domain warp: the noise is sampled at a wobbled position
    const wx = x + 60 * (fbm(x / 150, y / 150, S + 11, 3) - 0.5)
    const wy = y + 60 * (fbm(x / 150, y / 150, S + 23, 3) - 0.5)
    const e = fbm(wx / 110, wy / 110, S + 1, 5)
    const dx = (x / W - 0.5) * 2
    const dy = (y / H - 0.5) * 2
    const d = Math.sqrt(dx * dx + dy * dy) +
      (fbm(x / 70, y / 70, S + 5, 3) - 0.5) * 0.35
    const island = 1 - smoothstep(0.62, 1.02, d)
    height[idx(x, y)] = e * 0.7 + island * 0.6 - 0.25
    // a smoother copy (fewer hollows) for the rivers to run down
    flow[idx(x, y)] = fbm(wx / 110, wy / 110, S + 1, 2) * 0.7 + island * 0.6
    moist[idx(x, y)] = fbm(wx / 80, wy / 80, S + 7, 4)
  }
}
const SEA = 0.32
const HILL = 0.76
const ROCK = 0.84

// ---------------------------------------------------------------------
// terrain

enum T {
  SEA,
  SAND,
  MEADOW,
  FOREST,
  HILL,
  ROCK,
  RIVER,
  LAKE,
  ROAD,
  BRIDGE,
  PLAZA,
  WALL,
  FLOOR,
  TREE,
  STONE, // shrine / ruins floor
  CAMP,
  FIELD, // tilled soil of the farms
  RAMPART, // a town wall (STONEGATE)
  RUIN, // the broken walls of the ruins
  TRIAL, // the floor of a mini puzzle room
  ICE, // the ice of a mini puzzle room
}
const CELL: Record<T, string> = {
  [T.SEA]: "w",
  [T.SAND]: "y",
  [T.MEADOW]: "6",
  [T.FOREST]: "f",
  [T.HILL]: "p",
  [T.ROCK]: "1",
  [T.RIVER]: "w",
  [T.LAKE]: "w",
  [T.ROAD]: "3", // floor2.png: tiles with a dotted edge, apart from the meadow
  [T.BRIDGE]: "d",
  [T.PLAZA]: "c",
  [T.WALL]: "V", // wall_planks: the wooden houses
  [T.FLOOR]: "d",
  [T.TREE]: "J", // wall_canopy: the trees, a mass of leaves
  [T.STONE]: "m",
  [T.CAMP]: "p",
  [T.FIELD]: "t",
  [T.RAMPART]: "L", // wall_battlement
  [T.RUIN]: "Z", // wall_sandstone
  [T.TRIAL]: "4",
  [T.ICE]: "i",
}
const terrain = new Uint8Array(W * H)
const isWater = (t: T) => t === T.SEA || t === T.RIVER || t === T.LAKE
const isWild = (t: T) =>
  t === T.MEADOW || t === T.FOREST || t === T.HILL || t === T.SAND

// ---------------------------------------------------------------------
// 2. rivers

const D4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const D8: [number, number][] = [
  ...D4,
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]
const water = new Uint8Array(W * H) // 1 river, 2 lake
for (let p = 0; p < W * H; p++) if (height[p] < SEA) water[p] = 3 // sea

const sources: [number, number][] = []
{
  const cands: [number, number, number][] = []
  for (let y = 20; y < H - 20; y += 4) {
    for (let x = 20; x < W - 20; x += 4) {
      const h = height[idx(x, y)]
      if (h > 0.62 && h < ROCK) cands.push([x, y, h])
    }
  }
  cands.sort((a, b) => b[2] - a[2])
  for (const [x, y] of cands) {
    if (sources.every(([sx, sy]) => Math.hypot(sx - x, sy - y) > 150)) {
      sources.push([x, y])
    }
    if (sources.length >= 4) break
  }
}
for (const [sx, sy] of sources) {
  // The cheapest way to the sea over the smooth field: running down is
  // nearly free, climbing is dear, so it follows the valleys. Where it
  // has to climb out of a hollow, the water pools into a pond first
  const path = cheapestPath(
    idx(sx, sy),
    (p) => water[p] === 3,
    (p, q) =>
      // the meander: smooth noise makes the cheap way bend
      0.3 + Math.pow(fbm((q % W) / 18, ((q / W) | 0) / 18, S + 41, 3), 2) * 4 +
      Math.max(0, flow[q] - flow[p]) * 3000,
  )
  for (let k = 0; k < path.length; k++) {
    const p = path[k]
    if (water[p] === 3) break
    const x = p % W, y = (p / W) | 0
    water[p] = Math.max(water[p], 1)
    // two cells wide, beside the direction of flow
    const q = path[Math.min(k + 1, path.length - 1)]
    const side = Math.abs(q - p) === 1 ? idx(x, y + 1) : idx(x + 1, y)
    if (inside(x + 1, y + 1) && water[side] !== 3) {
      water[side] = Math.max(water[side], 1)
    }
    const next = path[k + 1]
    if (next !== undefined && flow[next] > flow[p] + 0.004 && k > 20) {
      const r = 3 + randomInt(3)
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const lx = x + dx, ly = y + dy
          const wob = (fbm(lx / 6, ly / 6, S + 31, 2) - 0.5) * 3
          if (inside(lx, ly) && Math.hypot(dx, dy) + wob <= r) {
            water[idx(lx, ly)] = Math.max(water[idx(lx, ly)], 2)
          }
        }
      }
    }
  }
}
// lakes where the low land is wettest
for (let p = 0; p < W * H; p++) {
  if (water[p] === 0 && moist[p] > 0.7 && height[p] < 0.55) water[p] = 2
}
// the rivers wet the land around them
{
  const dist = bfsDistance((p) => water[p] === 1 || water[p] === 2, 8)
  for (let p = 0; p < W * H; p++) {
    if (dist[p] <= 8) moist[p] += 0.18 * (1 - dist[p] / 8)
  }
}

/**
 * Cheapest path (4-dir) from start to the first goal cell, by Dijkstra
 * or A* (with a heuristic), on a binary heap. Returns the cells.
 */
function cheapestPath(
  start: number,
  isGoal: (p: number) => boolean,
  cost: (p: number, q: number) => number,
  heuristic: (x: number, y: number) => number = () => 0,
): number[] {
  const g = new Float64Array(W * H).fill(Infinity)
  const from = new Int32Array(W * H).fill(-1)
  const heap: [number, number][] = []
  const push = (f: number, p: number) => {
    heap.push([f, p])
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heap[parent][0] <= heap[i][0]) break
      ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
      i = parent
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  g[start] = 0
  push(0, start)
  let end = -1
  while (heap.length > 0) {
    const [f, p] = pop()
    const x = p % W, y = (p / W) | 0
    if (f > g[p] + heuristic(x, y) + 1e-6) continue // a stale entry
    if (isGoal(p)) {
      end = p
      break
    }
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy
      if (!inside(nx, ny)) continue
      const q = idx(nx, ny)
      const ng = g[p] + cost(p, q)
      if (ng < g[q]) {
        g[q] = ng
        from[q] = p
        push(ng + heuristic(nx, ny), q)
      }
    }
  }
  const path: number[] = []
  for (let p = end; p !== -1; p = from[p]) path.unshift(p)
  return path
}

/** Multi-source BFS distance (4-dir) from the cells matching src, up to max */
function bfsDistance(src: (p: number) => boolean, max: number): Uint16Array {
  const dist = new Uint16Array(W * H).fill(65535)
  const queue: number[] = []
  for (let p = 0; p < W * H; p++) {
    if (src(p)) {
      dist[p] = 0
      queue.push(p)
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const p = queue[q]
    if (dist[p] >= max) continue
    const x = p % W, y = (p / W) | 0
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy
      if (!inside(nx, ny)) continue
      const np = idx(nx, ny)
      if (dist[np] > dist[p] + 1) {
        dist[np] = dist[p] + 1
        queue.push(np)
      }
    }
  }
  return dist
}

// ---------------------------------------------------------------------
// 3. terrain by height x moisture, smoothed

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = idx(x, y)
    const h = height[p]
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y)
    if (water[p] === 3 || edge < 4) terrain[p] = T.SEA
    else if (water[p] === 2) terrain[p] = T.LAKE
    else if (water[p] === 1) terrain[p] = T.RIVER
    else if (h < SEA + 0.025) terrain[p] = T.SAND
    else if (h > ROCK) terrain[p] = T.ROCK
    else if (h > HILL) terrain[p] = T.HILL
    else if (moist[p] > 0.5) terrain[p] = T.FOREST
    else terrain[p] = T.MEADOW
  }
}
// majority filter over the land kinds: specks join their surroundings
for (let pass = 0; pass < 3; pass++) {
  const next = terrain.slice()
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = idx(x, y)
      const t = terrain[p]
      if (!(isWild(t) || t === T.ROCK)) continue
      const counts = new Map<number, number>()
      for (const [dx, dy] of D8) {
        const nt = terrain[idx(x + dx, y + dy)]
        if (isWild(nt) || nt === T.ROCK) {
          counts.set(nt, (counts.get(nt) ?? 0) + 1)
        }
      }
      for (const [k, n] of counts) {
        if (k !== t && n >= 5) next[p] = k
      }
    }
  }
  terrain.set(next)
}

// ---------------------------------------------------------------------
// 4. anchors

const props: Spawn[] = []
const actors: Spawn[] = []
const items: Spawn[] = []
const taken = new Set<number>() // cells holding a spawn
/** Cells kept clear of trees and rocks (structures and their margins) */
const keepClear = new Uint8Array(W * H)

const put = (
  list: Spawn[],
  x: number,
  y: number,
  type: string,
  data?: unknown,
) => {
  const p = idx(x, y)
  if (taken.has(p)) return false
  taken.add(p)
  list.push({ i: OI + x, j: OJ + y, type, ...(data ? { data } : {}) })
  return true
}

/** Fits an anchor onto land: the nearest spot with room to build */
function snap(fx: number, fy: number, r: number): [number, number] {
  const x0 = Math.round(fx * W), y0 = Math.round(fy * H)
  for (let d = 0; d < 200; d++) {
    for (let dy = -d; dy <= d; dy++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue
        const x = x0 + dx, y = y0 + dy
        if (fits(x, y, r)) return [x, y]
      }
    }
  }
  throw new Error(`no room for an anchor near ${fx},${fy}`)
}
function fits(x: number, y: number, r: number) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (!inside(x + dx, y + dy)) return false
      const t = terrain[idx(x + dx, y + dy)]
      if (!(t === T.MEADOW || t === T.FOREST || t === T.HILL)) return false
    }
  }
  return true
}
function disc(x: number, y: number, r: number, t: T) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (inside(x + dx, y + dy) && dx * dx + dy * dy <= r * r + r) {
        terrain[idx(x + dx, y + dy)] = t
        keepClear[idx(x + dx, y + dy)] = 1
      }
    }
  }
}

type Node = { x: number; y: number; name: string; kind: string }
const nodes: Node[] = []
{
  const [x, y] = snap(plan.arrival.x, plan.arrival.y, 5)
  nodes.push({ x, y, name: plan.arrival.name, kind: "arrival" })
}
for (const v of plan.villages) {
  const [x, y] = snap(v.x, v.y, 12)
  nodes.push({ x, y, name: v.name, kind: "village" })
}
for (const l of plan.landmarks) {
  const [x, y] = snap(l.x, l.y, 6)
  nodes.push({ x, y, name: l.name, kind: l.kind })
}
// the cave mouth: on a fixed column (the cavern below lines up with it),
// at the nearest spot along it with room
{
  const x = Math.round(plan.cave.x * W)
  const y0 = Math.round(plan.cave.y * H)
  let found = -1
  for (let d = 0; d < H && found < 0; d++) {
    for (const y of [y0 - d, y0 + d]) {
      if (found < 0 && fits(x, y, 4)) found = y
    }
  }
  if (found < 0) throw new Error("no room for the cave mouth")
  nodes.push({ x, y: found, name: plan.cave.name, kind: "cave" })
}
// the east pier: on a fixed row (the city lines its bridge up with it),
// at the easternmost land with room; a bridge runs from it over the sea
// to the edge of the WILDS
{
  const y = Math.round(plan.east.y * H)
  let x = W - 1
  while (x > W / 2 && !fits(x, y, 3)) x--
  nodes.push({ x, y, name: plan.east.name, kind: "east" })
  for (let bx = x + 3; bx < W; bx++) {
    for (const by of [y, y + 1]) {
      const p = idx(bx, by)
      terrain[p] = isWater(terrain[p] as T) ? T.BRIDGE : T.ROAD
      keepClear[p] = 1
    }
  }
}
// camps: spaced out on the remaining land (Poisson disc against the rest)
{
  const cands: [number, number][] = []
  for (let n = 0; n < 4000 && cands.length < plan.camps; n++) {
    const x = 30 + randomInt(W - 60), y = 30 + randomInt(H - 60)
    if (!fits(x, y, 3)) continue
    if (
      [...nodes, ...cands.map(([cx, cy]) => ({ x: cx, y: cy }))].every((o) =>
        Math.hypot(o.x - x, o.y - y) > 90
      )
    ) cands.push([x, y])
  }
  cands.forEach(([x, y], n) =>
    nodes.push({ x, y, name: `CAMP ${n + 1}`, kind: "camp" })
  )
}
// clear the ground under each anchor
for (const n of nodes) {
  const r = n.kind === "village" ? 6 : n.kind === "camp" ? 2 : 4
  disc(
    n.x,
    n.y,
    r,
    n.kind === "village"
      ? T.PLAZA
      : n.kind === "camp"
      ? T.CAMP
      : n.kind === "arrival"
      ? T.PLAZA
      : T.STONE,
  )
}

// the old tunnel: from the cave mouth straight south across the border,
// walled on both sides (it crosses the shore and the sea)
{
  const cave = nodes.find((n) => n.kind === "cave")!
  for (let y = cave.y + 4; y < H; y++) {
    for (let dx = -2; dx <= 2; dx++) {
      const p = idx(cave.x + dx, y)
      terrain[p] = Math.abs(dx) === 2 ? T.ROCK : T.CAMP
      keepClear[p] = 1
    }
  }
}

// ---------------------------------------------------------------------
// 5. roads: a spanning tree over the anchors and a couple of loops

const edges: [number, number][] = []
{
  const inTree = new Set([0])
  while (inTree.size < nodes.length) {
    let best: [number, number, number] | null = null
    for (const a of inTree) {
      for (let b = 0; b < nodes.length; b++) {
        if (inTree.has(b)) continue
        const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y)
        if (!best || d < best[2]) best = [a, b, d]
      }
    }
    edges.push([best![0], best![1]])
    inTree.add(best![1])
  }
  // loops: each village also reaches its nearest unlinked anchor
  let loops = 0
  for (let a = 0; a < nodes.length && loops < 2; a++) {
    if (nodes[a].kind !== "village") continue
    const others = nodes.map((
      n,
      b,
    ) => [b, Math.hypot(n.x - nodes[a].x, n.y - nodes[a].y)])
      .filter(([b]) =>
        b !== a &&
        !edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))
      ).sort((p, q) => p[1] - q[1])
    if (others.length > 0 && others[0][1] < 320) {
      edges.push([a, others[0][0]])
      loops++
    }
  }
}

function stepCost(p: number, q: number): number {
  const t = terrain[q]
  let c: number
  switch (t) {
    case T.SEA:
    case T.WALL:
    case T.RUIN:
    case T.RAMPART: // the town walls: the roads come in by the gates
    case T.FLOOR:
      return Infinity
    case T.RIVER:
      c = 10
      break
    case T.LAKE:
      c = 30
      break
    case T.ROCK:
      c = 40
      break
    case T.HILL:
      c = 3
      break
    case T.FOREST:
      c = 2.5
      break
    case T.ROAD:
    case T.BRIDGE:
      c = 0.4
      break
    case T.PLAZA:
    case T.STONE:
    case T.CAMP:
      c = 0.6
      break
    default:
      c = 1.2
  }
  // a little low-frequency noise in the cost makes the roads wander
  const x = q % W, y = (q / W) | 0
  const wander = 0.2 + Math.pow(fbm(x / 22, y / 22, S + 51, 3), 2) * 4
  return c * wander + Math.abs(height[q] - height[p]) * 80
}

/** A* to the goal cell (4-dir) over the given step cost */
function route(ax: number, ay: number, bx: number, by: number): number[] {
  const goal = idx(bx, by)
  return cheapestPath(
    idx(ax, ay),
    (p) => p === goal,
    stepCost,
    (x, y) => (Math.abs(bx - x) + Math.abs(by - y)) * 0.4,
  )
}
const roadCells = new Set<number>()
/** The town ponds: the roads stop at the bank (no bridge to the middle) */
const ponds = new Set<number>()
function lay(p: number) {
  const t = terrain[p]
  if (t === T.PLAZA || t === T.STONE || t === T.CAMP || ponds.has(p)) return
  terrain[p] = isWater(t) ? T.BRIDGE : t === T.BRIDGE ? T.BRIDGE : T.ROAD
  keepClear[p] = 1
  roadCells.add(p)
}
// ---------------------------------------------------------------------
// the towns' ground: cleared land, streets, walls and ponds, laid before
// the roads so that the roads join the streets (and come in by the gates)

type Layout = "crossroads" | "ring" | "walled" | "market"
/** The radius of each kind of town */
const TOWN_R: Record<Layout, number> = {
  crossroads: 30,
  ring: 24,
  walled: 26,
  market: 30,
}
const layoutOf = (n: Node): Layout =>
  (plan.villages.find((v) => v.name === n.name)?.layout ??
    "crossroads") as Layout
const townR = (n: Node) => TOWN_R[layoutOf(n)]

/** A straight street, 2 cells wide (the second cell right or below) */
function street(x0: number, y0: number, x1: number, y1: number) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
  const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0)
  for (let k = 0; k <= steps; k++) {
    const x = x0 + sx * k, y = y0 + sy * k
    for (const [dx, dy] of sx !== 0 ? [[0, 0], [0, 1]] : [[0, 0], [1, 0]]) {
      if (!inside(x + dx, y + dy)) continue
      const t = terrain[idx(x + dx, y + dy)]
      if (t === T.SEA || t === T.RAMPART) continue
      lay(idx(x + dx, y + dy))
    }
  }
}

for (const n of nodes) {
  if (n.kind !== "village") continue
  const { x: cx, y: cy } = n
  const R = townR(n)
  // the land of the town is cleared to meadow (the water stays)
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      if (!inside(cx + dx, cy + dy) || Math.hypot(dx, dy) > R + 2) continue
      const p = idx(cx + dx, cy + dy)
      const t = terrain[p] as T
      if (isWater(t) || t === T.PLAZA) continue
      terrain[p] = T.MEADOW
      keepClear[p] = 1
    }
  }
  switch (layoutOf(n)) {
    case "crossroads":
      // two main streets crossing at the plaza
      street(cx - R, cy, cx + R, cy)
      street(cx, cy - R, cx, cy + R)
      break
    case "ring": {
      // a green with a pond in the middle, a ring street around it, and
      // four spokes out
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.hypot(dx, dy), p = idx(cx + dx, cy + dy)
          if (!inside(cx + dx, cy + dy)) continue
          if (d <= 4.2) {
            terrain[p] = T.LAKE
            ponds.add(p)
          } else if (d <= 11) {
            if (terrain[p] === T.PLAZA) terrain[p] = T.MEADOW
          } else if (d <= 13.2 && !isWater(terrain[p] as T)) lay(p)
        }
      }
      street(cx + 13, cy, cx + R, cy)
      street(cx - R, cy, cx - 13, cy)
      street(cx, cy + 13, cx, cy + R)
      street(cx, cy - R, cx, cy - 13)
      break
    }
    case "walled": {
      // a square wall with a gate on each side; a grid of streets inside
      const S = R - 2
      for (let d = -S; d <= S; d++) {
        for (
          const [x, y] of [[cx + d, cy - S], [cx + d, cy + S], [
            cx - S,
            cy + d,
          ], [cx + S, cy + d]]
        ) {
          if (!inside(x, y) || isWater(terrain[idx(x, y)] as T)) continue
          // the gates: 3 wide where the middle streets go out
          if (Math.abs(d) <= 1 || d === 2) continue
          terrain[idx(x, y)] = T.RAMPART
        }
      }
      for (const o of [-12, 0, 12]) {
        street(cx + o, cy - S + 1, cx + o, cy + S - 1)
        street(cx - S + 1, cy + o, cx + S - 1, cy + o)
      }
      // the middle streets run out of the gates
      street(cx, cy - S - 4, cx, cy - S + 1)
      street(cx, cy + S - 1, cx, cy + S + 4)
      street(cx - S - 4, cy, cx - S + 1, cy)
      street(cx + S - 1, cy, cx + S + 4, cy)
      disc(cx, cy, 4, T.PLAZA)
      break
    }
    case "market": {
      // one long market street, a cross street, a back lane where the
      // folk live, fields at the east end
      street(cx - R, cy, cx + R, cy)
      street(cx, cy - 10, cx, cy + 13)
      street(cx - R + 2, cy + 13, cx + R - 2, cy + 13)
      for (let y = cy - 14; y <= cy - 3; y++) {
        for (let x = cx + 12; x <= cx + 28; x++) {
          if (!inside(x, y) || isWater(terrain[idx(x, y)] as T)) continue
          terrain[idx(x, y)] = T.FIELD
        }
      }
      break
    }
  }
}

for (const [a, b] of edges) {
  const path = route(nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y)
  for (let k = 0; k < path.length; k++) {
    const p = path[k]
    lay(p)
    // two cells wide: the second cell beside the direction of travel
    const q = path[Math.min(k + 1, path.length - 1)]
    const horizontal = Math.abs(q - p) === 1
    const x = p % W, y = (p / W) | 0
    const side = horizontal
      ? idx(x, Math.min(H - 1, y + 1))
      : idx(Math.min(W - 1, x + 1), y)
    if (terrain[side] !== T.SEA) lay(side)
  }
}
// the road margins stay clear of trees
{
  const d = bfsDistance((p) => roadCells.has(p), 2)
  for (let p = 0; p < W * H; p++) if (d[p] <= 2) keepClear[p] = 1
}

// ---------------------------------------------------------------------
// 6. the towns: houses along the streets, and what makes each kind

const houses: {
  x0: number
  y0: number
  x1: number
  y1: number
  village: string
}[] = []
const VILLAGER_SIGNS = ["sign-inn", "sign-item", "sign-pub", "sign-weapon"]
/** Who lives in the houses, in turn (the folk of kt3k/ff5study among them) */
const RESIDENTS = [
  "villager",
  "blacksmith",
  "villager2",
  "inventor",
  "thief",
  "villager",
  "assassin",
  "villager2",
]
let residents = 0
let signs = 0
/** Who sits by the campfires, camp by camp */
const CAMPERS = ["bard", "thief", "assassin", "lady-knight", "sailor"]

/**
 * A house by the street cell (sx, sy), set back along (nx, ny) (away
 * from the street) with its door facing the street, a path to it, a
 * table, a stool and a barrel inside, and someone living just inside
 * the door. Returns false if there's no room.
 */
function house(
  village: string,
  sx: number,
  sy: number,
  nx: number,
  ny: number,
  resident = RESIDENTS[residents % RESIDENTS.length],
): boolean {
  const w = 7 + randomInt(3), h = 6 + randomInt(2)
  let x0: number, y0: number, door: [number, number]
  if (nx !== 0) {
    y0 = sy - (h >> 1)
    x0 = nx > 0 ? sx + 2 : sx - 1 - w
    door = [nx > 0 ? x0 : x0 + w - 1, sy]
  } else {
    x0 = sx - (w >> 1)
    y0 = ny > 0 ? sy + 2 : sy - 1 - h
    door = [sx, ny > 0 ? y0 : y0 + h - 1]
  }
  const x1 = x0 + w - 1, y1 = y0 + h - 1
  for (let y = y0 - 1; y <= y1 + 1; y++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (!inside(x, y)) return false
      const p = idx(x, y)
      const t = terrain[p]
      if (!(t === T.MEADOW || t === T.FOREST || t === T.HILL)) return false
      if (taken.has(p) || roadCells.has(p)) return false
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1
      terrain[idx(x, y)] = edge ? T.WALL : T.FLOOR
      keepClear[idx(x, y)] = 1
    }
  }
  terrain[idx(...door)] = T.FLOOR
  // the path from the door to the street
  let [px, py] = door
  for (let k = 0; k < 8; k++) {
    px -= nx
    py -= ny
    const q = idx(px, py)
    if (!inside(px, py) || roadCells.has(q) || isWater(terrain[q] as T)) break
    terrain[q] = T.ROAD
    keepClear[q] = 1
  }
  put(props, x0 + 2, y0 + 2, "table")
  put(props, x0 + 3, y0 + 2, "stool")
  put(props, x1 - 1, y0 + 1, houses.length % 2 ? "jar" : "barrel")
  put(actors, door[0] + nx, door[1] + ny, resident)
  residents++
  // a shop sign beside some doors (on the wall cell next to it)
  if (signs < VILLAGER_SIGNS.length && ny !== 0) {
    put(props, door[0] + 1, door[1], VILLAGER_SIGNS[signs++])
  }
  houses.push({ x0, y0, x1, y1, village })
  return true
}

/** Houses at the candidate spots (tried in random order) up to count */
function housesAt(
  n: Node,
  spots: [number, number, number, number][],
  count: number,
  residentsOf: (k: number) => string | undefined = () => undefined,
) {
  let built = 0
  for (const [sx, sy, nx, ny] of shuffle(spots)) {
    if (built >= count) break
    if (house(n.name, sx, sy, nx, ny, residentsOf(built))) built++
  }
}

/** Spots on both sides of a 2-wide street from (x0, y0), every `step` */
function alongStreet(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  from: number,
  to: number,
  step: number,
): [number, number, number, number][] {
  const spots: [number, number, number, number][] = []
  for (let t = from; t <= to; t += step) {
    const x = x0 + dx * t, y = y0 + dy * t
    if (dx !== 0) {
      spots.push([x, y, 0, -1], [x, y + 1, 0, 1])
    } else {
      spots.push([x, y, -1, 0], [x + 1, y, 1, 0])
    }
  }
  return spots
}

/** The plaza: a well, the stall and its keeper, the notice board */
function plaza(n: Node, sells = "mushroom") {
  const { x: cx, y: cy } = n
  put(props, cx - 2, cy - 2, "well")
  put(props, cx + 2, cy - 3, "shop", { sells, price: 3 })
  put(actors, cx + 2, cy - 4, "keeper")
  put(props, cx + 3, cy + 3, "notice-board", {
    text: `${n.name}: WELCOME, TRAVELER`,
  })
}

/** A lamp post by the street, only on open ground (not in a house) */
function lampPost(x: number, y: number) {
  if (inside(x, y) && terrain[idx(x, y)] === T.MEADOW) {
    put(props, x, y, "lamp-post")
  }
}

/** Kids at play and a cat by the spot */
function kidsAndCat(x: number, y: number) {
  put(actors, x - 2, y, "kid")
  put(actors, x + 2, y, "kid")
  put(actors, x, y + 2, "child")
  put(actors, x - 4, y + 3, "cat")
}

function buildCrossroads(n: Node, count: number) {
  const { x: cx, y: cy } = n
  const R = townR(n)
  plaza(n)
  for (const [dx, dy] of [[-5, -3], [5, 3], [-3, 5], [3, -5]]) {
    put(props, cx + dx, cy + dy, "lamp-post")
  }
  put(props, cx - 4, cy + 3, "bench")
  put(actors, cx - 4, cy + 4, "sage")
  put(props, cx + 4, cy - 1, "flower-pot")
  put(actors, cx - 3, cy - 4, "bard")
  // guards at the ends of the main streets
  put(actors, cx + R - 2, cy - 1, "guard")
  put(actors, cx - 1, cy - R + 2, "lady-knight")
  kidsAndCat(cx + 6, cy + 6)
  housesAt(n, [
    ...alongStreet(cx, cy, 1, 0, 10, R - 4, 9),
    ...alongStreet(cx, cy, -1, 0, 10, R - 4, 9),
    ...alongStreet(cx, cy, 0, 1, 10, R - 4, 9),
    ...alongStreet(cx, cy, 0, -1, 10, R - 4, 9),
  ], count)
  // lamp posts along the main streets
  for (let t = 8; t < R; t += 8) {
    for (const [dx, dy] of [[t, -1], [-t, 2], [-1, t], [2, -t]]) {
      lampPost(cx + dx, cy + dy)
    }
  }
}

function buildRing(n: Node, count: number) {
  const { x: cx, y: cy } = n
  // the green: benches and flowers around the pond, a stall, a show
  for (const [dx, dy] of [[0, -7], [7, 0], [0, 7], [-7, 0]]) {
    put(props, cx + dx, cy + dy, "bench")
  }
  for (const [dx, dy] of [[5, -5], [-5, 5], [5, 5], [-5, -5]]) {
    put(props, cx + dx, cy + dy, "flower-pot")
  }
  put(props, cx + 3, cy - 9, "shop", { sells: "bread", price: 3 })
  put(actors, cx + 3, cy - 10, "keeper")
  put(props, cx - 3, cy - 9, "notice-board", {
    text: `${n.name}: MIND THE POND`,
  })
  put(actors, cx - 9, cy + 2, "dancer")
  put(actors, cx + 6, cy + 2, "fishwife")
  put(actors, cx - 2, cy + 6, "sailor")
  put(actors, cx + 1, cy - 6, "nun")
  kidsAndCat(cx + 8, cy - 4)
  // lamp posts on the ring
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) * Math.PI / 4
    lampPost(
      Math.round(cx + Math.cos(a) * 10.5),
      Math.round(cy + Math.sin(a) * 10.5),
    )
  }
  // the houses face the green from outside the ring
  const spots: [number, number, number, number][] = []
  for (let k = 0; k < 16; k++) {
    const a = (k + 0.5) * Math.PI / 8
    const c = Math.cos(a), s = Math.sin(a)
    const [nx, ny] = Math.abs(c) > Math.abs(s)
      ? [Math.sign(c), 0]
      : [0, Math.sign(s)]
    spots.push([
      Math.round(cx + c * 14),
      Math.round(cy + s * 14),
      nx,
      ny,
    ])
  }
  housesAt(n, spots, count)
}

function buildWalled(n: Node, count: number) {
  const { x: cx, y: cy } = n
  const S = townR(n) - 2
  put(props, cx, cy - 2, "well")
  put(actors, cx + 2, cy + 2, "dancer")
  // the royal party is in town, the chancellor never far behind
  put(actors, cx - 3, cy + 1, "princess")
  put(actors, cx - 3, cy + 3, "chancellor")
  // a guard by each gate, inside
  put(actors, cx + 2, cy - S + 2, "guard")
  put(actors, cx + 2, cy + S - 2, "guard")
  put(actors, cx - S + 2, cy + 2, "lady-knight")
  put(actors, cx + S - 2, cy + 2, "lady-knight")
  // the market around the plaza
  put(props, cx + 5, cy - 3, "shop", { sells: "potion", price: 4 })
  put(actors, cx + 5, cy - 4, "keeper")
  put(props, cx - 5, cy - 3, "shop", { sells: "seed", price: 1 })
  put(actors, cx - 5, cy - 4, "keeper")
  put(actors, cx - 6, cy + 3, "apprentice")
  put(props, cx + 3, cy + 5, "notice-board", {
    text: `${n.name}: THE GATES CLOSE AT NIGHT (THEY DON'T)`,
  })
  kidsAndCat(cx + 7, cy + 8)
  const spots: [number, number, number, number][] = []
  for (const o of [-12, 0, 12]) {
    for (const t of [-18, -6, 6, 18]) {
      spots.push([cx + o, cy + t, -1, 0], [cx + o + 1, cy + t, 1, 0])
    }
  }
  housesAt(n, spots, count)
  // lamp posts at the crossings
  for (const ox of [-12, 12]) {
    for (const oy of [-12, 12]) lampPost(cx + ox - 1, cy + oy - 1)
  }
}

function buildMarket(n: Node, count: number) {
  const { x: cx, y: cy } = n
  const R = townR(n)
  // stalls along the north side of the street, keepers behind them
  const stalls: [string, number][] = [
    ["seed", 1],
    ["bread", 3],
    ["mushroom", 3],
    ["potion", 4],
  ]
  stalls.forEach(([sells, price], k) => {
    const x = cx - 4 - k * 5
    put(props, x, cy - 2, "shop", { sells, price })
    put(actors, x, cy - 3, "keeper")
  })
  put(props, cx - 24, cy - 2, "notice-board", {
    text: `${n.name} MARKET: EVERY DAY IS MARKET DAY`,
  })
  put(actors, cx + 2, cy - 2, "bard")
  put(actors, cx - 11, cy - 1, "apprentice")
  put(actors, cx - 8, cy - 1, "merchant")
  put(props, cx + 4, cy - 4, "bench")
  put(actors, cx + 5, cy - 4, "sage")
  // the fields: rows of saplings, the farmers among them
  for (let y = cy - 13; y <= cy - 4; y += 3) {
    for (let x = cx + 13; x <= cx + 27; x += 2) {
      if (terrain[idx(x, y)] === T.FIELD) put(props, x, y, "sapling")
    }
  }
  put(actors, cx + 14, cy - 2, "farmer")
  put(actors, cx + 22, cy - 2, "farmer")
  kidsAndCat(cx + 4, cy + 4)
  // the folk live along the back lane
  housesAt(n, [
    ...alongStreet(cx, cy + 13, -1, 0, 5, R - 6, 9),
    ...alongStreet(cx, cy + 13, 1, 0, 5, R - 6, 9),
  ], count)
  for (let t = -24; t <= 24; t += 8) lampPost(cx + t, cy + 2)
}

for (const n of nodes) {
  switch (n.kind) {
    case "village": {
      const v = plan.villages.find((v) => v.name === n.name)!
      const build = {
        crossroads: buildCrossroads,
        ring: buildRing,
        walled: buildWalled,
        market: buildMarket,
      }[layoutOf(n)]
      build(n, v.houses)
      break
    }
    case "arrival":
      put(props, n.x, n.y, "portal-out")
      put(props, n.x + 2, n.y - 1, "sign", {
        text: "THE WILDS: A LAND GROWN, NOT DRAWN. FOLLOW THE ROADS",
      })
      put(props, n.x - 2, n.y - 2, "lantern")
      break
    case "lookout":
      put(props, n.x, n.y - 1, "sign", {
        text: "LOOKOUT: THE RIVERS RUN DOWN FROM HERE",
      })
      put(props, n.x + 2, n.y, "chest", { drops: "coin", count: 6 })
      put(props, n.x - 2, n.y, "lantern")
      put(actors, n.x, n.y + 2, "guard")
      break
    case "shrine":
      put(props, n.x, n.y, "fish-shrine")
      for (const [dx, dy] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
        put(props, n.x + dx, n.y + dy, "lantern")
      }
      // a nun keeps the shrine
      put(actors, n.x - 1, n.y + 2, "nun")
      put(props, n.x - 2, n.y + 3, "bench")
      put(props, n.x, n.y + 3, "flower-pot")
      break
    case "ruins": {
      // broken walls around the stone floor
      for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          const edge = Math.abs(dx) === 8 || Math.abs(dy) === 6
          const x = n.x + dx, y = n.y + dy
          if (!inside(x, y) || taken.has(idx(x, y))) continue
          if (edge && rng() < 0.6) {
            terrain[idx(x, y)] = T.RUIN
            keepClear[idx(x, y)] = 1
          } else if (!edge && rng() < 0.7) {
            terrain[idx(x, y)] = T.STONE
            keepClear[idx(x, y)] = 1
          }
        }
      }
      put(props, n.x, n.y, "chest", { drops: "coin", count: 10 })
      put(props, n.x - 3, n.y + 2, "crate")
      put(props, n.x + 3, n.y - 2, "hatena")
      put(actors, n.x + 5, n.y + 3, "boulder")
      // old graves, the sage who tends them, and what the old ones left
      for (const dx of [-6, -4]) put(props, n.x + dx, n.y - 3, "gravestone")
      put(actors, n.x - 5, n.y - 1, "sage")
      put(items, n.x + 5, n.y - 3, "sword")
      put(items, n.x + 6, n.y - 3, "shield")
      put(items, n.x - 1, n.y + 4, "scroll")
      break
    }
    case "east":
      put(props, n.x - 2, n.y - 2, "lantern")
      put(props, n.x + 2, n.y - 1, "sign", {
        text: "EAST PIER: THE LONG BRIDGE EAST TO THE CITY",
      })
      put(actors, n.x, n.y + 2, "sailor")
      break
    case "cave":
      put(props, n.x - 3, n.y + 3, "lantern")
      put(props, n.x + 3, n.y + 3, "lantern")
      put(props, n.x + 3, n.y, "sign", {
        text: "THE OLD TUNNEL: SOUTH TO THE CAVERN. THREE TRIALS, ONE HOARD",
      })
      break
    case "camp": {
      const k = Number(n.name.split(" ")[1]) - 1
      put(props, n.x, n.y - 1, "lantern")
      put(props, n.x + 1, n.y + 1, "chest", { drops: "bread", count: 3 })
      put(props, n.x - 1, n.y + 1, "stool")
      put(props, n.x, n.y, "campfire")
      put(props, n.x - 1, n.y - 1, "tent")
      put(actors, n.x + 1, n.y - 1, CAMPERS[k % CAMPERS.length])
      put(actors, n.x - 2, n.y, "fox")
      put(items, n.x + 2, n.y, k % 2 ? "potion" : "herb")
      break
    }
  }
}

// ---------------------------------------------------------------------
// mini puzzles (tools/minipuzzles.ts): small walled rooms with a treasure
// at the goal, scattered over the open land away from the anchors

/** The cells of the puzzle rooms (left alone by the reachability fix) */
const puzzleCells = new Uint8Array(W * H)
const puzzles: { x: number; y: number; kind: Kind; solution: string }[] = []
{
  const KINDS: Kind[] = ["ice", "boulder", "switch"]
  const TREASURES = ["gem", "coin-bag", "potion", "ether", "scroll", "sword"]
  const SIGNS: Record<Kind, string> = {
    ice: "ICE TRIAL: SLIDE TO THE TREASURE",
    boulder: "WEIGHT TRIAL: THE DOOR OPENS WHILE THE PLATE IS HELD",
    switch: "SWITCH TRIAL: BLUE STANDS WHILE OFF, RED WHILE ON",
  }
  for (let n = 0; n < 6000 && puzzles.length < 9; n++) {
    const kind = KINDS[puzzles.length % KINDS.length]
    const x0 = 20 + randomInt(W - 40), y0 = 20 + randomInt(H - 40)
    // the room (11x9) and a margin of 2, all open land, nothing built
    let fits = true
    for (let y = y0 - 2; y < y0 + 9 + 4 && fits; y++) {
      for (let x = x0 - 2; x < x0 + 11 + 2 && fits; x++) {
        const t = terrain[idx(x, y)] as T
        if (
          !(t === T.MEADOW || t === T.FOREST || t === T.HILL) ||
          keepClear[idx(x, y)] || taken.has(idx(x, y))
        ) fits = false
      }
    }
    if (!fits) continue
    if (
      [...nodes, ...puzzles].some((o) =>
        Math.hypot(o.x - x0, o.y - y0) < (nodes.includes(o as Node) ? 45 : 70)
      )
    ) continue
    const puzzle = MAKERS[kind]({ rng, randomInt })
    const group = `mini-${puzzles.length + 1}`
    puzzle.rows.forEach((row, dy) => {
      ;[...row].forEach((c, dx) => {
        const x = x0 + dx, y = y0 + dy
        const p = idx(x, y)
        terrain[p] = c === "#" ? T.RUIN : c === "_" ? T.ICE : T.TRIAL
        keepClear[p] = 1
        puzzleCells[p] = 1
        if (c === "B") put(actors, x, y, "boulder")
        else if (c === "P") put(props, x, y, "plate", { group })
        else if (c === "D") put(props, x, y, "door", { group })
        else if (c === "S") put(props, x, y, "switch", { group })
        else if (c === "b") put(props, x, y, "blue-wall", { group })
        else if (c === "r") put(props, x, y, "red-wall", { group })
        else if (c === "G") {
          put(items, x, y, TREASURES[puzzles.length % TREASURES.length])
        }
      })
    })
    // the way in: a path down from the entrance, a sign beside it
    const ex = x0 + 5
    for (let y = y0 + 9; y < y0 + 12; y++) {
      terrain[idx(ex, y)] = T.ROAD
      keepClear[idx(ex, y)] = 1
    }
    put(props, ex + 1, y0 + 10, "sign", { text: SIGNS[kind] })
    for (let y = y0 - 1; y <= y0 + 9; y++) {
      for (let x = x0 - 1; x <= x0 + 11; x++) keepClear[idx(x, y)] = 1
    }
    puzzles.push({ x: x0, y: y0, kind, solution: puzzle.solution })
  }
  console.log(
    `mini puzzles: ${puzzles.map((p) => `${p.kind} ${p.solution.length}`)}`,
  )
}

// ---------------------------------------------------------------------
// 7. scatter by density and spacing

/** Poisson disc: candidates in random order, kept if far enough apart */
function scatter(
  minDist: number,
  tries: number,
  accept: (x: number, y: number) => boolean,
  place: (x: number, y: number) => void,
) {
  const cell = minDist / Math.SQRT2
  const gw = Math.ceil(W / cell), gh = Math.ceil(H / cell)
  const grid = new Int32Array(gw * gh).fill(-1)
  const pts: [number, number][] = []
  for (let n = 0; n < tries; n++) {
    const x = randomInt(W), y = randomInt(H)
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell)
    let ok = true
    for (let oy = -2; oy <= 2 && ok; oy++) {
      for (let ox = -2; ox <= 2 && ok; ox++) {
        const k = grid[(gy + oy) * gw + gx + ox]
        if (
          gx + ox >= 0 && gy + oy >= 0 && gx + ox < gw && gy + oy < gh &&
          k >= 0 && Math.hypot(pts[k][0] - x, pts[k][1] - y) < minDist
        ) ok = false
      }
    }
    if (!ok || !accept(x, y)) continue
    grid[gy * gw + gx] = pts.length
    pts.push([x, y])
    place(x, y)
  }
}
const free = (x: number, y: number) =>
  inside(x, y) && !keepClear[idx(x, y)] && !taken.has(idx(x, y))

// trees: dense in forests, a few lone ones on meadows; clumps of 1-4
scatter(2.6, W * H / 3, (x, y) => {
  if (!free(x, y)) return false
  const t = terrain[idx(x, y)]
  const m = moist[idx(x, y)]
  if (t === T.FOREST) return rng() < 0.55 + (m - 0.55) * 1.5
  if (t === T.MEADOW) return rng() < 0.03
  return false
}, (x, y) => {
  const shape = randomInt(4)
  const cells = shape === 0
    ? [[0, 0]]
    : shape === 1
    ? [[0, 0], [1, 0]]
    : shape === 2
    ? [[0, 0], [0, 1]]
    : [[0, 0], [1, 0], [0, 1], [1, 1]]
  for (const [dx, dy] of cells) {
    if (free(x + dx, y + dy) && isWild(terrain[idx(x + dx, y + dy)])) {
      terrain[idx(x + dx, y + dy)] = T.TREE
    }
  }
})
// rocks on the hills
scatter(
  5,
  W * H / 20,
  (x, y) => free(x, y) && terrain[idx(x, y)] === T.HILL && rng() < 0.4,
  (x, y) => {
    terrain[idx(x, y)] = T.ROCK
  },
)

const walkableCell = (p: number) =>
  catalog.cells[CELL[terrain[p] as T]]?.canEnter ?? false
const distWater = bfsDistance((p) => isWater(terrain[p] as T), 4)
const distRoad = bfsDistance((p) => roadCells.has(p), 60)

// flowers by the water
scatter(6, W * H / 30, (x, y) =>
  free(x, y) && distWater[idx(x, y)] <= 3 &&
  (terrain[idx(x, y)] === T.MEADOW || terrain[idx(x, y)] === T.SAND) &&
  rng() < 0.5, (x, y) => put(props, x, y, "flowers"))
// coins: off the beaten track, more the farther from the roads
scatter(14, W * H / 40, (x, y) => {
  const p = idx(x, y)
  return free(x, y) && walkableCell(p) && distRoad[p] >= 12 &&
    rng() < Math.min(0.8, distRoad[p] / 40)
}, (x, y) => put(items, x, y, "coin"))
// apples under the trees, mushrooms deep in the forest, seeds in meadows
scatter(
  9,
  W * H / 40,
  (x, y) => {
    const p = idx(x, y)
    if (!free(x, y) || terrain[p] !== T.FOREST) return false
    return D4.some(([dx, dy]) => terrain[idx(x + dx, y + dy)] === T.TREE) &&
      rng() < 0.5
  },
  (x, y) =>
    put(
      items,
      x,
      y,
      distRoad[idx(x, y)] > 25 && rng() < 0.2 ? "mushroom" : "apple",
    ),
)
scatter(
  40,
  W * H / 200,
  (x, y) => free(x, y) && terrain[idx(x, y)] === T.MEADOW && rng() < 0.4,
  (x, y) => put(items, x, y, "seed"),
)

// animals where they belong
const villageNodes = nodes.filter((n) => n.kind === "village")
for (const v of villageNodes) {
  // a flock of sheep on a meadow near the village
  for (let n = 0; n < 200; n++) {
    const a = rng() * Math.PI * 2, r = townR(v) + 6 + rng() * 25
    const x = Math.round(v.x + Math.cos(a) * r),
      y = Math.round(v.y + Math.sin(a) * r)
    if (!inside(x, y) || terrain[idx(x, y)] !== T.MEADOW) continue
    let placed = 0
    for (const [dx, dy] of [[0, 0], [2, 1], [-1, 2]]) {
      if (free(x + dx, y + dy) && terrain[idx(x + dx, y + dy)] === T.MEADOW) {
        if (put(actors, x + dx, y + dy, "sheep")) placed++
      }
    }
    if (placed > 0) break
  }
}
// crows nest by the water near the coins; chasers in deep forest;
// wanderers on the roads
scatter(80, W * H / 100, (x, y) => {
  const p = idx(x, y)
  return free(x, y) && walkableCell(p) && distWater[p] === 1 && rng() < 0.3
}, (x, y) => put(actors, x, y, "crow"))
scatter(60, W * H / 100, (x, y) => {
  const p = idx(x, y)
  return free(x, y) && terrain[p] === T.FOREST && distRoad[p] > 20 &&
    rng() < 0.4
}, (x, y) => put(actors, x, y, "chaser"))
scatter(
  50,
  W * H / 100,
  (x, y) => roadCells.has(idx(x, y)) && !taken.has(idx(x, y)) && rng() < 0.3,
  (x, y) => put(actors, x, y, "random"),
)

// ---------------------------------------------------------------------
// 8. every walkable cell reachable from the arrival (or filled)

const blockingProp = new Set<number>()
for (const s of props) {
  if (!catalog.props[s.type]?.canEnter) {
    blockingProp.add(idx(s.i - OI, s.j - OJ))
  }
}
const walkable = (p: number) => walkableCell(p) && !blockingProp.has(p)
const arrival = nodes[0]
for (let round = 0; round < 50; round++) {
  const reached = new Uint8Array(W * H)
  const queue = [idx(arrival.x, arrival.y)]
  reached[queue[0]] = 1
  for (let q = 0; q < queue.length; q++) {
    const p = queue[q]
    const x = p % W, y = (p / W) | 0
    for (const [dx, dy] of D4) {
      const np = idx(x + dx, y + dy)
      if (inside(x + dx, y + dy) && !reached[np] && walkable(np)) {
        reached[np] = 1
        queue.push(np)
      }
    }
  }
  // find the unreached pockets
  const pocketOf = new Int32Array(W * H).fill(-1)
  const pockets: number[][] = []
  for (let p = 0; p < W * H; p++) {
    if (!walkable(p) || reached[p] || pocketOf[p] >= 0 || puzzleCells[p]) {
      continue
    }
    const cells = [p]
    pocketOf[p] = pockets.length
    for (let q = 0; q < cells.length; q++) {
      const c = cells[q]
      const x = c % W, y = (c / W) | 0
      for (const [dx, dy] of D4) {
        const np = idx(x + dx, y + dy)
        if (
          inside(x + dx, y + dy) && walkable(np) && !reached[np] &&
          pocketOf[np] < 0
        ) {
          pocketOf[np] = pockets.length
          cells.push(np)
        }
      }
    }
    pockets.push(cells)
  }
  if (pockets.length === 0) break
  for (const cells of pockets) {
    if (cells.length < 30) {
      // too small to matter: grown over
      for (const c of cells) {
        if (!blockingProp.has(c) && !isWater(terrain[c] as T)) {
          terrain[c] = terrain[c] === T.HILL ? T.ROCK : T.TREE
        }
      }
      continue
    }
    // a trail cut through the trees / rocks to the reached land
    const from = new Int32Array(W * H).fill(-2)
    const queue2 = [...cells]
    for (const c of cells) from[c] = -1
    let hit = -1
    for (let q = 0; q < queue2.length && hit < 0; q++) {
      const c = queue2[q]
      const x = c % W, y = (c / W) | 0
      for (const [dx, dy] of D4) {
        if (!inside(x + dx, y + dy)) continue
        const np = idx(x + dx, y + dy)
        if (from[np] !== -2) continue
        const t = terrain[np] as T
        if (reached[np]) {
          from[np] = c
          hit = np
          break
        }
        if (t === T.TREE || t === T.ROCK || isWild(t)) {
          from[np] = c
          queue2.push(np)
        }
      }
    }
    for (let c = hit; c >= 0 && from[c] !== -1; c = from[c]) {
      if (terrain[c] === T.TREE) terrain[c] = T.FOREST
      else if (terrain[c] === T.ROCK) terrain[c] = T.HILL
    }
  }
}
// spawns left on cells that can't hold them are dropped
const standable = (s: Spawn) => walkableCell(idx(s.i - OI, s.j - OJ))
const actorsOut = actors.filter(standable)
const itemsOut = items.filter(standable)
const propsOut = props.filter((s) => {
  const t = terrain[idx(s.i - OI, s.j - OJ)] as T
  // signs on house walls stay; everything else needs open ground
  return s.type.startsWith("sign-") ? t === T.WALL : standable(s)
})

// ---------------------------------------------------------------------
// report and checks

const census = new Map<string, number>()
for (let p = 0; p < W * H; p++) {
  const name = T[terrain[p]] ?? String(terrain[p])
  census.set(name, (census.get(name) ?? 0) + 1)
}
console.log(
  "terrain:",
  [...census].sort((a, b) => b[1] - a[1]).map(([k, n]) =>
    `${k} ${(n / (W * H) * 100).toFixed(1)}%`
  ).join(", "),
)
console.log(
  `rivers ${sources.length}, anchors ${nodes.length}, roads ${roadCells.size} cells, houses ${houses.length}`,
)
console.log(
  `actors ${actorsOut.length}, items ${itemsOut.length}, props ${propsOut.length}`,
)
let ok = true
{
  const reached = new Uint8Array(W * H)
  const queue = [idx(arrival.x, arrival.y)]
  reached[queue[0]] = 1
  for (let q = 0; q < queue.length; q++) {
    const p = queue[q]
    const x = p % W, y = (p / W) | 0
    for (const [dx, dy] of D4) {
      const np = idx(x + dx, y + dy)
      if (inside(x + dx, y + dy) && !reached[np] && walkable(np)) {
        reached[np] = 1
        queue.push(np)
      }
    }
  }
  for (const n of nodes) {
    // a ring town's middle is its pond: the ring street is checked
    const x = n.kind === "village" && layoutOf(n) === "ring" ? n.x + 12 : n.x
    const near = D8.some(([dx, dy]) => reached[idx(x + dx, n.y + dy)])
    console.log(`${near ? "ok" : "NG"} ${n.name} reachable from the arrival`)
    if (!near) ok = false
  }
  for (const [k, pz] of puzzles.entries()) {
    const ok1 = reached[idx(pz.x + 5, pz.y + 7)] === 1
    console.log(
      `${ok1 ? "ok" : "NG"} mini puzzle ${k + 1} (${pz.kind}) reached`,
    )
    if (!ok1) ok = false
  }
  let unreached = 0
  for (let p = 0; p < W * H; p++) {
    // (a puzzle room's inner parts open as it's solved)
    if (walkable(p) && !reached[p] && !puzzleCells[p]) unreached++
  }
  console.log(
    `${
      unreached === 0 ? "ok" : "NG"
    } no unreachable walkable cell (${unreached})`,
  )
  if (unreached > 0) ok = false
  for (const v of villageNodes) {
    const n = houses.filter((h) => h.village === v.name).length
    console.log(`${n >= 3 ? "ok" : "NG"} ${v.name} has ${n} houses`)
    if (n < 3) ok = false
  }
}

// ---------------------------------------------------------------------
// --preview <file.png>: the terrain classes, one pixel per cell, in
// distinct colors (to judge the shapes while tuning the generator)

const previewAt = Deno.args.indexOf("--preview")
if (previewAt >= 0) {
  const COLORS: Record<T, string> = {
    [T.SEA]: Palette.blue4,
    [T.SAND]: Palette.brown1,
    [T.MEADOW]: Palette.lime2,
    [T.FOREST]: Palette.green3,
    [T.HILL]: Palette.yellow3,
    [T.ROCK]: Palette.gray3,
    [T.RIVER]: Palette.blue2,
    [T.LAKE]: Palette.blue3,
    [T.ROAD]: Palette.white,
    [T.BRIDGE]: Palette.brown3,
    [T.PLAZA]: Palette.orange2,
    [T.WALL]: Palette.black,
    [T.FLOOR]: Palette.brown2,
    [T.TREE]: Palette.green4,
    [T.RAMPART]: Palette.black,
    [T.RUIN]: Palette.yellow3,
    [T.STONE]: Palette.violet2,
    [T.CAMP]: Palette.orange3,
    [T.FIELD]: Palette.brown3,
  }
  const rgba = new Uint8Array(W * H * 4)
  for (let p = 0; p < W * H; p++) {
    const hex = COLORS[terrain[p] as T]
    rgba.set([1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)), p * 4)
    rgba[p * 4 + 3] = 255
  }
  const mark = (list: Spawn[], hex: string) => {
    for (const s of list) {
      const p = idx(s.i - OI, s.j - OJ)
      rgba.set([1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)), p * 4)
    }
  }
  mark(actorsOut, Palette.pink2)
  mark(propsOut, Palette.magenta2)
  await Deno.writeFile(Deno.args[previewAt + 1], await encodePng(W, H, rgba))
  console.log(`wrote the preview to ${Deno.args[previewAt + 1]}`)
}
// (the preview is written even when a check fails, to see why)
if (!ok) {
  console.error("wilds verification failed")
  Deno.exit(1)
}

// ---------------------------------------------------------------------
// output: one json per block

for (let by = 0; by < plan.blocks.h; by++) {
  for (let bx = 0; bx < plan.blocks.w; bx++) {
    const bi = OI + bx * BLOCK, bj = OJ + by * BLOCK
    const inBlock = (s: Spawn) =>
      s.i >= bi && s.i < bi + BLOCK && s.j >= bj && s.j < bj + BLOCK
    const field: string[] = []
    for (let y = 0; y < BLOCK; y++) {
      let row = ""
      for (let x = 0; x < BLOCK; x++) {
        row += CELL[terrain[idx(bx * BLOCK + x, by * BLOCK + y)] as T]
      }
      field.push(row)
    }
    // rooms: the named places, clipped to the block
    const { rooms, room } = createRooms(bi, bj)
    for (const n of nodes) {
      const r = n.kind === "village" ? townR(n) + 2 : n.kind === "ruins" ? 9 : 6
      const x0 = Math.max(0, n.x - r - bx * BLOCK)
      const y0 = Math.max(0, n.y - r - by * BLOCK)
      const x1 = Math.min(BLOCK - 1, n.x + r - bx * BLOCK)
      const y1 = Math.min(BLOCK - 1, n.y + r - by * BLOCK)
      if (x0 <= x1 && y0 <= y1) room(n.name.replace(/ /g, ""), x0, y0, x1, y1)
    }
    const json = {
      i: bi,
      j: bj,
      name: "WILDS",
      rooms,
      catalogs: ["../catalog/base.json"],
      config: { showsExitButton: true },
      actors: actorsOut.filter(inBlock),
      items: itemsOut.filter(inBlock),
      props: propsOut.filter(inBlock),
      field,
    }
    await Deno.writeTextFile(
      new URL(`../static/map/block_${bi}.${bj}.json`, import.meta.url),
      JSON.stringify(json, null, 2),
    )
  }
}
console.log(
  `generated ${
    plan.blocks.w * plan.blocks.h
  } blocks of the WILDS at ${OI},${OJ}`,
)

// ---------------------------------------------------------------------
// the "W" portal room on the START island, below the start corridor

type BlockJson = { i: number; j: number; props: Spawn[]; field: string[] }
const startPath = new URL(
  "../static/map/block_-10000.-10000.json",
  import.meta.url,
)
const start = JSON.parse(await Deno.readTextFile(startPath)) as BlockJson
const sgrid = start.field.map((row) => [...row])
const carve = (x0: number, y0: number, x1: number, y1: number, c: string) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) sgrid[y][x] = c
}
carve(35, 41, 37, 43, "0") // the passage down from the corridor's end
carve(33, 44, 39, 48, "3") // the room ring
carve(34, 45, 38, 47, "6") // the room floor
carve(36, 42, 36, 42, "r") // the red marker cell
start.field = sgrid.map((row) => row.join(""))
const local = (x: number, y: number) => ({ i: start.i + x, j: start.j + y })
for (
  const add of [
    {
      ...local(36, 46),
      type: "portal",
      data: { i: OI + arrival.x, j: OJ + arrival.y },
    },
    { ...local(36, 42), type: "r_white" },
    { ...local(35, 42), type: "w" },
    {
      ...local(37, 41),
      type: "sign",
      data: { text: "THE WILDS: AN ISLAND GROWN BY THE GENERATOR" },
    },
  ]
) {
  const k = start.props.findIndex((p) => p.i === add.i && p.j === add.j)
  if (k >= 0) start.props[k] = add
  else start.props.push(add)
}
await Deno.writeTextFile(startPath, JSON.stringify(start, null, 2))
console.log("linked the WILDS from the start island")
