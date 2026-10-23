// Picks the homes of the Odradeks (model/odradek.ts): the corners where
// they turn up, one Odradek for each goal done. A corner is a floor cell
// with walls on two adjacent sides (a wall above or below it, and one to
// its left or right), nothing standing in it.
//
// The first home is the hall of waystones on the START island (every
// player passes it); the rest are houses (the planks floors inside the
// walls) of the villages and cities of the WILDS, one house of each town
// in turn: the villages first, the nearest to ASHFORD (where the old road
// from the hall comes out) first, then the cities; in each town the
// houses nearest its middle first. Each home keeps a few corners far
// apart, for the Odradek to turn up in by turns, and its bounds, which it
// keeps to when it scuttles off.
//
// Writes static/map/odradek.json. Run it again after the WILDS or the
// START island change (deno task generate-wilds).
//
// Usage: deno -A tools/odradek_homes.ts
const MAP = new URL("../static/map/", import.meta.url)
const CATALOG = new URL("../static/catalog/base.json", import.meta.url)

/** How many homes are listed (one per goal done; there are ~50 goals) */
const HOMES = 64
/** The corners kept per home */
const CORNERS = 3
/** A house belongs to the town whose middle is this near */
const TOWN_REACH = 150
/** The cities (the rest of map/towns.json are villages) */
const CITIES = new Set(["THE CITY", "CROOKHAVEN", "SOUTHPORT"])
/** The hall of waystones in the START block (local cells, inclusive) */
const START = { i: -10000, j: -10000 }
const HALL = { x0: 12, y0: 29, x1: 30, y1: 34 }
/** The floor of the houses, and their walls (wall0, wall1) */
const HOUSE_FLOOR = "d"
const HOUSE_WALLS = new Set(["1", "2"])

type Block = {
  i: number
  j: number
  field: string[]
  actors?: { i: number; j: number }[]
  items?: { i: number; j: number }[]
  props?: { i: number; j: number; type: string }[]
}
type Town = { name: string; x: number; y: number }
export type Home = {
  place: string
  /** The bounds it keeps to (world cells, walls inclusive) */
  box: [number, number, number, number]
  corners: [number, number][]
}

const catalog = JSON.parse(await Deno.readTextFile(CATALOG))
const towns: Town[] = JSON.parse(
  await Deno.readTextFile(new URL("towns.json", MAP)),
)
const readBlock = async (name: string): Promise<Block> =>
  JSON.parse(await Deno.readTextFile(new URL(name, MAP)))

/** The cells something stands in: a prop that blocks, an actor, an item */
function taken(block: Block, into: Set<string>) {
  for (const p of block.props ?? []) {
    if (catalog.props[p.type]?.canEnter === false) into.add(`${p.i}.${p.j}`)
  }
  for (const a of block.actors ?? []) into.add(`${a.i}.${a.j}`)
  for (const it of block.items ?? []) into.add(`${it.i}.${it.j}`)
}

/** The corners of a set of floor cells, given what a wall is */
function cornersOf(
  cells: [number, number][],
  at: (i: number, j: number) => string | undefined,
  isWall: (c: string | undefined) => boolean,
  occupied: Set<string>,
): [number, number][] {
  return cells.filter(([i, j]) =>
    !occupied.has(`${i}.${j}`) &&
    (isWall(at(i, j - 1)) || isWall(at(i, j + 1))) &&
    (isWall(at(i - 1, j)) || isWall(at(i + 1, j)))
  )
}

/** A few corners far apart: the first in reading order, then each the
 * farthest from those already picked */
function spread(corners: [number, number][], n: number): [number, number][] {
  const sorted = [...corners].sort((a, b) => a[1] - b[1] || a[0] - b[0])
  const out: [number, number][] = sorted.slice(0, 1)
  while (out.length < n && out.length < sorted.length) {
    let best = sorted[0], bestD = -1
    for (const c of sorted) {
      const d = Math.min(
        ...out.map((o) => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1])),
      )
      if (d > bestD) [best, bestD] = [c, d]
    }
    if (bestD <= 0) break
    out.push(best)
  }
  return out
}

// ---------------------------------------------------------------------
// the hall of waystones

const start = await readBlock(`block_${START.i}.${START.j}.json`)
const hallTaken = new Set<string>()
taken(start, hallTaken)
const hallCells: [number, number][] = []
for (let y = HALL.y0; y <= HALL.y1; y++) {
  for (let x = HALL.x0; x <= HALL.x1; x++) {
    hallCells.push([START.i + x, START.j + y])
  }
}
const startAt = (i: number, j: number) =>
  start.field[j - START.j]?.[i - START.i]
const hall: Home = {
  place: "THE HALL OF WAYSTONES",
  box: [
    START.i + HALL.x0 - 1,
    START.j + HALL.y0 - 1,
    START.i + HALL.x1 + 1,
    START.j + HALL.y1 + 1,
  ],
  corners: spread(
    cornersOf(hallCells, startAt, (c) => c === "b", hallTaken),
    4,
  ),
}

// ---------------------------------------------------------------------
// the houses of the WILDS

const blocks: Block[] = []
for await (const e of Deno.readDir(MAP)) {
  const m = /^block_(-?\d+)\.(-?\d+)\.json$/.exec(e.name)
  if (!m || Number(m[1]) < 2000) continue
  blocks.push(await readBlock(e.name))
}
const I0 = Math.min(...blocks.map((b) => b.i))
const J0 = Math.min(...blocks.map((b) => b.j))
const W = Math.max(...blocks.map((b) => b.i)) + 200 - I0
const H = Math.max(...blocks.map((b) => b.j)) + 200 - J0
const grid = new Uint8Array(W * H)
const wildsTaken = new Set<string>()
for (const b of blocks) {
  b.field.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      grid[(b.j - J0 + y) * W + (b.i - I0 + x)] = row.charCodeAt(x)
    }
  })
  taken(b, wildsTaken)
}
const at = (i: number, j: number) => {
  const x = i - I0, y = j - J0
  if (x < 0 || y < 0 || x >= W || y >= H) return undefined
  return String.fromCharCode(grid[y * W + x])
}

type House = Home & { town: Town; d: number }
const houses: House[] = []
const seen = new Uint8Array(W * H)
const FLOOR = HOUSE_FLOOR.charCodeAt(0)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const k = y * W + x
    if (seen[k] || grid[k] !== FLOOR) continue
    // the planks floor of one house (a door is a floor cell too)
    const cells: [number, number][] = []
    const stack = [k]
    seen[k] = 1
    while (stack.length > 0) {
      const c = stack.pop()!
      const cx = c % W, cy = (c - cx) / W
      cells.push([cx + I0, cy + J0])
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const n = ny * W + nx
        if (seen[n] || grid[n] !== FLOOR) continue
        seen[n] = 1
        stack.push(n)
      }
    }
    const corners = cornersOf(
      cells,
      at,
      (c) => c !== undefined && HOUSE_WALLS.has(c),
      wildsTaken,
    )
    // a bridge or a pier has no corners; a house has four at least
    if (corners.length < 4) continue
    const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1])
    const box: Home["box"] = [
      Math.min(...xs) - 1,
      Math.min(...ys) - 1,
      Math.max(...xs) + 1,
      Math.max(...ys) + 1,
    ]
    const mx = (box[0] + box[2]) / 2, my = (box[1] + box[3]) / 2
    let town: Town | null = null, d = Infinity
    for (const t of towns) {
      const td = Math.hypot(t.x - mx, t.y - my)
      if (td < d) [town, d] = [t, td]
    }
    if (!town || d > TOWN_REACH) continue
    houses.push({
      place: town.name,
      box,
      corners: spread(corners, CORNERS),
      town,
      d,
    })
  }
}

// one house of each town in turn: the villages nearest ASHFORD first,
// then the cities; in each town, the houses nearest its middle first
const ashford = towns.find((t) => t.name === "ASHFORD")!
const order = [...towns].sort((a, b) =>
  Number(CITIES.has(a.name)) - Number(CITIES.has(b.name)) ||
  Math.hypot(a.x - ashford.x, a.y - ashford.y) -
    Math.hypot(b.x - ashford.x, b.y - ashford.y)
)
const byTown = order.map((t) =>
  houses.filter((h) => h.town === t).sort((a, b) =>
    a.d - b.d || a.box[1] - b.box[1] || a.box[0] - b.box[0]
  )
)
const homes: Home[] = [hall]
for (let round = 0; homes.length < HOMES; round++) {
  const before = homes.length
  for (const list of byTown) {
    const h = list[round]
    if (h && homes.length < HOMES) {
      homes.push({ place: h.place, box: h.box, corners: h.corners })
    }
  }
  if (homes.length === before) break
}

// as deno fmt writes it: the numbers of a box or a corner on one line
const inline = (a: unknown[]): string =>
  `[${a.map((x) => Array.isArray(x) ? inline(x) : String(x)).join(", ")}]`
const text = "[\n" +
  homes.map((h) =>
    [
      "  {",
      `    "place": ${JSON.stringify(h.place)},`,
      `    "box": ${inline(h.box)},`,
      `    "corners": ${inline(h.corners)}`,
      "  }",
    ].join("\n")
  ).join(",\n") + "\n]\n"
await Deno.writeTextFile(new URL("odradek.json", MAP), text)
const count = new Map<string, number>()
for (const h of homes) count.set(h.place, (count.get(h.place) ?? 0) + 1)
console.log(
  `${homes.length} homes (of ${houses.length} houses in the towns):`,
  [...count].map(([p, n]) => `${p} ${n}`).join(", "),
)
