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
// The arrival hides one more thing: the castaway cove, a stretch of
// coast the land itself seals, where the W portal lands. The cove is
// the tutorial told by the terrain, and the hermit's toll bridge keeps
// the island shut until it is walked (see "the castaway cove").
//
// The cities (tools/generate_city.ts, the CITY and SOUTHPORT, each built
// from its own seed) stand on the west coast: each harbor opens on the
// sea, the land around rises a little, and the island's roads come to
// the gates in the belt of trees. The island is 14x9 blocks; the counts
// of puzzles, oddities, rivers and loops grow with its area (SCALE).
//
// The CAVERN (tools/generate_cavern.ts) lies inside the island: the
// height field rises into a mountain over it, the mountain is solid rock
// around it, and its cave mouth opens on the north face, where a road
// leads. The cavern is built on its own and stamped in at the end.
//
// By each landmark stands a waystone in a circle of standing stones;
// touched, it opens its gate in the hall of waystones on the START island
// (model/waystone.ts).
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
import {
  cellKey,
  cellsOf,
  closeDoor,
  GROW_STYLES,
  growPlan,
  type HousePlan,
  HUT,
  type LaidDoor,
  type LaidPlan,
  layPlan,
  ODD_KINDS,
  oddFolk,
  PLANS,
  type RoomKind,
} from "./house_plans.ts"
import { writePath } from "../model/ferry.ts"
import type { Dir } from "../model/types.ts"
import {
  buildCity,
  CITY_H,
  CITY_OUT,
  CITY_W,
  type CityStyle,
} from "./generate_city.ts"
import {
  buildCavern,
  CAVERN_ENTRY_X,
  CAVERN_H,
  CAVERN_W,
} from "./generate_cavern.ts"

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
  /** The cavern: its entrance column (x) and top row (y), as fractions */
  cave: { x: number; y: number; name: string }
  /**
   * The cities on the west coast: each its left column and top row, as
   * fractions, its name (the room id) and the seed of its plan
   */
  cities: {
    x: number
    y: number
    name: string
    seed: string
    style?: CityStyle
  }[]
}

const plan: Plan = JSON.parse(
  await Deno.readTextFile(new URL("./wilds_plan.json", import.meta.url)),
)
const BLOCK = 200
const W = plan.blocks.w * BLOCK
const H = plan.blocks.h * BLOCK
const OI = plan.origin.i
const OJ = plan.origin.j
/** How many times the first 8x5 island this is: the counts grow with it */
const SCALE = Math.max(1, Math.round((W * H) / (1600 * 1000)))
const { rng, randomInt, shuffle } = seed(plan.seed)

const catalog = await loadCatalog(
  new URL("../static/catalog/base.json", import.meta.url).href,
  ["base.json"],
)

// the cavern's place: a rectangle inside the island, under a mountain
const CX0 = Math.round(plan.cave.x * W) - CAVERN_ENTRY_X
const CY0 = Math.round(plan.cave.y * H)
/** The solid rock around the cavern (cells) */
const MARGIN = 14
const inCavern = (x: number, y: number) =>
  x >= CX0 && x < CX0 + CAVERN_W && y >= CY0 && y < CY0 + CAVERN_H
const inMassif = (x: number, y: number) =>
  x >= CX0 - MARGIN && x < CX0 + CAVERN_W + MARGIN &&
  y >= CY0 - MARGIN && y < CY0 + CAVERN_H + MARGIN
/** The distance from the cell to the mountain's rock (0 inside) */
const distMassif = (x: number, y: number) => {
  const dx = Math.max(CX0 - MARGIN - x, 0, x - (CX0 + CAVERN_W + MARGIN - 1))
  const dy = Math.max(CY0 - MARGIN - y, 0, y - (CY0 + CAVERN_H + MARGIN - 1))
  return Math.hypot(dx, dy)
}
const cavern = await buildCavern(OI + CX0, OJ + CY0)

// the cities' places: on the west coast, each harbor on the sea. The
// first is THE CITY (the C portal of the START island lands in it)
const cities = await Promise.all(plan.cities.map(async (c, n) => {
  const x0 = Math.round(c.x * W), y0 = Math.round(c.y * H)
  return {
    ...c,
    x0,
    y0,
    city: await buildCity(OI + x0, OJ + y0, {
      seed: c.seed,
      name: n === 0 ? "THE CITY" : c.name,
      style: c.style,
    }),
  }
}))
type PlacedCity = (typeof cities)[number]
/** The city the cell is in, if any */
const cityAt = (x: number, y: number): PlacedCity | undefined =>
  cities.find((c) =>
    x >= c.x0 && x < c.x0 + CITY_W && y >= c.y0 && y < c.y0 + CITY_H
  )
/** The city's cell character at (x, y), in the city's square */
const cityCell = (c: PlacedCity, x: number, y: number) =>
  c.city.grid[(y - c.y0) * CITY_W + (x - c.x0)]
/**
 * true on a city's ground: inside its organic outline (the rest of its
 * square, CITY_OUT, is the island's)
 */
const inCity = (x: number, y: number) => {
  const c = cityAt(x, y)
  return c !== undefined && cityCell(c, x, y) !== CITY_OUT
}
/** The distance to the nearest city's land (its east part, off the harbor) */
const distCity = (x: number, y: number) =>
  Math.min(...cities.map((c) => {
    const dx = Math.max(c.x0 + 90 - x, 0, x - (c.x0 + CITY_W - 1))
    const dy = Math.max(c.y0 - y, 0, y - (c.y0 + CITY_H - 1))
    return Math.hypot(dx, dy)
  }))

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
    // the mountain over the cavern: the land rises toward it, so it
    // stands in foothills and the rivers run down from it
    const mountain = 0.5 * (1 - smoothstep(0, 70, distMassif(x, y)))
    height[idx(x, y)] = e * 0.7 + island * 0.6 - 0.25 + mountain
    // a smoother copy (fewer hollows) for the rivers to run down
    flow[idx(x, y)] = fbm(wx / 110, wy / 110, S + 1, 2) * 0.7 + island * 0.6 +
      mountain
    moist[idx(x, y)] = fbm(wx / 80, wy / 80, S + 7, 4)
  }
}
const SEA = 0.32
const HILL = 0.76
const ROCK = 0.84
// the land the city stands on: out of the sea, but low (meadows, not
// hills) around it
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const near = 1 - smoothstep(0, 60, distCity(x, y))
    if (near <= 0) continue
    const p = idx(x, y)
    const low = Math.min(Math.max(height[p], SEA + 0.1), HILL - 0.06)
    height[p] = low * near + height[p] * (1 - near)
  }
}

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
  STONEWALL, // the stone wall of a house (some are stone, old or new)
  FLOOR,
  TREE,
  STONE, // shrine / ruins floor
  CAMP,
  FIELD, // tilled soil of the farms
  RAMPART, // a town wall (STONEGATE)
  RUIN, // the broken walls of the ruins
  TRIAL, // the floor of a mini puzzle room
  ICE, // the ice of a mini puzzle room
  BIO, // a biomechanical wall (BONE VALLEY); its kind is in bioChar
  CITY, // the city's ground (stamped in at the end)
  RUNE, // the carved floor of a waystone's circle
  FENCE, // the fence of a sheep pen
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
  [T.WALL]: "2", // wall1: the wooden houses
  [T.STONEWALL]: "1", // wall0: the stone houses
  [T.FLOOR]: "d",
  [T.TREE]: "J", // wall_canopy: the trees, a mass of leaves
  [T.STONE]: "m",
  [T.CAMP]: "p",
  [T.FIELD]: "t",
  [T.RAMPART]: "1", // wall0: a town wall
  [T.RUIN]: "1", // wall0: the broken walls
  [T.TRIAL]: "4",
  [T.ICE]: "i",
  [T.BIO]: "A",
  [T.CITY]: "b",
  [T.RUNE]: "R",
  [T.FENCE]: "H",
}
/** The biomechanical wall kind (A-F) of each T.BIO cell */
const bioChar = new Map<number, string>()
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
    if (sources.length >= 3 * SCALE) break
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

// the mountain is solid rock (the cavern is stamped into it at the end)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) if (inMassif(x, y)) terrain[idx(x, y)] = T.ROCK
}
// the city's ground is set aside, and its harbor water runs out to the
// open sea north and south of it
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (inCity(x, y)) terrain[idx(x, y)] = T.CITY
    else if (
      cities.some((c) => {
        // past the ends of the harbor the sea draws back in a curve, so
        // the coast bends away instead of stopping in a straight line
        const beyond = Math.max(c.y0 - y, 0, y - (c.y0 + CITY_H - 1))
        const reach = 80 - beyond * beyond / 40 +
          (fbm(x / 30, y / 30, S + 61, 2) - 0.5) * 30
        return x < c.x0 + reach && beyond < 70
      })
    ) terrain[idx(x, y)] = T.SEA
  }
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
// the cave mouth: on the mountain's north face, over the cavern's
// entrance
nodes.push({
  x: CX0 + CAVERN_ENTRY_X,
  y: CY0 - MARGIN - 5,
  name: plan.cave.name,
  kind: "cave",
})
// the city gates: the avenues come out of the city's belt of trees; a
// short road leads out from each to an anchor on the island (the gates
// that open onto the sea are left shut)
for (const { city, x0: KX0, y0: KY0, name } of cities) {
  for (const [n, g] of city.gates.entries()) {
    const [ox, oy] = g.side === "east"
      ? [1, 0]
      : g.side === "north"
      ? [0, -1]
      : [0, 1]
    const gx = KX0 + g.x, gy = KY0 + g.y
    const nx = gx + ox * 5, ny = gy + oy * 5
    const outside = [1, 2, 3, 4, 5].map((k) => idx(gx + ox * k, gy + oy * k))
    if (!inside(nx, ny) || outside.some((p) => isWater(terrain[p] as T))) {
      continue
    }
    for (const p of outside) {
      for (const side of [-1, 0, 1, 2]) {
        // the road 4 wide, as the avenue
        const q = p + (ox === 0 ? side : side * W)
        terrain[q] = T.ROAD
        keepClear[q] = 1
      }
    }
    nodes.push({
      x: nx,
      y: ny,
      name: `${name} ${g.side.toUpperCase()} GATE ${n + 1}`,
      kind: "citygate",
    })
  }
}
// the city's belt of trees spills out onto the island: stray trees
// thin out with the distance from its outline, so the city dissolves
// into the land (the gate roads above stay clear, and the roads laid
// later punch through whatever falls here)
{
  const dCity = bfsDistance((p) => terrain[p] === T.CITY, 10)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = idx(x, y)
      const d = dCity[p]
      if (d === 0 || d > 9) continue
      const t = terrain[p] as T
      if (keepClear[p] || taken.has(p)) continue
      if (!(t === T.MEADOW || t === T.FOREST || t === T.HILL)) continue
      if (hash(x, y, 9304) < (1 - d / 9) * 0.55) terrain[p] = T.TREE
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

// the passage from the cave mouth through the mountain's rock into the
// cavern (3 wide, the rock on both sides)
{
  const cave = nodes.find((n) => n.kind === "cave")!
  for (let y = cave.y + 1; y < CY0; y++) {
    for (let dx = -1; dx <= 1; dx++) {
      terrain[idx(cave.x + dx, y)] = T.CAMP
      keepClear[idx(cave.x + dx, y)] = 1
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
  for (let a = 0; a < nodes.length && loops < 2 * SCALE; a++) {
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
    case T.STONEWALL:
    case T.RUIN:
    case T.RAMPART: // the town walls: the roads come in by the gates
    case T.BIO:
    case T.CITY:
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
/** A house's cells, which no road or street is laid over */
const isHouse = (t: T) => t === T.WALL || t === T.STONEWALL || t === T.FLOOR
function lay(p: number) {
  const t = terrain[p] as T
  if (t === T.PLAZA || t === T.STONE || t === T.CAMP || ponds.has(p)) return
  if (isHouse(t)) return
  terrain[p] = isWater(t) ? T.BRIDGE : t === T.BRIDGE ? T.BRIDGE : T.ROAD
  keepClear[p] = 1
  roadCells.add(p)
}
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

// ---------------------------------------------------------------------
// the towns' ground: cleared land, streets, walls and ponds, laid before
// the roads so that the roads join the streets (and come in by the gates)

type Layout = "crossroads" | "ring" | "walled" | "market"
/** The radius of each kind of town */
const TOWN_R: Record<Layout, number> = {
  crossroads: 38,
  ring: 38,
  walled: 40,
  market: 38,
}
const layoutOf = (n: Node): Layout =>
  (plan.villages.find((v) => v.name === n.name)?.layout ??
    "crossroads") as Layout
const townR = (n: Node) => TOWN_R[layoutOf(n)]

/**
 * A street, 2 cells wide (the second cell right or below). It wants
 * to run straight from end to end, but the houses that stood before
 * it (and a cell round each) it goes round, as real streets do. Where
 * no way through is found (an end in the sea), it is laid straight,
 * skipping the water.
 */
function street(x0: number, y0: number, x1: number, y1: number) {
  const straight = () => {
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
  if (!inside(x0, y0) || !inside(x1, y1)) {
    straight()
    return
  }
  // how far a cell strays from the line the street wants
  const len = Math.hypot(x1 - x0, y1 - y0) || 1
  const stray = (x: number, y: number) =>
    Math.abs((x - x0) * (y1 - y0) - (y - y0) * (x1 - x0)) / len
  const cost = (_p: number, q: number) => {
    const t = terrain[q] as T
    if (t === T.SEA || t === T.RAMPART || isHouse(t)) return Infinity
    const x = q % W, y = (q / W) | 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (
        inside(x + dx, y + dy) && isHouse(terrain[idx(x + dx, y + dy)] as T)
      ) return Infinity
    }
    return (isWater(t) ? 6 : 1) + stray(x, y) * 0.6
  }
  const goal = idx(x1, y1)
  const path = cheapestPath(
    idx(x0, y0),
    (p) => p === goal,
    cost,
    (x, y) => Math.abs(x1 - x) + Math.abs(y1 - y),
  )
  if (path.length === 0 || path[path.length - 1] !== goal) {
    straight()
    return
  }
  for (let k = 0; k < path.length; k++) {
    const p = path[k]
    lay(p)
    const q = path[Math.min(k + 1, path.length - 1)]
    const horizontal = Math.abs(q - p) === 1 || q === p
    const x = p % W, y = (p / W) | 0
    const side = horizontal
      ? idx(x, Math.min(H - 1, y + 1))
      : idx(Math.min(W - 1, x + 1), y)
    if (terrain[side] !== T.SEA && terrain[side] !== T.RAMPART) lay(side)
  }
}

for (const n of nodes) {
  if (n.kind !== "village") continue
  const { x: cx, y: cy } = n
  const R = townR(n)
  // the land of the town: full meadow at heart, but the rim wanders
  // with the noise and the clearing dies out cell by cell into the
  // woods, so no drawn circle ever shows. The outer fringe is left to
  // the scatter: lone trees and brush creep back in where it thins
  const FRINGE = 9
  for (let dy = -R - FRINGE; dy <= R + FRINGE; dy++) {
    for (let dx = -R - FRINGE; dx <= R + FRINGE; dx++) {
      const x = cx + dx, y = cy + dy
      if (!inside(x, y)) continue
      const p = idx(x, y)
      const t = terrain[p] as T
      if (isWater(t) || t === T.PLAZA) continue
      const rim = R - 3 + 6 * fbm(x * 0.07, y * 0.07, 7102)
      const d = Math.hypot(dx, dy)
      if (d <= rim) {
        terrain[p] = T.MEADOW
        keepClear[p] = 1
      } else if (d <= rim + FRINGE) {
        // how far out into the fringe (0 at the rim, 1 at the woods):
        // the ground and the right to stay clear both fade with it
        const out = (d - rim) / FRINGE
        if (hash(x, y, 7103) > out) terrain[p] = T.MEADOW
        if (hash(x, y, 7104) > out * 1.6) keepClear[p] = 1
      }
    }
  }
  // the houses that stood before the streets: a few old houses set
  // down where they pleased (off the heart of the town and off the
  // ring street and the town wall), and the streets go round them.
  // What can never be built on or over - water, the town's set
  // pieces, the map's edge, a house there already - is kept out of
  // the running from the start: a door is only tried where nothing
  // of the kind lies within 3 cells, and rock and sand in the way
  // are levelled (layHouse). A village in five has an odd house too,
  // grown room by room, tried first while there is room for it
  const oldDoors: [number, number, number, number][] = []
  /** how many doors each odd house was built with (for the log) */
  const doorsOf = new Map<HousePlan, number>()
  {
    const layout = layoutOf(n)
    const S = R - 2
    const okAt = (dx: number, dy: number) => {
      const d = Math.hypot(dx, dy)
      if (d > R - 14) return false
      switch (layout) {
        case "ring":
          return d >= 24
        case "walled":
          return d >= 16 && Math.max(Math.abs(dx), Math.abs(dy)) <= S - 12
        case "market":
          return dy >= 8 && d >= 12
        default:
          return d >= 16
      }
    }
    const hard = (x: number, y: number) => {
      if (!inside(x, y)) return true
      const t = terrain[idx(x, y)] as T
      return isWater(t) || t === T.PLAZA || t === T.RAMPART ||
        t === T.FIELD || isHouse(t) || ponds.has(idx(x, y))
    }
    const candidates = () => {
      const out: [number, number][] = []
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (!okAt(dx, dy)) continue
          let clear = true
          for (let my = -3; my <= 3 && clear; my++) {
            for (let mx = -3; mx <= 3; mx++) {
              if (hard(cx + dx + mx, cy + dy + my)) {
                clear = false
                break
              }
            }
          }
          if (clear) out.push([cx + dx, cy + dy])
        }
      }
      return shuffle(out)
    }
    const tryAt = (plan: HousePlan, tries: number) => {
      for (const [x, y] of candidates().slice(0, tries)) {
        for (const [nx, ny] of shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]])) {
          const flip = rng() < 0.5 ? 1 : -1
          // the spot stands for the street: two cells out of the door
          const laid = layHouse(
            n.name,
            x - 2 * nx,
            y - 2 * ny,
            nx,
            ny,
            plan,
            flip,
            RESIDENTS[residents % RESIDENTS.length],
            true,
          )
          if (laid) {
            // every door gets its lane
            oldDoors.push([x, y, nx, ny])
            for (const d of laid.doors) {
              oldDoors.push([d.x, d.y, -d.out[0], -d.out[1]])
            }
            doorsOf.set(plan, 1 + laid.doors.length)
            return true
          }
        }
      }
      return false
    }
    if (rng() < 0.2) {
      const style = GROW_STYLES[randomInt(GROW_STYLES.length)]
      for (let rooms = 10 + randomInt(11); rooms >= 6; rooms -= 3) {
        const plan = growPlan(rng, rooms, style)
        if (plan.rooms.length < 6) continue
        if (tryAt(plan, 120)) {
          console.log(
            `${n.name}: an odd ${style} house of ${plan.rooms.length} rooms` +
              ` (${plan.merges?.length ?? 0} knocked through, ${
                doorsOf.get(plan)
              } doors)`,
          )
          break
        }
      }
    }
    const count = 1 + randomInt(3)
    for (let k = 0; k < count; k++) {
      tryAt(PLANS[randomInt(PLANS.length)], 40) || tryAt(HUT, 40)
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
          // the gates: 3 wide where the middle streets go out; a house
          // older than the wall stands in it, its own walls the wall
          if (Math.abs(d) <= 1 || d === 2) continue
          if (isHouse(terrain[idx(x, y)] as T)) continue
          terrain[idx(x, y)] = T.RAMPART
        }
      }
      for (const o of [-18, 0, 18]) {
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
          if (isHouse(terrain[idx(x, y)] as T)) continue
          terrain[idx(x, y)] = T.FIELD
        }
      }
      break
    }
  }
  // the old houses' lanes: from each door to the nearest street
  for (const [dx, dy, nx, ny] of oldDoors) {
    const path = cheapestPath(
      idx(dx - nx, dy - ny),
      (p) => roadCells.has(p),
      (_p, q) => {
        const t = terrain[q] as T
        return isHouse(t) || t === T.RAMPART || isWater(t) ? Infinity : 1
      },
    )
    for (const p of path) lay(p)
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

/** Who sits by the campfires, camp by camp */
const CAMPERS = ["bard", "thief", "assassin", "lady-knight", "sailor"]

/** A room of a house: its walls (inclusive), what kind of room it is,
 * and the cells kept clear of furniture (the doorways and their steps) */
type Room = {
  x0: number
  y0: number
  x1: number
  y1: number
  kind: RoomKind
  keep: Set<string>
}

/**
 * Furnishes one room (the pieces after FF5's town interiors). The
 * pieces go along the room's top wall and in its corners by kind, a
 * painting (a mirror in the bathroom) and a window hang on that wall
 * where no doorway is, and the bedroom gets the bed. `n` picks the
 * variations; `gaps` are the doorway cells in the walls.
 */
function furnishRoom(r: Room, n: number, gaps: Set<string>) {
  const { x0, y0, x1, y1, kind } = r
  const used = new Set(r.keep)
  const free = (x: number, y: number) =>
    x > x0 && x < x1 && y > y0 && y < y1 && !used.has(cellKey(x, y))
  const take = (x: number, y: number, type: string) => {
    if (!free(x, y)) return false
    used.add(cellKey(x, y))
    put(props, x, y, type)
    return true
  }
  // the rooms of the odd houses: one thing, over and over
  if (ODD_KINDS.includes(kind)) {
    if (kind === "dormitory") {
      for (let x = x0 + 1; x < x1; x += 2) {
        if (free(x, y0 + 1) && free(x, y0 + 2)) {
          take(x, y0 + 1, "bed-head")
          take(x, y0 + 2, "bed-foot")
        }
      }
    } else if (kind === "privies") {
      for (let x = x0 + 1; x < x1; x++) take(x, y0 + 1, "toilet")
    } else if (kind === "library") {
      for (let x = x0 + 1; x < x1; x++) {
        take(x, y0 + 1, "bookshelf")
        if (y1 - 1 > y0 + 1) take(x, y1 - 1, "bookshelf")
      }
    } else if (kind === "candlelit") {
      for (let x = x0 + 1; x < x1; x += 2) take(x, y0 + 1, "candles")
      for (let y = y0 + 3; y < y1; y += 2) {
        if (free(x0 + 2, y)) put(items, x0 + 2, y, "candle")
      }
    }
    return
  }
  // the middle of the room
  if (kind === "dining") {
    take(x0 + 2, y0 + 2, "table-l")
    take(x0 + 3, y0 + 2, "table-r")
    take(x0 + 1, y0 + 2, "chair")
    take(x0 + 4, y0 + 2, "stool")
  } else if (kind === "kitchen") {
    take(x0 + 2, y0 + 2, "table")
    take(x0 + 3, y0 + 2, "stool")
  } else if (kind === "bathroom") {
    take(x0 + 2, y0 + 2, "rug")
    take(x0 + 1, y1 - 1, "toilet")
  } else {
    for (const bx of n % 2 ? [x1 - 1, x0 + 1] : [x0 + 1, x1 - 1]) {
      if (free(bx, y0 + 1) && free(bx, y0 + 2)) {
        take(bx, y0 + 1, "bed-head")
        take(bx, y0 + 2, "bed-foot")
        break
      }
    }
    take(x1 - 1, y1 - 1, "broom")
  }
  if (kind === "kitchen" || kind === "dining") {
    take(x1 - 1, y0 + 1, n % 2 ? "jar" : "barrel")
  }
  // the bathtub takes two cells side by side
  if (kind === "bathroom") {
    for (let x = x0 + 1; x < x1 - 1; x++) {
      if (free(x, y0 + 1) && free(x + 1, y0 + 1)) {
        take(x, y0 + 1, "bathtub-l")
        take(x + 1, y0 + 1, "bathtub-r")
        break
      }
    }
  }
  // the top wall dressed to match
  const SETS: Partial<Record<RoomKind, string[]>> = {
    kitchen: ["counter", "stove", n % 2 ? "cauldron" : "kettle", "hearth"],
    dining: ["dish-shelf", "flower-pot", n % 2 ? "candles" : "washtub"],
    bedroom: ["wardrobe", "desk", "bookshelf", n % 2 ? "globe" : "candles"],
    bathroom: ["sink", "towel-rack", "shower"],
  }
  let wx = x0 + 1
  for (const piece of SETS[kind] ?? []) {
    for (; wx < x1; wx++) {
      if (take(wx, y0 + 1, piece)) {
        wx++
        break
      }
    }
  }
  // on the top wall: a painting (a mirror in the bathroom), a window
  // beside it, where no doorway is
  const onWall = (x: number) => x > x0 && x < x1 && !gaps.has(cellKey(x, y0))
  const artX = x0 + ((x1 - x0) >> 1)
  if (onWall(artX)) {
    put(props, artX, y0, kind === "bathroom" ? "mirror" : "painting")
  }
  if (onWall(artX - 2)) {
    put(props, artX - 2, y0, "window")
  }
  if (kind === "bedroom" && n % 3 === 0) {
    for (const [ix, iy] of [[x0 + 2, y0 + 3], [x1 - 2, y0 + 2]]) {
      if (free(ix, iy)) {
        put(items, ix, iy, n % 2 ? "book" : "candle")
        break
      }
    }
  }
}

/**
 * A house by the street cell (sx, sy), set back along (nx, ny) (away
 * from the street) with its door facing the street and a path to it.
 * The plans are tried in turn (big ones first, the hut when nothing
 * else fits, or when `compact`), each turned to face the street and
 * mirrored at random; the first with room is built, its rooms
 * furnished, and someone put just inside the door. Returns false if
 * no plan has room.
 */
function house(
  village: string,
  sx: number,
  sy: number,
  nx: number,
  ny: number,
  resident = RESIDENTS[residents % RESIDENTS.length],
  compact = false,
  old = false,
): boolean {
  const plans = compact
    ? [HUT]
    : [...shuffle(PLANS.filter((p) => !p.rare || rng() < 0.3))]
  for (const plan of plans) {
    for (const flip of shuffle([1, -1] as (1 | -1)[])) {
      if (layHouse(village, sx, sy, nx, ny, plan, flip, resident, old)) {
        return true
      }
    }
  }
  return false
}

function layHouse(
  village: string,
  sx: number,
  sy: number,
  nx: number,
  ny: number,
  plan: HousePlan,
  flip: 1 | -1,
  resident: string,
  /** a house older than the streets: its lane to the street is laid
   * later, once there is one */
  old = false,
): LaidPlan | null {
  // the door lands two cells off the street, the house reaching inward
  const doorX = sx + 2 * nx, doorY = sy + 2 * ny
  const laid = layPlan(plan, [doorX, doorY], [nx, ny], flip)
  const cells = cellsOf(laid)
  // room for the whole of it and a cell of margin all round. A house
  // older than the streets makes its own room: rock and sand under it
  // or beside it are levelled to meadow
  const soft = (t: T) => old && (t === T.ROCK || t === T.SAND)
  for (const [x, y] of cells) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!inside(x + dx, y + dy)) return null
        const q = idx(x + dx, y + dy)
        const t = terrain[q] as T
        if (!(t === T.MEADOW || t === T.FOREST || t === T.HILL || soft(t))) {
          return null
        }
        if (taken.has(q) || roadCells.has(q)) return null
      }
    }
  }
  // the other doors open onto two cells of ground (a road will do);
  // one that would open onto the water or a rock is walled up
  const step = (d: LaidDoor, k: number): [number, number] => [
    d.x + k * d.out[0],
    d.y + k * d.out[1],
  ]
  for (const d of [...laid.doors]) {
    const ok = [1, 2].every((k) => {
      const [x, y] = step(d, k)
      if (!inside(x, y)) return false
      const t = terrain[idx(x, y)] as T
      return t === T.MEADOW || t === T.FOREST || t === T.HILL ||
        t === T.ROAD || soft(t)
    })
    if (!ok) closeDoor(laid, d)
  }
  if (old) {
    for (const [x, y] of cells) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const q = idx(x + dx, y + dy)
          if (soft(terrain[q] as T)) terrain[q] = T.MEADOW
          keepClear[q] = 1
        }
      }
    }
  }
  // the doorsteps stay clear of trees
  for (const d of laid.doors) {
    for (const k of [1, 2]) {
      const q = idx(...step(d, k))
      if (soft(terrain[q] as T)) terrain[q] = T.MEADOW
      keepClear[q] = 1
    }
  }
  // some houses are stone, some planks - old or new alike: walls get
  // rebuilt over the years
  const brick = rng() < 0.3 ? T.STONEWALL : T.WALL
  for (const [x, y] of cells) {
    terrain[idx(x, y)] = laid.walls.has(cellKey(x, y)) ? brick : T.FLOOR
    keepClear[idx(x, y)] = 1
  }
  // the path from the door to the street
  let [px, py] = [doorX, doorY]
  for (let k = 0; k < (old ? 0 : 8); k++) {
    px -= nx
    py -= ny
    const q = idx(px, py)
    if (!inside(px, py) || roadCells.has(q) || isWater(terrain[q] as T)) break
    terrain[q] = T.ROAD
    keepClear[q] = 1
  }
  // no piece hangs where the shop sign goes
  const gaps = new Set([...laid.gaps, cellKey(doorX + 1, doorY)])
  const n = houses.length
  for (const r of laid.rooms) furnishRoom(r, n, gaps)
  const inX = doorX + nx, inY = doorY + ny
  put(actors, inX, inY, resident)
  residents++
  // an odd house holds its own folk (model/oddfolk.ts)
  if ((GROW_STYLES as string[]).includes(plan.name)) {
    const spawns = oddFolk(
      laid,
      [doorX, doorY],
      [-nx, -ny],
      [OI, OJ],
      rng,
      (x, y) =>
        inside(x, y) && !taken.has(idx(x, y)) &&
        (catalog.cells[CELL[terrain[idx(x, y)] as T]]?.canEnter ?? false),
    )
    for (const s of spawns) put(actors, s.x, s.y, s.type, s.data)
  }
  // a shop sign beside some doors (on the wall cell next to it)
  if (signs < VILLAGER_SIGNS.length && ny !== 0) {
    put(props, doorX + 1, doorY, VILLAGER_SIGNS[signs++])
  }
  houses.push({ ...laid.bounds, village })
  return laid
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
    if (
      house(n.name, sx, sy, nx, ny, residentsOf(built)) ||
      house(n.name, sx, sy, nx, ny, residentsOf(built), true)
    ) built++
  }
  // short of three houses (an island village hemmed in by the sea),
  // huts are tried halfway between the spots too
  if (built < 3) {
    for (const [sx, sy, nx, ny] of shuffle(spots)) {
      if (built >= 3) break
      for (const o of [-5, 5]) {
        const [tx, ty] = nx !== 0 ? [sx, sy + o] : [sx + o, sy]
        if (house(n.name, tx, ty, nx, ny, residentsOf(built), true)) {
          built++
          break
        }
      }
    }
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
    ...alongStreet(cx, cy, 1, 0, 10, R - 6, 10),
    ...alongStreet(cx, cy, -1, 0, 10, R - 6, 10),
    ...alongStreet(cx, cy, 0, 1, 10, R - 6, 10),
    ...alongStreet(cx, cy, 0, -1, 10, R - 6, 10),
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
  // the houses face the green from outside the ring, two to a
  // quarter, 30 degrees off the spokes so their long sides clear the
  // spokes, the ring street and each other
  const spots: [number, number, number, number][] = []
  for (let k = 0; k < 4; k++) {
    for (const off of [-30, 30]) {
      const a = (k * 90 + off) * Math.PI / 180
      const c = Math.cos(a), s = Math.sin(a)
      const [nx, ny] = Math.abs(c) > Math.abs(s)
        ? [Math.sign(c), 0]
        : [0, Math.sign(s)]
      spots.push([
        Math.round(cx + c * 18),
        Math.round(cy + s * 18),
        nx,
        ny,
      ])
    }
  }
  // and more along the spokes, for where the ring is short of land
  const R = townR(n)
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    spots.push(...alongStreet(cx, cy, dx, dy, 22, R - 8, 14))
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
  put(props, cx - 5, cy - 3, "shop", { sells: "bread", price: 3 })
  put(actors, cx - 5, cy - 4, "keeper")
  put(actors, cx - 6, cy + 3, "apprentice")
  put(props, cx + 3, cy + 5, "notice-board", {
    text: `${n.name}: THE GATES CLOSE AT NIGHT (THEY DON'T)`,
  })
  kidsAndCat(cx + 7, cy + 8)
  const spots: [number, number, number, number][] = []
  for (const o of [-18, 0, 18]) {
    for (const t of [-28, -9, 9, 28]) {
      spots.push([cx + o, cy + t, -1, 0], [cx + o + 1, cy + t, 1, 0])
    }
  }
  housesAt(n, spots, count)
  // lamp posts at the crossings
  for (const ox of [-18, 18]) {
    for (const oy of [-18, 18]) lampPost(cx + ox - 1, cy + oy - 1)
  }
}

function buildMarket(n: Node, count: number) {
  const { x: cx, y: cy } = n
  const R = townR(n)
  // stalls along the north side of the street, keepers behind them
  const stalls: [string, number][] = [
    ["herb", 3],
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
  // (and along the main street, out past the stalls and the fields)
  housesAt(n, [
    ...alongStreet(cx, cy + 13, -1, 0, 7, R - 8, 10),
    ...alongStreet(cx, cy + 13, 1, 0, 7, R - 8, 10),
    ...alongStreet(cx, cy, -1, 0, 24, R - 8, 14),
    ...alongStreet(cx, cy, 1, 0, 24, R - 8, 14),
  ], count)
  for (let t = -24; t <= 24; t += 8) lampPost(cx + t, cy + 2)
}

/**
 * BONE VALLEY: a biomechanical ossuary in the spirit of H. R. Giger. A
 * round shell of bone walls (each stretch its own kind: ribs, vertebrae,
 * hoses, skulls, hive, sinew) with four ways in, ribs reaching in from
 * it toward the middle, and something waiting there.
 */
function buildBoneValley(n: Node) {
  const R = 16
  const KINDS = ["A", "B", "C", "D", "E", "F"]
  for (let dy = -R - 1; dy <= R + 1; dy++) {
    for (let dx = -R - 1; dx <= R + 1; dx++) {
      const x = n.x + dx, y = n.y + dy
      if (!inside(x, y) || taken.has(idx(x, y))) continue
      const p = idx(x, y)
      const d = Math.hypot(dx, dy)
      if (d > R + 0.5) continue
      const a = Math.atan2(dy, dx)
      // the kind by the direction from the middle, in stretches
      const kind = KINDS[Math.floor(((a + Math.PI) / (Math.PI * 2)) * 6) % 6]
      const gate = Math.abs(dx) <= 1 || Math.abs(dy) <= 1
      const shell = d >= R - 2 && !gate
      // ribs: eight spokes from the shell toward the middle
      const spoke = d >= 7 && d < R - 2 && !gate &&
        Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) < 0.09
      if (shell || spoke) {
        terrain[p] = T.BIO
        bioChar.set(p, kind)
      } else {
        terrain[p] = T.CAMP
      }
      keepClear[p] = 1
    }
  }
  // what waits in the middle
  put(props, n.x, n.y - 1, "self-statue")
  put(props, n.x, n.y + 1, "chest", { drops: "gem", count: 3 })
  put(props, n.x - 2, n.y, "moon-shell")
  put(props, n.x + 2, n.y, "clock")
  put(actors, n.x - 4, n.y + 4, "shadow")
  put(actors, n.x + 4, n.y - 4, "shadow")
  put(props, n.x + 2, n.y + R + 1, "sign", {
    text: "BONE VALLEY: THE WALLS HERE GREW. THEY ARE STILL GROWING",
  })
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
      // the portal lands at the head of the landing trail (below);
      // this plaza is where the trail lets the player out
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
    case "biomech":
      buildBoneValley(n)
      break
    case "citygate": {
      put(props, n.x + 3, n.y - 3, "lantern")
      const c = cities.find((c) => n.name.startsWith(`${c.name} `))!
      const town = c.name === "CITY" ? "THE CITY" : c.name
      put(props, n.x - 3, n.y + 3, "sign", { text: `${town}: ${c.city.motto}` })
      break
    }
    case "cave":
      put(props, n.x - 3, n.y + 3, "lantern")
      put(props, n.x + 3, n.y + 3, "lantern")
      put(props, n.x + 3, n.y, "sign", {
        text: "CAVE MOUTH: INTO THE MOUNTAIN. THREE TRIALS, ONE HOARD",
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
// the castaway cove (sculpted after the mini puzzles): its rect, so
// the mini puzzles keep out of it

/** The cove rect (the LANDING room): its east edge meets the plaza */
const COVE_W = 76
const COVE_H = 50
const COVE_X0 = nodes[0].x - 78
const COVE_Y0 = nodes[0].y - 37
/** Where the W portal lands: the sand beside the wreck */
const COVE_START = { x: COVE_X0 + 10, y: COVE_Y0 + 9 }

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
  for (let n = 0; n < 6000 * SCALE && puzzles.length < 9 * SCALE; n++) {
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
    // not in the castaway cove: it is sculpted over this land later
    if (
      x0 + 13 > COVE_X0 - 2 && x0 - 2 < COVE_X0 + COVE_W + 2 &&
      y0 + 14 > COVE_Y0 - 2 && y0 - 2 < COVE_Y0 + COVE_H + 2
    ) continue
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
// the animal trials (docs/item-tools.md, ideas/wilds-roaming-todo.md 4):
// walled rooms where the tools are what open the door. A door opens while
// someone stands on its plate, and the plate lies too far from the door
// to hold it yourself: an apple draws the chaser onto it, a fish puts the
// cat to sleep on it, and the third room wants both, the long sleeper
// first. No apples lie about (the chaser would follow you out and eat
// them): bring your own, or wait on the young apple tree outside. A fish
// lies outside, out of the cat's reach

{
  type Kind = "apple" | "fish" | "both"
  const KINDS: Kind[] = ["apple", "fish", "both"]
  const WIDTH: Record<Kind, number> = { apple: 15, fish: 19, both: 23 }
  const WAY: Record<Kind, number> = { apple: 7, fish: 9, both: 6 }
  const SIGN: Record<Kind, string> = {
    apple: "THE CHASER WILL DO ANYTHING FOR AN APPLE",
    fish: "THE CAT SLEEPS LONG AFTER A FISH",
    both: "TWO PLATES, TWO DOORS. WHO SLEEPS LONGER?",
  }
  const TREASURE: Record<Kind, string> = {
    apple: "coin-bag",
    fish: "gem",
    both: "big-candy",
  }
  const trials: { x: number; y: number; kind: Kind }[] = []
  for (let n = 0; n < 8000 && trials.length < 2 * KINDS.length; n++) {
    const kind = KINDS[trials.length % KINDS.length]
    const w = WIDTH[kind]
    const x0 = 20 + randomInt(W - 40 - w), y0 = 20 + randomInt(H - 60)
    let fits = true
    for (let y = y0 - 2; y < y0 + 16 && fits; y++) {
      for (let x = x0 - 2; x < x0 + w + 2 && fits; x++) {
        const p = idx(x, y)
        const t = terrain[p] as T
        if (
          !(t === T.MEADOW || t === T.FOREST || t === T.HILL) ||
          keepClear[p] || taken.has(p) || puzzleCells[p] || inMassif(x, y)
        ) fits = false
      }
    }
    if (!fits) continue
    if (
      x0 + w + 2 > COVE_X0 - 2 && x0 - 2 < COVE_X0 + COVE_W + 2 &&
      y0 + 16 > COVE_Y0 - 2 && y0 - 2 < COVE_Y0 + COVE_H + 2
    ) continue
    if (
      [...nodes, ...puzzles, ...trials].some((o) =>
        Math.hypot(o.x - x0, o.y - y0) < (nodes.includes(o as Node) ? 45 : 90)
      )
    ) continue
    const group = `trial-${trials.length + 1}`
    const at = (x: number, y: number, t: T) => {
      const p = idx(x, y)
      terrain[p] = t
      keepClear[p] = 1
      puzzleCells[p] = 1
    }
    // the room: sandstone walls, a trial floor, the way in at the bottom
    for (let y = y0; y <= y0 + 10; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const edge = x === x0 || x === x0 + w - 1 || y === y0 || y === y0 + 10
        at(x, y, edge ? T.RUIN : T.TRIAL)
      }
    }
    const way = x0 + WAY[kind]
    for (let x = way - 1; x <= way + 1; x++) at(x, y0 + 10, T.TRIAL)
    for (let y = y0 + 11; y <= y0 + 12; y++) {
      terrain[idx(way, y)] = T.ROAD
      keepClear[idx(way, y)] = 1
    }
    put(props, way + 2, y0 + 11, "sign", { text: SIGN[kind] })
    put(props, way - 2, y0 + 11, "sign", {
      text: "X CHOOSES WHAT TO PUT DOWN, SPACE PUTS IT",
    })
    const r = { x: x0 + 1, y: y0 + 1 }
    /** A wall across at column x, a door in it at row y */
    const doorWall = (x: number, y: number, g: string) => {
      for (let yy = r.y; yy <= r.y + 8; yy++) at(x, yy, T.RUIN)
      at(x, y, T.TRIAL)
      put(props, x, y, "door", { group: g })
    }
    if (kind === "apple") {
      put(props, r.x + 1, r.y + 1, "plate", { group })
      put(actors, r.x + 6, r.y + 4, "chaser")
      doorWall(r.x + 10, r.y + 4, group)
      put(items, r.x + 12, r.y + 4, TREASURE[kind])
      put(props, x0 + w - 3, y0 + 13, "sapling")
    } else if (kind === "fish") {
      put(props, r.x + 2, r.y + 1, "plate", { group })
      put(actors, r.x + 5, r.y + 2, "cat")
      for (let y = r.y + 6; y <= r.y + 7; y++) {
        for (let x = r.x + 1; x <= r.x + 3; x++) at(x, y, T.LAKE)
      }
      doorWall(r.x + 14, r.y + 4, group)
      put(items, r.x + 16, r.y + 4, TREASURE[kind])
      put(items, x0 + 10, y0 + 13, "fish")
    } else {
      put(props, r.x + 1, r.y + 1, "plate", { group: `${group}a` })
      put(props, r.x + 1, r.y + 7, "plate", { group: `${group}b` })
      for (let x = r.x; x <= r.x + 11; x++) at(x, r.y + 4, T.RUIN)
      put(actors, r.x + 6, r.y + 1, "chaser")
      put(actors, r.x + 4, r.y + 7, "cat")
      for (let y = r.y; y <= r.y + 1; y++) {
        for (let x = r.x + 13; x <= r.x + 15; x++) at(x, y, T.LAKE)
      }
      doorWall(r.x + 17, r.y + 4, `${group}a`)
      doorWall(r.x + 19, r.y + 4, `${group}b`)
      put(items, r.x + 20, r.y + 4, TREASURE[kind])
      put(items, x0 + 15, y0 + 13, "fish")
      put(props, x0 + 3, y0 + 13, "sapling")
    }
    for (let y = y0 - 1; y <= y0 + 14; y++) {
      for (let x = x0 - 1; x <= x0 + w; x++) keepClear[idx(x, y)] = 1
    }
    trials.push({ x: x0, y: y0, kind })
  }
  console.log(`animal trials: ${trials.map((t) => t.kind).join(", ")}`)
}

// ---------------------------------------------------------------------
// the four corners (model/pane.ts, ideas/wilds-roaming-todo.md 9): the
// lone windows shatter into pieces of four places, and those places are
// the corners of the island. In each, a trial with an empty window frame
// at its end: the snowfield in the north (on the ice), the sunken ruins
// in the south (the boulder and the plate), the cape in the east (the
// switches) and the city's old drain in the west (a maze). Bring the
// frame its piece and the pane is whole again

{
  type CornerKind = Kind | "maze"
  type Corner = {
    shard: string
    name: string
    kind: CornerKind
    /** Where to look for room: a landmark's name or a spot (fractions) */
    near: string | [number, number]
    lore: string
  }
  const CORNERS: Corner[] = [
    {
      shard: "shard-snow",
      name: "THE SNOWFIELD",
      kind: "ice",
      near: [0.5, 0.1],
      lore: "A FIELD OF SNOW, ONCE SEEN THROUGH A WINDOW. ITS PANE IS LOST",
    },
    {
      shard: "shard-sea",
      name: "THE SUNKEN RUINS",
      kind: "boulder",
      near: "SUNKEN RUINS",
      lore: "A FARAWAY SEA, ONCE SEEN THROUGH A WINDOW. ITS PANE IS LOST",
    },
    {
      shard: "shard-sky",
      name: "THE CAPE",
      kind: "switch",
      near: "EAST CAPE",
      lore: "A CLOUDLESS SKY, ONCE SEEN THROUGH A WINDOW. ITS PANE IS LOST",
    },
    {
      shard: "shard-town",
      name: "THE OLD DRAIN",
      kind: "maze",
      near: [
        (cities[0].x0 + CITY_W + 30) / W,
        (cities[0].y0 + CITY_H - 60) / H,
      ],
      lore:
        "THE CITY'S OLD DRAIN. A TOWN AT DUSK, ONCE SEEN THROUGH A WINDOW. ITS PANE IS LOST",
    },
  ]
  /** A maze (cells 2 apart), walls '#', floor '.', 'E' in, 'G' the end */
  const maze = (cw: number, ch: number): string[] => {
    const w = cw * 2 + 1, h = ch * 2 + 1
    const g = Array.from({ length: h }, () => Array(w).fill("#"))
    const seen = new Set<number>()
    const stack: [number, number][] = [[cw >> 1, ch - 1]]
    seen.add((ch - 1) * cw + (cw >> 1))
    g[(ch - 1) * 2 + 1][(cw >> 1) * 2 + 1] = "."
    while (stack.length > 0) {
      const [cx, cy] = stack[stack.length - 1]
      const next = shuffle(D4.slice()).map(([dx, dy]) => [cx + dx, cy + dy])
        .find(([nx, ny]) =>
          nx >= 0 && ny >= 0 && nx < cw && ny < ch && !seen.has(ny * cw + nx)
        )
      if (!next) {
        stack.pop()
        continue
      }
      const [nx, ny] = next
      seen.add(ny * cw + nx)
      g[cy + ny + 1][cx + nx + 1] = "."
      g[ny * 2 + 1][nx * 2 + 1] = "."
      stack.push([nx, ny])
    }
    // the way in at the bottom middle; the end: the farthest floor from it
    const ex = (cw >> 1) * 2 + 1
    g[h - 1][ex] = "E"
    const dist = new Map<number, number>([[(h - 1) * w + ex, 0]])
    const queue = [(h - 1) * w + ex]
    let far = queue[0]
    for (let q = 0; q < queue.length; q++) {
      const x = queue[q] % w, y = (queue[q] / w) | 0
      for (const [dx, dy] of D4) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const np = ny * w + nx
        if (g[ny][nx] === "#" || dist.has(np)) continue
        dist.set(np, dist.get(queue[q])! + 1)
        queue.push(np)
        if (dist.get(np)! > dist.get(far)!) far = np
      }
    }
    g[(far / w) | 0][far % w] = "G"
    return g.map((row) => row.join(""))
  }
  const made: string[] = []
  for (const c of CORNERS) {
    const rows = c.kind === "maze" ? maze(12, 7) : MAKERS[c.kind]({
      rng,
      randomInt,
    }).rows
    const rw = rows[0].length, rh = rows.length
    let tx: number, ty: number
    if (typeof c.near === "string") {
      const n = nodes.find((n) => n.name === c.near)!
      tx = n.x
      ty = n.y
    } else {
      tx = Math.round(c.near[0] * W)
      ty = Math.round(c.near[1] * H)
    }
    const fitsRoom = (x0: number, y0: number) => {
      for (let y = y0 - 3; y < y0 + rh + 5; y++) {
        for (let x = x0 - 3; x < x0 + rw + 3; x++) {
          if (!inside(x, y)) return false
          const p = idx(x, y)
          const t = terrain[p] as T
          if (
            !(t === T.MEADOW || t === T.FOREST || t === T.HILL ||
              t === T.SAND) ||
            keepClear[p] || taken.has(p) || puzzleCells[p] || inMassif(x, y)
          ) return false
        }
      }
      return !(x0 + rw + 3 > COVE_X0 - 2 && x0 - 3 < COVE_X0 + COVE_W + 2 &&
        y0 + rh + 5 > COVE_Y0 - 2 && y0 - 3 < COVE_Y0 + COVE_H + 2)
    }
    let at: [number, number] | null = null
    for (let d = 8; d < 220 && !at; d += 2) {
      for (let k = 0; k < 36 && !at; k++) {
        const a = (k / 36) * Math.PI * 2
        const x0 = Math.round(tx + Math.cos(a) * d - rw / 2)
        const y0 = Math.round(ty + Math.sin(a) * d - rh / 2)
        if (fitsRoom(x0, y0)) at = [x0, y0]
      }
    }
    if (!at) {
      console.error(`NG no room for ${c.name}`)
      Deno.exit(1)
    }
    const [x0, y0] = at
    const group = `corner-${c.shard}`
    // the ground around, by the place: snow, puddles, stone, the drain
    for (let dy = -9; dy < rh + 9; dy++) {
      for (let dx = -9; dx < rw + 9; dx++) {
        const x = x0 + dx, y = y0 + dy
        if (!inside(x, y)) continue
        const p = idx(x, y)
        const t = terrain[p] as T
        if (
          keepClear[p] || taken.has(p) || puzzleCells[p] ||
          !(t === T.MEADOW || t === T.FOREST || t === T.HILL || t === T.SAND)
        ) continue
        const out = Math.max(-dx, dx - rw + 1, -dy, dy - rh + 1, 0)
        const n = hash(x, y, 7711)
        if (out > 8 - n * 4) continue
        if (c.kind === "ice") terrain[p] = T.SAND // the snow
        else if (c.kind === "switch") terrain[p] = T.STONE
        else if (c.kind === "maze") terrain[p] = n < 0.5 ? T.HILL : T.CAMP
        else if (dy < -2 && n < 0.18) terrain[p] = T.LAKE // the sunken pools
        else if (n > 0.92) terrain[p] = T.RUIN
      }
    }
    rows.forEach((row, dy) => {
      ;[...row].forEach((ch, dx) => {
        const x = x0 + dx, y = y0 + dy
        const p = idx(x, y)
        terrain[p] = ch === "#"
          ? (c.kind === "maze" ? T.ROCK : T.RUIN)
          : ch === "_"
          ? T.ICE
          : c.kind === "maze"
          ? T.CAMP
          : T.TRIAL
        keepClear[p] = 1
        puzzleCells[p] = 1
        if (ch === "B") put(actors, x, y, "boulder")
        else if (ch === "P") put(props, x, y, "plate", { group })
        else if (ch === "D") put(props, x, y, "door", { group })
        else if (ch === "S") put(props, x, y, "switch", { group })
        else if (ch === "b") put(props, x, y, "blue-wall", { group })
        else if (ch === "r") put(props, x, y, "red-wall", { group })
        else if (ch === "G") put(props, x, y, "pane", { shard: c.shard })
      })
    })
    // the way in from below, with the place's name and its lore
    const exx = x0 + rows[rh - 1].indexOf("E")
    for (let y = y0 + rh; y < y0 + rh + 3; y++) {
      terrain[idx(exx, y)] = T.ROAD
      keepClear[idx(exx, y)] = 1
    }
    put(props, exx + 1, y0 + rh + 1, "sign", { text: c.lore })
    put(props, exx - 1, y0 + rh + 1, "sign", { text: c.name })
    for (let y = y0 - 1; y <= y0 + rh; y++) {
      for (let x = x0 - 1; x <= x0 + rw; x++) keepClear[idx(x, y)] = 1
    }
    puzzles.push({ x: x0, y: y0, kind: "ice", solution: "" })
    made.push(c.name.toLowerCase())
  }
  console.log(`the four corners: ${made.join(", ")}`)
}

// ---------------------------------------------------------------------
// the castaway cove: the tutorial, told by the terrain. The W portal
// lands a castaway on the wreck beach of a cove the land itself seals:
// the lagoon to the north, cliffs to the west, a solid thicket to the
// south and a river to the east, crossed only by the hermit's toll
// bridge (an apple gate). On the way out the cove happens to teach
// everything: the wreck's crates block the one notch in the groyne, a
// launch board hurls the player along the spit, a gone-wild orchard
// drops the apples the toll asks for, the frozen tarn carries them
// across on the ice, and the warden's passage opens by its switches.
// Off the path, the wave chimes ring out the key to the hermit's crypt
// and something glints mid-tarn. The seal, every station, the slide
// paths over the ice (strandings included) and the one-way-ness of
// each mandatory gimmick are all verified below, and the build fails
// loudly if any of it regresses.
{
  const n0 = nodes[0]
  const inCove = (x: number, y: number) =>
    x >= COVE_X0 && x < COVE_X0 + COVE_W && y >= COVE_Y0 &&
    y < COVE_Y0 + COVE_H
  // whatever stood on this land before goes: the cove is sculpted over
  for (const list of [props, actors, items]) {
    for (const s of list) {
      if (inCove(s.i - OI, s.j - OJ)) taken.delete(idx(s.i - OI, s.j - OJ))
    }
    const kept = list.filter((s) => !inCove(s.i - OI, s.j - OJ))
    list.length = 0
    list.push(...kept)
  }

  // --- the land: bands of lagoon, sand, cliff, thicket and river,
  // every edge wobbled by noise so nothing reads as a drawn wall
  const set = (u: number, v: number, t: T) => {
    const p = idx(COVE_X0 + u, COVE_Y0 + v)
    terrain[p] = t
    keepClear[p] = 1
    // left alone by the reachability fix, like the puzzle rooms: the
    // toll gate seals the cove from the island on purpose
    puzzleCells[p] = 1
  }
  const tAt = (u: number, v: number) =>
    terrain[idx(COVE_X0 + u, COVE_Y0 + v)] as T
  /** The lagoon's edge, the beach below it, the west cliffs, the south
   * thicket's brink and the river's column, all drawn by noise */
  const coast = (u: number) => 6 + Math.round(4 * fbm(u * 0.09, 0.31, 7001))
  const shore = (u: number) =>
    coast(u) + 3 + Math.round(2 * fbm(u * 0.15, 1.7, 7005))
  const cliff = (v: number) => 4 + Math.round(3 * fbm(0.2, v * 0.11, 7002))
  const brink = (u: number) => 45 - Math.round(3 * fbm(u * 0.07, 0.8, 7003))
  const riverBase = (v: number) => 69 + Math.round(2 * fbm(0.5, v * 0.13, 7004))
  // straight where the bridge crosses, so the toll gate is flanked by
  // water on both sides
  const riverU = (v: number) => riverBase(v >= 33 && v <= 41 ? 37 : v)
  for (let v = 0; v < COVE_H; v++) {
    for (let u = 0; u < COVE_W; u++) {
      let t: T = T.TREE // the default: solid thicket, carved out below
      if (v <= coast(u)) t = T.SEA
      else if (v <= shore(u)) t = T.SAND
      if (t !== T.SEA && u < cliff(v)) t = T.ROCK
      if (t !== T.SEA && v >= brink(u)) t = T.TREE
      const ur = riverU(v)
      if (Math.abs(u - ur) <= 1) t = v <= coast(u) ? T.SEA : T.RIVER
      else if (u > ur + 1 && v > coast(u)) t = T.TREE
      set(u, v, t)
    }
  }
  // the groyne: a rock arm penning the wreck beach, but for one notch
  for (let v = 0; v <= 15; v++) {
    for (let u = 16; u <= 18; u++) {
      if (tAt(u, v) !== T.SEA) set(u, v, v === 12 ? T.SAND : T.ROCK)
    }
  }
  // firm sand on both sides of the notch, whatever the shore noise says
  for (const [cu, cv] of [[14, 11], [15, 11], [14, 12], [15, 12]]) {
    if (tAt(cu, cv) !== T.SEA) set(cu, cv, T.SAND)
  }
  for (const [cu, cv] of [[19, 11], [20, 11], [19, 12], [20, 12]]) {
    if (tAt(cu, cv) !== T.SEA) set(cu, cv, T.SAND)
  }
  // the wreck beach itself: a sand pocket bitten out of the lagoon
  for (let v = 5; v <= 13; v++) {
    for (let u = 5; u <= 16; u++) {
      const d = ((u - 11) / 5.5) ** 2 + ((v - 9) / 4) ** 2
      if (d <= 1) set(u, v, T.SAND)
    }
  }
  /** Carves a wobbling trail of the terrain t between two points */
  const carve = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    t: T = T.FOREST,
  ) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2
    for (let s = 0; s <= steps; s++) {
      const cx = x0 + ((x1 - x0) * s) / steps +
        (fbm(s * 0.23, 9.1, 7007) - 0.5) * 2
      const cy = y0 + ((y1 - y0) * s) / steps +
        (fbm(9.7, s * 0.23, 7008) - 0.5) * 2
      for (let dv = -1; dv <= 1; dv++) {
        for (let du = -1; du <= 1; du++) {
          const u = Math.round(cx + du), v = Math.round(cy + dv)
          if (
            u >= 1 && u < COVE_W - 1 && v >= 1 && v < COVE_H - 1 &&
            Math.hypot(Math.round(cx) + du - cx, Math.round(cy) + dv - cy) <=
              1.4 &&
            tAt(u, v) !== T.SEA && tAt(u, v) !== T.RIVER
          ) set(u, v, t)
        }
      }
    }
  }
  /** The beach row the stations stand on */
  const sv = (u: number) => coast(u) + 2
  // the forest trail from the spit's end down to the orchard
  carve(40, sv(40), 42, 14)
  carve(42, 14, 44, 18)
  // the orchard: a clearing gone wild in the thicket
  for (let v = 16; v <= 28; v++) {
    for (let u = 36; u <= 52; u++) {
      const d = ((u - 44) / 6.5) ** 2 + ((v - 22) / 4.8) ** 2 +
        (fbm(u * 0.3, v * 0.3, 7009) - 0.5) * 0.3
      if (d <= 1 && tAt(u, v) === T.TREE) set(u, v, T.FOREST)
    }
  }
  // down from the orchard to the tarn's north ledge
  carve(44, 26, 41, 29)
  // the tarn: a frozen pond in a rock basin, stones caught in the ice
  const td = (u: number, v: number) =>
    Math.hypot((u - 42) / 10, (v - 36) / 5.5) +
    (fbm(u * 0.21, v * 0.21, 7010) - 0.5) * 0.14
  for (let v = 27; v <= 45; v++) {
    for (let u = 28; u <= 56; u++) {
      const d = td(u, v)
      if (d <= 1) set(u, v, T.ICE)
      else if (d <= 1.32 && tAt(u, v) !== T.SEA) set(u, v, T.ROCK)
    }
  }
  for (const [iu, iv] of [[38, 33], [47, 33], [37, 38], [46, 39]]) {
    if (tAt(iu, iv) === T.ICE) set(iu, iv, T.ROCK)
  }
  // slabs of some older floor, caught in the ice: a slide can rest on
  // them, so no run of bad slides ever strands anyone
  for (const [su, sv2] of [[44, 40], [36, 35], [41, 41]]) {
    if (tAt(su, sv2) === T.ICE) set(su, sv2, T.STONE)
  }
  set(42, 36, T.STONE) // the glint mid-tarn: a stone that stops the slide
  // the ledges: sand lips onto the ice, north (in) and east (out)
  for (let v = 29; v <= 30; v++) {
    for (let u = 40; u <= 42; u++) set(u, v, T.SAND)
  }
  for (let v = 35; v <= 37; v++) {
    for (let u = 51; u <= 53; u++) set(u, v, T.SAND)
  }
  // the warden's passage: a ruin corridor right off the east ledge
  for (let v = 33; v <= 40; v++) {
    for (let u = 52; u <= 64; u++) set(u, v, T.RUIN)
  }
  for (let v = 36; v <= 37; v++) {
    for (let u = 52; u <= 64; u++) set(u, v, T.STONE)
  }
  for (const [nu, nv] of [[54, 35], [57, 38], [60, 35]]) set(nu, nv, T.STONE)
  // the hermit's rest between the passage and the river
  for (let v = 33; v <= 41; v++) {
    for (let u = 65; u <= riverU(v) - 2; u++) set(u, v, T.MEADOW)
  }
  // the crypt above it, and the step down to its door
  for (let v = 28; v <= 31; v++) {
    for (let u = 64; u <= 68; u++) set(u, v, T.RUIN)
  }
  for (let v = 29; v <= 30; v++) {
    for (let u = 65; u <= 67; u++) set(u, v, T.STONE)
  }
  set(66, 31, T.STONE)
  set(66, 32, T.MEADOW)
  set(67, 32, T.MEADOW)
  // the toll bridge, and the road off it to the plaza
  const rb = riverU(37)
  for (let u = rb - 1; u <= rb + 1; u++) set(u, 37, T.BRIDGE)
  for (let v = 36; v <= 38; v++) {
    for (let u = rb + 2; u < COVE_W; u++) {
      if (tAt(u, v) !== T.RIVER && tAt(u, v) !== T.SEA) set(u, v, T.MEADOW)
    }
  }

  // --- what stands in the cove (zprop remembers it for the checks)
  const zprop = new Map<number, string>()
  const sp = (
    list: Spawn[],
    u: number,
    v: number,
    type: string,
    data?: unknown,
  ) => {
    if (!put(list, COVE_X0 + u, COVE_Y0 + v, type, data)) {
      throw new Error(`castaway cove: the cell for ${type} is taken`)
    }
    if (list === props) zprop.set(idx(COVE_X0 + u, COVE_Y0 + v), type)
  }
  // the wreck: what the tide left of the ship, and the way out
  sp(props, 10, 9, "portal-out")
  sp(props, 12, 7, "sign", {
    text: "THE SHIP IS KINDLING NOW. CRATES BREAK IF YOU WALK AT THEM",
  })
  sp(props, 9, 8, "chest", { drops: "coin", count: 4 })
  for (const [cu, cv] of [[13, 8], [14, 10], [12, 11], [8, 10]]) {
    sp(props, cu, cv, "crate")
  }
  sp(props, 16, 12, "crate")
  sp(props, 18, 12, "crate")
  sp(actors, 14, 7, "snail")
  // the spit: the launch board, loose coins, and the wave chimes
  sp(props, 21, sv(21), "spring")
  sp(props, 20, sv(20) + 1, "sign", {
    text: "A LAUNCH BOARD OFF THE WRECK. FACE EAST AND STEP ON",
  })
  for (const cu of [25, 28, 31]) sp(items, cu, sv(21), "coin")
  const CHIME_NOTES = [0, 2, 4, 7, 9]
  CHIME_NOTES.forEach((note, k) => {
    const bu = 24 + k * 2
    set(bu, sv(bu) + 1, T.SAND)
    sp(props, bu, sv(bu) + 1, "bell-stone", {
      group: "wave-chimes",
      order: k + 1,
      count: CHIME_NOTES.length,
      note,
    })
  })
  set(22, sv(22) + 1, T.SAND)
  sp(props, 22, sv(22) + 1, "sign", {
    text: "WAVE CHIMES. THE SEA RINGS THEM WEST TO EAST - IN ORDER, A GIFT",
  })
  for (const [cu, cv] of [[48, sv(48)], [55, sv(55)]]) sp(items, cu, cv, "coin")
  // the orchard: apples on the ground, trees that grow more, an old camp
  sp(props, 43, 17, "sign", {
    text: "AN ORCHARD GONE WILD. THE TOLL GATE ASKS FIVE APPLES - TAKE PLENTY",
  })
  for (const [au, av] of [[40, 20], [47, 19], [41, 25], [48, 24]]) {
    sp(props, au, av, "sapling")
  }
  for (
    const [au, av] of [[42, 21], [45, 23], [43, 26], [49, 21], [39, 22], [
      46,
      25,
    ]]
  ) sp(items, au, av, "apple")
  sp(props, 48, 22, "campfire")
  sp(props, 49, 20, "tent")
  sp(props, 47, 23, "stool")
  sp(actors, 44, 20, "fox")
  // the tarn's signs: the warning on the way in, the glint on the way out
  set(39, 29, T.SAND)
  sp(props, 39, 29, "sign", {
    text: "THE TARN FROZE SMOOTH. ONE STEP AND IT CARRIES YOU",
  })
  sp(props, 51, 35, "sign", {
    text:
      "SOMETHING GLINTS MID-ICE. THE SLIDE ONLY STOPS WHERE SOMETHING STANDS",
  })
  sp(props, 42, 36, "chest", { drops: "gem", count: 3 })
  // the warden's passage: blue stands while its switch sleeps, red
  // while it wakes; the switches sit in niches between the walls
  sp(props, 51, 37, "sign", {
    text:
      "THE WARDENS PASSAGE: BLUE STANDS WHILE THE SWITCH SLEEPS, RED WHILE IT WAKES",
  })
  const WARDEN = { group: "cove-warden" }
  for (const v of [36, 37]) {
    sp(props, 56, v, "blue-wall", WARDEN)
    sp(props, 59, v, "red-wall", WARDEN)
    sp(props, 62, v, "blue-wall", WARDEN)
  }
  sp(props, 54, 35, "switch", WARDEN)
  sp(props, 57, 38, "switch", WARDEN)
  sp(props, 60, 35, "switch", WARDEN)
  // the hermit's rest: the keeper, his dead, his crypt and his toll
  sp(actors, 66, 36, "sage")
  sp(props, 65, 34, "lantern")
  sp(props, 65, 40, "lantern")
  sp(props, 67, 39, "gravestone")
  sp(props, 67, 34, "gravestone")
  sp(props, 66, 38, "sign", {
    text: "THE HERMIT KEEPS THE BRIDGE. FIVE APPLES PAYS THE TOLL",
  })
  sp(props, 67, 32, "sign", {
    text: "THE HERMITS CRYPT. THE WAVE CHIMES KEPT ITS KEY",
  })
  sp(props, 66, 31, "key-gate")
  sp(props, 66, 29, "chest", { drops: "gem", count: 3 })
  sp(props, rb - 1, 37, "apple-gate", { count: 5 })

  // --- the checks: the cove must hold, teach and let go exactly as
  // designed. Every flood is in world cells over the painted terrain.
  const must = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`castaway cove: ${msg}`)
  }
  type Opts = {
    gate?: boolean
    walls?: boolean
    crates?: boolean
    ice?: boolean
  }
  const BREAKS = new Set(["crate", "chest", "bell-stone"])
  const pass = (x: number, y: number, o: Opts) => {
    const t = terrain[idx(x, y)] as T
    if (!catalog.cells[CELL[t]]?.canEnter) return false
    if (t === T.ICE && o.ice === false) return false
    const pt = zprop.get(idx(x, y))
    if (!pt) return true
    if (catalog.props[pt]?.canEnter) return true
    if (pt === "apple-gate") return o.gate === true
    if (pt === "key-gate") return false
    if (pt === "crate") return o.crates !== false
    if (pt === "blue-wall" || pt === "red-wall") return o.walls !== false
    return BREAKS.has(pt)
  }
  const flood = (o: Opts) => {
    const seen = new Set<number>()
    const start = idx(COVE_START.x, COVE_START.y)
    seen.add(start)
    const queue = [start]
    for (let q = 0; q < queue.length; q++) {
      const p = queue[q]
      const x = p % W, y = (p / W) | 0
      for (const [dx, dy] of D4) {
        const np = idx(x + dx, y + dy)
        if (!seen.has(np) && pass(x + dx, y + dy, o)) {
          seen.add(np)
          queue.push(np)
        }
      }
    }
    return seen
  }
  const cell = (u: number, v: number) => idx(COVE_X0 + u, COVE_Y0 + v)
  const f1 = flood({})
  must(
    [...f1].every((p) => inCove(p % W, (p / W) | 0)),
    "the cove leaks past its own land",
  )
  const SPOTS: [string, number, number][] = [
    ["the notch's far side", 20, sv(20)],
    ["the launch board", 21, sv(21)],
    ["the first wave chime", 24, sv(24) + 1],
    ["the orchard", 44, 22],
    ["the tarn's north ledge", 41, 30],
    ["the tarn's east ledge", 51, 36],
    ["the warden's passage", 58, 36],
    ["the hermit's rest", 66, 36],
    ["the crypt's door", 66, 32],
    ["the toll gate's step", rb - 2, 37],
  ]
  for (const [name, u, v] of SPOTS) {
    must(f1.has(cell(u, v)), `${name} cannot be reached`)
  }
  must(
    !flood({ crates: false }).has(cell(20, sv(20))),
    "the notch crates can be walked around",
  )
  must(
    !flood({ walls: false }).has(cell(66, 36)),
    "the warden's walls can be walked around",
  )
  must(
    !flood({ ice: false }).has(cell(58, 36)),
    "the tarn can be walked around",
  )
  must(
    flood({ gate: true }).has(idx(n0.x, n0.y)),
    "the toll bridge does not let out onto the plaza",
  )
  // the ice, as it actually plays: a slide ends on the first cell that
  // is not ice, or against whatever blocks the way. Every stop the
  // slides can reach must also lead back to a ledge (no strandings),
  // and one of them must stop beside the glint.
  {
    const starts = [cell(41, 30), cell(51, 36)]
    const edges = new Map<number, number[]>()
    const seen = new Set(starts)
    const queue = [...starts]
    for (let q = 0; q < queue.length; q++) {
      const p = queue[q]
      const x = p % W, y = (p / W) | 0
      for (const [dx, dy] of D4) {
        let cx = x + dx, cy = y + dy
        if (!pass(cx, cy, {})) continue
        while (
          terrain[idx(cx, cy)] === T.ICE && pass(cx + dx, cy + dy, {})
        ) {
          cx += dx
          cy += dy
        }
        const np = idx(cx, cy)
        edges.set(p, [...(edges.get(p) ?? []), np])
        if (!seen.has(np)) {
          seen.add(np)
          queue.push(np)
        }
      }
    }
    const glint = [
      cell(42, 36), // in the sim the slide lands on the stone itself:
      cell(41, 36), // in play the chest on it stops the slide one short
      cell(43, 36),
      cell(42, 35),
      cell(42, 37),
    ]
    must(
      glint.some((p) => seen.has(p)),
      "no slide stops beside the glint mid-tarn",
    )
    // back-edges: from every reached stop, a ledge must be reachable
    const rev = new Map<number, number[]>()
    for (const [a, bs] of edges) {
      for (const b of bs) rev.set(b, [...(rev.get(b) ?? []), a])
    }
    const back = new Set(starts)
    const bq = [...starts]
    for (let q = 0; q < bq.length; q++) {
      for (const a of rev.get(bq[q]) ?? []) {
        if (!back.has(a)) {
          back.add(a)
          bq.push(a)
        }
      }
    }
    for (const p of seen) {
      if (!back.has(p)) {
        // debug dump before failing: the tarn and the edges of the spot
        const u0 = p % W - COVE_X0, v0 = ((p / W) | 0) - COVE_Y0
        console.log(`strand at ${u0},${v0}; edges out:`, edges.get(p))
        for (let v = 27; v <= 45; v++) {
          let row = ""
          for (let u = 28; u <= 56; u++) {
            const t = tAt(u, v)
            row += u === u0 && v === v0
              ? "@"
              : t === T.ICE
              ? "."
              : t === T.STONE
              ? "o"
              : t === T.SAND
              ? "_"
              : t === T.ROCK
              ? "#"
              : t === T.RUIN
              ? "R"
              : " "
          }
          console.log(row)
        }
      }
      must(
        back.has(p),
        `a slide strands the player at ${p % W - COVE_X0},${
          ((p / W) | 0) - COVE_Y0
        }`,
      )
    }
  }
  console.log("castaway cove: sealed, every station reached, the ice is fair")
}

// ---------------------------------------------------------------------
// the waystones (model/waystone.ts, ideas/wilds-roaming-todo.md 6): by
// each landmark, a little way off, a clearing in a ring of dark trees
// with one way in. Inside, a fairy ring of flowers on the grass, a circle
// of standing stones on a floor carved with runes, a crescent pool, and
// in the middle the old waystone. The two lanterns at the way in are the
// only light. Touched, the stone wakes and its gate opens in the hall of
// waystones on the START island

// ---------------------------------------------------------------------
// the post (model/errand.ts, ideas/wilds-roaming-todo.md 1): a post box
// by each village's plaza and outside each city's first gate, its
// postmaster beside it. Bump it for a letter to another town; carried
// there, the letter pays more the farther it went

/** A cell of open ground (plaza, road, meadow) holding nothing yet */
const freeGround = (x: number, y: number) => {
  const p = idx(x, y)
  const t = terrain[p] as T
  return (t === T.PLAZA || t === T.ROAD || t === T.MEADOW) &&
    !taken.has(p) && !puzzleCells[p]
}
/** The nearest free cell to (x, y) with a free cell beside it */
const spot = (x0: number, y0: number): [number, number] | null => {
  for (let d = 0; d < 14; d++) {
    for (let dy = -d; dy <= d; dy++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue
        const x = x0 + dx, y = y0 + dy
        if (inside(x + 1, y) && freeGround(x, y) && freeGround(x + 1, y)) {
          return [x, y]
        }
      }
    }
  }
  return null
}
/** The towns: the villages and the cities (their middles) */
const towns = [
  ...nodes.filter((n) => n.kind === "village").map((n) => ({
    name: n.name,
    x: n.x,
    y: n.y,
  })),
  ...cities.map((c) => ({
    name: c.name === "CITY" ? "THE CITY" : c.name,
    x: c.x0 + CITY_W / 2,
    y: c.y0 + CITY_H / 2,
  })),
]
{
  type Post = { town: string; x: number; y: number }
  const posts: Post[] = []
  const seenCity = new Set<string>()
  for (const n of nodes) {
    let town: string | null = null
    if (n.kind === "village") town = n.name
    else if (n.kind === "citygate") {
      const c = cities.find((c) => n.name.startsWith(`${c.name} `))
      if (c && !seenCity.has(c.name)) {
        seenCity.add(c.name)
        town = c.name === "CITY" ? "THE CITY" : c.name
      }
    }
    if (!town) continue
    const at = spot(n.x + 3, n.y + 3)
    if (!at) {
      console.error(`NG no room for the post box of ${town}`)
      Deno.exit(1)
    }
    posts.push({ town, x: at[0], y: at[1] })
  }
  for (const post of posts) {
    // where it sends: the towns a fair walk away, paying by the distance
    const others = posts.filter((o) => o !== post).map((o) => ({
      town: o.town,
      d: Math.hypot(o.x - post.x, o.y - post.y),
    })).sort((a, b) => a.d - b.d)
    const fair = others.filter((o) => o.d >= 300 && o.d <= 1600)
    const routes = (fair.length >= 3 ? fair : others.slice(0, 3)).map((o) => ({
      town: o.town,
      reward: Math.max(5, Math.round(o.d / 30)),
    }))
    put(props, post.x, post.y, "post-box", { town: post.town, routes })
    put(actors, post.x + 1, post.y, "keeper")
  }
  console.log(`post: ${posts.map((p) => p.town.toLowerCase()).join(", ")}`)
}

// ---------------------------------------------------------------------
// the trade (model/trade.ts, ideas/wilds-roaming-todo.md 2): a stall in
// each town selling what the town makes, cheap; its trader beside it.
// Any other town buys the crate, paying the more the farther it came

/** What each town makes */
const GOODS: Record<string, string> = {
  ASHFORD: "WOOL",
  MILLBROOK: "FLOUR",
  STONEGATE: "IRON",
  HAYWARD: "GRAIN",
  THORNBURY: "HONEY",
  OAKMERE: "TIMBER",
  FROSTREACH: "FURS",
  BRAMBLEWICK: "BERRIES",
  WILLOWEND: "BASKETS",
  HIGHCROFT: "MUSHROOMS",
  "THE CITY": "CLOTH",
  SOUTHPORT: "FISH",
  CROOKHAVEN: "CANDLES",
}
{
  const at = new Map(towns.map((t) => [t.name, t]))
  const stalls: string[] = []
  const seenCity = new Set<string>()
  for (const n of nodes) {
    let town: string | null = null
    if (n.kind === "village") town = n.name
    else if (n.kind === "citygate") {
      const c = cities.find((c) => n.name.startsWith(`${c.name} `))
      if (c && !seenCity.has(c.name)) {
        seenCity.add(c.name)
        town = c.name === "CITY" ? "THE CITY" : c.name
      }
    }
    const good = town ? GOODS[town] : undefined
    if (!town || !good) continue
    const here = at.get(town)!
    // what it pays for the others' goods: by how far they came
    const prices: Record<string, number> = {}
    for (const [other, g] of Object.entries(GOODS)) {
      const from = at.get(other)
      if (other === town || !from) continue
      prices[g] = 4 +
        Math.round(Math.hypot(from.x - here.x, from.y - here.y) / 30)
    }
    const spotAt = spot(n.x - 4, n.y + 3)
    if (!spotAt) {
      console.error(`NG no room for the trade stall of ${town}`)
      Deno.exit(1)
    }
    put(props, spotAt[0], spotAt[1], "trade-stall", {
      town,
      good,
      cost: 5,
      prices,
    })
    put(actors, spotAt[0] + 1, spotAt[1], "keeper")
    stalls.push(`${town.toLowerCase()} ${good.toLowerCase()}`)
  }
  console.log(`trade: ${stalls.join(", ")}`)
}

// ---------------------------------------------------------------------
// the guides: people who tell the way to the towns (a speech bubble, as
// a sign's): one in each village's plaza, one outside each city's gate,
// one at each camp and two by the landing. Each names the nearest towns,
// which way they lie and about how far

/** "NORTH-EAST" etc.: which way (dx, dy) points (y grows southward) */
function compass(dx: number, dy: number): string {
  const names = [
    "EAST",
    "SOUTH-EAST",
    "SOUTH",
    "SOUTH-WEST",
    "WEST",
    "NORTH-WEST",
    "NORTH",
    "NORTH-EAST",
  ]
  const k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4))
  return names[(k + 8) % 8]
}
{
  const GUIDES = ["guide-sage", "guide-sailor", "guide-farmer", "guide-bard"]
  const WHO: Record<string, string> = {
    "guide-sage": "SAGE",
    "guide-sailor": "SAILOR",
    "guide-farmer": "FARMER",
    "guide-bard": "BARD",
  }
  /** What a guide at (x, y) says of the nearest towns (not its own) */
  const advice = (x: number, y: number, count: number, here?: string) =>
    towns.filter((t) => t.name !== here)
      .map((t) => ({ ...t, d: Math.hypot(t.x - x, t.y - y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, count)
      .map((t) =>
        `${t.name} LIES ${compass(t.x - x, t.y - y)}, ABOUT ${
          Math.max(1, Math.round(t.d / 50)) * 50
        } STEPS`
      ).join(". ")
  let placed = 0
  const guide = (x0: number, y0: number, count: number, here?: string) => {
    const at = spot(x0, y0)
    if (!at) return
    const type = GUIDES[placed % GUIDES.length]
    const text = `${WHO[type]}: ${advice(at[0], at[1], count, here)}`
    if (put(props, at[0], at[1], type, { text })) placed++
  }
  for (const n of nodes) {
    if (n.kind === "village") guide(n.x - 4, n.y - 3, 3, n.name)
    else if (n.kind === "camp") guide(n.x + 2, n.y + 2, 2)
    else if (n.kind === "citygate") guide(n.x - 3, n.y - 2, 2)
    else if (n.kind === "arrival") {
      guide(n.x + 3, n.y - 2, 3)
      guide(n.x - 3, n.y + 2, 3)
    }
  }
  console.log(`guides: ${placed}`)
}
/**
 * Where the old road from the START island comes out: a free cell by
 * ASHFORD's plaza, in the middle of the west (the portal at the west end
 * of the hall of waystones leads here)
 */
const townRoad = (() => {
  const n = nodes.find((n) => n.name === "ASHFORD")!
  const at = spot(n.x + 1, n.y - 4)
  if (!at) {
    console.error("NG no room for the old road's end in ASHFORD")
    Deno.exit(1)
  }
  taken.add(idx(at[0], at[1]))
  return { name: n.name, x: at[0], y: at[1] }
})()

/**
 * The gates in the hall of waystones on the START island (local cells of
 * the start block): x, the gate's row, the row of its standing stone. The
 * aisle runs along rows 31 and 32, between the two rows of gates
 */
const HALL_SLOTS: [number, number, number][] = [15, 19, 23, 27].flatMap((
  x,
) => [[x, 30, 29], [x, 33, 34]] as [number, number, number][])
/** The start block's top left (the hall is carved into it) */
const START_BLOCK = { i: -10000, j: -10000 }

type Waystone = {
  id: string
  name: string
  x: number
  y: number
  /**
   * Its gate home, beside the stone. The two gates of a waystone lead to
   * each other: going in by one, you come out on the other
   */
  ax: number
  ay: number
}
const waystones: Waystone[] = []
{
  const R = 10
  const fitsCircle = (cx: number, cy: number) => {
    for (let dy = -R - 1; dy <= R + 1; dy++) {
      for (let dx = -R - 1; dx <= R + 1; dx++) {
        if (dx * dx + dy * dy > (R + 1) * (R + 1)) continue
        const x = cx + dx, y = cy + dy
        if (!inside(x, y) || inMassif(x, y)) return false
        const p = idx(x, y)
        const t = terrain[p] as T
        if (!(t === T.MEADOW || t === T.FOREST || t === T.HILL)) return false
        if (keepClear[p] || taken.has(p) || puzzleCells[p]) return false
      }
    }
    return true
  }
  const sites = nodes.filter((n) =>
    ["lookout", "shrine", "ruins", "biomech", "cave"].includes(n.kind)
  )
  for (const n of sites) {
    let spot: [number, number] | null = null
    for (let d = 16; d <= 130 && !spot; d += 2) {
      for (let k = 0; k < 48 && !spot; k++) {
        const a = (k / 48) * Math.PI * 2
        const cx = Math.round(n.x + Math.cos(a) * d)
        const cy = Math.round(n.y + Math.sin(a) * d)
        if (fitsCircle(cx, cy)) spot = [cx, cy]
      }
    }
    if (!spot) {
      console.error(`NG no room for the waystone of ${n.name}`)
      Deno.exit(1)
    }
    const [cx, cy] = spot
    // the way in faces the landmark
    const toward = Math.atan2(n.y - cy, n.x - cx)
    const angleOff = (dx: number, dy: number) => {
      let d = Math.atan2(dy, dx) - toward
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      return Math.abs(d)
    }
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const r = Math.hypot(dx, dy)
        if (r > R + 0.5) continue
        const p = idx(cx + dx, cy + dy)
        keepClear[p] = 1
        const gap = angleOff(dx, dy) < 0.32
        if (r > 8.5) terrain[p] = gap ? T.MEADOW : T.TREE
        else if (r > 6.5) terrain[p] = T.MEADOW
        else if (r > 5.2) terrain[p] = T.STONE
        else terrain[p] = T.RUNE
        // the path in: mosaic from the gap to the circle
        if (gap && r > 5.2 && r <= 9.5 && angleOff(dx, dy) < 0.2) {
          terrain[p] = T.STONE
        }
      }
    }
    // the crescent pool behind the stone
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const r = Math.hypot(dx, dy)
        if (r >= 2 && r <= 3.3 && angleOff(-dx, -dy) < 0.9) {
          terrain[idx(cx + dx, cy + dy)] = T.LAKE
        }
      }
    }
    // the standing stones, the way in between two of them
    for (let k = 0; k < 8; k++) {
      const a = toward + (k + 0.5) * (Math.PI / 4)
      put(
        props,
        cx + Math.round(Math.cos(a) * 5.6),
        cy + Math.round(Math.sin(a) * 5.6),
        "monolith",
      )
    }
    // the fairy ring of flowers on the grass
    for (let k = 0; k < 20; k++) {
      const a = toward + (k + 0.5) * (Math.PI / 10)
      const fx = cx + Math.round(Math.cos(a) * 7.5)
      const fy = cy + Math.round(Math.sin(a) * 7.5)
      if (terrain[idx(fx, fy)] === T.MEADOW) put(props, fx, fy, "flowers")
    }
    // the two lanterns at the way in
    const side = toward + Math.PI / 2
    for (const s of [-1, 1]) {
      put(
        props,
        cx + Math.round(Math.cos(toward) * 9.5 + Math.cos(side) * 2 * s),
        cy + Math.round(Math.sin(toward) * 9.5 + Math.sin(side) * 2 * s),
        "lantern",
      )
    }
    const id = n.name.replace(/ /g, "")
    put(props, cx, cy, "waystone", { id, name: n.name })
    // the gate home, beside the stone: open once the stone woke, it leads
    // onto this stone's gate in the hall (and that one onto this)
    const slot = HALL_SLOTS[waystones.length]
    if (!slot) {
      console.error("NG more waystones than gates in the hall")
      Deno.exit(1)
    }
    const ax = cx + Math.round(Math.cos(toward + Math.PI / 2) * 2)
    const ay = cy + Math.round(Math.sin(toward + Math.PI / 2) * 2)
    put(props, ax, ay, "waygate", {
      id,
      name: n.name,
      home: true,
      i: START_BLOCK.i + slot[0],
      j: START_BLOCK.j + slot[1],
    })
    waystones.push({ id, name: n.name, x: cx, y: cy, ax, ay })
  }
  console.log(
    `waystones: ${waystones.map((w) => w.name.toLowerCase()).join(", ")}`,
  )
}

// ---------------------------------------------------------------------
// the rivers, made whole: since they were first run, the mountain, the
// cities, the towns, the roads, the cove and the puzzle rooms were laid
// over the land, cutting some of them short. So each is run again, now
// around all of that, from its source to the sea (or into a river that
// already reaches it), and the old broken runs dry up. The cities' canals
// run on out of the city the same way: wherever a canal meets the city's
// edge, a river carries it on to the sea. Every river and canal then
// flows from a source, a harbor or another river to the sea, never
// stopping short in the land

{
  /** What a river may not run through */
  const STRUCTURE = new Set<T>([
    T.WALL,
    T.STONEWALL,
    T.FLOOR,
    T.PLAZA,
    T.RAMPART,
    T.RUIN,
    T.STONE,
    T.CAMP,
    T.FIELD,
    T.TRIAL,
    T.ICE,
    T.BIO,
    T.CITY,
    T.RUNE,
  ])
  const inCove = (x: number, y: number) =>
    x >= COVE_X0 && x < COVE_X0 + COVE_W && y >= COVE_Y0 &&
    y < COVE_Y0 + COVE_H
  const blocked = (p: number) => {
    const x = p % W, y = (p / W) | 0
    return STRUCTURE.has(terrain[p] as T) || puzzleCells[p] === 1 ||
      inCove(x, y) || inMassif(x, y)
  }
  /** The waterways of the cities (canals, bridges, harbors) */
  const cityWater = (p: number) => {
    if (terrain[p] !== T.CITY) return false
    const x = p % W, y = (p / W) | 0
    const c = cityAt(x, y)!
    return c.city.waterway[(y - c.y0) * CITY_W + (x - c.x0)] === 1
  }
  const isNet = (p: number) => {
    const t = terrain[p] as T
    return t === T.SEA || t === T.RIVER || t === T.LAKE || t === T.BRIDGE ||
      cityWater(p)
  }
  // the old runs dry up (not the cove's river, nor the lakes)
  let dried = 0
  for (let p = 0; p < W * H; p++) {
    const x = p % W, y = (p / W) | 0
    if (inCove(x, y)) continue
    if (terrain[p] === T.RIVER) {
      terrain[p] = moist[p] > 0.5 ? T.FOREST : T.MEADOW
      dried++
    } else if (terrain[p] === T.BRIDGE) {
      terrain[p] = T.ROAD
    }
  }
  /** The water that reaches the sea (flooded from the open sea) */
  const reaches = new Uint8Array(W * H)
  const flood = (from: number[]) => {
    const queue = from.filter((p) => !reaches[p])
    for (const p of queue) reaches[p] = 1
    for (let q = 0; q < queue.length; q++) {
      const x = queue[q] % W, y = (queue[q] / W) | 0
      for (const [dx, dy] of D4) {
        if (!inside(x + dx, y + dy)) continue
        const np = idx(x + dx, y + dy)
        if (!reaches[np] && isNet(np)) {
          reaches[np] = 1
          queue.push(np)
        }
      }
    }
  }
  flood([idx(0, 0)])
  /** Runs a river from p to water that reaches the sea, out of the cities */
  const run = (start: number) => {
    const path = cheapestPath(
      start,
      (p) => reaches[p] === 1 && terrain[p] !== T.CITY,
      (p, q) => {
        if (blocked(q)) return Infinity
        const t = terrain[q] as T
        if (t === T.SEA || t === T.LAKE || t === T.RIVER) return 0.2
        if (t === T.BRIDGE) return 0.5
        if (t === T.ROAD) return 8 // a new bridge
        const climb = Math.max(0, flow[q] - flow[p]) * 3000
        const meander =
          Math.pow(fbm((q % W) / 18, ((q / W) | 0) / 18, S + 41, 3), 2) * 4
        return (t === T.ROCK ? 3 : 0.3) + meander + climb
      },
    )
    if (path.length === 0 || !reaches[path[path.length - 1]]) return 0
    const wet = (p: number) => {
      const t = terrain[p] as T
      if (t === T.SEA || t === T.LAKE || t === T.RIVER || t === T.BRIDGE) {
        return
      }
      if (blocked(p)) return
      terrain[p] = t === T.ROAD ? T.BRIDGE : T.RIVER
      keepClear[p] = 1
    }
    for (let k = 0; k < path.length; k++) {
      const p = path[k]
      wet(p)
      // two cells wide, beside the direction of flow
      const q = path[Math.min(k + 1, path.length - 1)]
      const x = p % W, y = (p / W) | 0
      const side = Math.abs(q - p) === 1 ? idx(x, y + 1) : idx(x + 1, y)
      if (inside(x + 1, y + 1)) wet(side)
    }
    flood(path)
    return path.length
  }
  // the rivers, from their sources (the mountain's rock aside)
  let runs = 0, cells = 0
  for (const [sx, sy] of sources) {
    const p = idx(sx, sy)
    if (blocked(p)) continue
    const n = run(p)
    if (n > 0) runs++
    cells += n
  }
  // the canals out of the cities: from each canal cell on the city's edge
  let mouths = 0
  for (let p = 0; p < W * H; p++) {
    if (!cityWater(p)) continue
    const x = p % W, y = (p / W) | 0
    for (const [dx, dy] of D4) {
      if (!inside(x + dx, y + dy)) continue
      const np = idx(x + dx, y + dy)
      if (terrain[np] === T.CITY || isNet(np) || blocked(np)) continue
      const n = run(np)
      if (n > 0) {
        mouths++
        cells += n
        flood([p])
      }
    }
  }
  // water still cut off (the cove's river runs out of the cove at its
  // south end): carried on to the sea from where it stops
  let joined = 0
  for (let p = 0; p < W * H; p++) {
    const t = terrain[p] as T
    if (reaches[p] || !(t === T.RIVER || cityWater(p))) continue
    const x = p % W, y = (p / W) | 0
    for (const [dx, dy] of D4) {
      if (reaches[p] || !inside(x + dx, y + dy)) continue
      const np = idx(x + dx, y + dy)
      if (terrain[np] === T.CITY || isNet(np) || blocked(np)) continue
      const n = run(np)
      if (n > 0) {
        joined++
        cells += n
        flood([p])
      }
    }
  }
  // every river and canal cell now reaches the sea
  let cut = 0
  for (let p = 0; p < W * H; p++) {
    const t = terrain[p] as T
    if ((t === T.RIVER || cityWater(p)) && !reaches[p]) {
      if (cut++ < 5) {
        console.log(`  cut off: ${p % W},${(p / W) | 0} ${T[t]}`)
      }
    }
  }
  console.log(
    `rivers made whole: ${runs} rivers, ${mouths} canal mouths, ${joined} joined, ${cells} cells (${dried} old cells dried), ${cut} cut off`,
  )
  if (cut > 0) {
    console.error("NG some rivers or canals don't reach the sea")
    Deno.exit(1)
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
// apples under the trees, mushrooms deep in the forest
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

// fish washed up on the shores (no fishing: this is where the fish for
// the cats and foxes come from; one lies there again when the place
// comes back)
scatter(30, W * H / 40, (x, y) => {
  const p = idx(x, y)
  if (!free(x, y) || distWater[p] !== 1 || !walkableCell(p)) return false
  const t = terrain[p] as T
  return (t === T.SAND || t === T.MEADOW || t === T.FOREST) && rng() < 0.5
}, (x, y) => put(items, x, y, "fish"))

// animals where they belong, and the animal homes (model/den.ts,
// ideas/animal-homes.md): by each village a sheep pen with its flock
// grazing outside; out on the meadows the rabbits' warrens; in the
// woods' edges the foxes' dens; and the beehives by the flowers
const villageNodes = nodes.filter((n) => n.kind === "village")
const homes = { pens: 0, warrens: 0, dens: 0, hives: 0 }
const meadowFree = (x: number, y: number) =>
  free(x, y) && terrain[idx(x, y)] === T.MEADOW && !roadCells.has(idx(x, y))
{
  /** the pen's fence: 9 x 7, a gate in the middle of the side facing (gx, gy) */
  const PW = 9, PH = 7
  for (const v of villageNodes) {
    for (let n = 0; n < 400; n++) {
      const a = rng() * Math.PI * 2, r = townR(v) + 8 + rng() * 24
      const x0 = Math.round(v.x + Math.cos(a) * r) - 4,
        y0 = Math.round(v.y + Math.sin(a) * r) - 3
      // the pen and a margin of 2 all round
      let fits = true
      for (let y = y0 - 2; y < y0 + PH + 2 && fits; y++) {
        for (let x = x0 - 2; x < x0 + PW + 2 && fits; x++) {
          if (!inside(x, y) || !meadowFree(x, y)) fits = false
        }
      }
      if (!fits) continue
      // the gate faces the village
      const cx = x0 + 4, cy = y0 + 3
      const dx = v.x - cx, dy = v.y - cy
      const [gx, gy] = Math.abs(dx) > Math.abs(dy)
        ? [dx > 0 ? x0 + PW - 1 : x0, cy]
        : [cx, dy > 0 ? y0 + PH - 1 : y0]
      for (let y = y0; y < y0 + PH; y++) {
        for (let x = x0; x < x0 + PW; x++) {
          const edge = x === x0 || y === y0 || x === x0 + PW - 1 ||
            y === y0 + PH - 1
          // the gateway, three wide
          const gate = gx === cx
            ? y === gy && Math.abs(x - gx) <= 1
            : x === gx && Math.abs(y - gy) <= 1
          if (edge && !gate) terrain[idx(x, y)] = T.FENCE
          keepClear[idx(x, y)] = 1
        }
      }
      const id = `${gx}.${gy}`
      for (const k of [-1, 0, 1]) {
        put(
          props,
          gx === cx ? gx + k : gx,
          gx === cx ? gy : gy + k,
          "pen-gate",
          {
            id,
            i0: OI + x0 + 1,
            j0: OJ + y0 + 1,
            i1: OI + x0 + PW - 2,
            j1: OJ + y0 + PH - 2,
            count: 3,
          },
        )
      }
      // the sign beside the gate, outside
      const [ox, oy] = [gx + Math.sign(gx - cx), gy + Math.sign(gy - cy)]
      const [sx, sy] = gx === cx ? [ox + 2, oy] : [ox, oy + 2]
      put(props, sx, sy, "sign", {
        text: "THE SHEPHERD'S FOLD: THE GATE SHUTS ON A FULL FOLD OF THREE",
      })
      // the flock, grazing a little way off the far side
      let flock = 0
      for (let k = 0; k < 300 && flock < 3; k++) {
        const fa = rng() * Math.PI * 2, fr = 7 + rng() * 6
        const fx = Math.round(cx + Math.cos(fa) * fr),
          fy = Math.round(cy + Math.sin(fa) * fr)
        if (
          inside(fx, fy) && meadowFree(fx, fy) &&
          (fx < x0 - 1 || fx > x0 + PW || fy < y0 - 1 || fy > y0 + PH) &&
          put(actors, fx, fy, "sheep")
        ) flock++
      }
      homes.pens++
      break
    }
  }
}
// the warrens: four holes round a patch of meadow, three rabbits
const warrens: [number, number][] = []
scatter(70, W * H / 60, (x, y) => {
  if (homes.warrens >= 8 * SCALE) return false
  if (!meadowFree(x, y) || distRoad[idx(x, y)] < 6) return false
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      if (!inside(x + dx, y + dy) || !meadowFree(x + dx, y + dy)) return false
    }
  }
  return rng() < 0.5
}, (x, y) => {
  const id = `${x}.${y}`
  warrens.push([x, y])
  for (const [dx, dy] of [[-3, -2], [3, -3], [-2, 3], [4, 2]]) {
    put(props, x + dx, y + dy, "rabbit-hole", { id })
  }
  for (const [dx, dy] of [[0, 0], [1, -1], [-1, 1]]) {
    put(actors, x + dx, y + dy, "rabbit")
  }
  homes.warrens++
})
// the foxes' dens: at the forest's edge, the den's mouth to the open,
// its fox curled nearby. Half of them first, each a little way off a
// warren: the fox hunts its rabbits (model/instinct.ts), and whatever
// draws the rabbits out draws the fox from its den
const denSpot = (x: number, y: number, nearWarren: boolean) => {
  const p = idx(x, y)
  if (!free(x, y) || terrain[p] !== T.FOREST) return false
  if (nearWarren) {
    const d = Math.min(
      ...warrens.map(([wx, wy]) => Math.hypot(wx - x, wy - y)),
    )
    if (d < 10 || d > 18) return false
  }
  // the forest behind (north), the open in front (south)
  if (
    terrain[idx(x, y - 1)] !== T.FOREST && terrain[idx(x, y - 1)] !== T.TREE
  ) {
    return false
  }
  for (let dy = 1; dy <= 3; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!inside(x + dx, y + dy) || !free(x + dx, y + dy)) return false
      if (!walkableCell(idx(x + dx, y + dy))) return false
    }
  }
  return true
}
const putDen = (x: number, y: number) => {
  put(props, x, y, "fox-den", { id: `${x}.${y}` })
  put(actors, x + 2, y + 2, "fox")
  for (let dy = 1; dy <= 3; dy++) {
    for (let dx = -2; dx <= 2; dx++) keepClear[idx(x + dx, y + dy)] = 1
  }
  homes.dens++
}
scatter(
  60,
  W * H / 20,
  (x, y) => homes.dens < 3 * SCALE && denSpot(x, y, true),
  putDen,
)
const denByWarren = homes.dens
scatter(
  110,
  W * H / 60,
  (x, y) => homes.dens < 6 * SCALE && denSpot(x, y, false) && rng() < 0.5,
  putDen,
)
// the beehives: on the meadows near the water, where the flowers grow
scatter(40, W * H / 20, (x, y) => {
  const p = idx(x, y)
  if (homes.hives >= 6 * SCALE) return false
  if (!meadowFree(x, y) || distWater[p] > 4) return false
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!inside(x + dx, y + dy) || !free(x + dx, y + dy)) return false
      if (!walkableCell(idx(x + dx, y + dy))) return false
    }
  }
  return rng() < 0.5
}, (x, y) => {
  put(props, x, y, "beehive", { id: `${x}.${y}` })
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) keepClear[idx(x + dx, y + dy)] = 1
  }
  homes.hives++
})
console.log(
  `animal homes: ${homes.pens} pens, ${homes.warrens} warrens, ${homes.dens} dens (${denByWarren} by a warren), ${homes.hives} hives`,
)
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
// the oddities (ideas/breakables.md): things that break and let
// something out, and creatures that aren't people, scattered over the
// open land away from the roads and the towns

/** Open land around (x, y) within r: free, wild, not by an anchor */
function openLand(x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (!free(x + dx, y + dy)) return false
      const t = terrain[idx(x + dx, y + dy)] as T
      if (!(t === T.MEADOW || t === T.FOREST || t === T.SAND)) return false
    }
  }
  return nodes.every((n) => Math.hypot(n.x - x, n.y - y) > 40)
}
const oddities = new Map<string, number>()
/** Places `count` of a setup, each where `fits` holds, spread apart */
function oddity(
  name: string,
  count: number,
  r: number,
  setup: (x: number, y: number) => void,
  fits: (x: number, y: number) => boolean = (x, y) => openLand(x, y, r),
) {
  let placed = 0
  count *= SCALE
  scatter(120, W * H / 40, (x, y) => placed < count && fits(x, y), (x, y) => {
    setup(x, y)
    // the setup and its margin stay clear of trees
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (inside(x + dx, y + dy)) keepClear[idx(x + dx, y + dy)] = 1
      }
    }
    placed++
  })
  oddities.set(name, placed)
}
// props, standing alone with room to push them from every side
for (
  const type of [
    "nest-jar-4",
    "packed-box",
    "drawer-tower",
    "moon-shell",
    "lone-window",
    "clock",
    "pinata-tree",
    "self-statue",
  ]
) oddity(type, 3, 2, (x, y) => put(props, x, y, type))
// a balloon rock among things that break when it bursts
oddity("balloon-rock", 3, 2, (x, y) => {
  put(props, x, y, "balloon-rock")
  put(props, x, y - 1, "crate")
  put(props, x - 1, y, "nest-jar-2")
  put(props, x + 1, y, "egg-wall")
})
// a short eggshell wall
oddity("egg-wall", 3, 3, (x, y) => {
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) put(props, x + dx, y + dy, "egg-wall")
  }
})
// bell stones: five in a row, a tune from left to right
{
  let set = 0
  oddity("bell-stone", 3, 5, (x, y) => {
    set++
    const notes = [0, 2, 4, 7, 9]
    notes.forEach((note, k) =>
      put(props, x - 4 + k * 2, y, "bell-stone", {
        group: `wilds-bell-${set}`,
        order: k + 1,
        count: notes.length,
        note,
      })
    )
    put(props, x - 5, y + 2, "sign", { text: "BELL STONES: LEFT TO RIGHT" })
  })
}
// toothpaste rocks on the shore, facing the water
oddity("paste-tube", 4, 1, (x, y) => put(props, x, y, "paste-tube"), (x, y) => {
  if (!openLand(x, y, 1) && !(free(x, y) && isWild(terrain[idx(x, y)] as T))) {
    return false
  }
  // water on one side, open land on the other (to push from)
  return D4.some(([dx, dy]) =>
    isWater(terrain[idx(x + dx, y + dy)] as T) &&
    isWater(terrain[idx(x + dx * 3, y + dy * 3)] as T) &&
    free(x - dx, y - dy) && walkableCell(idx(x - dx, y - dy))
  ) && nodes.every((n) => Math.hypot(n.x - x, n.y - y) > 40)
})
// the creatures
for (
  const type of ["spore", "piggy", "fin", "cloud", "shadow", "book", "egg-s"]
) oddity(type, 3, 2, (x, y) => put(actors, x, y, type))
oddity("pebble-leader", 3, 4, (x, y) => put(actors, x, y, "pebble-leader"))
oddity("fluff", 3, 3, (x, y) => {
  put(actors, x, y, "fluff")
  put(actors, x + 2, y + 1, "fluff")
  put(actors, x - 1, y + 2, "fluff")
})
oddity("slipper", 3, 3, (x, y) => {
  put(actors, x - 2, y + 2, "slipper")
  put(props, x + 1, y - 1, "slipper-mat", { group: `wilds-mat-${x}.${y}` })
  put(props, x + 2, y - 1, "slipper-mat", { group: `wilds-mat-${x}.${y}` })
})
oddity("block-fish", 3, 4, (x, y) => {
  for (const [dx, dy] of [[-3, -3], [0, -2], [3, -3], [-2, 2], [2, 3]]) {
    put(actors, x + dx, y + dy, "block-fish")
  }
})
// snails by the water: the shell unrolls into a path across it
oddity(
  "snail",
  3,
  1,
  (x, y) => put(actors, x, y, "snail"),
  (x, y) =>
    free(x, y) && isWild(terrain[idx(x, y)] as T) &&
    distWater[idx(x, y)] === 2 &&
    nodes.every((n) => Math.hypot(n.x - x, n.y - y) > 40),
)
console.log(
  "oddities:",
  [...oddities].map(([k, n]) => `${k} ${n}`).join(", "),
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
    // a pocket walled in by a house on every side (the odd houses
    // grow round such light-wells) is a courtyard: left as it is,
    // flowers in it
    const walledIn = cells.every((c) => {
      const x = c % W, y = (c / W) | 0
      return D4.every(([dx, dy]) => {
        const q = idx(x + dx, y + dy)
        return pocketOf[q] === pocketOf[c] ||
          terrain[q] === T.WALL || terrain[q] === T.STONEWALL
      })
    })
    if (walledIn && cells.length < 30) {
      // saplings fill it (no one can get in to walk it, so it must
      // not count as walkable ground)
      for (const c of cells) {
        put(props, c % W, (c / W) | 0, "sapling")
        blockingProp.add(c)
      }
      continue
    }
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
    if (hit < 0) {
      // an islet the sea cuts off: it sinks
      for (const c of cells) {
        if (!blockingProp.has(c)) terrain[c] = T.SEA
      }
      continue
    }
    for (let c = hit; c >= 0 && from[c] !== -1; c = from[c]) {
      if (terrain[c] === T.TREE) terrain[c] = T.FOREST
      else if (terrain[c] === T.ROCK) terrain[c] = T.HILL
    }
  }
}
// every waystone's circle is walked to from the arrival
{
  const reached = new Uint8Array(W * H)
  const queue = [idx(arrival.x, arrival.y)]
  reached[queue[0]] = 1
  for (let q = 0; q < queue.length; q++) {
    const x = queue[q] % W, y = (queue[q] / W) | 0
    for (const [dx, dy] of D4) {
      const np = idx(x + dx, y + dy)
      if (inside(x + dx, y + dy) && !reached[np] && walkable(np)) {
        reached[np] = 1
        queue.push(np)
      }
    }
  }
  const lost = waystones.filter((w) => !reached[idx(w.ax, w.ay)])
  if (lost.length > 0) {
    console.error(
      `NG waystones out of reach: ${lost.map((w) => w.name).join(", ")}`,
    )
    Deno.exit(1)
  }
}
// the shortcuts (model/shortcut.ts, ideas/wilds-roaming-todo.md 5):
// where two walked places lie a few cells apart across trees, rock or a
// river but a long walk round, a passage is cut between them with a
// latch gate in it, latched on the far side (the farther from the
// arrival on foot). Walk the long way, lift the latch, and it is a quick
// way back from then on
{
  const D = new Int32Array(W * H).fill(-1)
  const start = idx(arrival.x, arrival.y)
  D[start] = 0
  const queue = [start]
  for (let q = 0; q < queue.length; q++) {
    const x = queue[q] % W, y = (queue[q] / W) | 0
    for (const [dx, dy] of D4) {
      const np = idx(x + dx, y + dy)
      if (inside(x + dx, y + dy) && D[np] < 0 && walkable(np)) {
        D[np] = D[queue[q]] + 1
        queue.push(np)
      }
    }
  }
  const inCoveRect = (x: number, y: number) =>
    x >= COVE_X0 - 4 && x < COVE_X0 + COVE_W + 4 && y >= COVE_Y0 - 4 &&
    y < COVE_Y0 + COVE_H + 4
  const barrier = (x: number, y: number) => {
    const p = idx(x, y)
    const t = terrain[p] as T
    const water = t === T.RIVER || t === T.LAKE
    // (the rivers are kept clear of trees, not of crossings)
    return (t === T.TREE || t === T.ROCK || water) &&
      (water || !keepClear[p]) && !puzzleCells[p] && !taken.has(p) &&
      !inCoveRect(x, y) && !inMassif(x, y) && !inCity(x, y)
  }
  type Cut = {
    x: number
    y: number
    dx: number
    dy: number
    k: number
    saving: number
  }
  const cuts: Cut[] = []
  for (let y = 2; y < H - 2; y += 2) {
    for (let x = 2; x < W - 2; x += 2) {
      const p = idx(x, y)
      if (D[p] < 0) continue
      for (const [dx, dy] of D4) {
        for (let k = 1; k <= 8; k++) {
          const qx = x + dx * k, qy = y + dy * k
          if (!inside(qx, qy)) break
          const q = idx(qx, qy)
          if (D[q] >= 0) {
            const saving = Math.abs(D[p] - D[q]) - k
            if (k >= 3 && saving >= 150) cuts.push({ x, y, dx, dy, k, saving })
            break
          }
          if (!barrier(qx, qy)) break
        }
      }
    }
  }
  cuts.sort((a, b) => b.saving - a.saving)
  console.log(
    `shortcut candidates: ${cuts.length}, best saving ${cuts[0]?.saving ?? 0}`,
  )
  const picked: Cut[] = []
  for (const c of cuts) {
    if (picked.length >= 4 * SCALE) break
    if (picked.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < 160)) continue
    // still all barrier (an earlier cut may have taken a cell)
    let clearWay = true
    for (let s = 1; s < c.k; s++) {
      if (!barrier(c.x + c.dx * s, c.y + c.dy * s)) clearWay = false
    }
    if (!clearWay) continue
    picked.push(c)
    const bx = c.x + c.dx * c.k, by = c.y + c.dy * c.k
    const nearIsA = D[idx(c.x, c.y)] < D[idx(bx, by)]
    for (let s = 1; s < c.k; s++) {
      const p = idx(c.x + c.dx * s, c.y + c.dy * s)
      const t = terrain[p] as T
      terrain[p] = t === T.RIVER || t === T.LAKE ? T.BRIDGE : T.CAMP
      keepClear[p] = 1
    }
    // the gate next to the near end; it is pushed toward the near side
    const s = nearIsA ? 1 : c.k - 1
    const gx = c.x + c.dx * s, gy = c.y + c.dy * s
    const [pdx, pdy] = nearIsA ? [-c.dx, -c.dy] : [c.dx, c.dy]
    const dir = pdx === 1
      ? "right"
      : pdx === -1
      ? "left"
      : pdy === 1
      ? "down"
      : "up"
    put(props, gx, gy, "latch-gate", { id: `${gx}.${gy}`, dir })
  }
  console.log(
    `shortcuts: ${picked.length} latch gates (saving ${
      picked.map((c) => c.saving).join(", ")
    } steps)`,
  )
}
// the ferries (model/ferry.ts, ideas/wilds-roaming-todo.md 10): every
// river and canal runs on to the sea, so each is a way down the island.
// From each river's source and each city's farthest canal, the way down
// to the sea is followed, and boats are moored along it at landings (a
// bank to step off onto). A boat rows you on to the next landing; the
// one at the mouth rows you back up to the first
{
  const inCoveRect = (x: number, y: number) =>
    x >= COVE_X0 - 4 && x < COVE_X0 + COVE_W + 4 && y >= COVE_Y0 - 4 &&
    y < COVE_Y0 + COVE_H + 4
  const cityWater = (x: number, y: number) => {
    const c = cityAt(x, y)
    return c !== undefined &&
      c.city.waterway[(y - c.y0) * CITY_W + (x - c.x0)] === 1
  }
  /** The waters a boat goes on (the sea aside) */
  const isNet = (x: number, y: number) => {
    const p = idx(x, y)
    if (puzzleCells[p] || inCoveRect(x, y) || inMassif(x, y)) return false
    const t = terrain[p] as T
    if (t === T.CITY) return cityWater(x, y)
    return t === T.RIVER || t === T.LAKE || t === T.BRIDGE
  }
  // the steps down to the sea, from every water
  const down = new Int32Array(W * H).fill(-1)
  const queue: number[] = []
  for (let p = 0; p < W * H; p++) {
    if (terrain[p] === T.SEA) {
      down[p] = 0
      queue.push(p)
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const x = queue[q] % W, y = (queue[q] / W) | 0
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy
      if (!inside(nx, ny)) continue
      const np = idx(nx, ny)
      if (down[np] < 0 && isNet(nx, ny)) {
        down[np] = down[queue[q]] + 1
        queue.push(np)
      }
    }
  }
  // the land walked to from the arrival (the city's own ground by its cells)
  const citySpawn = new Set(
    cities.flatMap((c) => [...c.city.props, ...c.city.actors, ...c.city.items])
      .map((s) => idx(s.i - OI, s.j - OJ)),
  )
  const reached = new Uint8Array(W * H)
  {
    const q2 = [idx(arrival.x, arrival.y)]
    reached[q2[0]] = 1
    for (let q = 0; q < q2.length; q++) {
      const x = q2[q] % W, y = (q2[q] / W) | 0
      for (const [dx, dy] of D4) {
        const np = idx(x + dx, y + dy)
        if (inside(x + dx, y + dy) && !reached[np] && walkable(np)) {
          reached[np] = 1
          q2.push(np)
        }
      }
    }
  }
  const BANK = new Set<T>([
    T.MEADOW,
    T.SAND,
    T.FOREST,
    T.HILL,
    T.ROAD,
    T.PLAZA,
    T.CAMP,
    T.FIELD,
    T.STONE,
  ])
  /** The bank to step off onto from the boat at p, if any */
  const bankOf = (p: number): number | null => {
    const x = p % W, y = (p / W) | 0
    for (const [dx, dy] of D4) {
      const bx = x + dx, by = y + dy
      if (!inside(bx, by)) continue
      const b = idx(bx, by)
      if (!reached[b] || taken.has(b) || puzzleCells[b]) continue
      const t = terrain[b] as T
      if (t === T.CITY) {
        const c = cityAt(bx, by)!
        const ch = cityCell(c, bx, by)
        if (
          cityWater(bx, by) || citySpawn.has(b) ||
          !catalog.cells[ch]?.canEnter
        ) continue
      } else if (!BANK.has(t)) continue
      return b
    }
    return null
  }
  const dirOf = (from: number, to: number): Dir =>
    to === from + 1
      ? "right"
      : to === from - 1
      ? "left"
      : to > from
      ? "down"
      : "up"
  /** Down to the sea from p, keeping straight where it can */
  const wayDown = (p: number) => {
    const way = [p]
    let last = -1
    while (down[p] > 0) {
      const x = p % W, y = (p / W) | 0
      const next = D4.map(([dx, dy]) => [x + dx, y + dy])
        .filter(([nx, ny]) => inside(nx, ny))
        .map(([nx, ny]) => idx(nx, ny))
        .filter((np) => down[np] === down[p] - 1)
      const ahead = next.find((np) => np - p === last) ?? next[0]
      last = ahead - p
      p = ahead
      way.push(p)
    }
    // the sea itself is no landing
    way.pop()
    return way
  }
  const heads: number[] = []
  for (const [sx, sy] of sources) {
    const p = idx(sx, sy)
    if (down[p] > 0) heads.push(p)
  }
  for (const c of cities) {
    let best = -1
    for (let y = c.y0; y < c.y0 + CITY_H; y++) {
      for (let x = c.x0; x < c.x0 + CITY_W; x++) {
        const p = idx(x, y)
        if (cityWater(x, y) && down[p] > (best < 0 ? 0 : down[best])) best = p
      }
    }
    if (best >= 0) heads.push(best)
  }
  const ways = heads.map(wayDown).filter((w) => w.length >= 60)
    .sort((a, b) => b.length - a.length)
  const places = [
    ...towns,
    ...nodes.filter((n) => plan.landmarks.some((l) => l.name === n.name)),
  ]
  const nameOf = (p: number, end: "head" | "mouth" | null) => {
    const x = p % W, y = (p / W) | 0
    let best: { name: string; d: number } | null = null
    for (const t of places) {
      const d = Math.hypot(t.x - x, t.y - y)
      if (d < 60 && (!best || d < best.d)) best = { name: t.name, d }
    }
    if (best) return best.name
    return end === "head"
      ? "THE HEADWATERS"
      : end === "mouth"
      ? "THE RIVER MOUTH"
      : "THE NEXT LANDING DOWN"
  }
  const moored: number[] = []
  let routes = 0, boats = 0
  for (const way of ways) {
    if (routes >= 4 * SCALE) break
    // the landings: the first bank from the head, then one every 100 cells
    // or so, and the last bank before the sea
    const stops: { k: number; bank: number }[] = []
    const free = (p: number) =>
      !taken.has(p) &&
      moored.every((m) =>
        Math.hypot(m % W - p % W, ((m / W) | 0) - ((p / W) | 0)) >= 16
      )
    let lastStop: { k: number; bank: number } | null = null
    for (let k = way.length - 1; k >= 0 && !lastStop; k--) {
      const bank = free(way[k]) ? bankOf(way[k]) : null
      if (bank !== null) lastStop = { k, bank }
    }
    if (!lastStop) continue
    for (let k = 0; k < lastStop.k - 40; k++) {
      const prev = stops[stops.length - 1]
      if (prev && k - prev.k < 100) continue
      const bank = free(way[k]) ? bankOf(way[k]) : null
      if (bank !== null) stops.push({ k, bank })
    }
    stops.push(lastStop)
    if (stops.length < 2) continue
    routes++
    const steps = (from: number, to: number) => {
      const cells = from < to
        ? way.slice(from, to + 1)
        : way.slice(to, from + 1).reverse()
      return cells.slice(1).map((c, n) => dirOf(cells[n], c))
    }
    stops.forEach((stop, n) => {
      const next = n + 1 < stops.length ? stops[n + 1] : stops[0]
      const p = way[stop.k]
      put(props, p % W, (p / W) | 0, "ferry", {
        to: nameOf(
          way[next.k],
          n + 1 < stops.length
            ? (n + 2 === stops.length ? "mouth" : null)
            : "head",
        ),
        path: writePath(steps(stop.k, next.k)),
        land: { up: "u", down: "d", left: "l", right: "r" }[
          dirOf(way[next.k], next.bank)
        ],
      })
      // the bank stays clear to step off onto
      taken.add(stop.bank)
      moored.push(p)
      boats++
    })
  }
  console.log(`ferries: ${routes} routes, ${boats} boats`)
}
// spawns left on cells that can't hold them are dropped
/** The props hung on a house wall (placed on the wall cell itself) */
const WALL_PIECES = new Set(["painting", "mirror", "window"])
const standable = (s: Spawn) => walkableCell(idx(s.i - OI, s.j - OJ))
const actorsOut = actors.filter(standable)
const itemsOut = items.filter(standable)
const propsOut = props.filter((s) => {
  const t = terrain[idx(s.i - OI, s.j - OJ)] as T
  // signs and the pieces hung on house walls stay; everything else
  // needs open ground
  // (the cities' own walls are T.CITY here: their generator placed
  // those pieces on its walls itself)
  return s.type.startsWith("sign-") || WALL_PIECES.has(s.type)
    ? t === T.WALL || t === T.STONEWALL || t === T.CITY
    : s.type === "ferry"
    ? true // moored on the water
    : standable(s)
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
    [T.STONEWALL]: Palette.gray3,
    [T.FLOOR]: Palette.brown2,
    [T.TREE]: Palette.green4,
    [T.RAMPART]: Palette.black,
    [T.RUIN]: Palette.yellow3,
    [T.STONE]: Palette.violet2,
    [T.CAMP]: Palette.orange3,
    [T.FIELD]: Palette.brown3,
    [T.TRIAL]: Palette.white,
    [T.ICE]: Palette.cyan1,
    [T.BIO]: Palette.violet3,
    [T.CITY]: Palette.pink3,
    [T.RUNE]: Palette.violet2,
    [T.FENCE]: Palette.brown3,
  }
  const rgba = new Uint8Array(W * H * 4)
  for (let p = 0; p < W * H; p++) {
    const x = p % W, y = (p / W) | 0
    const c = cityAt(x, y)
    const hex = c && inCity(x, y)
      ? (cityCell(c, x, y) === "w" ? Palette.blue3 : Palette.orange1)
      : inCavern(x, y)
      ? (cavern.grid[(y - CY0) * CAVERN_W + (x - CX0)] === "2"
        ? Palette.gray4
        : cavern.grid[(y - CY0) * CAVERN_W + (x - CX0)] === "w"
        ? Palette.blue3
        : Palette.yellow2)
      : COLORS[terrain[p] as T]
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
// output: one json per block, the cavern stamped into the mountain

/** The cell character at (x, y) */
function cellAt(x: number, y: number): string {
  const c = cityAt(x, y)
  if (c && inCity(x, y)) return cityCell(c, x, y)
  if (inCavern(x, y)) {
    // the cavern's rock is the mountain's rock, so no seam shows
    const c = cavern.grid[(y - CY0) * CAVERN_W + (x - CX0)]
    return c === "2" ? CELL[T.ROCK] : c
  }
  const p = idx(x, y)
  return terrain[p] === T.BIO ? bioChar.get(p)! : CELL[terrain[p] as T]
}
const allActors = [
  ...actorsOut,
  ...cavern.actors,
  ...cities.flatMap((c) => c.city.actors),
]
const allItems = [
  ...itemsOut,
  ...cavern.items,
  ...cities.flatMap((c) => c.city.items),
]
const allProps = [
  ...propsOut,
  ...cavern.props,
  ...cities.flatMap((c) => c.city.props),
]
/** The named places: the anchors, and the cavern's caves and chambers */
const places = [
  ...nodes.map((n) => {
    const r = n.kind === "village"
      ? townR(n) + 2
      : n.kind === "ruins"
      ? 9
      : n.kind === "biomech"
      ? 17
      : 6
    return {
      id: n.name.replace(/ /g, ""),
      x0: n.x - r,
      y0: n.y - r,
      x1: n.x + r,
      y1: n.y + r,
    }
  }),
  {
    // the whole cove reads as the LANDING (check_world finds the W
    // portal's landing by this room id) ...
    id: "LANDING",
    x0: COVE_X0,
    y0: COVE_Y0,
    x1: COVE_X0 + COVE_W - 1,
    y1: COVE_Y0 + COVE_H - 1,
  },
  // ... and its places name themselves (the smallest room wins)
  ...[
    { id: "THE-WRECK", r: [4, 3, 18, 14] },
    { id: "THE-SPIT", r: [19, 4, 35, 15] },
    { id: "WILD-ORCHARD", r: [36, 15, 52, 28] },
    { id: "FROZEN-TARN", r: [28, 27, 51, 45] },
    { id: "WARDENS-PASSAGE", r: [52, 32, 64, 41] },
    { id: "HERMITS-REST", r: [64, 27, 75, 42] },
  ].map(({ id, r }) => ({
    id,
    x0: COVE_X0 + r[0],
    y0: COVE_Y0 + r[1],
    x1: COVE_X0 + r[2],
    y1: COVE_Y0 + r[3],
  })),
  // the waystones' circles
  ...waystones.map((w) => ({
    id: `${w.id}-WAYSTONE`,
    x0: w.x - 10,
    y0: w.y - 10,
    x1: w.x + 10,
    y1: w.y + 10,
  })),
  {
    id: "CAVERN",
    x0: CX0,
    y0: CY0,
    x1: CX0 + CAVERN_W - 1,
    y1: CY0 + CAVERN_H - 1,
  },
  ...cavern.rooms.map((r) => ({
    id: `CAVERN-${r.id}`,
    x0: CX0 + r.x0,
    y0: CY0 + r.y0,
    x1: CX0 + r.x1,
    y1: CY0 + r.y1,
  })),
  ...cities.flatMap(({ name, x0: KX0, y0: KY0, city }) => [
    {
      id: name,
      x0: KX0,
      y0: KY0,
      x1: KX0 + CITY_W - 1,
      y1: KY0 + CITY_H - 1,
    },
    ...city.rooms.map((r) => ({
      id: `${name}-${r.id}`,
      x0: KX0 + r.x0,
      y0: KY0 + r.y0,
      x1: KX0 + r.x1,
      y1: KY0 + r.y1,
    })),
  ]),
]

for (let by = 0; by < plan.blocks.h; by++) {
  for (let bx = 0; bx < plan.blocks.w; bx++) {
    const bi = OI + bx * BLOCK, bj = OJ + by * BLOCK
    const inBlock = (s: Spawn) =>
      s.i >= bi && s.i < bi + BLOCK && s.j >= bj && s.j < bj + BLOCK
    const field: string[] = []
    for (let y = 0; y < BLOCK; y++) {
      let row = ""
      for (let x = 0; x < BLOCK; x++) {
        row += cellAt(bx * BLOCK + x, by * BLOCK + y)
      }
      field.push(row)
    }
    // rooms: the named places, clipped to the block
    const { rooms, room } = createRooms(bi, bj)
    for (const r of places) {
      const x0 = Math.max(0, r.x0 - bx * BLOCK)
      const y0 = Math.max(0, r.y0 - by * BLOCK)
      const x1 = Math.min(BLOCK - 1, r.x1 - bx * BLOCK)
      const y1 = Math.min(BLOCK - 1, r.y1 - by * BLOCK)
      if (x0 <= x1 && y0 <= y1) room(r.id, x0, y0, x1, y1)
    }
    const json = {
      i: bi,
      j: bj,
      name: "WILDS",
      rooms,
      catalogs: ["../catalog/base.json"],
      config: { showsExitButton: true },
      actors: allActors.filter(inBlock),
      items: allItems.filter(inBlock),
      props: allProps.filter(inBlock),
      field,
    }
    await Deno.writeTextFile(
      new URL(`../static/map/block_${bi}.${bj}.json`, import.meta.url),
      JSON.stringify(json, null, 2) + "\n",
    )
  }
}
console.log(
  `generated ${
    plan.blocks.w * plan.blocks.h
  } blocks of the WILDS at ${OI},${OJ}`,
)

// the towns' names and middles (in world cells), for the world map
// viewer (static/maps.html) to print where each town stands
await Deno.writeTextFile(
  new URL("../static/map/towns.json", import.meta.url),
  JSON.stringify(
    towns.map((t) => ({ name: t.name, x: OI + t.x, y: OJ + t.y })),
    null,
    2,
  ) + "\n",
)
console.log(`listed ${towns.length} towns for the map viewer`)

// ---------------------------------------------------------------------
// the "W" and "C" portal rooms on the START island, right beside the
// start room (W to the left, C to the right), and the island tidied:
// whatever can't be walked to from the start is black

type StartJson = {
  i: number
  j: number
  props: Spawn[]
  actors?: Spawn[]
  items?: Spawn[]
  field: string[]
}
const startPath = new URL(
  "../static/map/block_-10000.-10000.json",
  import.meta.url,
)
const start = JSON.parse(await Deno.readTextFile(startPath)) as StartJson
const sgrid = start.field.map((row) => [...row])
const carve = (x0: number, y0: number, x1: number, y1: number, c: string) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) sgrid[y][x] = c
}
const local = (x: number, y: number) => ({ i: start.i + x, j: start.j + y })
/** The spawn lists of the start block, without those in the box */
const dropIn = (x0: number, y0: number, x1: number, y1: number) => {
  const out = (s: Spawn) => {
    const x = s.i - start.i, y = s.j - start.j
    return x < x0 || x > x1 || y < y0 || y > y1
  }
  start.props = start.props.filter(out)
  start.actors = (start.actors ?? []).filter(out)
  start.items = (start.items ?? []).filter(out)
}
// the old rooms at the corridor's far end are gone
carve(33, 41, 48, 48, "b")
dropIn(33, 41, 48, 48)
/** The start room (where the game starts): its ring is x 34-38, y 17-21 */
const portalRoom = (
  x0: number,
  door: number,
  letter: string,
  to: { i: number; j: number },
  text: string,
) => {
  carve(x0, 17, x0 + 4, 21, "3") // the room ring
  carve(x0 + 1, 18, x0 + 3, 20, "6") // the room floor
  carve(door, 19, door, 19, "0") // the door from the start room
  dropIn(x0, 16, x0 + 4, 21)
  start.props.push(
    { ...local(x0 + 2, 19), type: "portal", data: to },
    { ...local(x0 + 2, 16), type: letter },
    {
      ...local(x0 + (letter === "w" ? 1 : 3), 18),
      type: "sign",
      data: { text },
    },
  )
}
portalRoom(
  28,
  33,
  "w",
  { i: OI + COVE_START.x, j: OJ + COVE_START.y },
  "THE WILDS: YOU WASH ASHORE IN A COVE. PAST THE HERMITS BRIDGE, THE ISLAND",
)
portalRoom(
  40,
  39,
  "c",
  {
    i: OI + cities[0].x0 + cities[0].city.arrival[0],
    j: OJ + cities[0].y0 + cities[0].city.arrival[1],
  },
  "THE CITY: STREETS, SHOPS AND A CASTLE BY THE SEA",
)
// the hall of waystones, off the corridor south of the start room: a
// dark hall carved with runes, a mosaic aisle down the middle, and a
// gate for each waystone of the WILDS along it, a standing stone behind
// each. A gate sleeps until its waystone out in the WILDS is touched
{
  const X0 = 12, X1 = 30, Y0 = 29, Y1 = 34
  carve(X0, Y0, X1, Y1, "R")
  carve(X0, 31, 33, 32, "m") // the aisle, and the way in from the corridor
  dropIn(X0, Y0 - 1, 33, Y1 + 1)
  const slots = HALL_SLOTS
  if (waystones.length > slots.length) {
    console.error(`NG ${waystones.length} waystones, ${slots.length} gates`)
    Deno.exit(1)
  }
  waystones.forEach((w, n) => {
    const [x, gy, sy] = slots[n]
    start.props.push(
      {
        ...local(x, gy),
        type: "waygate",
        data: { id: w.id, name: w.name, i: OI + w.ax, j: OJ + w.ay },
      },
      { ...local(x, sy), type: "monolith" },
      { ...local(x + 1, gy), type: "sign", data: { text: w.name } },
    )
  })
  // the old road: a plain portal at the west end of the aisle, open from
  // the start, to a village in the middle of the WILDS
  start.props.push(
    {
      ...local(12, 31),
      type: "portal",
      data: { i: OI + townRoad.x, j: OJ + townRoad.y },
    },
    {
      ...local(12, 32),
      type: "sign",
      data: {
        text:
          `THE OLD ROAD TO ${townRoad.name}, A VILLAGE IN THE MIDDLE OF THE WILDS`,
      },
    },
  )
  start.props.push(
    { ...local(13, 30), type: "lantern" },
    { ...local(13, 33), type: "lantern" },
    {
      ...local(32, 30),
      type: "sign",
      data: {
        text:
          "THE HALL OF WAYSTONES: A GATE WAKES WHEN ITS WAYSTONE OUT IN THE WILDS IS TOUCHED",
      },
    },
  )
}
// tidy: the cells that can't be walked to from the start (props count
// as passable: gates open) turn black, and what stood there goes. The
// spawns right by the walkable cells stay (the letters over the rooms)
{
  const START_AT: [number, number] = [36, 19]
  const N = sgrid.length
  const reached = new Uint8Array(N * N)
  const queue: [number, number][] = [START_AT]
  reached[START_AT[1] * N + START_AT[0]] = 1
  while (queue.length > 0) {
    const [x, y] = queue.pop()!
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || reached[ny * N + nx]) {
        continue
      }
      if (!catalog.cells[sgrid[ny][nx]]?.canEnter) continue
      reached[ny * N + nx] = 1
      queue.push([nx, ny])
    }
  }
  const near = (x: number, y: number) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < N && ny < N && reached[ny * N + nx]) {
          return true
        }
      }
    }
    return false
  }
  let blacked = 0
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!reached[y * N + x] && sgrid[y][x] !== "b") {
        sgrid[y][x] = "b"
        blacked++
      }
    }
  }
  const keep = (s: Spawn) => near(s.i - start.i, s.j - start.j)
  const before = start.props.length + (start.actors?.length ?? 0) +
    (start.items?.length ?? 0)
  start.props = start.props.filter(keep)
  start.actors = (start.actors ?? []).filter(keep)
  start.items = (start.items ?? []).filter(keep)
  const after = start.props.length + start.actors.length + start.items.length
  console.log(
    `tidied the start island: ${blacked} cells blacked, ${
      before - after
    } spawns dropped`,
  )
}
start.field = sgrid.map((row) => row.join(""))
await Deno.writeTextFile(startPath, JSON.stringify(start, null, 2) + "\n")
console.log("linked the WILDS and the CITY from the start island")
