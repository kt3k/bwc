// Generates the preview zoo (block_10000.10000): a showcase block
// where every cell, item, prop and actor of the catalog is placed live
// with a labeled sign, so their behaviors can be tried in the real
// game. Reached from static/preview.html (hash #10010,10004).
//
// Usage: deno -A tools/generate_preview_zoo.ts
import { createRooms } from "./rooms.ts"
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
  "c",
  "d",
  "m",
  "p",
  "h",
  "y",
  "g",
  "a",
  "r",
]
CELLS.forEach((cell, n) => {
  const x = 6 + n * 7
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
  prop(x + 2, 38, "lantern-unlit") // light it to open the gate
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
  // the ghost walks through walls; a lantern in the pen keeps it inside
  if (type === "ghost") prop(x, 52, "lantern")
})
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
// animals with a mind of their own (see game-ideas-4.md)

sign(4, 76, "ANIMALS: MIRROR, SHEEP, CROW")

sign(6, 78, "MIRROR: IT COPIES YOU, LEFT AND RIGHT SWAPPED")
rect(14, 80, 22, 88, "1")
rect(15, 81, 21, 87, "0")
grid[84][19] = "1" // a pillar to shift the pair out of sync
actor(18, 84, "mirror")
prop(15, 81, "switch", { group: "zoo-mirror" })
prop(10, 80, "blue-wall", { group: "zoo-mirror" })
prop(11, 80, "red-wall", { group: "zoo-mirror" })

sign(30, 78, "SHEEP: HERD IT ONTO THE PLATE")
rect(30, 80, 44, 90, "1")
rect(31, 81, 43, 89, "f")
grid[80][37] = "f" // the gate in the fence
rect(40, 90, 42, 92, "1")
rect(41, 90, 41, 91, "f") // the chute
prop(41, 91, "plate", { group: "zoo-sheep" })
rect(26, 84, 29, 86, "1")
rect(27, 85, 29, 85, "0")
grid[85][30] = "0"
prop(30, 85, "door", { group: "zoo-sheep" })
item(27, 85, "coin")
actor(35, 85, "sheep")

sign(52, 78, "CROW: STEALS SHINY THINGS, FLIES OVER WATER")
rect(52, 80, 66, 90, "w")
rect(59, 80, 59, 90, "0") // the strip to bump it on
grid[85][56] = "0"
item(56, 85, "key")
grid[85][63] = "0"
actor(63, 85, "crow", "left")
item(68, 84, "coin")
item(68, 86, "coin")

// ---------------------------------------------------------------------
// a small town square where the townsfolk live (see game-ideas-5.md)

rect(30, 96, 38, 98, "c") // the way down from the showcase floor
rect(2, 98, 70, 130, "c")
sign(36, 99, "TOWN: BUMP INTO PEOPLE TO TALK")
const house = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  door: number,
) => {
  rect(x0, y0, x1, y1, "1")
  rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, "d")
  grid[y1][door] = "d"
  prop(x0 + 2, y0 + 2, "table")
  prop(x0 + 3, y0 + 2, "stool")
}
house(4, 101, 14, 108, 9)
house(56, 101, 66, 108, 61)
house(4, 118, 14, 126, 9)
// the stall: the keeper minds it from behind the counter
rect(30, 101, 38, 103, "1")
rect(31, 102, 37, 102, "d")
grid[103][34] = "c"
prop(34, 103, "shop", { sells: "mushroom", price: 3 })
actor(34, 102, "keeper", "down")
// the fountain and the benches around it
rect(33, 113, 35, 115, "w")
prop(30, 114, "stool")
prop(38, 114, "stool")
prop(34, 118, "table")
prop(22, 110, "lantern")
prop(46, 110, "lantern")
prop(50, 122, "table")
prop(51, 122, "stool")
// town props (grayscale, after the FFV town tiles): shop signboards by
// the doors and the stall, barrels, a well, flower beds, a notice board
prop(11, 108, "sign-inn")
prop(63, 108, "sign-pub")
prop(11, 126, "sign-weapon")
prop(36, 101, "sign-item")
prop(15, 104, "barrel")
prop(15, 105, "barrel")
prop(55, 106, "jar")
prop(29, 102, "jar")
prop(24, 116, "well")
for (const x of [18, 19, 20, 40, 41, 42]) prop(x, 100, "flowers")
for (const x of [32, 36]) prop(x, 112, "flowers")
prop(40, 99, "notice-board", {
  text: "TOWN NEWS: THE KIDS ARE LOOKING FOR A NEW PLAYMATE",
})
actor(12, 111, "villager")
actor(28, 107, "villager2")
actor(44, 112, "villager")
actor(60, 112, "villager2")
actor(20, 124, "kid")
actor(25, 127, "kid")
actor(30, 124, "kid")
actor(16, 113, "cat")
actor(52, 105, "cat")

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

// sections shown on screen as "ZOO-<section>" (see tools/rooms.ts)
const { rooms, room } = createRooms(BI, BJ)
room("CELLS", 0, 8, 199, 16)
room("ITEMS", 0, 18, 199, 24)
room("PROPS", 0, 26, 199, 32)
room("GATES", 0, 34, 199, 42)
room("ACTORS", 0, 44, 199, 54)
room("COMBOS", 0, 56, 199, 64)
room("WALLS", 0, 66, 199, 74)
room("ANIMALS", 0, 76, 199, 95)
room("TOWN", 0, 96, 199, 131)

const json = {
  i: BI,
  j: BJ,
  name: "ZOO",
  rooms,
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
