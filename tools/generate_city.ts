// Generates the CITY: a walkable city of streets, houses and shops east
// of the WILDS (2x2 blocks right of it), reached on foot over the long
// bridge from the WILDS' EAST PIER. Where the WILDS towns are villages,
// this is a town big enough to call a city:
//
// 1. the ground: the sea and a harbor quay on the west (where the
//    bridge lands), a canal winding north to south, and four avenues
//    (4 wide) that cut the land into 9 districts
// 2. each district is cut into lots by streets (2 wide), splitting the
//    longer side again and again until the lots are small (a binary
//    space partition), so the street plan is irregular, not a grid
// 3. the lots are built up by the district: houses (residential),
//    rows of shops with signs and keepers (market), warehouses and
//    piers (harbor), a walled castle with its keep (castle), and a few
//    special lots: the city square, parks, a chapel with its graveyard
// 4. the city folk live by their roles (model/townsfolk.ts): commuters
//    go to work and home, shoppers go from shop to shop, lamplighters
//    make their round, the crier calls the news in the square, guards
//    watch the castle gates, fishers sit on the piers...
// 5. every walkable cell is made reachable from the bridge (or filled
//    with trees), then the checks: every door is reached, the district
//    has its buildings
//
// Usage: deno -A tools/generate_city.ts [--preview file.png]
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
  east: { y: number }
}
const BLOCK = 200
const W = 400
const H = 400
/** Right of the WILDS, top-aligned with it */
const OI = wilds.origin.i + wilds.blocks.w * BLOCK
const OJ = wilds.origin.j
/** The row of the bridge from the WILDS (the same row on both sides) */
const ENTRY_Y = Math.round(wilds.east.y * wilds.blocks.h * BLOCK)
if (ENTRY_Y < 30 || ENTRY_Y > H - 120) {
  throw new Error(`the bridge row ${ENTRY_Y} doesn't fit the city`)
}
const { rng, randomInt, shuffle } = seed("city-1")
const S = 4111

const catalog = await loadCatalog(
  new URL("../static/catalog/base.json", import.meta.url).href,
  ["base.json"],
)

const C = {
  SEA: "w",
  LAND: "6",
  STREET: "3", // floor2.png, apart from the meadow
  AVENUE: "c",
  SQUARE: "m",
  WALL: "1",
  FLOOR: "d",
  PIER: "d",
  TREE: "J", // wall_canopy: the leaves of the parks and the edge belt
  // the walls by kind (tools/import_ff5_walls.ts)
  CASTLE: "K", // wall_castle: the keep, the barracks, the uptown houses
  RAMPART: "L", // wall_battlement: the castle's outer wall
  MASONRY: "M", // wall_masonry: the houses of the town
  PLANKS: "V", // wall_planks: the harbor's warehouses and houses
  SANDSTONE: "Z", // wall_sandstone: the chapel
  BOOKS: "U", // wall_bookshelf: the keep's library wall
  YARD: "4",
  GRAVEL: "p",
} as const

const grid: string[] = Array(W * H).fill(C.LAND)
const idx = (x: number, y: number) => y * W + x
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H
const at = (x: number, y: number) => (inside(x, y) ? grid[idx(x, y)] : "")
const set = (x: number, y: number, c: string) => {
  if (inside(x, y)) grid[idx(x, y)] = c
}
const D4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const isWater = (c: string) => c === C.SEA
/** Cells a street or a building may not take */
const fixed = new Uint8Array(W * H)

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
  if (!inside(x, y)) return false
  const p = idx(x, y)
  if (taken.has(p)) return false
  taken.add(p)
  list.push({ i: OI + x, j: OJ + y, type, ...(data ? { data } : {}) })
  return true
}

// ---------------------------------------------------------------------
// 1. the ground

/** The coast: sea to the west of it, a quay along it */
const coast: number[] = []
for (let y = 0; y < H; y++) {
  coast.push(44 + Math.round((fbm(y / 45, 0.5, S, 3) - 0.5) * 30))
  for (let x = 0; x < coast[y]; x++) set(x, y, C.SEA)
  // the quay: a cobbled waterfront, 3 wide
  for (let x = coast[y]; x < coast[y] + 3; x++) set(x, y, C.AVENUE)
}
const QUAY_END = Math.max(...coast) + 3
/** The canal: 3 wide, winding gently from north to south */
const canalX = (y: number) => 226 + Math.round(Math.sin(y / 37) * 4)
for (let y = 0; y < H; y++) {
  for (let dx = 0; dx < 3; dx++) set(canalX(y) + dx, y, C.SEA)
}

// the avenues: two across, two down
const Y1 = ENTRY_Y - 1, Y2 = 262
const X1 = 140, X2 = 310
function avenue(x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inside(x, y)) continue
      // over the canal: a bridge
      set(x, y, isWater(at(x, y)) ? C.PIER : C.AVENUE)
      fixed[idx(x, y)] = 1
    }
  }
}
for (const y of [Y1, Y2]) {
  for (let x = 0; x < W - 4; x++) {
    if (x < coast[y]) continue
    avenue(x, y, x, y + 3)
  }
}
for (const x of [X1, X2]) avenue(x, 4, x + 3, H - 5)
// the bridge from the WILDS lands on the first avenue
for (let x = 0; x < coast[ENTRY_Y] + 3; x++) {
  for (const y of [ENTRY_Y, ENTRY_Y + 1]) {
    set(x, y, C.PIER)
    fixed[idx(x, y)] = 1
  }
}
// the quay is fixed too
for (let y = 0; y < H; y++) {
  for (let x = coast[y]; x < coast[y] + 3; x++) fixed[idx(x, y)] = 1
}
// the edge of the city: a belt of trees
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const edge = x >= W - 4 || y < 3 || y >= H - 3
    if (edge && !isWater(at(x, y))) {
      set(x, y, C.TREE)
      fixed[idx(x, y)] = 1
    }
  }
}

// ---------------------------------------------------------------------
// 2. the districts, cut into lots

type Rect = { x0: number; y0: number; x1: number; y1: number }
type District =
  | "HARBOR"
  | "NORTHSIDE"
  | "MARKET"
  | "SOUTHSIDE"
  | "UPTOWN"
  | "CASTLE"
  | "PARKSIDE"
const COLS: [number, number][] = [[QUAY_END, X1 - 1], [X1 + 4, X2 - 1], [
  X2 + 4,
  W - 5,
]]
const ROWS: [number, number][] = [[3, Y1 - 1], [Y1 + 4, Y2 - 1], [
  Y2 + 4,
  H - 4,
]]
const DISTRICTS: District[][] = [
  ["HARBOR", "HARBOR", "HARBOR"],
  ["NORTHSIDE", "MARKET", "SOUTHSIDE"],
  ["UPTOWN", "CASTLE", "PARKSIDE"],
]
/** How big a lot may get before it's cut again */
const MAX_LOT: Record<District, number> = {
  HARBOR: 30,
  NORTHSIDE: 22,
  MARKET: 20,
  SOUTHSIDE: 22,
  UPTOWN: 26,
  CASTLE: 0,
  PARKSIDE: 24,
}
type Lot = Rect & { district: District }
const lots: Lot[] = []
const districtRects: (Rect & { name: District })[] = []

/** A street (2 wide) along a line, not over water or what's fixed */
function streetLine(x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inside(x, y) || fixed[idx(x, y)]) continue
      set(x, y, isWater(at(x, y)) ? C.PIER : C.STREET)
      fixed[idx(x, y)] = 1
    }
  }
}

function subdivide(r: Rect, district: District) {
  const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1
  const max = MAX_LOT[district]
  if (w <= max && h <= max) {
    lots.push({ ...r, district })
    return
  }
  if (w >= h) {
    const cut = r.x0 + Math.round(w * (0.38 + rng() * 0.24))
    streetLine(cut, r.y0, cut + 1, r.y1)
    subdivide({ ...r, x1: cut - 1 }, district)
    subdivide({ ...r, x0: cut + 2 }, district)
  } else {
    const cut = r.y0 + Math.round(h * (0.38 + rng() * 0.24))
    streetLine(r.x0, cut, r.x1, cut + 1)
    subdivide({ ...r, y1: cut - 1 }, district)
    subdivide({ ...r, y0: cut + 2 }, district)
  }
}

COLS.forEach(([x0, x1], c) => {
  ROWS.forEach(([y0, y1], r) => {
    const district = DISTRICTS[c][r]
    districtRects.push({ x0, y0, x1, y1, name: district })
    if (district !== "CASTLE") subdivide({ x0, y0, x1, y1 }, district)
  })
})

// ---------------------------------------------------------------------
// 3. buildings

const isStreet = (c: string) =>
  c === C.STREET || c === C.AVENUE || c === C.SQUARE || c === C.PIER
type Side = "n" | "s" | "w" | "e"
const SIDE_DIR: Record<Side, [number, number]> = {
  n: [0, -1],
  s: [0, 1],
  w: [-1, 0],
  e: [1, 0],
}
/** The sides of a lot that face a street (by how much of each does) */
function streetSides(r: Rect): Side[] {
  const score = (cells: [number, number][]) =>
    cells.filter(([x, y]) => isStreet(at(x, y))).length / cells.length
  const xs = (y: number) => {
    const cells: [number, number][] = []
    for (let x = r.x0; x <= r.x1; x++) cells.push([x, y])
    return cells
  }
  const ys = (x: number) => {
    const cells: [number, number][] = []
    for (let y = r.y0; y <= r.y1; y++) cells.push([x, y])
    return cells
  }
  const sides: [Side, number][] = [
    ["n", score(xs(r.y0 - 1))],
    ["s", score(xs(r.y1 + 1))],
    ["w", score(ys(r.x0 - 1))],
    ["e", score(ys(r.x1 + 1))],
  ]
  return sides.filter(([, s]) => s > 0.5).sort((a, b) => b[1] - a[1]).map((
    [side],
  ) => side)
}

type Building = Rect & {
  door: [number, number]
  /** the cell just inside the door */
  inner: [number, number]
  side: Side
  kind: "house" | "shop" | "warehouse" | "chapel" | "keep"
  district: District
}
const buildings: Building[] = []

/** All cells of the rect are plain land (no water, street, building) */
function clear(r: Rect): boolean {
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const c = at(x, y)
      if (
        !inside(x, y) || fixed[idx(x, y)] || (c !== C.LAND && c !== C.GRAVEL)
      ) {
        return false
      }
    }
  }
  return true
}

/** Every wall character (the walls of the buildings by kind) */
const WALLS = new Set<string>([
  C.WALL,
  C.CASTLE,
  C.RAMPART,
  C.MASONRY,
  C.PLANKS,
  C.SANDSTONE,
  C.BOOKS,
])
/** The wall of a building, by what it is and where */
function wallOf(kind: Building["kind"], district: District): string {
  if (kind === "chapel") return C.SANDSTONE
  if (kind === "keep" || district === "CASTLE") return C.CASTLE
  if (kind === "warehouse" || district === "HARBOR") return C.PLANKS
  if (kind === "shop") return C.WALL
  if (district === "UPTOWN") return C.CASTLE
  return C.MASONRY
}

/** Walls round a floor, a door in the middle of the given side */
function build(
  r: Rect,
  side: Side,
  kind: Building["kind"],
  district: District,
): Building | null {
  if (r.x1 - r.x0 < 4 || r.y1 - r.y0 < 4 || !clear(r)) return null
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const edge = x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1
      set(x, y, edge ? wallOf(kind, district) : C.FLOOR)
      fixed[idx(x, y)] = 1
    }
  }
  const mx = (r.x0 + r.x1) >> 1, my = (r.y0 + r.y1) >> 1
  const door: [number, number] = side === "n"
    ? [mx, r.y0]
    : side === "s"
    ? [mx, r.y1]
    : side === "w"
    ? [r.x0, my]
    : [r.x1, my]
  const [dx, dy] = SIDE_DIR[side]
  set(...door, C.FLOOR)
  const b: Building = {
    ...r,
    door,
    inner: [door[0] - dx, door[1] - dy],
    side,
    kind,
    district,
  }
  buildings.push(b)
  return b
}

/** The rect of a building against the given side of the area */
function against(
  area: Rect,
  side: Side,
  depth: number,
  width = Infinity,
): Rect {
  const w = area.x1 - area.x0 + 1, h = area.y1 - area.y0 + 1
  if (side === "n" || side === "s") {
    const bw = Math.min(w, width)
    const x0 = area.x0 + ((w - bw) >> 1)
    const d = Math.min(depth, h)
    return side === "n"
      ? { x0, y0: area.y0, x1: x0 + bw - 1, y1: area.y0 + d - 1 }
      : { x0, y0: area.y1 - d + 1, x1: x0 + bw - 1, y1: area.y1 }
  }
  const bh = Math.min(h, width)
  const y0 = area.y0 + ((h - bh) >> 1)
  const d = Math.min(depth, w)
  return side === "w"
    ? { x0: area.x0, y0, x1: area.x0 + d - 1, y1: y0 + bh - 1 }
    : { x0: area.x1 - d + 1, y0, x1: area.x1, y1: y0 + bh - 1 }
}

/** Cuts the area into strips along the side, each about `step` wide */
function strips(area: Rect, side: Side, step: number): Rect[] {
  const out: Rect[] = []
  if (side === "n" || side === "s") {
    const n = Math.max(1, Math.floor((area.x1 - area.x0 + 2) / step))
    const w = (area.x1 - area.x0 + 2) / n
    for (let k = 0; k < n; k++) {
      out.push({
        ...area,
        x0: area.x0 + Math.round(k * w),
        x1: area.x0 + Math.round((k + 1) * w) - 2,
      })
    }
  } else {
    const n = Math.max(1, Math.floor((area.y1 - area.y0 + 2) / step))
    const h = (area.y1 - area.y0 + 2) / n
    for (let k = 0; k < n; k++) {
      out.push({
        ...area,
        y0: area.y0 + Math.round(k * h),
        y1: area.y0 + Math.round((k + 1) * h) - 2,
      })
    }
  }
  return out
}

const inset = (r: Rect, d: number): Rect => ({
  x0: r.x0 + d,
  y0: r.y0 + d,
  x1: r.x1 - d,
  y1: r.y1 - d,
})

// the special lots: picked first, by district
const specials = new Map<Lot, string>()
{
  const pick = (district: District, what: string, near?: [number, number]) => {
    const cands = lots.filter((l) =>
      l.district === district && !specials.has(l) &&
      l.x1 - l.x0 >= 10 && l.y1 - l.y0 >= 10 && clear(inset(l, 1))
    )
    if (cands.length === 0) return
    const lot = near
      ? cands.reduce((a, b) =>
        Math.hypot((a.x0 + a.x1) / 2 - near[0], (a.y0 + a.y1) / 2 - near[1]) <
            Math.hypot(
              (b.x0 + b.x1) / 2 - near[0],
              (b.y0 + b.y1) / 2 - near[1],
            )
          ? a
          : b
      )
      : cands[randomInt(cands.length)]
    specials.set(lot, what)
  }
  pick("MARKET", "SQUARE", [X1 + 20, Y1 + 20])
  pick("MARKET", "BAZAAR", [(X1 + X2) / 2 + 20, (Y1 + Y2) / 2])
  pick("NORTHSIDE", "PARK")
  pick("SOUTHSIDE", "CHAPEL")
  pick("PARKSIDE", "PARK", [(X2 + W) / 2, (Y2 + H) / 2])
  pick("PARKSIDE", "PARK")
  pick("UPTOWN", "GARDEN")
  pick("HARBOR", "FISHMARKET", [QUAY_END + 10, ENTRY_Y + 20])
}

/** Who lives in the houses, district by district */
const RESIDENTS: Record<string, string[]> = {
  HARBOR: ["sailor", "fishwife", "townsman", "commuter"],
  NORTHSIDE: [
    "townsman",
    "townswoman",
    "commuter",
    "villager",
    "shopper",
    "villager2",
    "commuter",
    "inventor",
  ],
  SOUTHSIDE: [
    "townswoman",
    "commuter",
    "townsman",
    "blacksmith",
    "shopper",
    "thief",
    "villager",
    "commuter",
  ],
  UPTOWN: ["townswoman", "merchant", "townsman", "shopper", "commuter"],
  PARKSIDE: ["townsman", "villager2", "townswoman", "commuter", "shopper"],
  MARKET: ["townsman", "townswoman"],
}
const residentCount: Record<string, number> = {}
const resident = (d: District) => {
  const list = RESIDENTS[d] ?? RESIDENTS.NORTHSIDE
  const k = residentCount[d] = (residentCount[d] ?? 0) + 1
  return list[k % list.length]
}

const SIGNS = [
  "sign-item",
  "sign-weapon",
  "sign-armor",
  "sign-inn",
  "sign-magic",
  "sign-pub",
]
const GOODS: [string, number][] = [
  ["bread", 3],
  ["seed", 1],
  ["potion", 4],
  ["mushroom", 3],
  ["herb", 3],
  ["ether", 4],
]
let shops = 0

/** Furnishes a house: a table and a stool, a barrel, the resident */
function furnishHouse(b: Building) {
  put(props, b.x0 + 2, b.y0 + 2, "table")
  put(props, b.x0 + 3, b.y0 + 2, "stool")
  put(props, b.x1 - 1, b.y1 - 1, buildings.length % 2 ? "jar" : "barrel")
  put(actors, ...b.inner, resident(b.district))
}

/** A shop: a sign by the door, the counter inside, the keeper behind */
function furnishShop(b: Building) {
  const [dx, dy] = SIDE_DIR[b.side]
  // the sign on the wall beside the door
  const [sx, sy] = dx === 0 ? [b.door[0] + 1, b.door[1]] : [
    b.door[0],
    b.door[1] + 1,
  ]
  put(props, sx, sy, SIGNS[shops % SIGNS.length])
  const [sells, price] = GOODS[shops % GOODS.length]
  shops++
  // the counter two cells in, the keeper behind it
  const [cx, cy] = [b.inner[0] - dx, b.inner[1] - dy]
  put(props, cx, cy, "shop", { sells, price })
  put(actors, cx - dx, cy - dy, "keeper")
  put(props, b.x0 + 1, b.y0 + 1, "barrel")
  put(props, b.x1 - 1, b.y0 + 1, "jar")
}

/** A warehouse: rows of crates and barrels, aisles between them */
function furnishWarehouse(b: Building) {
  for (let y = b.y0 + 2; y <= b.y1 - 2; y += 4) {
    for (let x = b.x0 + 2; x <= b.x1 - 2; x += 2) {
      if (Math.abs(x - b.inner[0]) <= 1 && Math.abs(y - b.inner[1]) <= 2) {
        continue
      }
      put(props, x, y, (x * 7 + y) % 3 === 0 ? "barrel" : "crate")
    }
  }
}

/** A residential lot: one or two houses facing the street, a yard */
function residential(lot: Lot) {
  const sides = streetSides(lot)
  const area = inset(lot, 1)
  if (sides.length === 0) {
    yard(area)
    return
  }
  const w = area.x1 - area.x0 + 1, h = area.y1 - area.y0 + 1
  const big = lot.district === "UPTOWN"
  const depth = big ? 9 : 7
  // a row of houses along the main street side
  const side = sides[0]
  const along = side === "n" || side === "s" ? w : h
  const step = big ? 12 : 9
  for (const strip of strips(area, side, Math.min(step, along))) {
    const r = against(strip, side, depth)
    const b = build(r, side, "house", lot.district)
    if (b) furnishHouse(b)
  }
  // and on the opposite side, if that's a street too and there's room
  const back = { n: "s", s: "n", w: "e", e: "w" }[side] as Side
  const across = side === "n" || side === "s" ? h : w
  if (sides.includes(back) && across >= 2 * depth + 2) {
    for (const strip of strips(area, back, step)) {
      const b = build(against(strip, back, depth), back, "house", lot.district)
      if (b) furnishHouse(b)
    }
  } else {
    yardLeft(area)
  }
}

/** What's left of an area after its buildings: a garden here and there */
function yardLeft(area: Rect) {
  for (let y = area.y0; y <= area.y1; y++) {
    for (let x = area.x0; x <= area.x1; x++) {
      if (at(x, y) !== C.LAND || fixed[idx(x, y)]) continue
      if ((x * 13 + y * 7) % 37 === 0) put(props, x, y, "flowers")
      else if ((x * 5 + y * 11) % 67 === 0) put(props, x, y, "sapling")
    }
  }
}
function yard(area: Rect) {
  yardLeft(area)
  const cx = (area.x0 + area.x1) >> 1, cy = (area.y0 + area.y1) >> 1
  put(props, cx, cy, "bench")
}

/** The shops of the market: rows of shops on every street side */
function market(lot: Lot) {
  const sides = streetSides(lot)
  const area = inset(lot, 1)
  for (const side of sides.slice(0, 2)) {
    for (const strip of strips(area, side, 8)) {
      const b = build(against(strip, side, 7), side, "shop", lot.district)
      if (b) furnishShop(b)
    }
  }
  yardLeft(area)
}

/** The harbor: warehouses; the lots on the quay get stacks of goods */
function harbor(lot: Lot) {
  const sides = streetSides(lot)
  const area = inset(lot, 1)
  if (sides.length === 0) return yard(area)
  const side = sides[0]
  const r = against(area, side, Math.min(14, area.y1 - area.y0 - 1), 18)
  const b = build(r, side, "warehouse", lot.district)
  if (b) furnishWarehouse(b)
  else residential(lot)
}

/** Paves the lot as a square, with a well in the middle */
function square(lot: Lot, name: string) {
  for (let y = lot.y0; y <= lot.y1; y++) {
    for (let x = lot.x0; x <= lot.x1; x++) {
      if (at(x, y) === C.LAND && !fixed[idx(x, y)]) set(x, y, C.SQUARE)
      fixed[idx(x, y)] = 1
    }
  }
  const cx = (lot.x0 + lot.x1) >> 1, cy = (lot.y0 + lot.y1) >> 1
  if (name === "SQUARE") {
    put(props, cx, cy, "well")
    put(actors, cx, cy + 2, "crier")
    put(props, cx - 3, cy + 3, "bench")
    put(props, cx + 3, cy + 3, "bench")
    put(actors, cx - 4, cy - 3, "bard")
    put(actors, lot.x0 + 1, lot.y1 - 1, "beggar")
    put(props, cx + 4, cy - 4, "notice-board", {
      text: "THE CITY: HARBOR WEST, CASTLE EAST, MARKET ALL AROUND",
    })
    for (const [dx, dy] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
      put(props, cx + dx, cy + dy, "lamp-post")
    }
  } else if (name === "BAZAAR") {
    // rows of stalls, keepers behind
    for (let y = lot.y0 + 2; y <= lot.y1 - 2; y += 4) {
      for (let x = lot.x0 + 2; x <= lot.x1 - 2; x += 3) {
        const [sells, price] = GOODS[(x + y) % GOODS.length]
        if (put(props, x, y, "shop", { sells, price })) {
          put(actors, x, y - 1, "keeper")
        }
      }
    }
    put(actors, lot.x0, lot.y1, "shopper")
    put(actors, lot.x1, lot.y0, "shopper")
    put(actors, lot.x1, lot.y1, "merchant")
  } else if (name === "FISHMARKET") {
    for (let x = lot.x0 + 2; x <= lot.x1 - 2; x += 4) {
      if (put(props, x, cy, "shop", { sells: "bread", price: 3 })) {
        put(actors, x, cy - 1, "fishwife")
      }
      put(props, x + 1, lot.y0 + 1, "barrel")
      put(props, x, lot.y1 - 1, "crate")
    }
    put(actors, lot.x0, cy + 2, "shopper")
  }
}

/** A park: lawn, trees, a pond, benches and the folk who enjoy them */
function park(lot: Lot) {
  const cx = (lot.x0 + lot.x1) >> 1, cy = (lot.y0 + lot.y1) >> 1
  const r = Math.min(lot.x1 - lot.x0, lot.y1 - lot.y0) / 2
  for (let y = lot.y0; y <= lot.y1; y++) {
    for (let x = lot.x0; x <= lot.x1; x++) {
      if (fixed[idx(x, y)] || at(x, y) !== C.LAND) continue
      fixed[idx(x, y)] = 1
      const d = Math.hypot(x - cx, (y - cy) * 1.3)
      if (d < r * 0.3) set(x, y, C.SEA) // the pond
      else if (
        d > r * 0.8 && (x * 7 + y * 3) % 5 === 0 &&
        x > lot.x0 && x < lot.x1 && y > lot.y0 && y < lot.y1
      ) set(x, y, C.TREE)
    }
  }
  const ring = Math.round(r * 0.3) + 2
  put(props, cx - ring, cy, "bench")
  put(props, cx + ring, cy, "bench")
  put(props, cx, cy + ring, "bench")
  put(actors, cx - ring, cy - 1, "sage")
  put(actors, cx + ring, cy + 1, "nun")
  put(actors, cx, cy - ring, "sailor")
  put(actors, cx + 2, cy + ring + 1, "dancer")
  put(actors, cx - 3, cy + ring, "kid")
  put(actors, cx + 3, cy - ring, "kid")
  put(actors, cx - 2, cy - ring - 1, "child")
  put(actors, cx + ring + 1, cy - 2, "cat")
  put(props, cx - ring, cy - ring, "flower-pot")
  put(props, cx + ring, cy + ring, "flower-pot")
  put(actors, lot.x0, lot.y0, "lamplighter")
  put(props, lot.x0 + 1, cy, "lamp-post")
  put(props, lot.x1 - 1, cy, "lamp-post")
}

/** The chapel and its graveyard */
function chapel(lot: Lot) {
  const sides = streetSides(lot)
  const side = sides[0] ?? "s"
  const area = inset(lot, 1)
  const b = build(against(area, side, 9, 11), side, "chapel", lot.district)
  if (b) {
    // the altar between two lanterns
    const ax = (b.x0 + b.x1) >> 1, ay = (b.y0 + b.y1) >> 1
    put(props, ax, ay, "table")
    put(props, ax - 2, ay, "lantern")
    put(props, ax + 2, ay, "lantern")
    put(actors, ...b.inner, "nun")
  }
  // the graveyard behind it
  for (let y = area.y0; y <= area.y1; y += 2) {
    for (let x = area.x0; x <= area.x1; x += 3) {
      if (at(x, y) === C.LAND && !fixed[idx(x, y)]) {
        put(props, x, y, "gravestone")
      }
    }
  }
  put(actors, area.x0, area.y1, "sage")
}

/** The castle: a wall round the district, gates, the keep, a garden */
function castle(r: Rect) {
  const wall = inset(r, 2)
  const cx = (wall.x0 + wall.x1) >> 1, cy = (wall.y0 + wall.y1) >> 1
  for (let y = wall.y0; y <= wall.y1; y++) {
    for (let x = wall.x0; x <= wall.x1; x++) {
      const edge = x === wall.x0 || x === wall.x1 || y === wall.y0 ||
        y === wall.y1
      const gate = (Math.abs(y - cy) <= 1 && (x === wall.x0)) ||
        (Math.abs(x - cx) <= 1 && (y === wall.y0 || y === wall.y1))
      if (!inside(x, y) || isWater(at(x, y))) continue
      set(x, y, edge && !gate ? C.RAMPART : C.GRAVEL)
      if (edge) fixed[idx(x, y)] = 1
    }
  }
  // the ways in: from the avenues to the gates
  for (let x = r.x0; x < wall.x0; x++) {
    for (let y = cy - 1; y <= cy + 1; y++) set(x, y, C.AVENUE)
  }
  for (const y of [r.y0, r.y0 + 1, r.y1 - 1, r.y1]) {
    for (let x = cx - 1; x <= cx + 1; x++) set(x, y, C.AVENUE)
  }
  // the keep: a big hall in the middle, its door to the west gate
  const keep = { x0: cx - 10, y0: cy - 8, x1: cx + 10, y1: cy + 8 }
  for (let y = keep.y0; y <= keep.y1; y++) {
    for (let x = keep.x0; x <= keep.x1; x++) {
      const edge = x === keep.x0 || x === keep.x1 || y === keep.y0 ||
        y === keep.y1
      // the north wall of the hall is lined with books
      set(
        x,
        y,
        edge ? (y === keep.y0 ? C.BOOKS : C.CASTLE) : C.SQUARE,
      )
    }
  }
  set(keep.x0, cy, C.SQUARE)
  buildings.push({
    ...keep,
    door: [keep.x0, cy],
    inner: [keep.x0 + 1, cy],
    side: "w",
    kind: "keep",
    district: "CASTLE",
  })
  // the throne: a table under two lanterns
  put(props, cx + 6, cy, "table")
  put(props, cx + 6, cy - 2, "lantern")
  put(props, cx + 6, cy + 2, "lantern")
  put(actors, cx + 4, cy, "chancellor")
  put(actors, cx + 3, cy - 3, "guard")
  put(actors, cx + 3, cy + 3, "guard")
  put(props, keep.x0 + 2, keep.y0 + 2, "barrel")
  put(props, keep.x1 - 2, keep.y0 + 2, "barrel")
  put(props, keep.x0 + 2, keep.y1 - 2, "lantern")
  put(props, keep.x1 - 2, keep.y1 - 2, "lantern")
  // guards at the gates, inside
  put(actors, wall.x0 + 2, cy + 2, "lady-knight")
  put(actors, cx + 2, wall.y0 + 2, "guard")
  put(actors, cx + 2, wall.y1 - 2, "guard")
  // the garden round the keep
  for (const [dx, dy] of [[-14, -12], [14, -12], [-14, 12], [14, 12]]) {
    put(props, cx + dx, cy + dy, "flower-pot")
  }
  put(props, cx - 14, cy - 4, "bench")
  put(props, cx + 14, cy + 4, "bench")
  put(actors, cx - 14, cy + 6, "princess")
  put(props, cx, cy - 13, "well")
  put(actors, cx + 6, cy + 12, "bard")
  for (const [dx, dy] of [[-16, 0], [16, 0], [0, -16], [0, 16]]) {
    put(props, cx + dx, cy + dy, "lamp-post")
  }
  put(actors, cx - 16, cy - 2, "lamplighter")
  // the barracks, north and south of the keep, and the orchards
  for (const [y0, side] of [[wall.y0 + 6, "s"], [wall.y1 - 14, "n"]] as const) {
    for (const x0 of [cx - 24, cx + 6]) {
      const b = build(
        { x0, y0, x1: x0 + 17, y1: y0 + 8 },
        side,
        "house",
        "CASTLE",
      )
      if (!b) continue
      put(props, b.x0 + 2, b.y0 + 2, "table")
      put(props, b.x0 + 3, b.y0 + 2, "stool")
      put(actors, ...b.inner, x0 < cx ? "guard" : "lady-knight")
    }
  }
  for (const [ya, yb] of [[wall.y0 + 18, cy - 16], [cy + 16, wall.y1 - 18]]) {
    for (let y = ya; y <= yb; y += 4) {
      for (let x = wall.x0 + 4; x <= wall.x1 - 4; x += 4) {
        if (Math.abs(x - cx) > 3) put(props, x, y, "sapling")
      }
    }
  }
  put(actors, cx - 10, wall.y0 + 20, "farmer")
  put(actors, cx + 10, wall.y1 - 20, "farmer")
}

// build the districts
for (const d of districtRects) if (d.name === "CASTLE") castle(d)
for (const lot of lots) {
  const special = specials.get(lot)
  if (
    special === "SQUARE" || special === "BAZAAR" || special === "FISHMARKET"
  ) {
    square(lot, special)
  } else if (special === "PARK" || special === "GARDEN") park(lot)
  else if (special === "CHAPEL") chapel(lot)
  else if (lot.district === "MARKET") market(lot)
  else if (lot.district === "HARBOR") harbor(lot)
  else residential(lot)
}

// ---------------------------------------------------------------------
// 4. the street life

// lamp posts along the avenues (on their outer rows)
for (const y of [Y1, Y2 + 3]) {
  for (let x = QUAY_END + 4; x < W - 6; x += 12) {
    if (at(x, y) === C.AVENUE) put(props, x, y, "lamp-post")
  }
}
for (const x of [X1, X2 + 3]) {
  for (let y = 8; y < H - 8; y += 12) {
    if (at(x, y) === C.AVENUE) put(props, x, y, "lamp-post")
  }
}
// the harbor: piers into the sea, fishers at their ends, goods on the quay
for (let y = 12; y < H - 12; y += 22) {
  if (Math.abs(y - ENTRY_Y) < 8) continue
  const x0 = coast[y]
  for (let x = x0 - 1; x >= Math.max(2, x0 - 14); x--) {
    set(x, y, C.PIER)
    set(x, y + 1, C.PIER)
  }
  put(actors, Math.max(2, x0 - 14), y, y % 44 < 22 ? "sailor" : "fishwife")
  put(props, coast[y] + 2, y + 3, "crate")
  put(props, coast[y] + 2, y + 4, "barrel")
}
put(props, coast[ENTRY_Y] + 2, ENTRY_Y - 3, "sign", {
  text: "THE CITY: WELCOME, TRAVELER. THE SQUARE IS EAST OF THE MARKET",
})
put(actors, coast[ENTRY_Y] + 4, ENTRY_Y + 4, "guard")
/** Where the portal from the START island lands: on the quay by the bridge */
const ARRIVAL: [number, number] = [coast[ENTRY_Y] + 5, ENTRY_Y + 1]
put(props, ...ARRIVAL, "portal-out")
// on the streets: lamplighters, commuters, shoppers, sweepers, travelers
{
  const streetCells: [number, number][] = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (at(x, y) === C.STREET || at(x, y) === C.AVENUE) {
        streetCells.push([x, y])
      }
    }
  }
  const folk: [string, number][] = [
    ["lamplighter", 6],
    ["commuter", 14],
    ["shopper", 10],
    ["apprentice", 5],
    ["merchant", 4],
    ["townsman", 10],
    ["townswoman", 10],
    ["beggar", 3],
    ["guard", 3],
    ["cat", 6],
  ]
  const shuffled = shuffle(streetCells)
  let k = 0
  for (const [type, n] of folk) {
    for (let placed = 0; placed < n && k < shuffled.length; k++) {
      const [x, y] = shuffled[k]
      if (put(actors, x, y, type)) placed++
    }
  }
}

// ---------------------------------------------------------------------
// 5. reachability and the checks

const blockingProps = new Set<number>()
for (const s of props) {
  if (!catalog.props[s.type]?.canEnter) {
    blockingProps.add(idx(s.i - OI, s.j - OJ))
  }
}
const walkable = (p: number) =>
  (catalog.cells[grid[p]]?.canEnter ?? false) && !blockingProps.has(p)
function walk() {
  const reached = new Uint8Array(W * H)
  const start = idx(0, ENTRY_Y)
  reached[start] = 1
  const queue = [start]
  for (let q = 0; q < queue.length; q++) {
    const p = queue[q]
    const x = p % W, y = (p / W) | 0
    for (const [dx, dy] of D4) {
      if (!inside(x + dx, y + dy)) continue
      const np = idx(x + dx, y + dy)
      if (!reached[np] && walkable(np)) {
        reached[np] = 1
        queue.push(np)
      }
    }
  }
  return reached
}
let reached = walk()
// unreachable open ground becomes trees (the doors are checked below)
let filled = 0
for (let p = 0; p < W * H; p++) {
  if (!reached[p] && walkable(p) && grid[p] !== C.FLOOR) {
    grid[p] = C.TREE
    filled++
  }
}
reached = walk()
// a building whose floor isn't all reached (a narrow shop blocked by
// its furniture) loses its furniture
{
  const FURNITURE = new Set(["barrel", "jar", "table", "crate"])
  const cut = new Set<number>()
  for (const b of buildings) {
    let blocked = false
    for (let y = b.y0 + 1; y < b.y1 && !blocked; y++) {
      for (let x = b.x0 + 1; x < b.x1; x++) {
        const p = idx(x, y)
        if (!reached[p] && walkable(p)) blocked = true
      }
    }
    if (!blocked) continue
    for (const s of props) {
      const x = s.i - OI, y = s.j - OJ
      if (
        FURNITURE.has(s.type) && x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1
      ) {
        cut.add(idx(x, y))
        blockingProps.delete(idx(x, y))
      }
    }
  }
  for (let k = props.length - 1; k >= 0; k--) {
    if (cut.has(idx(props[k].i - OI, props[k].j - OJ))) props.splice(k, 1)
  }
  reached = walk()
}

let ok = true
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "ok" : "NG"} ${name}`)
  if (!cond) ok = false
}
const unreachedDoors = buildings.filter((b) => !reached[idx(...b.door)])
check(
  `every door is reached (${unreachedDoors.length} not)`,
  unreachedDoors.length === 0,
)
let unreachedFloor = 0
for (let p = 0; p < W * H; p++) {
  if (!reached[p] && walkable(p)) {
    unreachedFloor++
  }
}
check(`no unreachable floor (${unreachedFloor})`, unreachedFloor === 0)
const count = (kind: Building["kind"]) =>
  buildings.filter((b) => b.kind === kind).length
check(`houses (${count("house")}) >= 120`, count("house") >= 120)
check(`shops (${count("shop")}) >= 25`, count("shop") >= 25)
check(`warehouses (${count("warehouse")}) >= 6`, count("warehouse") >= 6)
check("the keep", count("keep") === 1)
check("the chapel", count("chapel") === 1)

const unknown = [
  ...actors.filter((s) => !catalog.actors[s.type]),
  ...items.filter((s) => !catalog.items[s.type]),
  ...props.filter((s) => !catalog.props[s.type]),
].map((s) => s.type)
check(
  `every spawn type is in the catalog (${[...new Set(unknown)]})`,
  unknown.length === 0,
)

const standable = (s: Spawn) => {
  const p = idx(s.i - OI, s.j - OJ)
  return catalog.cells[grid[p]]?.canEnter ?? false
}
const actorsOut = actors.filter((s) =>
  standable(s) && reached[idx(s.i - OI, s.j - OJ)]
)
const itemsOut = items.filter(standable)
const propsOut = props.filter((s) =>
  s.type.startsWith("sign-")
    ? WALLS.has(grid[idx(s.i - OI, s.j - OJ)])
    : standable(s)
)
const census = new Map<string, number>()
for (const a of actorsOut) census.set(a.type, (census.get(a.type) ?? 0) + 1)
console.log(
  `buildings ${buildings.length}, lots ${lots.length}, actors ${actorsOut.length}, props ${propsOut.length}, filled ${filled}`,
)
console.log(
  [...census].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(
    ", ",
  ),
)

// --preview <file.png>: one pixel per cell in distinct colors
const previewAt = Deno.args.indexOf("--preview")
if (previewAt >= 0) {
  const COLORS: Record<string, string> = {
    [C.SEA]: Palette.blue3,
    [C.LAND]: Palette.lime2,
    [C.STREET]: Palette.white,
    [C.AVENUE]: Palette.gray2,
    [C.SQUARE]: Palette.orange2,
    [C.WALL]: Palette.black,
    [C.CASTLE]: Palette.gray4,
    [C.RAMPART]: Palette.black,
    [C.MASONRY]: Palette.gray4,
    [C.PLANKS]: Palette.brown3,
    [C.SANDSTONE]: Palette.yellow3,
    [C.BOOKS]: Palette.brown4,
    [C.FLOOR]: Palette.brown2,
    [C.TREE]: Palette.green3,
    [C.YARD]: Palette.lime1,
    [C.GRAVEL]: Palette.yellow2,
  }
  const rgba = new Uint8Array(W * H * 4)
  const rgb = (hex: string) =>
    [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16))
  for (let p = 0; p < W * H; p++) {
    rgba.set([...rgb(COLORS[grid[p]] ?? Palette.magenta2), 255], p * 4)
  }
  for (const a of actorsOut) {
    rgba.set([...rgb(Palette.pink2), 255], idx(a.i - OI, a.j - OJ) * 4)
  }
  await Deno.writeFile(Deno.args[previewAt + 1], await encodePng(W, H, rgba))
  console.log(`wrote the preview to ${Deno.args[previewAt + 1]}`)
}
if (!ok) {
  console.error("city verification failed")
  Deno.exit(1)
}

// ---------------------------------------------------------------------
// output: one json per block, the districts and special places as rooms

const named: (Rect & { id: string })[] = [
  ...districtRects.map((d) => ({ ...d, id: d.name })),
  ...[...specials].map(([lot, what]) => ({ ...lot, id: what })),
]
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
      name: "CITY",
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
console.log(`generated the CITY (4 blocks) at ${OI},${OJ}`)

// ---------------------------------------------------------------------
// the "C" portal room on the START island, beside the "W" room of the
// WILDS (off the same passage down from the start corridor)

type StartJson = { i: number; j: number; props: Spawn[]; field: string[] }
const startPath = new URL(
  "../static/map/block_-10000.-10000.json",
  import.meta.url,
)
const start = JSON.parse(await Deno.readTextFile(startPath)) as StartJson
const sgrid = start.field.map((row) => [...row])
const carve = (x0: number, y0: number, x1: number, y1: number, c: string) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) sgrid[y][x] = c
}
carve(38, 42, 44, 43, "0") // the passage east from the W passage
carve(41, 44, 47, 48, "3") // the room ring
carve(42, 45, 46, 47, "6") // the room floor
carve(44, 44, 44, 44, "0") // the door
carve(43, 42, 43, 42, "r") // the red marker cell
start.field = sgrid.map((row) => row.join(""))
const local = (x: number, y: number) => ({ i: start.i + x, j: start.j + y })
for (
  const add of [
    {
      ...local(44, 46),
      type: "portal",
      data: { i: OI + ARRIVAL[0], j: OJ + ARRIVAL[1] },
    },
    { ...local(43, 42), type: "r_white" },
    { ...local(42, 42), type: "c" },
    {
      ...local(45, 43),
      type: "sign",
      data: { text: "THE CITY: STREETS, SHOPS AND A CASTLE BY THE SEA" },
    },
  ]
) {
  const k = start.props.findIndex((p) => p.i === add.i && p.j === add.j)
  if (k >= 0) start.props[k] = add
  else start.props.push(add)
}
await Deno.writeTextFile(startPath, JSON.stringify(start, null, 2))
console.log("linked the CITY from the start island")
