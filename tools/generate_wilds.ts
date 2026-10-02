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
// 6. villages grown along those roads: houses facing the road, a plaza
//    with a well and a stall, the townsfolk
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

type Spawn = { i: number; j: number; type: string; data?: unknown }
type Anchor = { x: number; y: number; name: string }
type Plan = {
  seed: string
  origin: { i: number; j: number }
  blocks: { w: number; h: number }
  arrival: { x: number; y: number; name: string }
  villages: { x: number; y: number; name: string; houses: number }[]
  landmarks: { x: number; y: number; name: string; kind: string }[]
  camps: number
  cave: { x: number; y: number; name: string }
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
  [T.ROAD]: "0",
  [T.BRIDGE]: "d",
  [T.PLAZA]: "c",
  [T.WALL]: "1",
  [T.FLOOR]: "d",
  [T.TREE]: "2",
  [T.STONE]: "m",
  [T.CAMP]: "p",
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
  const [x, y] = snap(v.x, v.y, 8)
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
function lay(p: number) {
  const t = terrain[p]
  if (t === T.PLAZA || t === T.STONE || t === T.CAMP) return
  terrain[p] = isWater(t) ? T.BRIDGE : t === T.BRIDGE ? T.BRIDGE : T.ROAD
  keepClear[p] = 1
  roadCells.add(p)
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
// 6. villages along the roads

const houses: {
  x0: number
  y0: number
  x1: number
  y1: number
  village: string
}[] = []
const VILLAGER_SIGNS = ["sign-inn", "sign-item", "sign-pub", "sign-weapon"]

function buildVillage(n: Node, count: number) {
  const { x: cx, y: cy } = n
  // the plaza: a well at the center, the stall and its keeper north
  put(props, cx, cy, "well")
  put(props, cx, cy - 3, "shop", { sells: "mushroom", price: 3 })
  put(actors, cx, cy - 4, "keeper")
  put(props, cx + 3, cy - 3, "notice-board", {
    text: `${n.name}: WELCOME, TRAVELER`,
  })
  for (const [dx, dy] of [[-5, -2], [5, 2], [-2, 5], [2, -5]]) {
    put(props, cx + dx, cy + dy, "lantern")
  }
  for (const [dx, dy] of [[-3, 3], [3, 3], [-4, 0]]) {
    put(actors, cx + dx, cy + dy, "kid")
  }
  // houses: on road cells near the plaza, set back from the road with
  // the door facing it
  const near = shuffle(
    [...roadCells].filter((p) => {
      const x = p % W, y = (p / W) | 0
      const d = Math.hypot(x - cx, y - cy)
      return d > 9 && d < 34
    }),
  )
  let built = 0
  for (const p of near) {
    if (built >= count) break
    const rx = p % W, ry = (p / W) | 0
    const horizontal = roadCells.has(p - 1) && roadCells.has(p + 1)
    const vertical = roadCells.has(p - W) && roadCells.has(p + W)
    if (horizontal === vertical) continue
    const w = 7 + randomInt(4), h = 6 + randomInt(3)
    const side = rng() < 0.5 ? -1 : 1
    let x0: number, y0: number, door: [number, number]
    if (horizontal) {
      x0 = rx - (w >> 1)
      y0 = side < 0 ? ry - 3 - h : ry + 4
      door = [rx, side < 0 ? y0 + h - 1 : y0]
    } else {
      y0 = ry - (h >> 1)
      x0 = side < 0 ? rx - 3 - w : rx + 4
      door = [side < 0 ? x0 + w - 1 : x0, ry]
    }
    const x1 = x0 + w - 1, y1 = y0 + h - 1
    let ok = true
    for (let y = y0 - 1; y <= y1 + 1 && ok; y++) {
      for (let x = x0 - 1; x <= x1 + 1 && ok; x++) {
        if (!inside(x, y)) ok = false
        else {
          const t = terrain[idx(x, y)]
          if (!(t === T.MEADOW || t === T.FOREST || t === T.HILL)) ok = false
          if (taken.has(idx(x, y))) ok = false
        }
      }
    }
    if (!ok) continue
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || y === y0 || y === y1
        terrain[idx(x, y)] = edge ? T.WALL : T.FLOOR
        keepClear[idx(x, y)] = 1
      }
    }
    terrain[idx(...door)] = T.FLOOR
    // the path from the door to the road
    let [px, py] = door
    const [sx, sy] = horizontal
      ? [0, side < 0 ? 1 : -1]
      : [side < 0 ? 1 : -1, 0]
    for (let k = 0; k < 6; k++) {
      px += sx
      py += sy
      const q = idx(px, py)
      if (roadCells.has(q)) break
      terrain[q] = T.ROAD
      keepClear[q] = 1
    }
    put(props, x0 + 2, y0 + 2, "table")
    put(props, x0 + 3, y0 + 2, "stool")
    put(props, x1 - 1, y0 + 1, built % 2 ? "jar" : "barrel")
    // the villager lives just inside the door
    const [ix, iy] = horizontal
      ? [door[0], door[1] + (side < 0 ? -1 : 1)]
      : [door[0] + (side < 0 ? -1 : 1), door[1]]
    put(actors, ix, iy, built % 2 ? "villager2" : "villager")
    // a shop sign beside some doors (on the wall cell next to it)
    if (built < VILLAGER_SIGNS.length && horizontal) {
      put(props, door[0] + 1, door[1], VILLAGER_SIGNS[built])
    }
    houses.push({ x0, y0, x1, y1, village: n.name })
    built++
  }
  // a cat by the plaza, flowers around it
  put(actors, cx - 6, cy + 4, "cat")
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2
    const x = Math.round(cx + Math.cos(a) * 7),
      y = Math.round(cy + Math.sin(a) * 7)
    if (inside(x, y) && isWild(terrain[idx(x, y)])) put(props, x, y, "flowers")
  }
}

for (const n of nodes) {
  switch (n.kind) {
    case "village": {
      const v = plan.villages.find((v) => v.name === n.name)!
      buildVillage(n, v.houses)
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
      break
    case "shrine":
      put(props, n.x, n.y, "fish-shrine")
      for (const [dx, dy] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
        put(props, n.x + dx, n.y + dy, "lantern")
      }
      break
    case "ruins": {
      // broken walls around the stone floor
      for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          const edge = Math.abs(dx) === 8 || Math.abs(dy) === 6
          const x = n.x + dx, y = n.y + dy
          if (!inside(x, y) || taken.has(idx(x, y))) continue
          if (edge && rng() < 0.6) {
            terrain[idx(x, y)] = T.WALL
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
      break
    }
    case "cave":
      put(props, n.x - 3, n.y + 3, "lantern")
      put(props, n.x + 3, n.y + 3, "lantern")
      put(props, n.x + 3, n.y, "sign", {
        text: "THE OLD TUNNEL: SOUTH TO THE CAVERN. THREE TRIALS, ONE HOARD",
      })
      break
    case "camp":
      put(props, n.x, n.y - 1, "lantern")
      put(props, n.x + 1, n.y + 1, "chest", { drops: "coin", count: 3 })
      put(props, n.x - 1, n.y + 1, "stool")
      break
  }
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
    const a = rng() * Math.PI * 2, r = 20 + rng() * 25
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
    if (!walkable(p) || reached[p] || pocketOf[p] >= 0) continue
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
    const near = D8.some(([dx, dy]) => reached[idx(n.x + dx, n.y + dy)])
    console.log(`${near ? "ok" : "NG"} ${n.name} reachable from the arrival`)
    if (!near) ok = false
  }
  let unreached = 0
  for (let p = 0; p < W * H; p++) if (walkable(p) && !reached[p]) unreached++
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
if (!ok) {
  console.error("wilds verification failed")
  Deno.exit(1)
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
    [T.STONE]: Palette.violet2,
    [T.CAMP]: Palette.orange3,
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
      const r = n.kind === "village" ? 34 : n.kind === "ruins" ? 9 : 6
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
