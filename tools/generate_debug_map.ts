// Generates the debug map (block_10000.-10000): a compact block that
// lists EVERY actor, item and prop of the catalog at once, each with
// a labeled sign, so all of them can be checked in one screen-ish
// area. Unlike the preview zoo, the lists are derived from the catalog
// itself, so a newly added spawn type shows up here automatically.
//
// To the right of it, walled off and reached by a portal at the top, the
// GROUPS area: the puzzles run by finite groups (ideas/groups.md), each
// in a bay of its own, with a RESET to play them again.
//
// It also links the block from the start island: a "DEBUG" portal room
// is carved to the left of the start corridor (mirroring the tutorial
// portal room on the right).
//
// Usage: deno -A tools/generate_debug_map.ts
import { loadCatalog } from "../model/catalog.ts"
import { validate } from "../util/json-schema.ts"
import { ODD_FAMILIES, unlikeType } from "../model/odd-families.ts"
import {
  type Arrangement,
  type Cycles,
  isIdentity,
  MIRROR,
  MURAL_POSE,
  poseStage,
  pullAll,
  same,
  tokenAt,
  TURN,
} from "../model/group.ts"

const SIZE = 200
const BI = 10000
const BJ = -10000

/** Where the player lands (local coords) */
const ARRIVAL = { i: 2, j: 4 }
/** The start position of the game (see game/game-screen.ts) */
const START = { i: -9964, j: -9981 }

type Spawn = {
  i: number
  j: number
  type: string
  dir?: string
  data?: unknown
}

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
  shop: { sells: "mushroom", price: 1 },
  "race-goal": { course: "debug", par: 600, reward: 3 },
  "apple-gate": { count: 1 },
  switch: { group: "debug-sw" },
  waystone: { id: "DEBUG", name: "DEBUG" },
  "latch-gate": { id: "DEBUG", dir: "up" },
  "post-box": { town: "DEBUG", routes: [{ town: "DEBUG", reward: 1 }] },
  "trade-stall": { town: "DEBUG", good: "DEBRIS", cost: 1, prices: {} },
  pane: { shard: "shard-sky" },
  ferry: { to: "NOWHERE", path: "", land: "d" },
  "rabbit-hole": { id: "sample" },
  "fox-den": { id: "sample" },
  beehive: { id: "sample" },
  "pen-gate": { id: "sample", i0: 0, j0: 0, i1: 0, j1: 0, count: 99 },
  "guide-sage": { text: "SAGE: DEBUG LIES NORTH, ABOUT 50 STEPS" },
  "guide-sailor": { text: "SAILOR: DEBUG LIES EAST, ABOUT 50 STEPS" },
  "guide-farmer": { text: "FARMER: DEBUG LIES SOUTH, ABOUT 50 STEPS" },
  "guide-bard": { text: "BARD: DEBUG LIES WEST, ABOUT 50 STEPS" },
  waygate: { id: "DEBUG", name: "DEBUG", i: BI + ARRIVAL.i, j: BJ + ARRIVAL.j },
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
  "ring-slot": { id: "debug", kind: "stone" },
  "ring-heart": { id: "debug" },
  "goal-bell": { id: "debug-bell" },
  "pair-plinth": { id: "debug-pair", want: "stone" },
  "pair-twin": { id: "debug-pair", holds: "stone" },
  "clear-dais": { id: "debug-dais" },
  "gaze-statue": { id: "debug-gaze", dir: "down", to: [BI, BJ] },
  "gaze-sun": { id: "debug-gaze" },
  "patrol-beacon": { id: "debug-beacon" },
  "fold-gate": { id: "debug-fold", i0: BI, j0: BJ, i1: BI, j1: BJ },
  "chain-wanter": { id: "debug-chain", k: 0, n: 1, want: "jar", dir: "down" },
  // the parts of the group puzzles (the GROUPS area has them at work)
  "group-lever": { group: "debug-group", cycles: [[0, 1]] },
  "group-stone": { group: "debug-group", place: 0 },
  "group-moai": { group: "debug-moai" },
  "group-door": { group: "debug-group", id: "debug-group", target: [1, 0] },
  "group-bell": { group: "debug-group" },
  // undoes the goals above (their ids start with "debug")
  "goal-reset": {
    prefix: "debug",
    box: [BI, BJ, BI + SIZE - 1, BJ + SIZE - 1],
    to: [BI + ARRIVAL.i, BJ + ARRIVAL.j],
  },
  // the odd ones out: each its own id (one found is not all found)
  ...Object.fromEntries(
    ODD_FAMILIES.map((f) => [unlikeType(f), { id: `debug-${f}` }]),
  ),
}

/** Extra notes shown on the label sign of some props */
const NOTES: Record<string, string> = {
  "reset-portal": "WIPES THE SAVE!",
  "goal-reset": "UNDOES THE GOALS OF THIS MAP ONLY",
  "goal-bell": "A THING BUMPED INTO IT RINGS IT, A KNOCK DOESN'T",
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
/** The bait rooms (docs/item-tools.md): try the tools, apple and fish */
const BAIT_Y = GARDEN_Y + 2 + GARDEN_ROWS * (PLOT_H + 2) + 1
/** The top of the bait rooms (11 high, the way in at the bottom) */
const BAIT_ROOM_Y = BAIT_Y + 4
/** The animal homes (ideas/animal-homes.md), below the bait rooms */
const HOMES_Y = BAIT_ROOM_Y + 14
const height = HOMES_Y + 18
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
    prop(cx - 1, y - 1, "chest", { drops: "bread", count: 2 })
    sign(cx + 2, y - 1, "PUSH BOTH: COINS AND BREAD IN ONE PILE")
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

// the bait rooms: choose a tool (X or the buttons below the screen) and
// put it down with space. Each room's door opens while someone stands
// on its plate, and the plate is too far from the door to hold it
// yourself: the apple draws the chaser onto it, the fish the cat
letters(2, BAIT_Y, "BAIT")
sign(7, BAIT_Y, "BAIT: X (OR THE BUTTONS) CHOOSES WHAT TO PUT. SPACE PUTS IT")
prop(14, 4, "portal", { i: BI + 3, j: BJ + BAIT_Y + 2 })
sign(15, 4, "PORTAL: TO THE BAIT ROOMS (THE TOOLS)")
prop(2, BAIT_Y + 2, "portal", { i: BI + 13, j: BJ + 4 })
sign(4, BAIT_Y + 2, "SUPPLIES. A FISH COMES BACK WHEN YOU COME BACK")
for (let x = 6; x <= 11; x++) item(x, BAIT_Y + 2, "apple")
item(18, BAIT_Y + 2, "fish")
rect(20, BAIT_Y + 1, 23, BAIT_Y + 2, "w")
{
  /** A walled room, (x0, y0) its top left wall, open at the bottom */
  const room = (x0: number, w: number, way: number, text: string) => {
    const y0 = BAIT_ROOM_Y
    rect(x0, y0, x0 + w - 1, y0 + 10, "1")
    rect(x0 + 1, y0 + 1, x0 + w - 2, y0 + 9, "0")
    rect(x0 + way - 1, y0 + 10, x0 + way + 1, y0 + 10, "0")
    sign(x0 + way - 2, y0 + 11, text)
    return { x: x0 + 1, y: y0 + 1 }
  }
  /** A wall across the room at column x, a door in it at row y */
  const doorWall = (x: number, y: number, top: number, group: string) => {
    rect(x, top, x, top + 8, "1")
    rect(x, y, x, y, "0")
    prop(x, y, "door", { group })
  }

  // A: the apple draws the chaser onto the plate. It sits there, full,
  // for 6 seconds
  {
    const r = room(2, 15, 7, "APPLE: THE CHASER EATS IT, THEN SITS ON IT")
    prop(r.x + 1, r.y + 1, "plate", { group: "bait-a" })
    actor(r.x + 6, r.y + 4, "chaser")
    doorWall(r.x + 10, r.y + 4, r.y, "bait-a")
    item(r.x + 12, r.y + 4, "coin-bag")
  }
  // B: the fish draws the cat onto the plate. It sleeps there for 20
  // seconds. A pond to fish in
  {
    const r = room(18, 19, 9, "FISH: THE CAT EATS IT, THEN SLEEPS ON IT")
    prop(r.x + 2, r.y + 1, "plate", { group: "bait-b" })
    actor(r.x + 5, r.y + 2, "cat")
    rect(r.x + 1, r.y + 6, r.x + 3, r.y + 7, "w")
    // a fish lying in the room would be eaten at once: it waits outside
    item(r.x + 9, r.y + 11, "fish")
    doorWall(r.x + 14, r.y + 4, r.y, "bait-b")
    item(r.x + 16, r.y + 4, "gem")
  }
  // D: two doors, two plates, both at once. The apple for the chaser,
  // the fish for the cat, and the long sleeper first
  {
    const r = room(58, 23, 6, "BOTH PLATES AT ONCE: WHO GETS WHICH, AND FIRST?")
    prop(r.x + 1, r.y + 1, "plate", { group: "bait-d1" })
    prop(r.x + 1, r.y + 7, "plate", { group: "bait-d2" })
    // the halves: the chaser above, the cat below
    rect(r.x, r.y + 4, r.x + 11, r.y + 4, "1")
    actor(r.x + 6, r.y + 1, "chaser")
    actor(r.x + 4, r.y + 7, "cat")
    // the bait waits outside, out of the animals' reach
    item(r.x + 12, r.y + 11, "apple")
    item(r.x + 13, r.y + 11, "apple")
    item(r.x + 14, r.y + 11, "fish")
    rect(r.x + 13, r.y, r.x + 15, r.y + 1, "w")
    doorWall(r.x + 17, r.y + 4, r.y, "bait-d1")
    doorWall(r.x + 19, r.y + 4, r.y, "bait-d2")
    item(r.x + 20, r.y + 4, "big-candy")
  }
}

// the animal homes (model/den.ts): a warren, a sheep pen, a fox's den
// and a beehive on a meadow
letters(2, HOMES_Y, "HOMES")
sign(8, HOMES_Y, "ANIMAL HOMES: A WARREN, A PEN, A DEN AND A HIVE")
prop(22, 4, "portal", { i: BI + 3, j: BJ + HOMES_Y + 2 })
sign(23, 4, "PORTAL: TO THE ANIMAL HOMES")
prop(2, HOMES_Y + 2, "portal", { i: BI + 21, j: BJ + 4 })
rect(1, HOMES_Y + 4, 60, HOMES_Y + 17, "6")
{
  const y = HOMES_Y + 5
  // the warren: four holes, three rabbits, apples to hold one still
  sign(2, y, "WARREN: COME CLOSE AND THEY BOLT. AN APPLE HOLDS ONE")
  for (const [dx, dy] of [[0, 2], [7, 1], [1, 9], [8, 8]]) {
    prop(3 + dx, y + dy, "rabbit-hole", { id: "debug" })
  }
  for (const [dx, dy] of [[4, 4], [5, 5], [3, 6]]) {
    actor(3 + dx, y + dy, "rabbit")
  }
  // the apples wait by the portal, out of the rabbits' reach
  for (let x = 13; x <= 15; x++) item(x, HOMES_Y + 2, "apple")
  // the pen: a 9 x 7 fence, the gate at the bottom, the flock outside
  const px = 16, py = y + 1
  rect(px, py, px + 8, py + 6, "H")
  rect(px + 1, py + 1, px + 7, py + 5, "6")
  // the gateway, three wide
  rect(px + 3, py + 6, px + 5, py + 6, "6")
  for (let x = px + 3; x <= px + 5; x++) {
    prop(x, py + 6, "pen-gate", {
      id: "debug",
      i0: BI + px + 1,
      j0: BJ + py + 1,
      i1: BI + px + 7,
      j1: BJ + py + 5,
      count: 3,
    })
  }
  sign(
    px + 5,
    py + 7,
    "THE SHEPHERD'S FOLD: THE GATE SHUTS ON A FULL FOLD OF THREE",
  )
  actor(px + 2, py + 9, "sheep")
  actor(px + 5, py + 10, "sheep")
  actor(px + 7, py + 9, "sheep")
  // the fox's den: the fox beside it, fish and a pond to fish in
  sign(30, y, "FOX'S DEN: THE FOX GUARDS ITS HOARD. A FISH PUTS IT TO SLEEP")
  rect(31, y + 1, 37, y + 1, "1")
  prop(34, y + 2, "fox-den", { id: "debug" })
  actor(36, y + 4, "fox")
  rect(30, y + 9, 32, y + 10, "w")
  item(34, y + 11, "fish")
  // the beehive: the bees go out to the flowers by turns
  sign(44, y, "BEEHIVE: THE BEES GO OUT TO THE FLOWERS BY TURNS")
  prop(48, y + 4, "beehive", { id: "debug" })
}

// ---------------------------------------------------------------------
// the GROUPS area (ideas/groups.md, model/group-lever.ts): puzzles run by
// finite groups, each in a walled bay of its own, to the right of the
// rest of the map and walled off from it (reached by the portal at the
// top). Each bay has a sign with its one rule below it and, for
// debugging, a sign with its group and a solution. A door's target is
// made from its solution, so every door can be opened

/** The top left of the GROUPS area and where the player lands in it */
const GX = 106
const GY = 2
const GROUPS_ARRIVAL = { i: GX + 3, j: GY + 3 }
/** The area's bounds (local, inclusive), the floor round the bays */
const GROUPS_BOX = [GX - 1, GY - 1, GX + 62, GY + 44] as const
/** The goal ids of the area start with this (the RESET's prefix) */
const GROUPS_PREFIX = "groups-"

rect(GROUPS_BOX[0], GROUPS_BOX[1], GROUPS_BOX[2], GROUPS_BOX[3], "0")
letters(GX, GY, "GROUPS")
sign(
  GX + 7,
  GY,
  "GROUPS: PUZZLES RUN BY FINITE GROUPS. A LEVER SWAPS OR TURNS THE STONES IT IS TIED TO. MATCH THE MURAL",
)
prop(30, 4, "portal", { i: BI + GROUPS_ARRIVAL.i, j: BJ + GROUPS_ARRIVAL.j })
sign(31, 4, "PORTAL: TO THE GROUPS (PUZZLES RUN BY FINITE GROUPS)")
prop(GX, GY + 3, "portal", { i: BI + 29, j: BJ + 4 })
sign(GX + 1, GY + 3, "PORTAL: BACK TO THE DEBUG MAP")
prop(GROUPS_ARRIVAL.i, GROUPS_ARRIVAL.j, "portal-out")
prop(GX + 6, GY + 3, "goal-reset", {
  prefix: GROUPS_PREFIX,
  box: [
    BI + GROUPS_BOX[0],
    BJ + GROUPS_BOX[1],
    BI + GROUPS_BOX[2],
    BJ + GROUPS_BOX[3],
  ],
  to: [BI + GROUPS_ARRIVAL.i, BJ + GROUPS_ARRIVAL.j],
})
sign(GX + 7, GY + 3, "RESET: THE GROUP PUZZLES BACK AS NEW, TO PLAY AGAIN")

/** A bay: (x, y) its top left wall, open at the bottom middle */
type Bay = { x: number; y: number; w: number; h: number; group: string }
/**
 * Walls a bay in, with its rule sign and its debug sign below it. The
 * group's id is the bay's (the stones and levers of a bay are its own)
 */
function bay(
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  rule: string,
  debug: string,
): Bay {
  rect(x, y, x + w - 1, y + h - 1, "1")
  rect(x + 1, y + 1, x + w - 2, y + h - 2, "0")
  const mid = x + Math.floor(w / 2)
  rect(mid - 1, y + h - 1, mid + 1, y + h - 1, "0")
  sign(x + 1, y + h, rule)
  sign(x + w - 2, y + h, `DEBUG: ${debug}`)
  return { x, y, w, h, group: `${GROUPS_PREFIX}${name}` }
}

/** The levers of a bay, by name: where things go, and their look */
type LeverSpec = { cycles: Cycles; look: number }
const SWAP = 0, TURNS = 1, MIRRORS = 2, FLAT = 3

const lever = (b: Bay, dx: number, dy: number, name: string, l: LeverSpec) =>
  prop(b.x + dx, b.y + dy, "group-lever", {
    group: b.group,
    cycles: l.cycles,
    name,
    look: l.look,
  })
const stoneAt = (b: Bay, dx: number, dy: number, place: number) =>
  prop(b.x + dx, b.y + dy, "group-stone", { group: b.group, place })

/**
 * The door in the bay's top right corner, a vault behind it where its
 * letter comes up. Its target is its solution's word pulled from e
 */
function door(b: Bay, solution: Cycles[]): Arrangement {
  const target = pullAll(solution)
  if (isIdentity(target)) throw new Error(`${b.group}: the target is e`)
  const vx = b.x + b.w - 2, vy = b.y + 1
  rect(vx - 1, vy, vx - 1, vy, "1")
  prop(vx, vy + 1, "group-door", {
    group: b.group,
    id: b.group,
    target,
    reward: [BI + vx, BJ + vy],
  })
  return target
}

/** The mural tiles of a target of stones, at the places' cells */
const muralOf = (
  b: Bay,
  target: Arrangement,
  cells: readonly [number, number][],
) =>
  cells.forEach(([dx, dy], place) =>
    prop(b.x + dx, b.y + dy, "group-mural", { show: tokenAt(target, place) })
  )

/** A row of stones 2 apart from (dx, dy), the levers between them */
const rowCells = (dx: number, dy: number, n: number) =>
  [...Array(n).keys()].map((k) => [dx + 2 * k, dy] as [number, number])

// row A: the stones (S3, S4), the turning Moai (Z4, D4), the bell
const ROW_A = GY + 6
{
  // 1. three standing stones: S3
  const b = bay(
    GX,
    ROW_A,
    11,
    9,
    "s3",
    "THREE STONES. THE LEFT LEVER SWAPS THE LEFT PAIR, THE RIGHT ONE THE RIGHT PAIR. SET THEM AS THE MURAL",
    "S3 (6 STATES). SOLUTION: LEFT, THEN RIGHT. RIGHT THEN LEFT IS NOT IT: THE ORDER MATTERS",
  )
  const l = { cycles: [[0, 1]], look: SWAP },
    r = { cycles: [[1, 2]], look: SWAP }
  const target = door(b, [l.cycles, r.cycles])
  if (same(target, pullAll([r.cycles, l.cycles]))) {
    throw new Error("S3 commutes")
  }
  muralOf(b, target, rowCells(2, 1, 3))
  rowCells(2, 3, 3).forEach(([dx, dy], place) => stoneAt(b, dx, dy, place))
  lever(b, 3, 4, "l", l)
  lever(b, 5, 4, "r", r)
}
{
  // 2. four standing stones: S4
  const b = bay(
    GX + 12,
    ROW_A,
    13,
    9,
    "s4",
    "FOUR STONES. EACH LEVER SWAPS THE TWO STONES EITHER SIDE OF IT. SET THEM AS THE MURAL",
    "S4 (24 STATES). THE MURAL IS THE ROW REVERSED. SOLUTION: 1 2 3 1 2 1 (LEVERS LEFT TO RIGHT), 6 SWAPS",
  )
  const swaps = [0, 1, 2].map((k) => ({ cycles: [[k, k + 1]], look: SWAP }))
  const [s1, s2, s3] = swaps.map((s) => s.cycles)
  const target = door(b, [s1, s2, s3, s1, s2, s1])
  muralOf(b, target, rowCells(2, 1, 4))
  rowCells(2, 3, 4).forEach(([dx, dy], place) => stoneAt(b, dx, dy, place))
  swaps.forEach((s, k) => lever(b, 3 + 2 * k, 4, `s${k + 1}`, s))
}
{
  // 3a. the turning Moai: Z4
  const b = bay(
    GX + 26,
    ROW_A,
    11,
    9,
    "z4",
    "THE MOAI. THE LEVER TURNS IT A QUARTER, CLOCKWISE. TURN IT TO LOOK AS ON THE MURAL",
    "Z4 (4 STATES, THE TURN HAS ORDER 4). SOLUTION: TURN TWICE",
  )
  const turn = { cycles: TURN, look: TURNS }
  const target = door(b, [TURN, TURN])
  prop(b.x + 4, b.y + 1, "group-mural", {
    show: MURAL_POSE + poseStage(target),
  })
  prop(b.x + 4, b.y + 3, "group-moai", { group: b.group })
  lever(b, 4, 5, "t", turn)
}
{
  // 3b. the turning and mirrored Moai: D4
  const b = bay(
    GX + 38,
    ROW_A,
    11,
    9,
    "d4",
    "THE MOAI AGAIN. ONE LEVER TURNS IT, ONE MIRRORS IT LEFT TO RIGHT (THE RING IN ITS RIGHT EAR SHOWS WHICH). LOOK AS ON THE MURAL",
    "D4 (8 STATES, R^4 = S^2 = E, SRS = R^-1). SOLUTION: MIRROR, THEN TURN. TURN THEN MIRROR LOOKS RIGHT",
  )
  const target = door(b, [MIRROR, TURN])
  prop(b.x + 4, b.y + 1, "group-mural", {
    show: MURAL_POSE + poseStage(target),
  })
  prop(b.x + 4, b.y + 3, "group-moai", { group: b.group })
  lever(b, 3, 5, "t", { cycles: TURN, look: TURNS })
  lever(b, 5, 5, "m", { cycles: MIRROR, look: MIRRORS })
}
{
  // 7. the identity bell: orders
  const b = bay(
    GX + 50,
    ROW_A,
    11,
    9,
    "bell",
    "THE BELL RINGS WHEN THE STONES ARE BACK AS THEY BEGAN. THE SWAP: AFTER 2. THE TURN: AFTER 3. RING IT USING BOTH",
    "ORDERS IN S3: SWAP 2, TURN 3, SWAP+TURN 2. SOLUTION: SWAP, TURN, SWAP, TURN",
  )
  rowCells(2, 3, 3).forEach(([dx, dy], place) => stoneAt(b, dx, dy, place))
  lever(b, 3, 5, "s", { cycles: [[0, 1]], look: SWAP })
  lever(b, 5, 5, "c", { cycles: [[0, 1, 2]], look: TURNS })
  prop(b.x + 8, b.y + 2, "group-bell", {
    group: b.group,
    id: b.group,
    need: ["s", "c"],
    reward: [BI + b.x + 8, BJ + b.y + 4],
  })
}

// row B: the same four states (Z4, Z2xZ2), the patrol's clock, the
// boulders' words
const ROW_B = ROW_A + 12
{
  // 4. same four states, different rooms
  const square = [[5, 2], [6, 2], [5, 3], [6, 3]] as [number, number][]
  const mural = [[2, 1], [3, 1], [2, 2], [3, 2]] as [number, number][]
  const a = bay(
    GX,
    ROW_B,
    11,
    9,
    "z4-dial",
    "FOUR STONES, ONE DIAL: IT TURNS THEM ROUND THE SQUARE. 4 STATES. SET THEM AS THE MURAL",
    "Z4: EVERY STATE IS SOME TURNS OF THE DIAL (ORDER 4). SOLUTION: DIAL TWICE",
  )
  const dial = { cycles: [[0, 1, 3, 2]], look: TURNS }
  muralOf(a, door(a, [dial.cycles, dial.cycles]), mural)
  square.forEach(([dx, dy], place) => stoneAt(a, dx, dy, place))
  lever(a, 5, 5, "d", dial)

  const b = bay(
    GX + 12,
    ROW_B,
    11,
    9,
    "z2xz2",
    "THE SAME FOUR STONES, TWO TOGGLES: LEFT FOR RIGHT, TOP FOR BOTTOM. 4 STATES TOO. SET THEM AS THE MURAL",
    "Z2xZ2: EVERY LEVER AND STATE UNDOES ITSELF, NOTHING HAS ORDER 4. SOLUTION: BOTH TOGGLES, EITHER ORDER",
  )
  const cols = { cycles: [[0, 1], [2, 3]], look: SWAP }
  const rows = { cycles: [[0, 2], [1, 3]], look: SWAP }
  muralOf(b, door(b, [cols.cycles, rows.cycles]), mural)
  square.forEach(([dx, dy], place) => stoneAt(b, dx, dy, place))
  lever(b, 5, 5, "x", cols)
  lever(b, 6, 5, "y", rows)
}
{
  // 5. the patrol's clock: it pulls the levers at both ends of its lane,
  // swapping the left pair and back; pull yours at the right moment
  const b = bay(
    GX + 24,
    ROW_B,
    13,
    10,
    "clock",
    "THE WATCH PULLS A LEVER AT EACH END OF ITS WALK: THE LEFT PAIR SWAPS, AND BACK. YOURS SWAPS THE RIGHT PAIR. WHEN YOU PULL IT MATTERS",
    "S3 WITH A CLOCK OF ORDER 2. SOLUTION: PULL WHILE THE LEFT PAIR IS SWAPPED, THEN WAIT ONE TICK (A B A = C B A)",
  )
  const a = { cycles: [[0, 1]], look: SWAP }
  const own = { cycles: [[1, 2]], look: SWAP }
  // the lane along the top, walled from the rest
  rect(b.x + 1, b.y + 2, b.x + 8, b.y + 2, "1")
  rect(b.x + 8, b.y + 1, b.x + 8, b.y + 1, "1")
  lever(b, 1, 1, "a", a)
  lever(b, 7, 1, "a", a)
  actors.push({
    i: BI + b.x + 4,
    j: BJ + b.y + 1,
    type: "patrol",
    dir: "right",
  })
  const target = door(b, [a.cycles, own.cycles, a.cycles])
  muralOf(b, target, rowCells(3, 3, 3))
  rowCells(3, 5, 3).forEach(([dx, dy], place) => stoneAt(b, dx, dy, place))
  lever(b, 6, 6, "b", own)
}
{
  // 6. the boulders' words: each lane's boulder rolls over flat levers in
  // its order; which lanes, in which order, is the word
  const b = bay(
    GX + 38,
    ROW_B,
    15,
    13,
    "words",
    "PUSH A BOULDER ALONG ITS LANE: IT PULLS THE FLAT LEVERS IT ROLLS OVER, IN ORDER. A: THE LEFT PAIR, B: THE RIGHT PAIR",
    "S3 IN WORDS. LANES: TOP A B, MIDDLE B A, BOTTOM B. SOLUTION: BOTTOM THEN TOP, OR MIDDLE THEN BOTTOM (B A B)",
  )
  const a: Cycles = [[0, 1]], bb: Cycles = [[1, 2]]
  const flat = (dx: number, dy: number, name: string, cycles: Cycles) =>
    prop(b.x + dx, b.y + dy, "group-lever", {
      group: b.group,
      cycles,
      name,
      look: FLAT,
      over: true,
    })
  // the lanes, walled from each other; the way along their left ends
  for (const dy of [4, 6, 8, 10]) {
    rect(b.x + 2, b.y + dy, b.x + 9, b.y + dy, "1")
  }
  rect(b.x + 9, b.y + 4, b.x + 9, b.y + 10, "1")
  const lanes: [string, Cycles][][] = [
    [["a", a], ["b", bb]],
    [["b", bb], ["a", a]],
    [["b", bb]],
  ]
  lanes.forEach((word, n) => {
    const dy = 5 + 2 * n
    actor(b.x + 2, b.y + dy, "boulder")
    word.forEach(([name, cycles], k) =>
      flat(word.length === 1 ? 5 : 4 + 2 * k, dy, name, cycles)
    )
  })
  const target = door(b, [bb, a, bb])
  muralOf(b, target, rowCells(3, 1, 3))
  rowCells(3, 3, 3).forEach(([dx, dy], place) => stoneAt(b, dx, dy, place))
}

// row C: the odd group out. S3 as stones, D3 as a triangle turned and
// flipped, Z6 as a ring of six on a dial: knock on the odd one's plaque
const ROW_C = ROW_B + 15
{
  const ODD = `${GROUPS_PREFIX}odd`
  const plaque = (b: Bay, odd: boolean) =>
    prop(b.x + 8, b.y + 3, "group-mural", {
      id: ODD,
      odd,
      ...(odd ? { reward: [BI + b.x + 8, BJ + b.y + 5] } : {}),
    })
  const debug =
    "S3 ~= D3 (6 STATES, NOT COMMUTATIVE, ORDERS 1 2 3). Z6 COMMUTES AND ITS DIAL HAS ORDER 6. SOLUTION: THE RING'S PLAQUE"
  const s3 = bay(
    GX,
    ROW_C,
    11,
    9,
    "odd-s3",
    "THREE ROOMS, THREE GROUPS. TWO ARE THE SAME GROUP IN DISGUISE. KNOCK ON THE PLAQUE OF THE ODD ONE OUT. HERE: TWO SWAPS",
    debug,
  )
  rowCells(2, 3, 3).forEach(([dx, dy], place) => stoneAt(s3, dx, dy, place))
  lever(s3, 3, 4, "l", { cycles: [[0, 1]], look: SWAP })
  lever(s3, 5, 4, "r", { cycles: [[1, 2]], look: SWAP })
  plaque(s3, false)

  const d3 = bay(
    GX + 12,
    ROW_C,
    11,
    9,
    "odd-d3",
    "HERE: A TRIANGLE OF STONES, TURNED A THIRD, OR FLIPPED LEFT FOR RIGHT",
    debug,
  )
  // the corners clockwise: the top, the bottom right, the bottom left
  for (const [dx, dy, place] of [[4, 2, 0], [5, 4, 1], [3, 4, 2]]) {
    stoneAt(d3, dx, dy, place)
  }
  lever(d3, 3, 6, "t", { cycles: [[0, 1, 2]], look: TURNS })
  lever(d3, 5, 6, "f", { cycles: [[1, 2]], look: MIRRORS })
  plaque(d3, false)

  const z6 = bay(
    GX + 24,
    ROW_C,
    11,
    9,
    "odd-z6",
    "HERE: A RING OF SIX STONES ON A DIAL, EACH PULL ONE PLACE ROUND",
    debug,
  )
  // the ring clockwise: the top row left to right, the bottom right to left
  for (
    const [dx, dy, place] of [
      [3, 2, 0],
      [4, 2, 1],
      [5, 2, 2],
      [5, 3, 3],
      [4, 3, 4],
      [3, 3, 5],
    ]
  ) stoneAt(z6, dx, dy, place)
  lever(z6, 4, 5, "d", { cycles: [[0, 1, 2, 3, 4, 5]], look: TURNS })
  plaque(z6, true)
}

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
    if (li < 1 || li > SIZE - 2 || lj < 1 || lj > SIZE - 2) {
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
