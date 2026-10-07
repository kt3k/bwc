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
  "notice-board": { text: "I AM A NOTICE BOARD" },
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
  "bell-stone": { group: "debug-bell", order: 1, count: 1, note: 0 },
  "slipper-mat": { group: "debug-mat" },
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
const PENS_PER_ROW = 14
/** A row of pens: the label signs, then 5 rows of pen, then a gap */
const PEN_ROW_H = 7

// The sections, top to bottom
const ACTORS_Y = 7
const actorRows = Math.ceil(ACTOR_TYPES.length / PENS_PER_ROW)
const ITEMS_Y = ACTORS_Y + actorRows * PEN_ROW_H + 1
/** Items wrap to rows of this many, 2 rows apart */
const ITEMS_PER_ROW = 30
const itemRows = Math.ceil(ITEM_TYPES.length / ITEMS_PER_ROW)
const PROPS_LABEL_Y = ITEMS_Y + 2 + itemRows * 2
const PROPS_Y = PROPS_LABEL_Y + 2
const propRows = Math.ceil(PROP_TYPES.length / PROPS_PER_ROW)
const width = Math.max(
  2 + Math.min(ACTOR_TYPES.length, PENS_PER_ROW) * 7 + 2,
  2 + PROPS_PER_ROW * PITCH + 1,
)
/** The stack station: chests in dead ends drop all onto one cell */
const STACKS_Y = PROPS_Y + propRows * 2 + 1
/** The oddity garden (ideas/breakables.md): a plot for each oddity */
const GARDEN_Y = STACKS_Y + 9
const PLOT_W = 11
const PLOT_H = 9
const PLOT_COLS = 6
/** Each plot: the walls, then the rows of plots 2 cells apart */
const GARDEN_ROWS = 4
const height = GARDEN_Y + 2 + GARDEN_ROWS * (PLOT_H + 2) + 1
rect(1, 1, width, height, "0")

// title + arrival
letters(2, 2, "DEBUG")
sign(8, 2, "DEBUG MAP: EVERY ACTOR, ITEM AND PROP OF THE CATALOG")
prop(ARRIVAL.i, ARRIVAL.j, "portal-out")
prop(5, 4, "portal", { i: START.i, j: START.j })
sign(6, 4, "PORTAL: BACK TO THE START ISLAND")

// actors: one fenced pen each, in rows
letters(2, ACTORS_Y, "ACTORS")
sign(9, ACTORS_Y, "ACTORS: PENNED. A LANTERN HOLDS THE GHOST")
ACTOR_TYPES.forEach((type, n) => {
  const cx = 4 + (n % PENS_PER_ROW) * 7
  const y = ACTORS_Y + 1 + Math.floor(n / PENS_PER_ROW) * PEN_ROW_H
  sign(cx, y, label(type))
  rect(cx - 2, y + 1, cx + 2, y + 5, "1")
  rect(cx - 1, y + 2, cx + 1, y + 4, "0")
  actor(cx, y + 3, type)
  // the ghost walks through walls; a lantern in the pen keeps it inside
  if (type === "ghost") prop(cx, y + 5, "lantern")
})

// items: one row
letters(2, ITEMS_Y, "ITEMS")
sign(8, ITEMS_Y, "ITEMS: WALK OVER TO COLLECT")
ITEM_TYPES.forEach((type, n) => {
  const x = 2 + (n % ITEMS_PER_ROW) * PITCH
  const y = ITEMS_Y + 2 + Math.floor(n / ITEMS_PER_ROW) * 2
  sign(x, y, label(type))
  item(x + 1, y, type)
})

// props: rows of PROPS_PER_ROW, with a walkway row between them
letters(2, PROPS_LABEL_Y, "PROPS")
sign(8, PROPS_LABEL_Y, "PROPS: PUSH OR STEP ON THEM")
PROP_TYPES.forEach((type, n) => {
  const x = 2 + (n % PROPS_PER_ROW) * PITCH
  const y = PROPS_Y + Math.floor(n / PROPS_PER_ROW) * 2
  const data = SAMPLE_DATA[type]
  sign(x, y, label(type, data, NOTES[type]))
  prop(x + 1, y, type, data)
})

// stacks: a chest's drops never land on the one who pushed it, so a
// chest in a dead end (open only toward the pusher) leaves all of them
// in a pile where it stood. Step in to take the pile at once ("xN")
letters(2, STACKS_Y, "STACKS")
sign(9, STACKS_Y, "STACKS: PUSH A CHEST, THEN STEP IN TO TAKE THE PILE")
/** A chest in a dead end above (cx, y), pushed up from (cx, y) */
const deadEndChest = (
  cx: number,
  y: number,
  drops: string,
  count: number,
) => {
  rect(cx - 1, y - 2, cx + 1, y - 2, "1")
  rect(cx - 1, y - 1, cx - 1, y - 1, "1")
  rect(cx + 1, y - 1, cx + 1, y - 1, "1")
  prop(cx, y - 1, "chest", { drops, count })
}
{
  const y = STACKS_Y + 5
  // 5 coins in one pile
  deadEndChest(4, y, "coin", 5)
  sign(6, y - 1, "5 COINS IN ONE PILE")
  // a mixed pile: two chests side by side, walled in but for the
  // cells to push them from (below the right one, left of the left
  // one). Whichever goes first leaves its pile where it stood, and the
  // other drops onto it
  {
    const cx = 15
    rect(cx - 1, y - 2, cx + 1, y - 2, "1")
    rect(cx + 1, y - 1, cx + 1, y - 1, "1")
    rect(cx - 1, y, cx - 1, y, "1")
    prop(cx, y - 1, "chest", { drops: "coin", count: 3 })
    prop(cx - 1, y - 1, "chest", { drops: "seed", count: 2 })
    sign(cx + 2, y - 1, "PUSH BOTH: COINS AND SEEDS IN ONE PILE")
  }
  // keys: "GOT 2 KEYS"
  deadEndChest(24, y, "key", 2)
  sign(26, y - 1, "2 KEYS IN ONE PILE")
}

// the oddity garden: things that break and let something out, and
// actors that aren't people. Each plot is walled, open at the bottom
letters(2, GARDEN_Y, "ODDITIES")
sign(11, GARDEN_Y, "ODDITIES: BREAK THEM, BUMP THEM (IDEAS/BREAKABLES.MD)")
type Plot = { x: number; y: number }
/** Plot contents; (x, y) is the top left inside the walls (9x7) */
const PLOTS: [string, (p: Plot) => void][] = [
  [
    "NESTING JARS: A JAR IN A JAR IN A JAR",
    (p) => prop(p.x + 4, p.y + 3, "nest-jar-4"),
  ],
  [
    "PACKED BOX: TWO DOZEN THINGS INSIDE",
    (p) => prop(p.x + 4, p.y + 2, "packed-box"),
  ],
  ["EGGSHELL WALL: CRACK ONE", (p) => {
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        prop(p.x + 1 + dx, p.y + 1 + dy, "egg-wall")
      }
    }
  }],
  ["BELL STONES: LEFT TO RIGHT", (p) => {
    const notes = [0, 2, 4, 5, 7]
    notes.forEach((note, n) =>
      prop(p.x + n * 2, p.y + 2, "bell-stone", {
        group: "garden-bell",
        order: n + 1,
        count: notes.length,
        note,
      })
    )
  }],
  ["BALLOON ROCK: PUSH IT 3 TIMES", (p) => {
    prop(p.x + 4, p.y + 3, "balloon-rock")
    prop(p.x + 4, p.y + 2, "crate")
    prop(p.x + 3, p.y + 3, "nest-jar-2")
    prop(p.x + 5, p.y + 3, "egg-wall")
  }],
  [
    "DRAWER TOWER: PUSH IT AGAIN AND AGAIN",
    (p) => prop(p.x + 4, p.y + 2, "drawer-tower"),
  ],
  ["FALLEN MOON", (p) => prop(p.x + 4, p.y + 3, "moon-shell")],
  ["A WINDOW IN A FIELD", (p) => prop(p.x + 4, p.y + 3, "lone-window")],
  ["CLOCK: STOPS THE WALKERS", (p) => {
    prop(p.x + 4, p.y + 1, "clock")
    actor(p.x + 1, p.y + 4, "chick")
    actor(p.x + 7, p.y + 4, "sheep")
    actor(p.x + 4, p.y + 5, "slime")
  }],
  ["PINATA TREE: SHAKE IT", (p) => prop(p.x + 4, p.y + 2, "pinata-tree")],
  ["TOOTHPASTE ROCK: PUSH IT OVER THE WATER", (p) => {
    // a pond with a gem on its far shore, the tube on the near one
    rect(p.x + 3, p.y, p.x + 8, p.y + 4, "w")
    rect(p.x + 8, p.y + 2, p.x + 8, p.y + 2, "0")
    item(p.x + 8, p.y + 2, "gem")
    prop(p.x + 2, p.y + 2, "paste-tube")
  }],
  ["YOUR STATUE: AN ECHO OPENS THE DOOR", (p) => {
    prop(p.x + 1, p.y + 5, "self-statue")
    prop(p.x + 1, p.y + 1, "plate", { group: "garden-echo" })
    rect(p.x + 5, p.y, p.x + 8, p.y + 2, "1")
    rect(p.x + 6, p.y, p.x + 8, p.y + 1, "0")
    prop(p.x + 6, p.y + 2, "door", { group: "garden-echo" })
    item(p.x + 7, p.y, "coin-bag")
  }],
  ["SPORE BLOB: POKE IT", (p) => actor(p.x + 4, p.y + 3, "spore")],
  ["PIGGY BANK: CORNER IT", (p) => actor(p.x + 4, p.y + 3, "piggy")],
  ["A FIN: CATCH THE FISH", (p) => actor(p.x + 4, p.y + 3, "fin")],
  ["CLOUD: PRESS IT AGAINST A WALL", (p) => actor(p.x + 4, p.y + 3, "cloud")],
  [
    "PEBBLES: KICK THE ONE WITH EYES",
    (p) => actor(p.x + 4, p.y + 1, "pebble-leader"),
  ],
  ["A SHADOW: STEP ON IT", (p) => actor(p.x + 4, p.y + 3, "shadow")],
  ["BOOK: CATCH IT, SPELL ITS WORD", (p) => actor(p.x + 4, p.y + 3, "book")],
  ["BOILED EGG: ROLL IT INTO A WALL", (p) => actor(p.x + 4, p.y + 4, "egg-s")],
  ["FLUFF: TOUCH IT, FILL THE PLOT", (p) => actor(p.x + 4, p.y + 3, "fluff")],
  ["SLIPPERS: ONE ON EACH MAT", (p) => {
    actor(p.x + 2, p.y + 4, "slipper")
    prop(p.x + 6, p.y + 1, "slipper-mat", { group: "garden-mat" })
    prop(p.x + 7, p.y + 1, "slipper-mat", { group: "garden-mat" })
  }],
  ["SNAIL: BREAK ITS SHELL", (p) => {
    actor(p.x + 1, p.y + 3, "snail")
    rect(p.x + 3, p.y + 1, p.x + 8, p.y + 5, "w")
  }],
  ["BLOCK FISH: FOUR IN A ROW", (p) => {
    actor(p.x + 1, p.y + 1, "block-fish")
    actor(p.x + 4, p.y + 2, "block-fish")
    actor(p.x + 7, p.y + 1, "block-fish")
    actor(p.x + 2, p.y + 4, "block-fish")
    actor(p.x + 6, p.y + 5, "block-fish")
  }],
]
PLOTS.forEach(([text, fill], n) => {
  const px = 2 + (n % PLOT_COLS) * (PLOT_W + 1)
  const py = GARDEN_Y + 2 + Math.floor(n / PLOT_COLS) * (PLOT_H + 2)
  rect(px, py, px + PLOT_W - 1, py + PLOT_H - 1, "1")
  rect(px + 1, py + 1, px + PLOT_W - 2, py + PLOT_H - 2, "0")
  // the way in, at the bottom
  rect(px + 4, py + PLOT_H - 1, px + 6, py + PLOT_H - 1, "0")
  sign(px + 3, py + PLOT_H, text)
  fill({ x: px + 1, y: py + 1 })
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
