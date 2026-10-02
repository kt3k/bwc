// Generates the WILDS CAVERN: a cave dungeon under the south of the
// WILDS (2x2 blocks right below it), entered on foot down the old tunnel
// from the cave mouth. It tries out organic dungeon shapes (see
// ideas/organic-maps.md): the big spaces are grown, not drawn, while
// the puzzle rooms stay small, square and verified, as "ancient
// chambers" set into the rock.
//
// 1. a mission graph: entrance -> great hall -> lake, grotto, the deep
//    -> three trials (one key each) -> the vault behind three key gates
// 2. the chambers are stamped first (prefabs), and kept clear
// 3. caverns are grown as noisy metaballs (one per open node), the lake
//    cavern holds an underground lake
// 4. tunnels follow the graph edges: A* through the rock with noise in
//    the cost so they wind, carved with a width that varies along them
// 5. a majority filter rounds everything off, then floors vary by noise
//    (gravel, sand, packed earth), stalagmites stand in the open, side
//    pockets are dug by a drunkard's walk and hide coins
// 6. every walkable cell is made reachable from the entrance; then the
//    checks: every trial is sealed until solved and solvable, and the
//    vault opens only with the three keys
//
// Usage: deno -A tools/generate_cavern.ts [--preview file.png]
import { seed } from "../util/random.ts"
import { loadCatalog } from "../model/catalog.ts"
import { Palette } from "../util/palette.ts"
import { createRooms } from "./rooms.ts"
import { encodePng } from "./png.ts"
import { fbm } from "./noise.ts"

type Spawn = { i: number; j: number; type: string; data?: unknown }

const wilds = JSON.parse(
  await Deno.readTextFile(new URL("./wilds_plan.json", import.meta.url)),
) as {
  origin: { i: number; j: number }
  blocks: { w: number; h: number }
  cave: { x: number }
}
const BLOCK = 200
const W = 400
const H = 400
/** Right below the WILDS, with the old tunnel's column in the middle */
const TUNNEL_I = wilds.origin.i +
  Math.round(wilds.cave.x * wilds.blocks.w * BLOCK)
const OI = TUNNEL_I - W / 2
const OJ = wilds.origin.j + wilds.blocks.h * BLOCK
const ENTRY_X = TUNNEL_I - OI
const { rng, randomInt } = seed("cavern-1")
const S = 977

const catalog = await loadCatalog(
  new URL("../static/catalog/base.json", import.meta.url).href,
  ["base.json"],
)

const ROCK = "2"
const grid: string[] = Array(W * H).fill(ROCK)
const idx = (x: number, y: number) => y * W + x
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H
const D4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const D8: [number, number][] = [...D4, [1, 1], [1, -1], [-1, 1], [-1, -1]]
/** Cells that later stages must leave alone (chambers, their doors) */
const locked = new Uint8Array(W * H)
/** Cells kept free of stalagmites and pockets (paths, doors) */
const keepClear = new Uint8Array(W * H)

const props: Spawn[] = []
const actors: Spawn[] = []
const items: Spawn[] = []
const taken = new Set<number>()
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

// ---------------------------------------------------------------------
// 1. the mission graph

type Cave = { name: string; x: number; y: number; r: number }
const jitter = (v: number) => v + randomInt(17) - 8
const caves: Cave[] = [
  { name: "HALL", x: ENTRY_X, y: 75, r: 40 },
  { name: "LAKE", x: jitter(90), y: jitter(165), r: 38 },
  { name: "GROTTO", x: jitter(315), y: jitter(150), r: 30 },
  { name: "DEEP", x: jitter(205), y: jitter(245), r: 32 },
]
const cave = (name: string) => caves.find((c) => c.name === name)!

// ---------------------------------------------------------------------
// 2. the chambers (prefabs): small, square, verified

type Chamber = {
  name: string
  x0: number
  y0: number
  w: number
  h: number
  /** the cell just outside the door, where a tunnel arrives */
  outside: [number, number]
  key?: [number, number]
}
const chambers: Chamber[] = []

/** Stamps rows of a chamber: "#" rock, "." floor, other chars as is */
function stamp(x0: number, y0: number, rows: string[], floor: string) {
  rows.forEach((row, dy) => {
    ;[...row].forEach((c, dx) => {
      const p = idx(x0 + dx, y0 + dy)
      grid[p] = c === "#" ? ROCK : c === "." ? floor : c
      locked[p] = 1
    })
  })
  // a margin of rock around, so caverns don't eat into the walls
  for (let y = y0 - 2; y < y0 + rows.length + 2; y++) {
    for (let x = x0 - 2; x < x0 + rows[0].length + 2; x++) {
      if (inside(x, y) && !locked[idx(x, y)]) {
        grid[idx(x, y)] = ROCK
        locked[idx(x, y)] = 2
      }
    }
  }
}
/** Opens the door on the top wall and the cell outside it */
function door(x: number, y: number, floor: string): [number, number] {
  grid[idx(x, y)] = floor
  grid[idx(x, y - 1)] = floor
  grid[idx(x, y - 2)] = floor
  locked[idx(x, y - 1)] = 0
  locked[idx(x, y - 2)] = 0
  keepClear[idx(x, y - 1)] = 1
  keepClear[idx(x, y - 2)] = 1
  return [x, y - 2]
}

// Trial I, the sunken bridge: a channel splits the chamber; a boulder
// pushed into the water becomes the bridge to the key
{
  const x0 = jitter(60), y0 = jitter(270)
  stamp(x0, y0, [
    "#####################",
    "#...................#",
    "#...................#",
    "#...................#",
    "#...................#",
    "#...................#",
    "#...................#",
    "#...................#",
    "#wwwwwwwwwwwwwwwwwww#",
    "#...................#",
    "#...................#",
    "#...................#",
    "#...................#",
    "#...................#",
    "#####################",
  ], "4")
  const outside = door(x0 + 10, y0, "4")
  put(actors, x0 + 10, y0 + 5, "boulder")
  put(actors, x0 + 5, y0 + 5, "boulder") // a spare
  put(props, x0 + 13, y0 + 2, "sign", {
    text: "TRIAL I: STONE SINKS, AND STONE BECOMES A BRIDGE",
  })
  put(items, x0 + 10, y0 + 12, "key")
  chambers.push({
    name: "TRIAL1",
    x0,
    y0,
    w: 21,
    h: 15,
    outside,
    key: [x0 + 10, y0 + 12],
  })
}

// Trial II, the ice: a rink of pegs around a walled island. Built by
// generate and test: random pegs until the island can be reached (and
// left again) in no fewer than 6 slides
const ICE_W = 21, ICE_H = 17
function iceLayout(attempt: number): string[] | null {
  const r = seed(`cavern-ice-${attempt}`)
  const rows: string[][] = Array.from(
    { length: ICE_H },
    (_, y) =>
      Array.from(
        { length: ICE_W },
        (_, x) =>
          x === 0 || y === 0 || x === ICE_W - 1 || y === ICE_H - 1 ? "#" : "i",
      ),
  )
  for (let x = 8; x <= 12; x++) rows[1][x] = "." // the landing by the door
  // the island: walls around a 3x2 floor, one gap
  for (let y = 10; y <= 13; y++) {
    for (let x = 8; x <= 12; x++) {
      const edge = y === 10 || y === 13 || x === 8 || x === 12
      rows[y][x] = edge ? "#" : "."
    }
  }
  const gaps: [number, number][] = [[10, 10], [8, 11], [12, 12], [10, 13]]
  const [gx, gy] = gaps[r.randomInt(gaps.length)]
  rows[gy][gx] = "."
  for (let n = 0; n < 9; n++) {
    const x = 1 + r.randomInt(ICE_W - 2), y = 2 + r.randomInt(ICE_H - 3)
    if (rows[y][x] === "i" && !(x >= 7 && x <= 13 && y >= 9 && y <= 14)) {
      rows[y][x] = "#"
    }
  }
  const layout = rows.map((row) => row.join(""))
  const moves = iceSolve(layout, [10, 1], [10, 11])
  if (moves < 6) return null
  if (iceSolve(layout, [10, 11], [10, 1]) < 0) return null
  return layout
}
/** Fewest moves (slides count as one) from a to b on an ice layout, -1 if none */
function iceSolve(rows: string[], a: [number, number], b: [number, number]) {
  const open = (x: number, y: number) =>
    y >= 0 && y < rows.length && x >= 0 && x < rows[0].length &&
    rows[y][x] !== "#"
  const ice = (x: number, y: number) => rows[y][x] === "i"
  const dist = new Map<string, number>([[`${a[0]}.${a[1]}`, 0]])
  const queue: [number, number][] = [a]
  for (let q = 0; q < queue.length; q++) {
    const [x, y] = queue[q]
    const d = dist.get(`${x}.${y}`)!
    // the island's floor counts as arrived
    if (Math.abs(x - b[0]) <= 1 && Math.abs(y - b[1]) <= 1 && !ice(x, y)) {
      return d
    }
    for (const [dx, dy] of D4) {
      if (!open(x + dx, y + dy)) continue
      let nx = x + dx, ny = y + dy
      while (ice(nx, ny) && open(nx + dx, ny + dy)) {
        nx += dx
        ny += dy
      }
      const k = `${nx}.${ny}`
      if (!dist.has(k)) {
        dist.set(k, d + 1)
        queue.push([nx, ny])
      }
    }
  }
  return -1
}
{
  let layout: string[] | null = null
  for (let attempt = 0; attempt < 2000 && !layout; attempt++) {
    layout = iceLayout(attempt)
  }
  if (!layout) throw new Error("no solvable ice layout found")
  const x0 = jitter(300), y0 = jitter(255)
  stamp(x0, y0, layout, "4")
  const outside = door(x0 + 10, y0, "4")
  // the key on the island floor (11..12 inside the 3x2)
  const key: [number, number] = [x0 + 10, y0 + 12]
  grid[idx(...key)] = "4"
  put(items, ...key, "key")
  put(props, x0 + 7, y0 + 1, "sign", {
    text: "TRIAL II: ICE ONLY STOPS AT STONE",
  })
  chambers.push({ name: "TRIAL2", x0, y0, w: ICE_W, h: ICE_H, outside, key })
}

// Trial III, the weight: a plate at the end of a lane holds the alcove
// door open. Only a rolling boulder can stay on it for you
{
  const x0 = jitter(150), y0 = jitter(300)
  stamp(
    x0,
    y0,
    [
      "###################",
      "#.................#",
      "#.................#",
      "#.................#",
      "#.................#",
      "#.................#",
      "#.................#",
      "#.................#",
      "#########.#########",
      "########...########",
      "########...########",
      "########...########",
      "###################",
    ],
    "4",
  )
  // the partition has one door; the alcove behind it holds the key
  const outside = door(x0 + 9, y0, "4")
  put(props, x0 + 9, y0 + 8, "door", { group: "cavern-weight" })
  put(props, x0 + 17, y0 + 4, "plate", { group: "cavern-weight" })
  put(actors, x0 + 3, y0 + 4, "boulder")
  put(actors, x0 + 3, y0 + 6, "boulder") // a spare (push it up first)
  put(props, x0 + 12, y0 + 2, "sign", {
    text: "TRIAL III: THE DOOR STAYS OPEN WHILE THE PLATE IS HELD",
  })
  put(items, x0 + 9, y0 + 10, "key")
  chambers.push({
    name: "TRIAL3",
    x0,
    y0,
    w: 19,
    h: 13,
    outside,
    key: [x0 + 9, y0 + 10],
  })
}

// The vault: three key gates in the doorway, the hoard inside
{
  const x0 = ENTRY_X - 9, y0 = 352
  stamp(x0, y0, [
    "###################",
    "#.................#",
    "#.................#",
    "#.................#",
    "#.................#",
    "#.................#",
    "#.................#",
    "#.................#",
    "#.................#",
    "#.................#",
    "###################",
  ], "m")
  // a 1-wide gate corridor above the door
  for (let y = y0 - 4; y <= y0; y++) {
    grid[idx(x0 + 9, y)] = "m"
    locked[idx(x0 + 9, y)] = 1
  }
  for (const y of [y0 - 3, y0 - 2, y0 - 1]) {
    put(props, x0 + 9, y, "key-gate")
  }
  const outside: [number, number] = [x0 + 9, y0 - 5]
  grid[idx(...outside)] = "m"
  keepClear[idx(...outside)] = 1
  put(props, x0 + 11, y0 - 5, "sign", { text: "THE HOARD: THREE KEYS" })
  put(props, x0 + 5, y0 + 5, "chest", { drops: "coin", count: 15 })
  put(props, x0 + 13, y0 + 5, "chest", { drops: "seed", count: 4 })
  for (let y = y0 + 2; y <= y0 + 8; y += 3) {
    for (let x = x0 + 3; x <= x0 + 15; x += 3) put(items, x, y, "coin")
  }
  put(props, x0 + 9, y0 + 3, "sign", { text: "MASTER OF THE CAVERN!" })
  chambers.push({ name: "VAULT", x0, y0, w: 19, h: 11, outside })
}

// side nooks: small caverns off the main ones, so the rock between
// isn't empty (each gets a tunnel to the nearest main cavern)
const mainCaves = caves.slice()
for (let n = 0; n < 2000 && caves.length < mainCaves.length + 7; n++) {
  const r = 12 + randomInt(7)
  const x = r + 6 + randomInt(W - 2 * r - 12)
  const y = 30 + r + randomInt(H - 2 * r - 60)
  const clear = caves.every((c) =>
    Math.hypot(c.x - x, c.y - y) > c.r + r + 14
  ) &&
    chambers.every((ch) =>
      x + r + 6 < ch.x0 || x - r - 6 > ch.x0 + ch.w ||
      y + r + 6 < ch.y0 - 5 || y - r - 6 > ch.y0 + ch.h
    )
  if (clear) {
    caves.push({ name: `NOOK${caves.length - mainCaves.length + 1}`, x, y, r })
  }
}

// ---------------------------------------------------------------------
// 3. caverns: noisy metaballs, the lake cavern with its lake

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = idx(x, y)
    if (locked[p]) continue
    let open = -Infinity
    for (const c of caves) {
      // the shape bulges and dents with noise along its edge
      const d = Math.hypot(x - c.x, (y - c.y) * 1.25) / c.r
      open = Math.max(open, 1 - d)
    }
    open += (fbm(x / 13, y / 13, S + 1, 4) - 0.5) * 0.7
    if (open > 0.12) grid[p] = "p"
  }
}
{
  const lake = cave("LAKE")
  for (let y = lake.y - 20; y <= lake.y + 20; y++) {
    for (let x = lake.x - 26; x <= lake.x + 26; x++) {
      if (!inside(x, y) || locked[idx(x, y)]) continue
      const d = Math.hypot((x - lake.x) / 18, (y - lake.y - 4) / 10)
      if (d + (fbm(x / 7, y / 7, S + 3, 3) - 0.5) * 0.8 < 1) {
        grid[idx(x, y)] = "w"
      }
    }
  }
}

// ---------------------------------------------------------------------
// 4. tunnels along the graph edges

type End = { x: number; y: number }
const ends: Record<string, End> = { ENTRY: { x: ENTRY_X, y: 0 } }
for (const c of caves) ends[c.name] = c
for (const ch of chambers) {
  ends[ch.name] = { x: ch.outside[0], y: ch.outside[1] }
}
const EDGES: [string, string][] = [
  ["ENTRY", "HALL"],
  ["HALL", "LAKE"],
  ["HALL", "GROTTO"],
  ["HALL", "DEEP"],
  ["LAKE", "TRIAL1"],
  ["GROTTO", "TRIAL2"],
  ["DEEP", "TRIAL3"],
  ["DEEP", "VAULT"],
  ["LAKE", "DEEP"], // loops, so it isn't a tree of dead ends
  ["GROTTO", "DEEP"],
]
for (const c of caves.slice(mainCaves.length)) {
  const near = mainCaves.reduce((a, b) =>
    Math.hypot(a.x - c.x, a.y - c.y) < Math.hypot(b.x - c.x, b.y - c.y) ? a : b
  )
  EDGES.push([c.name, near.name])
}

function cheapestPath(
  start: number,
  goal: number,
  cost: (p: number, q: number) => number,
): number[] {
  const gx = goal % W, gy = (goal / W) | 0
  return searchPath(
    [start],
    (p) => p === goal,
    cost,
    (p) => (Math.abs(gx - p % W) + Math.abs(gy - ((p / W) | 0))) * 0.3,
  )
}
/** A* (Dijkstra when h is 0) from any of the starts to the first goal */
function searchPath(
  starts: number[],
  isGoal: (p: number) => boolean,
  cost: (p: number, q: number) => number,
  h: (p: number) => number = () => 0,
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
  for (const start of starts) {
    g[start] = 0
    push(h(start), start)
  }
  let goal = -1
  while (heap.length > 0) {
    const [f, p] = pop()
    if (f > g[p] + h(p) + 1e-9) continue
    if (isGoal(p)) {
      goal = p
      break
    }
    const x = p % W, y = (p / W) | 0
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy
      if (!inside(nx, ny)) continue
      const q = idx(nx, ny)
      const ng = g[p] + cost(p, q)
      if (ng < g[q]) {
        g[q] = ng
        from[q] = p
        push(ng + h(q), q)
      }
    }
  }
  const path: number[] = []
  for (let p = goal; p !== -1; p = from[p]) path.push(p)
  return path.reverse()
}

const tunnelCost = (_p: number, q: number) => {
  if (locked[q]) return Infinity
  const x = q % W, y = (q / W) | 0
  if (grid[q] === "w") return 25 // around the lake, not through it
  if (grid[q] !== ROCK) return 0.3
  return 0.4 + Math.pow(fbm(x / 20, y / 20, S + 5, 3), 2) * 4
}

for (const [a, b] of EDGES) {
  const A = ends[a], B = ends[b]
  const path = cheapestPath(idx(A.x, A.y), idx(B.x, B.y), tunnelCost)
  if (path.length === 0) throw new Error(`no tunnel from ${a} to ${b}`)
  for (const p of path) {
    const x = p % W, y = (p / W) | 0
    keepClear[p] = 1
    // the width varies along the tunnel (1 to 2 cells around the path)
    const r = fbm(x / 16, y / 16, S + 7, 2) > 0.55 ? 2 : 1
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue
        const q = idx(x + dx, y + dy)
        if (inside(x + dx, y + dy) && !locked[q] && grid[q] === ROCK) {
          grid[q] = "p"
        }
      }
    }
  }
}
// the entrance: the old tunnel comes down from the WILDS, 3 wide
for (let y = 0; y < 12; y++) {
  for (let x = ENTRY_X - 1; x <= ENTRY_X + 1; x++) {
    grid[idx(x, y)] = "p"
    keepClear[idx(x, y)] = 1
  }
}
for (let y = 0; y < 12; y++) {
  locked[idx(ENTRY_X - 2, y)] = 1
  locked[idx(ENTRY_X + 2, y)] = 1
}

// ---------------------------------------------------------------------
// 5. round off, vary the floors, stalagmites, pockets

for (let pass = 0; pass < 2; pass++) {
  const next = grid.slice()
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = idx(x, y)
      if (locked[p] || keepClear[p] || grid[p] === "w") continue
      let rock = 0
      for (const [dx, dy] of D8) if (grid[idx(x + dx, y + dy)] === ROCK) rock++
      if (grid[p] === ROCK && rock <= 2) next[p] = "p"
      else if (grid[p] !== ROCK && rock >= 6) next[p] = ROCK
    }
  }
  for (let p = 0; p < W * H; p++) grid[p] = next[p]
}
// the outer border stays rock (but for the entrance)
for (let x = 0; x < W; x++) {
  if (Math.abs(x - ENTRY_X) > 1) grid[idx(x, 0)] = ROCK
  grid[idx(x, H - 1)] = ROCK
}
for (let y = 0; y < H; y++) {
  grid[idx(0, y)] = ROCK
  grid[idx(W - 1, y)] = ROCK
}

const isCaveFloor = (p: number) => grid[p] === "p"
// floors: gravel, sand in the hollows, packed earth on the rises
for (let p = 0; p < W * H; p++) {
  if (!isCaveFloor(p) || locked[p]) continue
  const x = p % W, y = (p / W) | 0
  const n = fbm(x / 10, y / 10, S + 9, 3)
  if (n > 0.6) grid[p] = "y"
  else if (n < 0.38) grid[p] = "6"
}
// the grotto glitters: mosaic patches for crystals
{
  const g = cave("GROTTO")
  for (let y = g.y - g.r; y <= g.y + g.r; y++) {
    for (let x = g.x - g.r; x <= g.x + g.r; x++) {
      const p = idx(x, y)
      if (
        inside(x, y) && !locked[p] && grid[p] !== ROCK && grid[p] !== "w" &&
        fbm(x / 5, y / 5, S + 11, 2) > 0.6
      ) grid[p] = "m"
    }
  }
}

const open = (p: number) => grid[p] !== ROCK && grid[p] !== "w"
const distRock = new Uint16Array(W * H).fill(0)
{
  // distance to the nearest rock (how far into the open a cell is)
  const queue: number[] = []
  for (let p = 0; p < W * H; p++) {
    if (!open(p)) {
      distRock[p] = 0
      queue.push(p)
    } else distRock[p] = 65535
  }
  for (let q = 0; q < queue.length; q++) {
    const p = queue[q]
    const x = p % W, y = (p / W) | 0
    for (const [dx, dy] of D4) {
      if (!inside(x + dx, y + dy)) continue
      const np = idx(x + dx, y + dy)
      if (distRock[np] > distRock[p] + 1) {
        distRock[np] = distRock[p] + 1
        queue.push(np)
      }
    }
  }
}
/** Poisson disc: random candidates kept if far enough from the kept */
function scatter(
  minDist: number,
  tries: number,
  accept: (x: number, y: number) => boolean,
  place: (x: number, y: number) => void,
) {
  // kept points bucketed by minDist-sized cells: only 3x3 to look at
  const buckets = new Map<number, [number, number][]>()
  const key = (bx: number, by: number) => by * 4096 + bx
  for (let n = 0; n < tries; n++) {
    const x = randomInt(W), y = randomInt(H)
    const bx = Math.floor(x / minDist), by = Math.floor(y / minDist)
    let near = false
    for (let dy = -1; dy <= 1 && !near; dy++) {
      for (let dx = -1; dx <= 1 && !near; dx++) {
        near = (buckets.get(key(bx + dx, by + dy)) ?? []).some(([px, py]) =>
          Math.hypot(px - x, py - y) < minDist
        )
      }
    }
    if (near || !accept(x, y)) continue
    const k = key(bx, by)
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k)!.push([x, y])
    place(x, y)
  }
}
const freeOpen = (x: number, y: number) => {
  const p = idx(x, y)
  return inside(x, y) && open(p) && !locked[p] && !keepClear[p] &&
    !taken.has(p)
}
// stalagmites: lone rock spires out in the open (not on the paths)
scatter(
  5,
  6000,
  (x, y) => freeOpen(x, y) && distRock[idx(x, y)] >= 3 && rng() < 0.45,
  (x, y) => {
    grid[idx(x, y)] = ROCK
    if (rng() < 0.3 && freeOpen(x + 1, y)) grid[idx(x + 1, y)] = ROCK
  },
)
// side pockets: a drunkard's walk from the cavern edge into the rock,
// ending in a little chamber with coins
const pockets: [number, number][] = []
for (let n = 0; n < 400 && pockets.length < 6; n++) {
  let x = 10 + randomInt(W - 20), y = 10 + randomInt(H - 20)
  if (!freeOpen(x, y) || distRock[idx(x, y)] !== 1) continue
  if (pockets.some(([px, py]) => Math.hypot(px - x, py - y) < 60)) continue
  let ok = true
  const dug: number[] = []
  for (let step = 0; step < 40; step++) {
    const [dx, dy] = D4[randomInt(4)]
    x += dx
    y += dy
    if (x < 3 || y < 3 || x >= W - 3 || y >= H - 3 || locked[idx(x, y)] === 1) {
      ok = false
      break
    }
    if (grid[idx(x, y)] === ROCK) dug.push(idx(x, y))
  }
  if (!ok || dug.length < 15) continue
  for (const p of dug) grid[p] = "6"
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!locked[idx(x + dx, y + dy)]) grid[idx(x + dx, y + dy)] = "6"
    }
  }
  put(items, x, y, "coin")
  put(items, x + 1, y, "coin")
  put(items, x, y + 1, "coin")
  pockets.push([x, y])
}

// ---------------------------------------------------------------------
// life and light

const entry = { x: ENTRY_X, y: 1 }
put(props, ENTRY_X + 2, 14, "sign", {
  text: "THE WILDS CAVERN: THREE TRIALS HIDE THREE KEYS",
})
for (const c of mainCaves) {
  put(props, c.x, c.y, "lantern")
}
// the nooks are dark, with a little to find
for (const c of caves.slice(mainCaves.length)) {
  for (let n = 0, found = 0; n < 40 && found < 3; n++) {
    const x = c.x + randomInt(c.r) - (c.r >> 1)
    const y = c.y + randomInt(c.r) - (c.r >> 1)
    if (freeOpen(x, y)) {
      put(items, x, y, found === 0 && rng() < 0.5 ? "mushroom" : "coin")
      found++
    }
  }
}
for (const ch of chambers) {
  put(props, ch.outside[0] - 2, ch.outside[1], "lantern")
}
// chasers lurk in the hall and the deep, mushrooms grow by the water
for (const name of ["HALL", "DEEP", "GROTTO"]) {
  const c = cave(name)
  for (let n = 0; n < 50; n++) {
    const x = c.x + randomInt(c.r) - (c.r >> 1)
    const y = c.y + randomInt(c.r) - (c.r >> 1)
    if (freeOpen(x, y) && distRock[idx(x, y)] >= 2) {
      put(actors, x, y, "chaser")
      break
    }
  }
}
scatter(10, 4000, (x, y) => {
  return freeOpen(x, y) &&
    D4.some(([dx, dy]) => grid[idx(x + dx, y + dy)] === "w") && rng() < 0.6
}, (x, y) => put(items, x, y, rng() < 0.3 ? "mushroom" : "coin"))
scatter(9, 3000, (x, y) => {
  const p = idx(x, y)
  return freeOpen(x, y) && grid[p] === "m" && rng() < 0.7
}, (x, y) => put(items, x, y, "coin"))
// a boulder on the lake shore, for pushing into the water
{
  const lake = cave("LAKE")
  for (let n = 0; n < 2000; n++) {
    const x = lake.x + randomInt(2 * lake.r) - lake.r
    const y = lake.y + randomInt(2 * lake.r) - lake.r
    if (
      freeOpen(x, y) && distRock[idx(x, y)] >= 2 &&
      D4.some(([dx, dy]) => grid[idx(x + 2 * dx, y + 2 * dy)] === "w") &&
      put(actors, x, y, "boulder")
    ) break
  }
}

// ---------------------------------------------------------------------
// 6. reachability and the checks

const blockingProps = new Map<number, string>()
for (const s of props) {
  if (!catalog.props[s.type]?.canEnter) {
    blockingProps.set(idx(s.i - OI, s.j - OJ), s.type)
  }
}
/** "solved": puzzle doors, gates and bridges count as open */
function walk(solved: boolean, extraFloor = new Set<number>()) {
  const passable = (p: number) => {
    if (extraFloor.has(p)) return true
    const def = catalog.cells[grid[p]]
    if (!def?.canEnter) return false
    const prop = blockingProps.get(p)
    if (!prop) return true
    if (prop === "door" || prop === "key-gate") return solved
    return prop === "chest" || prop === "crate" || prop === "hatena"
  }
  const reached = new Uint8Array(W * H)
  const start = idx(entry.x, entry.y)
  reached[start] = 1
  const queue = [start]
  for (let q = 0; q < queue.length; q++) {
    const p = queue[q]
    const x = p % W, y = (p / W) | 0
    for (const [dx, dy] of D4) {
      if (!inside(x + dx, y + dy)) continue
      const np = idx(x + dx, y + dy)
      if (!reached[np] && passable(np)) {
        reached[np] = 1
        queue.push(np)
      }
    }
  }
  return { reached, passable }
}

const bridge1 = (() => {
  const t1 = chambers.find((c) => c.name === "TRIAL1")!
  return new Set([idx(t1.x0 + 10, t1.y0 + 8)])
})()

// unreachable open ground: small pockets are filled, big ones get a
// passage cut to the reached cave
for (let round = 0; round < 30; round++) {
  const { reached, passable } = walk(true, bridge1)
  const pocketOf = new Int32Array(W * H).fill(-1)
  const pocketsLeft: number[][] = []
  for (let p = 0; p < W * H; p++) {
    if (reached[p] || pocketOf[p] >= 0 || !passable(p) || locked[p]) continue
    const cells = [p]
    pocketOf[p] = pocketsLeft.length
    for (let q = 0; q < cells.length; q++) {
      const c = cells[q]
      const x = c % W, y = (c / W) | 0
      for (const [dx, dy] of D4) {
        const np = idx(x + dx, y + dy)
        if (
          inside(x + dx, y + dy) && !reached[np] && pocketOf[np] < 0 &&
          passable(np) && !locked[np]
        ) {
          pocketOf[np] = pocketsLeft.length
          cells.push(np)
        }
      }
    }
    pocketsLeft.push(cells)
  }
  if (pocketsLeft.length === 0) break
  for (const cells of pocketsLeft) {
    if (cells.length < 25) {
      for (const c of cells) grid[c] = ROCK
      continue
    }
    // the cheapest passage to the reached cave (not into a chamber)
    const path = searchPath(
      cells,
      (p) => reached[p] === 1 && !locked[p],
      (_p, q) =>
        locked[q]
          ? Infinity
          : grid[q] === "w"
          ? 50
          : grid[q] === ROCK
          ? 1
          : 0.2,
    )
    if (path.length === 0) throw new Error("a pocket can't be joined")
    for (const p of path) {
      if (grid[p] === ROCK) grid[p] = "p"
      else if (grid[p] === "w") grid[p] = "d" // a plank bridge
    }
  }
}
const standable = (s: Spawn) => {
  const p = idx(s.i - OI, s.j - OJ)
  return catalog.cells[grid[p]]?.canEnter ?? false
}
const actorsOut = actors.filter(standable)
const itemsOut = items.filter(standable)
const propsOut = props.filter((s) => {
  const p = idx(s.i - OI, s.j - OJ)
  return catalog.cells[grid[p]]?.canEnter || grid[p] === "w"
})

let ok = true
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "ok" : "NG"} ${name}`)
  if (!cond) ok = false
}
{
  const solved = walk(true, bridge1).reached
  const sealed = walk(false).reached
  for (const c of caves) {
    check(
      `${c.name} reached from the entrance`,
      (() => {
        // the center may be under the lake or a lantern: any cell near it
        for (let y = c.y - (c.r >> 2); y <= c.y + (c.r >> 2); y++) {
          for (let x = c.x - (c.r >> 2); x <= c.x + (c.r >> 2); x++) {
            if (solved[idx(x, y)] === 1) return true
          }
        }
        return false
      })(),
    )
  }
  for (const ch of chambers) {
    check(`${ch.name} door reached`, solved[idx(...ch.outside)] === 1)
    if (ch.key) {
      check(`${ch.name} key reached once solved`, solved[idx(...ch.key)] === 1)
    }
  }
  const t1 = chambers.find((c) => c.name === "TRIAL1")!
  const t3 = chambers.find((c) => c.name === "TRIAL3")!
  const vault = chambers.find((c) => c.name === "VAULT")!
  check("TRIAL1 key sealed until bridged", sealed[idx(...t1.key!)] === 0)
  check(
    "TRIAL3 key sealed while the door is shut",
    sealed[idx(...t3.key!)] === 0,
  )
  check(
    "VAULT sealed without the keys",
    sealed[idx(vault.x0 + 9, vault.y0 + 5)] === 0,
  )
  check(
    "VAULT opens with the keys",
    solved[idx(vault.x0 + 9, vault.y0 + 5)] === 1,
  )
  const keys = itemsOut.filter((s) => s.type === "key").length
  const gates = propsOut.filter((s) => s.type === "key-gate").length
  check(
    `three keys for three gates (${keys}/${gates})`,
    keys === 3 && gates === 3,
  )
  // the boulder lane of trial III ends on the plate
  const lane = []
  for (let x = t3.x0 + 4; x <= t3.x0 + 17; x++) {
    lane.push(grid[idx(x, t3.y0 + 4)])
  }
  check(
    "TRIAL3 boulder lane is clear to the plate",
    lane.every((c) => c === "4") && grid[idx(t3.x0 + 18, t3.y0 + 4)] === ROCK,
  )
  let unreached = 0
  const { passable } = walk(true, bridge1)
  for (let p = 0; p < W * H; p++) {
    if (!solved[p] && passable(p)) unreached++
  }
  check(`no unreachable open ground (${unreached})`, unreached === 0)
}
const census = new Map<string, number>()
for (const c of grid) census.set(c, (census.get(c) ?? 0) + 1)
console.log(
  "cells:",
  [...census].sort((a, b) => b[1] - a[1]).map(([k, n]) =>
    `${k} ${(n / (W * H) * 100).toFixed(1)}%`
  ).join(", "),
)
console.log(
  `actors ${actorsOut.length}, items ${itemsOut.length}, props ${propsOut.length}, pockets ${pockets.length}`,
)
if (!ok) {
  console.error("cavern verification failed")
  Deno.exit(1)
}

// ---------------------------------------------------------------------
// --preview <file.png>: one pixel per cell in distinct colors

const previewAt = Deno.args.indexOf("--preview")
if (previewAt >= 0) {
  const COLORS: Record<string, string> = {
    [ROCK]: Palette.gray4,
    p: Palette.yellow3,
    y: Palette.brown1,
    "6": Palette.lime3,
    w: Palette.blue3,
    m: Palette.violet2,
    "4": Palette.white,
    i: Palette.cyan1,
  }
  const rgba = new Uint8Array(W * H * 4)
  for (let p = 0; p < W * H; p++) {
    const hex = COLORS[grid[p]] ?? Palette.pink2
    rgba.set([1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)), p * 4)
    rgba[p * 4 + 3] = 255
  }
  for (
    const [list, hex] of [
      [actorsOut, Palette.pink2],
      [propsOut, Palette.orange2],
      [itemsOut, Palette.yellow1],
    ] as const
  ) {
    for (const s of list) {
      const p = idx(s.i - OI, s.j - OJ)
      rgba.set([1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)), p * 4)
    }
  }
  await Deno.writeFile(Deno.args[previewAt + 1], await encodePng(W, H, rgba))
  console.log(`wrote the preview to ${Deno.args[previewAt + 1]}`)
}

// ---------------------------------------------------------------------
// output: one json per block

for (let by = 0; by < H / BLOCK; by++) {
  for (let bx = 0; bx < W / BLOCK; bx++) {
    const bi = OI + bx * BLOCK, bj = OJ + by * BLOCK
    const inBlock = (s: Spawn) =>
      s.i >= bi && s.i < bi + BLOCK && s.j >= bj && s.j < bj + BLOCK
    const field: string[] = []
    for (let y = 0; y < BLOCK; y++) {
      let row = ""
      for (let x = 0; x < BLOCK; x++) {
        row += grid[idx(bx * BLOCK + x, by * BLOCK + y)]
      }
      field.push(row)
    }
    const { rooms, room } = createRooms(bi, bj)
    const named = [
      ...caves.map((c) => ({
        id: c.name,
        x0: c.x - c.r,
        y0: c.y - c.r,
        x1: c.x + c.r,
        y1: c.y + c.r,
      })),
      ...chambers.map((c) => ({
        id: c.name,
        x0: c.x0,
        y0: c.y0,
        x1: c.x0 + c.w - 1,
        y1: c.y0 + c.h - 1,
      })),
    ]
    // chambers last, so the smaller room wins where they overlap
    for (const r of named) {
      const x0 = Math.max(0, r.x0 - bx * BLOCK)
      const y0 = Math.max(0, r.y0 - by * BLOCK)
      const x1 = Math.min(BLOCK - 1, r.x1 - bx * BLOCK)
      const y1 = Math.min(BLOCK - 1, r.y1 - by * BLOCK)
      if (x0 <= x1 && y0 <= y1) room(r.id, x0, y0, x1, y1)
    }
    const json = {
      i: bi,
      j: bj,
      name: "CAVERN",
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
console.log(`generated the WILDS CAVERN (4 blocks) at ${OI},${OJ}`)
