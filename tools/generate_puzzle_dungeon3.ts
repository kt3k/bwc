// Generates the third floor of the puzzle dungeon (block_400.400),
// reached by the portal inside the second floor's vault. Ten rooms,
// each built around a different kind of challenge so that no two feel
// alike (see game-ideas-3.md, section C):
//
// - T1 ice bumpers: slide into the switch; blue/red walls are stoppers
// - T2 the gap for the boulder: align the sliding gap with the plate row
// - T3 the riddle of order: unlabeled buttons, the signs tell the order
// - T4 fish through the shutters: carry a fish, no jumping, on the clock
// - T5 freeze the metronome: a tree in the patrol lane fixes the state
// - T6 the five lights: chained switches, light them all
// - T7 the chain of clocks: two timer runs back to back
// - T8 the bridge and the far switch: a boulder crosses a boulder bridge
// - T9 the highway: patrols knock you back, cross between them
// - T10 the vault of choice: two keys on the floor, three key gates
//
// The layout is verified: a state-aware ice solver for T1, a brute
// force for T6, path-length checks for the timer runs, and sealed /
// solved reachability for every reward.
//
// Usage: deno -A tools/generate_puzzle_dungeon3.ts
import { loadCatalog } from "../model/catalog.ts"

const SIZE = 200
const BI = 400
const BJ = 400

type Spawn = {
  i: number
  j: number
  type: string
  dir?: string
  speed?: number
  data?: unknown
}

const grid: string[][] = Array.from(
  { length: SIZE },
  () => Array(SIZE).fill("2"),
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

const actor = (
  i: number,
  j: number,
  type: string,
  opts: { dir?: string; speed?: number } = {},
) => actors.push({ i: i + BI, j: j + BJ, type, ...opts })
const item = (i: number, j: number, type: string) =>
  items.push({ i: i + BI, j: j + BJ, type })
const prop = (i: number, j: number, type: string, data?: unknown) =>
  props.push({ i: i + BI, j: j + BJ, type, data })
const sign = (i: number, j: number, text: string) =>
  prop(i, j, "sign", { text })
/** A walled alcove: walls on the given rect, floor inside */
const alcove = (x0: number, y0: number, x1: number, y1: number) => {
  rect(x0, y0, x1, y1, "2")
  rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, "m") // alcoves get the mosaic floor
}
/** A blocking prop on a carved floor cell */
const gate = (i: number, j: number, type: string, data?: unknown) => {
  grid[j][i] = "6"
  prop(i, j, type, data)
}

// ---------------------------------------------------------------------
// skeleton: plaza, two spines, three vertical corridors, room stubs

rect(4, 40, 196, 44, "6") // spine A
rect(4, 110, 196, 114, "6") // spine B
for (const x of [52, 102, 152]) rect(x, 40, x + 2, 192, "6")

// plaza (entry from the B2F vault)
rect(80, 6, 120, 38, "c") // cobbled plaza
rect(98, 38, 102, 40, "6")
prop(100, 20, "portal-out")
prop(96, 20, "portal", { i: 300, j: 560 }) // back to the B2F vault
sign(104, 20, "DUNGEON B3F: TEN MIXED TRIALS")
sign(93, 20, "BACK TO B2F")
prop(110, 30, "shop", { sells: "mushroom", price: 5 })
prop(113, 30, "shop", { sells: "seed", price: 3 })
sign(107, 30, "SHOP: PUSH TO BUY")
sign(100, 34, "KEYS ARE HIDDEN IN THE TRIALS. THE VAULT IS EAST")
grid[10][85] = "x" // dig spot
item(115, 12, "mushroom")
// The way down to the fourth floor (block_400.200)
sign(87, 30, "B4F: THE CLOCKWORK")
prop(84, 30, "portal", { i: 500, j: 220 })

// row 1 rooms (y 46..108) and their door stubs on spine A
const ROW1: [number, number][] = [[6, 50], [56, 100], [106, 150], [156, 194]]
const ROW2: [number, number][] = [[6, 50], [56, 100], [106, 150], [156, 194]]
for (const [x0, x1] of ROW1) {
  const c = Math.floor((x0 + x1) / 2)
  rect(c - 1, 45, c + 1, 45, "6")
}
for (const [x0, x1] of ROW2) {
  const c = Math.floor((x0 + x1) / 2)
  rect(c - 1, 115, c + 1, 115, "6")
}

// ---------------------------------------------------------------------
// T1 (row 1, west): ice bumpers -> key 1
//
// The whole room is an ice rink walled in. Sliding into the switch
// presses it; the blue and red walls are stoppers that only exist in
// one of the two states, so the route to the island is a sequence of
// slides and one flip.

rect(26, 46, 30, 51, "6") // entry strip
rect(10, 52, 46, 104, "i") // the rink
rect(26, 74, 30, 78, "6") // the island
item(28, 76, "key")
item(27, 75, "coin")
item(29, 77, "coin")
// the island's ring of pegs, open only at the blue wall
for (let x = 25; x <= 31; x++) {
  grid[73][x] = "2"
  grid[79][x] = "2"
}
for (let y = 74; y <= 78; y++) {
  grid[y][25] = "2"
  grid[y][31] = "2"
}
grid[73][28] = "i"
grid[64][28] = "2" // peg
grid[60][16] = "2" // pegs for detours
grid[90][38] = "2"
grid[84][14] = "2"
prop(46, 63, "switch", { group: "t1" })
prop(45, 72, "red-wall", { group: "t1" })
prop(27, 71, "red-wall", { group: "t1" })
prop(28, 73, "blue-wall", { group: "t1" })
prop(16, 100, "blue-wall", { group: "t1" })
item(10, 63, "coin")
item(46, 104, "coin")
item(10, 104, "coin")
sign(26, 48, "SLIDE INTO THE SWITCH. BLUE AND RED STOP YOU IN TURN")

// ---------------------------------------------------------------------
// T2 (row 1, center-west): the gap for the boulder -> chest
//
// Three boulders face a wall of sliding cells. Only the middle row has
// a plate behind the wall, and only a parked boulder can hold the door.

rect(56, 46, 100, 108, "6")
rect(72, 52, 72, 108, "2") // the dividing wall (open along the top rows)
for (let k = 0; k < 11; k++) {
  gate(72, 56 + k, "slide-wall", { group: "t2", index: k })
}
prop(58, 48, "slide-button", { group: "t2" })
sign(62, 48, "THE GAP SLIDES DOWN ONE STEP PER PUSH")
sign(64, 52, "ONLY A BOULDER CAN HOLD THE PLATE. LEAVE THE ROOM TO RESET IT")
actor(64, 58, "boulder")
actor(64, 61, "boulder")
actor(64, 64, "boulder")
// The plate and the door stay within ~20 cells of the push spot: a
// boulder further than that from the player gets deactivated
prop(80, 61, "plate", { group: "t2p" })
grid[61][81] = "2" // stops the boulder on the plate
item(78, 58, "coin")
item(78, 64, "coin")
alcove(84, 66, 92, 74)
gate(88, 66, "door", { group: "t2p" })
prop(88, 70, "chest", { drops: "coin", count: 10 })
item(85, 67, "coin")
item(91, 73, "coin")

// ---------------------------------------------------------------------
// T3 (row 1, center-east): the riddle of order -> chest
//
// Four sequence buttons without numbers. The signs describe the three
// that count by their surroundings; the fourth is a trap.

rect(106, 46, 150, 108, "6")
sign(
  128,
  48,
  "THREE BUTTONS, NO NUMBERS. THE SIGNS ALONG THE WALLS TELL THE ORDER",
)
sign(116, 52, "NOT EVERY BUTTON BELONGS")
rect(110, 60, 114, 64, "w") // the pond
prop(116, 62, "seq-button", { group: "t3", order: 1 })
prop(140, 59, "lantern")
prop(140, 60, "seq-button", { group: "t3", order: 2 })
alcove(128, 88, 136, 96) // the crate alcove
for (const x of [131, 132, 133]) gate(x, 88, "crate")
prop(132, 94, "seq-button", { group: "t3", order: 3 })
prop(124, 70, "seq-button", { group: "t3", order: 9 }) // the trap
prop(125, 70, "stool")
sign(110, 104, "FIRST: THE ONE THAT FACES THE POND")
sign(144, 58, "SECOND: THE ONE UNDER THE LANTERN")
sign(128, 82, "THIRD: THE ONE THE CRATES HIDE")
alcove(140, 72, 148, 80) // the reward alcove
gate(144, 72, "seal-wall", { group: "t3", count: 3 })
prop(144, 76, "chest", { drops: "coin", count: 8 })
item(142, 74, "green-apple")
item(146, 78, "coin")

// ---------------------------------------------------------------------
// T4 (row 1, east): fish through the shutters -> shrine and chest
//
// Catch a fish, push the clock, then walk the long way round: the
// short way is paved with springs and a jump scares the fish off.

rect(158, 46, 178, 62, "y") // the fishing area: sand
rect(160, 50, 164, 56, "w")
prop(178, 58, "timer-button", { group: "t4", duration: 1080 })
sign(166, 48, "CATCH A FISH: FACE THE WATER, PRESS SPACE")
sign(172, 60, "PUSH THE CLOCK AND WALK. NO JUMPING, NO SPRINGS")
// the long way
rect(179, 54, 185, 56, "6")
rect(183, 56, 185, 80, "6")
rect(166, 78, 185, 80, "6")
gate(165, 79, "shutter", { group: "t4" })
// the short way (springs)
rect(168, 63, 170, 77, "6")
for (const y of [66, 70, 74]) prop(169, y, "spring")
sign(171, 62, "SHORTCUT (THE FISH WON'T LIKE IT)")
// the shrine behind the shutter
rect(158, 74, 164, 84, "6")
prop(160, 82, "fish-shrine")
prop(162, 76, "chest", { drops: "coin", count: 6 })
sign(158, 76, "BRING ME A FISH")
item(184, 66, "coin")

// ---------------------------------------------------------------------
// T5 (row 2, west): freeze the metronome -> chest
//
// A patrol flips the switch every lap. The boulder only passes the
// blue wall while it sleeps, and a rolling boulder can't wait, so plant
// a tree in the lane (from below, facing up) to stop the patrol.

rect(6, 116, 50, 192, "6")
rect(10, 119, 24, 119, "2") // the lane's north wall
grid[120][11] = "2" // the lane's west cap
prop(23, 120, "switch", { group: "t5" })
grid[120][24] = "2"
actor(17, 120, "patrol", { dir: "left" })
sign(
  30,
  128,
  "THE PATROL FLIPS THE SWITCH EVERY LAP. A TREE IN THE LANE STOPS IT",
)
sign(18, 152, "THE BOULDER PASSES ONLY WHILE BOTH BLUE WALLS SLEEP")
sign(30, 176, "LEAVE AND RETURN TO RESET")
for (const x of [14, 20, 26]) item(x, 130, "seed")
actor(20, 150, "boulder")
prop(28, 150, "blue-wall", { group: "t5" })
prop(34, 150, "blue-wall", { group: "t5" })
prop(38, 150, "plate", { group: "t5p" })
grid[150][39] = "2" // stops the boulder on the plate
alcove(40, 160, 48, 168)
gate(44, 160, "door", { group: "t5p" })
prop(44, 164, "chest", { drops: "coin", count: 10 })
item(42, 162, "coin")
item(46, 166, "green-apple")

// ---------------------------------------------------------------------
// T6 (row 2, center-west): the five lights -> chest
//
// Five switches in a row, each flipping itself and its neighbors.

rect(56, 116, 100, 192, "6")
sign(76, 120, "FIVE LIGHTS. EACH SWITCH FLIPS ITSELF AND ITS NEIGHBORS")
const T6 = ["t6a", "t6b", "t6c", "t6d", "t6e"]
T6.forEach((g, n) => {
  const also = [T6[n - 1], T6[n + 1]].filter((x) => x !== undefined)
  prop(62 + n * 8, 130, "switch", { group: g, also })
  prop(70 + n * 4, 140, "blue-wall", { group: g })
})
sign(76, 137, "LOWER ALL FIVE BLOCKS")
alcove(72, 160, 84, 170)
gate(78, 160, "and-wall", { groups: T6 })
prop(78, 166, "chest", { drops: "coin", count: 12 })
item(75, 163, "green-apple")
item(81, 163, "coin")

// ---------------------------------------------------------------------
// T7 (row 2, center-east): the chain of clocks -> chest
//
// Two timer buttons in a chain: each shutter sits far from its clock,
// and the second clock waits right behind the first shutter.

rect(122, 116, 134, 124, "6") // chamber 1
prop(122, 124, "timer-button", { group: "t7a", duration: 1140 })
sign(126, 118, "TWO CLOCKS IN A CHAIN. EACH SHUTTER IS FAR FROM ITS CLOCK")
rect(135, 120, 140, 120, "6") // leg 1
rect(140, 120, 140, 132, "6")
rect(114, 132, 140, 132, "6")
rect(136, 126, 139, 126, "6") // a coin branch (a small detour)
item(136, 126, "coin")
gate(113, 132, "shutter", { group: "t7a" })
rect(108, 129, 112, 135, "6") // chamber 2
prop(108, 135, "timer-button", { group: "t7b", duration: 1080 })
sign(110, 129, "THE SECOND CLOCK")
rect(110, 136, 110, 160, "6") // leg 2
rect(110, 160, 140, 160, "6")
gate(141, 160, "shutter", { group: "t7b" })
rect(142, 156, 148, 164, "6") // chamber 3
prop(146, 158, "chest", { drops: "coin", count: 10 })
item(144, 162, "coin")
item(148, 162, "coin")

// ---------------------------------------------------------------------
// T8 (row 2, east): the bridge and the far switch -> key 2
//
// The switch sits across the water. Sink one boulder to build the
// bridge, then roll another over it. The red wall in the far lane
// rises behind whoever presses the switch, so a walker gets trapped.

rect(156, 116, 175, 125, "6") // the entry strip
rect(156, 126, 169, 192, "6") // the west bank
rect(170, 126, 170, 188, "w") // the channel
rect(171, 140, 179, 140, "6") // the far lane
gate(174, 140, "red-wall", { group: "t8" })
prop(180, 140, "switch", { group: "t8" }) // 18 cells from the push spot
grid[140][170] = "w"
actor(160, 140, "boulder")
actor(163, 140, "boulder")
actor(166, 140, "boulder")
sign(160, 132, "BRIDGE THE WATER, THEN SEND A BOULDER ACROSS. EAST ONE FIRST")
sign(
  166,
  136,
  "THE RED WALL RISES BEHIND WHOEVER PRESSES THE SWITCH. THE KEY IS SOUTH",
)
alcove(160, 170, 168, 178)
gate(164, 170, "blue-wall", { group: "t8" })
item(164, 174, "key")
item(162, 172, "coin")
item(166, 176, "coin")

// ---------------------------------------------------------------------
// T9 (top, west): the highway -> chest
//
// Patrols run up and down open columns. They don't stop for anyone:
// a bump knocks you a cell along their way.

rect(6, 8, 74, 34, "d") // the highway: planks
rect(75, 20, 79, 22, "6") // connector to the plaza
sign(72, 19, "THE HIGHWAY: PATROLS KNOCK YOU BACK. CROSS BETWEEN THEM")
;[
  [18, "up", 1],
  [28, "down", 2],
  [38, "up", 1],
  [48, "down", 2],
  [58, "up", 2],
].forEach(([x, dir, speed]) => {
  actor(x as number, 21, "patrol", {
    dir: dir as string,
    speed: speed as number,
  })
})
for (const x of [23, 33, 43, 53]) item(x, 21, "coin")
prop(9, 21, "chest", { drops: "coin", count: 8 })
item(9, 12, "green-apple")
item(9, 30, "coin")

// ---------------------------------------------------------------------
// T10 (top, east): the vault of choice
//
// Three key gates, two keys on this floor. Pick your doors.

rect(126, 6, 194, 38, "6")
rect(121, 20, 125, 22, "6") // connector to the plaza
sign(160, 26, "TWO KEYS ON THIS FLOOR, THREE DOORS. CHOOSE")
const CHAMBERS: [number, string, () => void][] = [
  [135, "LEFT: A PILE OF COINS", () => {
    for (let y = 10; y <= 14; y += 2) {
      for (let x = 132; x <= 138; x += 2) item(x, y, "coin")
    }
  }],
  [160, "MIDDLE: THE GRAND PRIZE", () => {
    prop(160, 12, "chest", { drops: "coin", count: 30 })
    item(157, 10, "green-apple")
    item(163, 10, "green-apple")
    item(157, 14, "coin")
    item(163, 14, "coin")
  }],
  [185, "RIGHT: SUPPLIES", () => {
    for (const x of [182, 184, 186]) item(x, 10, "seed")
    for (const x of [183, 187]) item(x, 14, "mushroom")
    item(185, 12, "purple-mushroom")
  }],
]
for (const [cx, label, fill] of CHAMBERS) {
  alcove(cx - 5, 8, cx + 5, 16)
  gate(cx, 16, "key-gate")
  sign(cx, 19, label)
  fill()
}

// ---------------------------------------------------------------------
// verification

const catalog = await loadCatalog(
  new URL("../static/catalog/base.json", import.meta.url).href,
  ["base.json"],
)
for (const s of [...actors, ...items, ...props]) {
  const li = s.i - BI
  const lj = s.j - BJ
  if (li < 0 || li >= SIZE || lj < 0 || lj >= SIZE) {
    console.error("spawn out of bounds:", s)
    Deno.exit(1)
  }
  const known = catalog.actors[s.type] || catalog.items[s.type] ||
    catalog.props[s.type]
  if (!known) {
    console.error("unknown type:", s)
    Deno.exit(1)
  }
}
const cellEnter = (x: number, y: number) =>
  x >= 0 && x < SIZE && y >= 0 && y < SIZE &&
  (catalog.cells[grid[y][x]]?.canEnter ?? false)
const isIce = (x: number, y: number) => grid[y][x] === "i"

// Walls that open once their puzzle is solved (closed for the sealed
// checks, open for the solved checks)
const puzzleWalls = new Set([
  "blue-wall",
  "red-wall",
  "and-wall",
  "shutter",
  "seal-wall",
  "slide-wall",
  "door",
  "key-gate",
])
const freelyPassable = new Set(["crate", "chest", "timer-gate", "moon-gate"])
const hardBlock = new Set<string>()
const puzzleBlock = new Set<string>()
for (const p of props) {
  const def = catalog.props[p.type]!
  const key = `${p.i - BI}.${p.j - BJ}`
  if (puzzleWalls.has(p.type)) {
    puzzleBlock.add(key)
  } else if (!def.canEnter && !freelyPassable.has(p.type)) {
    hardBlock.add(key)
  }
}
let wallsOpen = false
const open = (x: number, y: number) =>
  cellEnter(x, y) && !hardBlock.has(`${x}.${y}`) &&
  (wallsOpen || !puzzleBlock.has(`${x}.${y}`))

/** BFS with ice sliding; returns the distances (in cells) */
function distances(sx: number, sy: number): Map<string, number> {
  const dist = new Map<string, number>([[`${sx}.${sy}`, 0]])
  const queue: [number, number][] = [[sx, sy]]
  let head = 0
  while (head < queue.length) {
    const [x, y] = queue[head++]
    const d = dist.get(`${x}.${y}`)!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let nx = x + dx
      let ny = y + dy
      if (!open(nx, ny)) continue
      let steps = 1
      while (isIce(nx, ny) && open(nx + dx, ny + dy)) {
        nx += dx
        ny += dy
        steps++
      }
      const key = `${nx}.${ny}`
      if (!dist.has(key)) {
        dist.set(key, d + steps)
        queue.push([nx, ny])
      }
    }
  }
  return dist
}

let ok = true
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "ok" : "NG"} ${name}`)
  if (!cond) ok = false
}

const ENTRY: [number, number] = [100, 22]
const sealed = distances(...ENTRY)
wallsOpen = true
const solved = distances(...ENTRY)
wallsOpen = false

const rooms: [string, number, number][] = [
  ["T1 entry strip", 28, 50],
  ["T2 button", 59, 48],
  ["T3 pond button", 117, 62],
  ["T4 clock", 177, 58],
  ["T5 seeds", 14, 131],
  ["T6 switches", 62, 131],
  ["T7 clock 1", 123, 124],
  ["T8 boulders", 159, 140],
  ["T5 boulder push spot", 19, 150],
  ["T3 crate alcove front", 132, 87],
  ["T3 hidden button front (behind crates)", 132, 93],
  ["T9 first patrol column", 18, 20],
  ["T10 sign", 160, 27],
]
for (const [name, x, y] of rooms) {
  check(`${name} reachable`, sealed.has(`${x}.${y}`))
}

check("T1 island sealed", !sealed.has("28.76"))
const rewards: [string, number, number][] = [
  ["T2 alcove", 88, 70],
  ["T3 alcove", 144, 76],
  ["T4 shrine", 160, 81],
  ["T5 alcove", 44, 164],
  ["T6 alcove", 78, 166],
  ["T7 chamber 2", 110, 131],
  ["T7 chamber 3", 146, 160],
  ["T8 key alcove", 164, 174],
  ["T10 grand prize", 160, 13],
]
for (const [name, x, y] of rewards) {
  check(`${name} sealed`, !sealed.has(`${x}.${y}`))
  check(`${name} solved`, solved.has(`${x}.${y}`))
}
// T9 and T4's long way are open rooms: the chest and the shutter front
check("T9 chest reachable", sealed.has("10.21"))
check("T4 long way reaches the shutter", sealed.has("166.79"))
// T8: the switch must not be walkable before the bridge, and a
// bridged channel must let a boulder line reach the switch
check("T8 switch unreachable across the water", !solved.has("179.140"))
grid[140][170] = "0"
wallsOpen = true
check("T8 lane walkable once bridged", distances(...ENTRY).has("179.140"))
wallsOpen = false
grid[140][170] = "w"

// T1: state-aware solver (position x switch state). Sliding or walking
// into the switch flips the state. Blue walls open while on, red
// walls while off.
{
  const sw = "46.63"
  const blues = new Set(["28.73", "16.100"])
  const reds = new Set(["45.72", "27.71"])
  const passable = (x: number, y: number, on: boolean, flips: boolean) => {
    const key = `${x}.${y}`
    if (key === sw) return flips ? "flip" : "wall"
    if (blues.has(key)) return on ? "open" : "wall"
    if (reds.has(key)) return on ? "wall" : "open"
    return cellEnter(x, y) ? "open" : "wall"
  }
  const solve = (
    sx: number,
    sy: number,
    on0: boolean,
    flips: boolean,
  ): Set<string> => {
    const seen = new Set<string>([`${sx}.${sy}.${on0}`])
    const queue: [number, number, boolean][] = [[sx, sy, on0]]
    while (queue.length > 0) {
      const [x, y, on] = queue.pop()!
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let nx = x
        let ny = y
        let state = on
        const first = passable(x + dx, y + dy, on, flips)
        if (first === "flip") {
          state = !on
        } else if (first === "wall") {
          continue
        } else {
          nx = x + dx
          ny = y + dy
          while (isIce(nx, ny)) {
            const next = passable(nx + dx, ny + dy, state, flips)
            if (next === "flip") {
              state = !state
              break
            }
            if (next === "wall") break
            nx += dx
            ny += dy
          }
        }
        const key = `${nx}.${ny}.${state}`
        if (!seen.has(key)) {
          seen.add(key)
          queue.push([nx, ny, state])
        }
      }
    }
    return seen
  }
  const fromStrip = solve(28, 51, false, true)
  const onIsland = [...fromStrip].filter((k) => k.startsWith("28.76."))
  check("T1 island reachable", onIsland.length > 0)
  const noSwitch = solve(28, 51, false, false)
  check("T1 island needs the switch", !noSwitch.has("28.76.false"))
  const back = onIsland.some((k) => {
    const on = k.endsWith("true")
    const r = solve(28, 76, on, true)
    return r.has("28.51.true") || r.has("28.51.false")
  })
  check("T1 return trip", back)
}

// T6: brute force the five lights
{
  let best: number[] | null = null
  for (let mask = 1; mask < 32; mask++) {
    const lights = [false, false, false, false, false]
    for (let n = 0; n < 5; n++) {
      if (!(mask & (1 << n))) continue
      for (const m of [n - 1, n, n + 1]) {
        if (m >= 0 && m < 5) lights[m] = !lights[m]
      }
    }
    if (lights.every(Boolean)) {
      const presses = [...Array(5).keys()].filter((n) => mask & (1 << n))
      if (!best || presses.length < best.length) best = presses
    }
  }
  check(`T6 solvable (press ${best?.map((n) => n + 1).join(", ")})`, !!best)
  check("T6 needs more than one press", (best?.length ?? 0) > 1)
}

// T7: the timer runs must be tight but possible at walking speed
{
  wallsOpen = true
  const run = (
    name: string,
    from: [number, number],
    to: [number, number],
    duration: number,
  ) => {
    const d = distances(...from).get(`${to[0]}.${to[1]}`)
    const frames = d === undefined ? Infinity : d * 16 + 16
    check(
      `${name}: ${d} cells (${(frames / 60).toFixed(1)}s) within ${
        (duration / 60).toFixed(0)
      }s`,
      frames < duration && frames * 1.6 > duration,
    )
  }
  run("T7 leg 1", [123, 124], [113, 132], 1140)
  run("T7 leg 2", [109, 135], [141, 160], 1080)
  rect(168, 63, 170, 63, "2") // measure the long way only (springs are a trap)
  run("T4 long way", [177, 58], [165, 79], 1080)
  rect(168, 63, 170, 63, "6")
  wallsOpen = false
}

if (!ok) {
  console.error("verification failed")
  Deno.exit(1)
}

// ---------------------------------------------------------------------
// output

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
  new URL("../static/map/block_400.400.json", import.meta.url),
  JSON.stringify(json, null, 2),
)
console.log("generated block_400.400.json (puzzle dungeon B3F)")
