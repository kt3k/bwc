// The debug portals of the START island (block_-10000.-10000): one small
// hall off the start corridor (west, across from the free roam room) with
// a portal straight to every debug place, side by side, each named on the
// ground in white letters (no signs to read). Two portals a row, a free
// cell between the rows, the name to the right of its portal.
//
// The places: the DEBUG map, its BAIT rooms, its animal HOMES and its
// GROUPS area (tools/generate_debug_map.ts), the CAYLEY rooms
// (tools/generate_cayley_map.ts), the GOALS map (tools/goals_map.ts), the
// preview ZOO and its TOWN (tools/generate_preview_zoo.ts), the LAMPS
// (tools/generate_lamp_map.ts).
//
// Built here only: the generators of those maps call linkStartPortals()
// after writing their blocks, and it rebuilds the whole hall from the
// blocks as they are (where the BAIT and HOMES portals of the DEBUG map
// lead depends on the catalog), so the portals never fight and running it
// again gives the same block. The rest of the START island is left alone.
//
// Usage: deno -A tools/start_portals.ts (relinks the hall only)
import * as CAYLEY from "./generate_cayley_map.ts"
import * as GOALS from "./goals_map.ts"
import * as LAMPS from "./generate_lamp_map.ts"

type Spawn = { i: number; j: number; type: string; data?: unknown }
type BlockJson = {
  i: number
  j: number
  props: Spawn[]
  actors?: Spawn[]
  items?: Spawn[]
  field: string[]
}
type At = { i: number; j: number }

/** A debug place: its name on the ground, and where its portal lands */
export type Destination = {
  name: string
  /** The arrival (world cells) */
  to?: At
  /** Or: where the portal standing on this cell (world) leads */
  via?: At & { block: string }
}

const DEBUG_BLOCK = "block_10000.-10000.json"

/** The debug places, in the order of the hall (row by row, west first) */
export const DESTINATIONS: Destination[] = [
  { name: "DEBUG", to: { i: 10002, j: -9996 } },
  { name: "GROUPS", to: { i: 10109, j: -9995 } },
  {
    name: "CAYLEY",
    to: { i: CAYLEY.BI + CAYLEY.ARRIVAL.i, j: CAYLEY.BJ + CAYLEY.ARRIVAL.j },
  },
  {
    name: "GOALS",
    to: { i: GOALS.BI + GOALS.ARRIVAL.i, j: GOALS.BJ + GOALS.ARRIVAL.j },
  },
  { name: "ZOO", to: { i: 10010, j: 10004 } },
  { name: "TOWN", to: { i: 10026, j: 10106 } },
  // the DEBUG map's rooms of the tools and of the animals: as far down as
  // the catalog is long, so taken from the map's own portals to them
  { name: "BAIT", via: { block: DEBUG_BLOCK, i: 10014, j: -9996 } },
  { name: "HOMES", via: { block: DEBUG_BLOCK, i: 10022, j: -9996 } },
  {
    name: "LAMPS",
    to: { i: LAMPS.BI + LAMPS.ARRIVAL.i, j: LAMPS.BJ + LAMPS.ARRIVAL.j },
  },
]

/** The START island's block */
export const START_BLOCK = "block_-10000.-10000.json"
/** The hall's ring (local cells of the START block): top left */
export const HALL = { x0: 14, y0: 37, x1: 32 }
/** The door from the start corridor (its west edge is x 34) */
export const DOOR = { x: 33, y: 38 }
/** The first row of portals, and the columns of the two portals a row */
const ROW0 = 39
const COLS = [15, 24]
/** Longest name: from its portal's east to the next column */
const MAX_NAME = 6

/**
 * Where the old portal rooms stood (one per place: DEBUG and GOALS north
 * of the hall of waystones, the TOWN's south of it): cleared with the
 * hall's own box every time
 */
const CLEARED: [number, number, number, number][] = [
  [14, 23, 33, 27],
  [14, 36, 33, 50],
]

/** The hall's last row (its south ring) for so many places */
export const hallBottom = (n: number) => ROW0 + 2 * (Math.ceil(n / 2) - 1) + 1

/** The portal's cell (local) of the n-th place, its name to the right */
export const slot = (n: number) => ({
  x: COLS[n % 2],
  y: ROW0 + 2 * Math.floor(n / 2),
})

const mapUrl = (name: string) =>
  new URL(`../static/map/${name}`, import.meta.url)

const readBlock = async (name: string) =>
  JSON.parse(await Deno.readTextFile(mapUrl(name))) as BlockJson

/** Where each place's portal lands, read from the maps as they are */
export async function resolve(
  dests: Destination[] = DESTINATIONS,
): Promise<{ name: string; to: At }[]> {
  const out = []
  for (const d of dests) {
    if (d.to) {
      out.push({ name: d.name, to: d.to })
      continue
    }
    const { block, i, j } = d.via!
    const portal = (await readBlock(block)).props.find((p) =>
      p.type === "portal" && p.i === i && p.j === j
    )
    if (!portal) throw new Error(`no portal at ${i},${j} for ${d.name}`)
    const to = portal.data as At
    out.push({ name: d.name, to: { i: to.i, j: to.j } })
  }
  return out
}

/** Rebuilds the hall of the debug portals on the START island */
export async function linkStartPortals() {
  const places = await resolve()
  for (const { name } of places) {
    if (!/^[A-Z]+$/.test(name) || name.length > MAX_NAME) {
      throw new Error(`can't write ${name} on the ground`)
    }
  }
  const start = await readBlock(START_BLOCK)
  const grid = start.field.map((row) => [...row])
  const carve = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y][x] = c
  }
  const y1 = hallBottom(places.length)
  if (y1 > CLEARED[1][3] - 1) throw new Error("too many places for the hall")
  // the box, cleared: black, and nothing standing on it
  for (const [x0, y0, x1, y1] of CLEARED) {
    carve(x0, y0, x1, y1, "b")
    const out = (s: Spawn) => {
      const x = s.i - start.i, y = s.j - start.j
      return x < x0 || x > x1 || y < y0 || y > y1
    }
    start.props = start.props.filter(out)
    start.actors = (start.actors ?? []).filter(out)
    start.items = (start.items ?? []).filter(out)
  }
  // the hall: a ring round the floor, the door to the corridor
  carve(HALL.x0, HALL.y0, HALL.x1, y1, "3")
  carve(HALL.x0 + 1, HALL.y0 + 1, HALL.x1 - 1, y1 - 1, "6")
  carve(DOOR.x, DOOR.y, DOOR.x, DOOR.y, "0")
  const local = (x: number, y: number) => ({ i: start.i + x, j: start.j + y })
  places.forEach(({ name, to }, n) => {
    const { x, y } = slot(n)
    start.props.push({ ...local(x, y), type: "portal", data: to })
    for (const [k, ch] of [...name.toLowerCase()].entries()) {
      start.props.push({ ...local(x + 1 + k, y), type: `${ch}_white` })
    }
  })
  start.field = grid.map((row) => row.join(""))
  await Deno.writeTextFile(
    mapUrl(START_BLOCK),
    JSON.stringify(start, null, 2) + "\n",
  )
  console.log(
    `linked the debug places from the start island: ${
      places.map((p) => p.name).join(", ")
    }`,
  )
}

if (import.meta.main) await linkStartPortals()
