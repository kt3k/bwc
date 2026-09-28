// Generates the debug map (block_10000.-10000): a compact block that
// lists EVERY actor, item and prop of the catalog at once, each with
// a labeled sign, so all of them can be checked in one screen-ish
// area. Unlike the preview zoo, the lists are derived from the catalog
// itself, so a newly added spawn type shows up here automatically.
//
// It also links the block from the start island: a "DEBUG" portal room
// is carved to the left of the start corridor (mirroring the tutorial
// portal room on the right).
//
// Usage: deno -A tools/generate_debug_map.ts
import { loadCatalog } from "../model/catalog.ts"
import { validate } from "../util/json-schema.ts"

const SIZE = 200
const BI = 10000
const BJ = -10000

/** Where the player lands (local coords) */
const ARRIVAL = { i: 2, j: 4 }
/** The start position of the game (see game/game-screen.ts) */
const START = { i: -9964, j: -9981 }

type Spawn = { i: number; j: number; type: string; data?: unknown }

const catalog = await loadCatalog(
  new URL("../static/catalog/base.json", import.meta.url).href,
  ["base.json"],
)

// ---------------------------------------------------------------------
// the debug block

const grid: string[][] = Array.from(
  { length: SIZE },
  () => Array(SIZE).fill("1"),
)
const actors: Spawn[] = []
const items: Spawn[] = []
const props: Spawn[] = []

function rect(x0: number, y0: number, x1: number, y1: number, cell: string) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) grid[y][x] = cell
    }
  }
}

const actor = (i: number, j: number, type: string) =>
  actors.push({ i: i + BI, j: j + BJ, type })
const item = (i: number, j: number, type: string) =>
  items.push({ i: i + BI, j: j + BJ, type })
const prop = (i: number, j: number, type: string, data?: unknown) =>
  props.push({ i: i + BI, j: j + BJ, type, data })
const sign = (i: number, j: number, text: string) =>
  prop(i, j, "sign", { text })
/** Spells a word with the white letter props (A-Z, 1-3 only) */
const letters = (i: number, j: number, word: string) => {
  for (const [n, ch] of [...word.toLowerCase()].entries()) {
    prop(i + n, j, `${ch}_white`)
  }
}

/**
 * Sample data for the props that take (or require) per-instance data.
 * A prop whose schema has required keys must have an entry here.
 */
const SAMPLE_DATA: Record<string, unknown> = {
  portal: { i: BI + ARRIVAL.i, j: BJ + ARRIVAL.j },
  sign: { text: "I AM A SIGN" },
  chest: { drops: "coin", count: 3 },
  plate: { group: "debug" },
  door: { group: "debug" },
  "timer-gate": { duration: 300 },
  shop: { sells: "seed", price: 1 },
  "race-goal": { course: "debug", par: 600, reward: 3 },
  "apple-gate": { count: 1 },
  switch: { group: "debug-sw" },
  "blue-wall": { group: "debug-sw" },
  "red-wall": { group: "debug-sw" },
  "and-wall": { groups: ["debug-sw"] },
  "timer-button": { group: "debug-timer", duration: 300 },
  shutter: { group: "debug-timer" },
  "seq-button": { group: "debug-seq", order: 1 },
  "seal-wall": { group: "debug-seq", count: 1 },
  "slide-button": { group: "debug-slide" },
  "slide-wall": { group: "debug-slide", index: 0 },
}

/** Extra notes shown on the label sign of some props */
const NOTES: Record<string, string> = {
  "reset-portal": "WIPES THE SAVE!",
  portal: "BACK TO THE ARRIVAL POINT",
}

const label = (type: string, data?: unknown, note?: string) => {
  let text = type.toUpperCase()
  if (data && typeof data === "object") {
    const pairs = Object.entries(data as Record<string, unknown>)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")
    text += ` (${pairs})`.toUpperCase()
  }
  if (note) text += ` - ${note}`
  return text
}

const ACTOR_TYPES = Object.keys(catalog.actors)
const ITEM_TYPES = Object.keys(catalog.items)
const PROP_TYPES = Object.keys(catalog.props)

const PROPS_PER_ROW = 12
/** Each entry takes 3 cells: sign, spawn, gap */
const PITCH = 3

// The floor: as wide as the widest section, as tall as the last row
const propRows = Math.ceil(PROP_TYPES.length / PROPS_PER_ROW)
const PROPS_Y = 21
const width = Math.max(
  2 + ACTOR_TYPES.length * 7 + 2,
  2 + PROPS_PER_ROW * PITCH + 1,
)
const height = PROPS_Y + propRows * 2 + 2
rect(1, 1, width, height, "0")

// title + arrival
letters(2, 2, "DEBUG")
sign(8, 2, "DEBUG MAP: EVERY ACTOR, ITEM AND PROP OF THE CATALOG")
prop(ARRIVAL.i, ARRIVAL.j, "portal-out")
prop(5, 4, "portal", { i: START.i, j: START.j })
sign(6, 4, "PORTAL: BACK TO THE START ISLAND")

// actors: one fenced pen each
letters(2, 7, "ACTORS")
sign(9, 7, "ACTORS: PENNED. A LANTERN HOLDS THE GHOST")
ACTOR_TYPES.forEach((type, n) => {
  const cx = 4 + n * 7
  sign(cx, 8, label(type))
  rect(cx - 2, 9, cx + 2, 13, "1")
  rect(cx - 1, 10, cx + 1, 12, "0")
  actor(cx, 11, type)
  // the ghost walks through walls; a lantern in the pen keeps it inside
  if (type === "ghost") prop(cx, 13, "lantern")
})

// items: one row
letters(2, 15, "ITEMS")
sign(8, 15, "ITEMS: WALK OVER TO COLLECT")
ITEM_TYPES.forEach((type, n) => {
  const x = 2 + n * PITCH
  sign(x, 17, label(type))
  item(x + 1, 17, type)
})

// props: rows of PROPS_PER_ROW, with a walkway row between them
letters(2, 19, "PROPS")
sign(8, 19, "PROPS: PUSH OR STEP ON THEM")
PROP_TYPES.forEach((type, n) => {
  const x = 2 + (n % PROPS_PER_ROW) * PITCH
  const y = PROPS_Y + Math.floor(n / PROPS_PER_ROW) * 2
  const data = SAMPLE_DATA[type]
  sign(x, y, label(type, data, NOTES[type]))
  prop(x + 1, y, type, data)
})

// ---------------------------------------------------------------------
// checks

for (const [type, def] of Object.entries(catalog.props)) {
  if (!def.dataSchema) continue
  const data = SAMPLE_DATA[type] ?? {}
  if (!validate(def.dataSchema, data)) {
    console.error(`prop "${type}" needs sample data matching its schema`)
    Deno.exit(1)
  }
}
const occupied = new Set<string>()
for (const list of [actors, items, props]) {
  for (const s of list) {
    const li = s.i - BI
    const lj = s.j - BJ
    if (li < 1 || li > width || lj < 1 || lj > height) {
      console.error("spawn out of the floor:", s)
      Deno.exit(1)
    }
    const key = `${li}.${lj}`
    if (occupied.has(key)) {
      console.error("overlapping spawns at", key, s)
      Deno.exit(1)
    }
    occupied.add(key)
  }
}
for (const s of actors) {
  if (!catalog.actors[s.type]) {
    console.error("unknown actor type:", s.type)
    Deno.exit(1)
  }
}
for (const s of items) {
  if (!catalog.items[s.type]) {
    console.error("unknown item type:", s.type)
    Deno.exit(1)
  }
}
for (const s of props) {
  if (!catalog.props[s.type]) {
    console.error("unknown prop type:", s.type)
    Deno.exit(1)
  }
}

const json = {
  i: BI,
  j: BJ,
  name: "DEBUG",
  catalogs: ["../catalog/base.json"],
  config: { showsExitButton: true },
  actors,
  items,
  props,
  field: grid.map((row) => row.join("")),
}
await Deno.writeTextFile(
  new URL(`../static/map/block_${BI}.${BJ}.json`, import.meta.url),
  JSON.stringify(json, null, 2),
)
console.log(
  `generated block_${BI}.${BJ}.json (debug map: ${ACTOR_TYPES.length} actors, ${ITEM_TYPES.length} items, ${PROP_TYPES.length} props)`,
)

// ---------------------------------------------------------------------
// the debug portal room on the start island (block_-10000.-10000)
//
// Mirrors the tutorial portal room across the start corridor: a
// passage opens to the left at the same row, marked with a red cell,
// a "D" label and a sign, leading to a walled room with the portal.

interface BlockJson {
  i: number
  j: number
  actors: Spawn[]
  items: Spawn[]
  props: Spawn[]
  field: string[]
}

const startPath = new URL(
  "../static/map/block_-10000.-10000.json",
  import.meta.url,
)
const start = JSON.parse(await Deno.readTextFile(startPath)) as BlockJson
const sgrid = start.field.map((row) => [...row])
const carve = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cell: string,
) => {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) sgrid[y][x] = cell
  }
}
carve(24, 23, 28, 27, "3") // the room ring
carve(25, 24, 27, 26, "6") // the room floor
carve(29, 23, 32, 27, "0") // the passage
carve(33, 25, 33, 25, "0") // the opening from the start corridor
carve(31, 25, 31, 25, "r") // the red marker cell
start.field = sgrid.map((row) => row.join(""))

const local = (i: number, j: number) => ({ i: start.i + i, j: start.j + j })
const additions: Spawn[] = [
  {
    ...local(26, 25),
    type: "portal",
    data: { i: BI + ARRIVAL.i, j: BJ + ARRIVAL.j },
  },
  { ...local(31, 25), type: "r_white" },
  { ...local(30, 25), type: "d" },
  { ...local(29, 23), type: "sign", data: { text: "DEBUG MAP: EVERY SPAWN" } },
]
for (const add of additions) {
  const index = start.props.findIndex((p) => p.i === add.i && p.j === add.j)
  if (index >= 0) {
    start.props[index] = add
  } else {
    start.props.push(add)
  }
}
await Deno.writeTextFile(startPath, JSON.stringify(start, null, 2))
console.log("linked the debug map from the start island")
