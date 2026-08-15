// Generates the expanded world map (see ideas/game-ideas.md):
//
// - Creates 12 new themed blocks so the world becomes a 4x5 grid
//   (i in {-400..200}, j in {-400..400}) minus the corners (-400,400)
//   and (200,400): 18 blocks + start island + not_found = 20 files.
// - Carves a road cross (local 99..101, both axes) through every block.
//   The crosses line up across blocks, forming a connected lattice.
// - Connects every sizable isolated pocket of enterable cells to the
//   road with a straight corridor, so the whole map is walkable.
// - Removes blocking prop spawns from the carved cells.
//
// Usage: deno -A tools/generate_map_blocks.ts
import { seed } from "../util/random.ts"
import { loadCatalog } from "../model/catalog.ts"

type Theme = "forest" | "lake" | "frozen" | "village" | "treasury"

const NEW_BLOCKS: Record<string, Theme> = {
  "-400.-400": "forest",
  "-200.-400": "forest",
  "0.-400": "frozen",
  "200.-400": "forest",
  "-400.-200": "lake",
  "200.-200": "village",
  "-400.0": "forest",
  "200.0": "lake",
  "-400.200": "village",
  "200.200": "treasury",
  "-200.400": "lake",
  "0.400": "forest",
}

const EXISTING_BLOCKS = [
  "-200.-200",
  "0.-200",
  "-200.0",
  "0.0",
  "-200.200",
  "0.200",
]

const SIZE = 200
const ROAD = [99, 100, 101]
const ROAD_CELL = "0"
/** Isolated pockets with at least this many cells get a corridor */
const POCKET_THRESHOLD = 20

const mapDir = new URL("../static/map/", import.meta.url)

type Spawn = { i: number; j: number; type: string; data?: unknown }

interface BlockJson {
  i: number
  j: number
  catalogs: string[]
  config?: { showsExitButton?: boolean }
  actors: { i: number; j: number; type: string }[]
  items: { i: number; j: number; type: string }[]
  props: Spawn[]
  field: string[]
}

// ---------------------------------------------------------------------
// helpers

function grid2field(grid: string[][]): string[] {
  return grid.map((row) => row.join(""))
}

function field2grid(field: string[]): string[][] {
  return field.map((row) => row.split(""))
}

function ellipse(
  grid: string[][],
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  cell: string,
) {
  for (let y = Math.max(0, cy - ry); y <= Math.min(SIZE - 1, cy + ry); y++) {
    for (let x = Math.max(0, cx - rx); x <= Math.min(SIZE - 1, cx + rx); x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) {
        grid[y][x] = cell
      }
    }
  }
}

function rect(
  grid: string[][],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cell: string,
) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) grid[y][x] = cell
    }
  }
}

function carveRoads(grid: string[][]): Set<string> {
  const carved = new Set<string>()
  for (let n = 0; n < SIZE; n++) {
    for (const r of ROAD) {
      if (grid[r][n] !== ROAD_CELL) {
        grid[r][n] = ROAD_CELL
        carved.add(`${n}.${r}`)
      }
      if (grid[n][r] !== ROAD_CELL) {
        grid[n][r] = ROAD_CELL
        carved.add(`${r}.${n}`)
      }
    }
  }
  return carved
}

/**
 * Connects every enterable pocket (>= POCKET_THRESHOLD cells) that is
 * not reachable from the road cross to the road, carving a straight
 * 1-wide corridor. Pockets fully inside a protected rect are skipped
 * (e.g. the treasury vault which must stay gated).
 */
function connectPockets(
  grid: string[][],
  canEnterCell: (ch: string) => boolean,
  protectedRects: [number, number, number, number][] = [],
): Set<string> {
  const carved = new Set<string>()
  const seen = new Int32Array(SIZE * SIZE)
  const idx = (x: number, y: number) => y * SIZE + x

  // Mark everything reachable from the road (component 1)
  const queue: number[] = [idx(100, 100)]
  seen[idx(100, 100)] = 1
  while (queue.length > 0) {
    const p = queue.pop()!
    const x = p % SIZE
    const y = (p - x) / SIZE
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue
      const np = idx(nx, ny)
      if (seen[np] || !canEnterCell(grid[ny][nx])) continue
      seen[np] = 1
      queue.push(np)
    }
  }

  const inProtected = (x: number, y: number) =>
    protectedRects.some(([x0, y0, x1, y1]) =>
      x >= x0 && x <= x1 && y >= y0 && y <= y1
    )

  // Find the remaining pockets and connect them
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (seen[idx(x, y)] || !canEnterCell(grid[y][x])) continue
      // Collect this pocket
      const pocket: [number, number][] = [[x, y]]
      seen[idx(x, y)] = 2
      const q = [idx(x, y)]
      while (q.length > 0) {
        const p = q.pop()!
        const px = p % SIZE
        const py = (p - px) / SIZE
        for (
          const [nx, ny] of [
            [px + 1, py],
            [px - 1, py],
            [px, py + 1],
            [px, py - 1],
          ]
        ) {
          if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue
          const np = idx(nx, ny)
          if (seen[np] || !canEnterCell(grid[ny][nx])) continue
          seen[np] = 2
          pocket.push([nx, ny])
          q.push(np)
        }
      }
      if (pocket.length < POCKET_THRESHOLD) continue
      if (pocket.every(([px, py]) => inProtected(px, py))) continue
      // Pick the pocket cell closest to a road axis and carve a
      // straight corridor to the road
      let best = pocket[0]
      let bestDist = Infinity
      for (const [px, py] of pocket) {
        const d = Math.min(Math.abs(px - 100), Math.abs(py - 100))
        if (d < bestDist) {
          bestDist = d
          best = [px, py]
        }
      }
      const [bx, by] = best
      if (Math.abs(bx - 100) <= Math.abs(by - 100)) {
        // Carve horizontally toward the vertical road
        const step = bx < 100 ? 1 : -1
        for (let cx = bx; cx !== 100; cx += step) {
          if (!canEnterCell(grid[by][cx])) {
            grid[by][cx] = ROAD_CELL
            carved.add(`${cx}.${by}`)
          }
        }
      } else {
        // Carve vertically toward the horizontal road
        const step = by < 100 ? 1 : -1
        for (let cy = by; cy !== 100; cy += step) {
          if (!canEnterCell(grid[cy][bx])) {
            grid[cy][bx] = ROAD_CELL
            carved.add(`${bx}.${cy}`)
          }
        }
      }
    }
  }
  return carved
}

// ---------------------------------------------------------------------
// theme generators (return the field grid, spawns and protected rects)

interface Generated {
  grid: string[][]
  actors: Spawn[]
  items: Spawn[]
  props: Spawn[]
  protectedRects: [number, number, number, number][]
}

function emptyGrid(base: string): string[][] {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(base))
}

function genForest(key: string): Generated {
  const { randomInt } = seed(`forest-${key}`)
  const grid = emptyGrid("g")
  // Tree clumps (wall cells)
  for (let n = 0; n < 260; n++) {
    const x = randomInt(SIZE)
    const y = randomInt(SIZE)
    ellipse(grid, x, y, 1 + randomInt(3), 1 + randomInt(2), "2")
  }
  return {
    grid,
    actors: [
      ...spawnList(key, "chaser", 8),
      ...spawnList(key, "boulder", 4),
      ...spawnList(key, "random", 6),
    ],
    items: [
      ...spawnList(key, "apple", 40),
      ...spawnList(key, "seed", 8),
      ...spawnList(key, "mushroom", 5),
      ...spawnList(key, "coin", 15),
    ],
    props: [
      ...spawnList(key, "lantern", 5),
      { ...spawnList(key, "sign", 1)[0], data: { text: "DEEP FOREST" } },
    ],
    protectedRects: [],
  }
}

function genLake(key: string): Generated {
  const { randomInt } = seed(`lake-${key}`)
  const grid = emptyGrid("0")
  // Grass patches
  for (let n = 0; n < 60; n++) {
    ellipse(
      grid,
      randomInt(SIZE),
      randomInt(SIZE),
      2 + randomInt(5),
      1 + randomInt(3),
      "g",
    )
  }
  // Water bodies (the road carved later bridges them)
  ellipse(grid, 60, 60, 34, 24, "w")
  ellipse(grid, 150, 140, 30, 26, "w")
  ellipse(grid, 60, 160, 22, 16, "w")
  return {
    grid,
    actors: [...spawnList(key, "random", 6), ...spawnList(key, "boulder", 3)],
    items: [
      ...spawnList(key, "coin", 30),
      ...spawnList(key, "apple", 15),
      ...spawnList(key, "seed", 5),
    ],
    props: [
      ...spawnList(key, "spring", 8),
      ...spawnList(key, "lantern", 5),
      {
        ...spawnList(key, "sign", 1)[0],
        data: { text: "LAKESIDE: TRY FISHING" },
      },
    ],
    protectedRects: [],
  }
}

function genFrozen(key: string): Generated {
  const grid = emptyGrid("0")
  // The big frozen lake with water pockets to skate around
  ellipse(grid, 100, 100, 70, 52, "i")
  ellipse(grid, 100, 100, 12, 7, "w")
  ellipse(grid, 65, 80, 8, 5, "w")
  ellipse(grid, 140, 125, 8, 6, "w")
  ellipse(grid, 120, 70, 6, 4, "w")
  return {
    grid,
    actors: [...spawnList(key, "boulder", 6), ...spawnList(key, "chaser", 3)],
    items: [
      ...spawnList(key, "coin", 35),
      ...spawnList(key, "green-apple", 10),
    ],
    props: [
      ...spawnList(key, "lantern", 4),
      {
        ...spawnList(key, "sign", 1)[0],
        data: { text: "FROZEN LAKE: SLIPPERY" },
      },
    ],
    protectedRects: [],
  }
}

function genVillage(key: string): Generated {
  const { randomInt } = seed(`village-${key}`)
  const grid = emptyGrid("3")
  const props: Spawn[] = []
  // Houses: wall ring with floor inside and a door on the south wall
  for (let n = 0; n < 9; n++) {
    const w = 10 + randomInt(6)
    const h = 8 + randomInt(5)
    const x = 8 + randomInt(SIZE - w - 16)
    const y = 8 + randomInt(SIZE - h - 16)
    // Keep the road cross clear
    if (x <= 103 && x + w >= 97) continue
    if (y <= 103 && y + h >= 97) continue
    rect(grid, x, y, x + w, y + h, "1")
    rect(grid, x + 1, y + 1, x + w - 1, y + h - 1, "4")
    const door = x + 2 + randomInt(w - 4)
    grid[y + h][door] = "4"
    props.push({ i: x + 2, j: y + 2, type: "table" })
    props.push({ i: x + 3, j: y + 3, type: "stool" })
  }
  return {
    grid,
    actors: [
      ...spawnList(key, "random", 8),
      ...spawnList(key, "static", 4),
      ...spawnList(key, "random-rotate", 4),
    ],
    items: [...spawnList(key, "apple", 15), ...spawnList(key, "coin", 15)],
    props: [
      ...props,
      ...spawnList(key, "lantern", 12),
      ...spawnList(key, "chest", 2).map((s) => ({
        ...s,
        data: { drops: "coin", count: 5 },
      })),
      { ...spawnList(key, "sign", 1)[0], data: { text: "VILLAGE" } },
    ],
    protectedRects: [],
  }
}

function genTreasury(key: string): Generated {
  const grid = emptyGrid("5")
  // The vault in the south-east quadrant, away from the road cross
  const [x0, y0, x1, y1] = [125, 125, 185, 185]
  rect(grid, x0, y0, x1, y1, "2")
  rect(grid, x0 + 2, y0 + 2, x1 - 2, y1 - 2, "5")
  // The gate hole on the west wall
  const gj = 155
  grid[gj][x0] = "5"
  grid[gj][x0 + 1] = "5"
  const { randomInt } = seed(`treasury-${key}`)
  const chests: Spawn[] = []
  for (let n = 0; n < 8; n++) {
    chests.push({
      i: x0 + 4 + randomInt(x1 - x0 - 8),
      j: y0 + 4 + randomInt(y1 - y0 - 8),
      type: "chest",
      data: n === 0
        ? { drops: "seed", count: 3 }
        : n === 1
        ? { drops: "apple", count: 4 }
        : { drops: "coin", count: 8 },
    })
  }
  const items: Spawn[] = []
  for (let n = 0; n < 20; n++) {
    items.push({
      i: x0 + 3 + randomInt(x1 - x0 - 6),
      j: y0 + 3 + randomInt(y1 - y0 - 6),
      type: "coin",
    })
  }
  return {
    grid,
    actors: [...spawnList(key, "boulder", 2)],
    items,
    props: [
      // The apple gate blocks the only hole in the vault wall
      { i: x0, j: gj, type: "apple-gate", data: { count: 15 } },
      ...chests,
      ...spawnList(key, "lantern", 6),
      {
        ...spawnList(key, "sign", 1)[0],
        data: { text: "TREASURY: APPLES OPEN THE GATE" },
      },
    ],
    // Both wall cells of the gate hole are inside the rect, so the
    // pocket-connection pass leaves the vault gated
    protectedRects: [[x0, y0, x1, y1]],
  }
}

/** Deterministic pseudo random spawn positions (occupancy solved later) */
function spawnList(key: string, type: string, count: number): Spawn[] {
  const { randomInt } = seed(`spawns-${key}-${type}`)
  return Array.from({ length: count }, () => ({
    i: randomInt(SIZE),
    j: randomInt(SIZE),
    type,
  }))
}

// ---------------------------------------------------------------------
// main

const catalog = await loadCatalog(
  new URL("../static/catalog/base.json", import.meta.url).href,
  ["base.json"],
)
const canEnterCell = (ch: string) => catalog.cells[ch]?.canEnter ?? false
const blocksProp = (type: string) =>
  catalog.props[type] ? !catalog.props[type].canEnter : false

function finalizeSpawns(
  gen: Generated,
  bi: number,
  bj: number,
): Pick<BlockJson, "actors" | "items" | "props"> {
  const occupied = new Set<string>()
  const place = (s: Spawn, needsEnterable: boolean): Spawn | null => {
    // Nudge the spawn to the nearest free enterable cell (spiral-ish)
    for (let r = 0; r < 24; r++) {
      for (
        const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]
      ) {
        const x = s.i + dx
        const y = s.j + dy
        if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) continue
        if (occupied.has(`${x}.${y}`)) continue
        if (needsEnterable && !canEnterCell(gen.grid[y][x])) continue
        occupied.add(`${x}.${y}`)
        return { ...s, i: x + bi, j: y + bj }
      }
    }
    return null
  }
  const actors = gen.actors.map((s) => place(s, true)).filter((s): s is Spawn =>
    !!s
  )
  const items = gen.items.map((s) => place(s, true)).filter((s): s is Spawn =>
    !!s
  )
  const props = gen.props.map((s) =>
    // Blocking props need an enterable cell too (they occupy it);
    // the apple gate keeps its exact position (the vault gate hole)
    s.type === "apple-gate"
      ? { ...s, i: s.i + bi, j: s.j + bj }
      : place(s, true)
  ).filter((s): s is Spawn => !!s)
  return { actors, items, props }
}

// Generate the new blocks
for (const [key, theme] of Object.entries(NEW_BLOCKS)) {
  const [bi, bj] = key.split(".").map(Number)
  const gen = theme === "forest"
    ? genForest(key)
    : theme === "lake"
    ? genLake(key)
    : theme === "frozen"
    ? genFrozen(key)
    : theme === "village"
    ? genVillage(key)
    : genTreasury(key)
  carveRoads(gen.grid)
  connectPockets(gen.grid, canEnterCell, gen.protectedRects)
  const spawns = finalizeSpawns(gen, bi, bj)
  const json: BlockJson = {
    i: bi,
    j: bj,
    catalogs: ["../catalog/base.json"],
    config: { showsExitButton: true },
    ...spawns,
    field: grid2field(gen.grid),
  }
  await Deno.writeTextFile(
    new URL(`block_${key}.json`, mapDir),
    JSON.stringify(json, null, 2),
  )
  console.log(`generated block_${key}.json (${theme})`)
}

// Carve the road lattice through the existing blocks and connect the
// isolated pockets
for (const key of EXISTING_BLOCKS) {
  const path = new URL(`block_${key}.json`, mapDir)
  const json = JSON.parse(await Deno.readTextFile(path)) as BlockJson
  const grid = field2grid(json.field)
  const carved = carveRoads(grid)
  for (const c of connectPockets(grid, canEnterCell)) carved.add(c)
  json.field = grid2field(grid)
  // Remove blocking props from the carved cells so the roads stay open
  const [bi, bj] = key.split(".").map(Number)
  const before = json.props.length
  json.props = json.props.filter((p) =>
    !(blocksProp(p.type) && carved.has(`${p.i - bi}.${p.j - bj}`))
  )
  await Deno.writeTextFile(path, JSON.stringify(json, null, 2))
  console.log(
    `carved block_${key}.json (${carved.size} cells, removed ${
      before - json.props.length
    } blocking props)`,
  )
}

console.log("done")
