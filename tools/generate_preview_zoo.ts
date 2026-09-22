// Generates the preview zoo (block_10000.10000): a showcase block
// where every cell, item, prop and actor of the catalog is placed live
// with a labeled sign, so their behaviors can be tried in the real
// game. Reached from static/preview.html (hash #10010,10004).
//
// Usage: deno -A tools/generate_preview_zoo.ts
import { loadCatalog } from "../model/catalog.ts"

const SIZE = 200
const BI = 10000
const BJ = 10000

type Spawn = {
  i: number
  j: number
  type: string
  dir?: string
  data?: unknown
}

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

const actor = (i: number, j: number, type: string, dir?: string) =>
  actors.push({ i: i + BI, j: j + BJ, type, dir })
const item = (i: number, j: number, type: string) =>
  items.push({ i: i + BI, j: j + BJ, type })
const prop = (i: number, j: number, type: string, data?: unknown) =>
  props.push({ i: i + BI, j: j + BJ, type, data })
const sign = (i: number, j: number, text: string) =>
  prop(i, j, "sign", { text })

// The open showcase floor (the player lands at local (10, 4))
rect(2, 2, 176, 96, "0")
sign(12, 4, "PREVIEW ZOO: EVERY GIMMICK LIVE")

// ---------------------------------------------------------------------
// cells: a 3x3 patch of each terrain

sign(4, 8, "CELLS: WALK ON THEM")
const CELLS = [
  "0",
  "3",
  "4",
  "5",
  "6",
  "f",
  "1",
  "2",
  "b",
  "i",
  "w",
  "x",
  "n",
  "s",
  "o",
  "e",
  "g",
  "a",
  "r",
]
CELLS.forEach((cell, n) => {
  const x = 6 + n * 9
  rect(x, 12, x + 2, 14, cell)
  sign(x + 1, 10, cell.toUpperCase())
})

// ---------------------------------------------------------------------
// items

sign(4, 18, "ITEMS: WALK OVER TO COLLECT")
const ITEMS = [
  "apple",
  "green-apple",
  "coin",
  "seed",
  "key",
  "mushroom",
  "purple-mushroom",
  "fish",
]
ITEMS.forEach((type, n) => {
  const x = 6 + n * 9
  item(x, 22, type)
  sign(x, 20, type.toUpperCase())
})

// ---------------------------------------------------------------------
// props (simple)

sign(4, 26, "PROPS: PUSH THEM")
const SIMPLE_PROPS: [string, unknown?][] = [
  ["crate"],
  ["hatena"],
  ["chest", { drops: "coin", count: 3 }],
  ["sign", { text: "I AM A SIGN" }],
  ["stool"],
  ["table"],
  ["lantern"],
  ["lantern-unlit"],
  ["sapling"],
  ["portal-out"],
]
SIMPLE_PROPS.forEach(([type, data], n) => {
  const x = 6 + n * 9
  prop(x, 30, type as string, data)
  sign(x, 28, (type as string).toUpperCase())
})

// ---------------------------------------------------------------------
// props (gates and machines), with their openers placed beside them

sign(4, 34, "GATES AND MACHINES")
let gx = 6
const station = (label: string, build: (x: number) => void) => {
  sign(gx, 36, label)
  build(gx)
  gx += 9
}
station("APPLE GATE", (x) => {
  prop(x, 38, "apple-gate", { count: 1 })
  item(x + 1, 38, "apple")
})
station("KEY GATE", (x) => {
  prop(x, 38, "key-gate")
  item(x + 1, 38, "key")
})
station("TIMER GATE", (x) => {
  prop(x, 38, "timer-gate", { duration: 300 })
})
station("MOON GATE", (x) => {
  prop(x, 38, "moon-gate")
})
station("PLATE + DOOR", (x) => {
  prop(x, 38, "plate", { group: "zoo" })
  prop(x + 2, 38, "door", { group: "zoo" })
})
station("SHOP", (x) => {
  prop(x, 38, "shop", { sells: "seed", price: 1 })
  item(x + 1, 38, "coin")
  item(x + 2, 38, "coin")
})
station("FISH SHRINE", (x) => {
  prop(x, 38, "fish-shrine")
})
station("SPRING", (x) => {
  prop(x, 38, "spring")
})
station("RACE", (x) => {
  prop(x, 38, "race-start")
  prop(x + 5, 38, "race-goal", { course: "zoo", par: 600, reward: 3 })
})
station("PORTAL", (x) => {
  prop(x, 38, "portal", { i: BI + 10, j: BJ + 4 })
})

// ---------------------------------------------------------------------
// actors in fenced pens

sign(4, 44, "ACTORS")
const PENNED = [
  "random",
  "random-walk",
  "random-rotate",
  "inertial",
  "static",
  "chaser",
  "ghost",
  "patrol",
]
PENNED.forEach((type, n) => {
  const x = 8 + n * 10
  sign(x, 46, type.toUpperCase())
  rect(x - 2, 48, x + 2, 52, "1")
  rect(x - 1, 49, x + 1, 51, "0")
  actor(x, 50, type)
})
// the ghost walks through walls at night, so warn about it
sign(70, 46, "GHOST ESCAPES AT NIGHT!")
// the boulder gets an open lane instead of a pen
sign(82, 46, "BOULDER: PUSH IT")
actor(84, 50, "boulder")

// ---------------------------------------------------------------------
// combo demos

sign(4, 56, "COMBO DEMOS")

sign(6, 58, "ICE LANE + SPRING")
prop(6, 60, "spring")
rect(7, 59, 18, 61, "i")

sign(28, 58, "BELT LINE (ONE WAY)")
for (let x = 28; x <= 34; x++) grid[60][x] = "e"

sign(46, 58, "BOULDER + WATER = BRIDGE")
actor(46, 60, "boulder")
rect(50, 59, 51, 61, "w")

sign(66, 58, "DIG HERE (SPACE)")
grid[60][66] = "x"

sign(80, 58, "POND: FACE WATER + SPACE TO FISH")
rect(80, 60, 85, 63, "w")

sign(100, 58, "PLANT A SEED (SPACE)")
item(100, 60, "seed")
item(101, 60, "seed")

sign(120, 58, "CHASER + BOULDER LANE")
actor(120, 62, "chaser")
actor(126, 60, "boulder")

// ---------------------------------------------------------------------
// button-linked walls (see game-ideas-3.md)

sign(4, 66, "BUTTON WALLS: PUSH THE BUTTONS")

sign(6, 68, "SWITCH: BLUE UP / RED DOWN")
prop(6, 70, "switch", { group: "zoo-sw" })
prop(9, 70, "blue-wall", { group: "zoo-sw" })
prop(10, 70, "red-wall", { group: "zoo-sw" })

sign(26, 68, "TIMER BUTTON + SHUTTER")
prop(26, 70, "timer-button", { group: "zoo-timer", duration: 300 })
prop(30, 70, "shutter", { group: "zoo-timer" })
prop(30, 71, "shutter", { group: "zoo-timer" })

sign(44, 68, "PRESS 1 2 3 IN ORDER")
prop(44, 70, "seq-button", { group: "zoo-seq", order: 1 })
prop(46, 70, "seq-button", { group: "zoo-seq", order: 2 })
prop(48, 70, "seq-button", { group: "zoo-seq", order: 3 })
prop(44, 71, "1_white")
prop(46, 71, "2_white")
prop(48, 71, "3_white")
prop(52, 70, "seal-wall", { group: "zoo-seq", count: 3 })

sign(64, 68, "SLIDE BUTTON: THE GAP MOVES")
prop(64, 70, "slide-button", { group: "zoo-slide" })
for (let n = 0; n < 5; n++) {
  prop(67 + n, 70, "slide-wall", { group: "zoo-slide", index: n })
}

sign(84, 68, "LIGHTS OUT: ALL ON OPENS THE WALL")
prop(84, 70, "switch", { group: "zoo-la" })
prop(86, 70, "switch", { group: "zoo-lb", also: ["zoo-la"] })
prop(88, 70, "switch", { group: "zoo-lc", also: ["zoo-lb"] })
prop(91, 70, "and-wall", { groups: ["zoo-la", "zoo-lb", "zoo-lc"] })

sign(104, 68, "BOULDER PRESSES THE SWITCH")
actor(104, 70, "boulder")
prop(110, 70, "switch", { group: "zoo-boulder" })
prop(110, 72, "blue-wall", { group: "zoo-boulder" })

sign(124, 68, "PATROL FLIPS THE SWITCH")
rect(124, 69, 134, 71, "1")
rect(125, 70, 132, 70, "0")
prop(133, 70, "switch", { group: "zoo-patrol" })
actor(126, 70, "patrol", "right")
prop(128, 73, "blue-wall", { group: "zoo-patrol" })
prop(130, 73, "red-wall", { group: "zoo-patrol" })

// ---------------------------------------------------------------------
// output (with a bounds check)

for (const list of [actors, items, props]) {
  for (const s of list) {
    const li = s.i - BI
    const lj = s.j - BJ
    if (li < 0 || li >= SIZE || lj < 0 || lj >= SIZE) {
      console.error("spawn out of bounds:", s)
      Deno.exit(1)
    }
  }
}
const catalog = await loadCatalog(
  new URL("../static/catalog/base.json", import.meta.url).href,
  ["base.json"],
)
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
  catalogs: ["../catalog/base.json"],
  config: { showsExitButton: true },
  actors,
  items,
  props,
  field: grid.map((row) => row.join("")),
}
await Deno.writeTextFile(
  new URL("../static/map/block_10000.10000.json", import.meta.url),
  JSON.stringify(json, null, 2),
)
console.log("generated block_10000.10000.json (preview zoo)")
