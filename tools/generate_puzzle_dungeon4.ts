// Generates the fourth floor of the puzzle dungeon (block_400.200),
// reached from the B3F plaza. Built on docs/design-principles.md: in
// every room something other than the player works the mechanism, the
// mechanism is visible before the sign explains it, and the signs
// state rules rather than solutions.
//
// - K1 the pusher: drop a boulder into the patrol's lane; the patrol
//   shoves it into the water, the bridge extends its lap to the button
// - K2 dominoes: the same chain, then the crossing patrol keeps hitting
//   a crystal whose blue wall meters a second patrol toward its button
// - K3 two crystals: an ice rink where each switch's walls are the
//   brakes needed to reach the other switch
// - K4 the double bridge: two channels, three boulders, the far switch
//   opens a wall in plain view of the push spot
// - K5 the rhythm corridor: a short-lap patrol alternates four walls;
//   every waiting pocket pays a coin
//
// Usage: deno -A tools/generate_puzzle_dungeon4.ts
import { loadCatalog } from "../model/catalog.ts"

const SIZE = 200
const BI = 400
const BJ = 200

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
const alcove = (x0: number, y0: number, x1: number, y1: number) => {
  rect(x0, y0, x1, y1, "2")
  rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, "m") // alcoves get the mosaic floor
}
const gate = (i: number, j: number, type: string, data?: unknown) => {
  grid[j][i] = "0"
  prop(i, j, type, data)
}
/** An enclosed horizontal patrol lane: walls above and below, caps at both ends */
const lane = (x0: number, x1: number, y: number) => {
  rect(x0 - 1, y - 1, x1 + 1, y - 1, "2")
  rect(x0 - 1, y + 1, x1 + 1, y + 1, "2")
  rect(x0, y, x1, y, "0")
  grid[y][x0 - 1] = "2"
  grid[y][x1 + 1] = "2"
}

// ---------------------------------------------------------------------
// skeleton: plaza, spine, five rooms in a row

rect(80, 6, 120, 38, "c") // cobbled plaza
rect(98, 38, 102, 40, "0")
rect(4, 40, 196, 44, "0")
prop(100, 20, "portal-out")
prop(96, 20, "portal", { i: 488, j: 434 }) // back to the B3F plaza
sign(104, 20, "DUNGEON B4F: THE CLOCKWORK")
sign(93, 20, "BACK TO B3F")
sign(100, 34, "NOTHING HERE MOVES FOR YOU. MAKE THE MACHINES DO IT")
grid[12][88] = "x"
item(112, 12, "coin")
// The way down to the fifth floor (block_600.200)
sign(111, 24, "B5F: THE MENAGERIE")
prop(108, 24, "portal", { i: 700, j: 216 })

const ROOMS: [number, number][] = [[6, 42], [46, 82], [86, 122], [126, 162], [
  166,
  194,
]]
for (const [x0, x1] of ROOMS) {
  const c = Math.floor((x0 + x1) / 2)
  rect(c - 1, 45, c + 1, 45, "0")
}

// ---------------------------------------------------------------------
// K1 (x 6..42): the pusher -> chest
//
// The lane is closed to the player except for one hole above it. A
// boulder dropped through the hole gets shoved by the patrol into the
// water; the bridge lets the patrol reach the button beyond.

rect(6, 46, 42, 106, "0")
lane(20, 34, 60)
grid[60][31] = "w"
prop(34, 60, "seq-button", { group: "k1", order: 1 })
actor(24, 60, "patrol", { dir: "right" })
grid[59][27] = "0" // the hole
actor(27, 52, "boulder")
actor(27, 48, "boulder") // a spare, pushed from (27, 47)
sign(24, 48, "THE PATROL SHOVES WHATEVER IS IN FRONT OF IT")
sign(30, 52, "BOULDERS SINK IN WATER. PATROLS DO NOT SWIM")
sign(24, 56, "DROP IT RIGHT AFTER THE PATROL PASSES BELOW")
alcove(30, 66, 38, 74)
gate(34, 66, "seal-wall", { group: "k1", count: 1 })
prop(34, 70, "chest", { drops: "coin", count: 8 })
item(31, 67, "coin")
item(37, 73, "coin")
sign(40, 63, "THE BUTTON NEEDS ONE PRESS")

// ---------------------------------------------------------------------
// K2 (x 46..82): dominoes -> chest
//
// Lane 1 repeats K1's chain, but the patrol that crosses the bridge
// keeps hitting a crystal switch. Its blue wall sits in lane 2, where
// a second patrol gets through only while the wall sleeps, and presses
// the button that unseals the chest.

rect(46, 46, 82, 106, "0")
lane(56, 65, 56)
grid[56][63] = "w"
prop(66, 56, "switch", { group: "k2" }) // the east cap is the crystal
grid[56][67] = "2"
actor(58, 56, "patrol", { dir: "right" })
grid[55][60] = "0" // the hole
actor(60, 52, "boulder")
actor(60, 49, "boulder") // a spare, pushed from (60, 48)
lane(52, 76, 70)
gate(64, 70, "blue-wall", { group: "k2" })
prop(77, 70, "seq-button", { group: "k2s", order: 1 })
grid[70][78] = "2"
actor(56, 70, "patrol", { dir: "right" })
sign(64, 48, "TWO LANES. THE SECOND PATROL WAITS FOR A WALL TO SLEEP")
sign(64, 60, "A CRYSTAL FLIPS EVERY TIME SOMETHING HITS IT")
for (const x of [66, 70, 74]) item(x, 60, "coin")
alcove(60, 76, 68, 84)
gate(64, 76, "seal-wall", { group: "k2s", count: 1 })
prop(64, 80, "chest", { drops: "coin", count: 10 })
item(61, 77, "green-apple")
item(67, 83, "coin")

// ---------------------------------------------------------------------
// K3 (x 86..122): two crystals -> key
//
// Two switch groups on one rink. Each group's walls are the brakes
// that make the slide toward the other switch stop where it must.

rect(102, 46, 106, 51, "0") // entry strip
rect(90, 52, 118, 100, "i") // the rink
rect(102, 78, 106, 82, "0") // the island
for (let x = 101; x <= 107; x++) {
  grid[77][x] = "2"
  grid[83][x] = "2"
}
for (let y = 78; y <= 82; y++) {
  grid[y][101] = "2"
  grid[y][107] = "2"
}
grid[83][104] = "i"
prop(104, 83, "blue-wall", { group: "k3q" })
item(104, 80, "key")
item(103, 79, "coin")
item(105, 81, "coin")
grid[64][104] = "2" // the first brake below the strip
prop(118, 63, "switch", { group: "k3p" })
prop(90, 89, "switch", { group: "k3q" })
prop(117, 72, "red-wall", { group: "k3p" })
prop(95, 71, "red-wall", { group: "k3p" })
grid[90][96] = "2"
prop(105, 89, "red-wall", { group: "k3p" })
grid[54][110] = "2"
prop(104, 60, "red-wall", { group: "k3q" })
item(90, 63, "coin")
item(118, 100, "coin")
sign(102, 48, "TWO CRYSTALS. THE WALLS OF ONE ARE THE BRAKES FOR THE OTHER")

// ---------------------------------------------------------------------
// K4 (x 126..162): the double bridge -> chest
//
// Three boulders, two channels. The last boulder crosses both bridges
// and presses the switch on the far bank; the wall it opens stands a
// few cells below the push spot, in plain view.

rect(126, 46, 149, 106, "y") // the near bank: sand
rect(150, 52, 150, 100, "w")
rect(151, 52, 153, 100, "0") // the strip between the channels
rect(154, 52, 154, 100, "w")
rect(155, 70, 158, 70, "0") // the far lane
prop(159, 70, "switch", { group: "k4" })
actor(142, 70, "boulder")
actor(144, 70, "boulder")
actor(146, 70, "boulder")
sign(144, 50, "THE FAR SWITCH OPENS THE NEAR WALL")
sign(134, 66, "BOULDERS SINK. A ROLLING BOULDER CRUSHES WHAT IT HITS")
alcove(140, 74, 148, 82)
gate(144, 74, "blue-wall", { group: "k4" })
prop(144, 78, "chest", { drops: "coin", count: 10 })
item(141, 75, "coin")
item(147, 81, "coin")
for (const y of [60, 80, 90]) item(152, y, "coin")

// ---------------------------------------------------------------------
// K5 (x 166..194): the rhythm corridor -> chest
//
// A short-lap patrol flips one crystal; blue and red walls alternate
// along the corridor, and every pocket between them holds coins.

rect(166, 46, 194, 106, "h") // the clockwork corridor: steel plates
lane(167, 171, 48) // a flip per lap: 5 cells keep the beat under 3 seconds
prop(172, 48, "switch", { group: "k5" })
grid[48][173] = "2"
actor(169, 48, "patrol", { dir: "right" })
sign(182, 52, "THE PATROL KEEPS TIME. BLUE AND RED TAKE TURNS")
for (const x of [172, 176, 180, 184]) rect(x, 58, x, 72, "2")
gate(172, 65, "blue-wall", { group: "k5" })
gate(176, 65, "red-wall", { group: "k5" })
gate(180, 65, "blue-wall", { group: "k5" })
gate(184, 65, "red-wall", { group: "k5" })
for (const x of [174, 178, 182]) {
  item(x, 61, "coin")
  item(x, 69, "coin")
}
sign(169, 62, "EVERY POCKET PAYS FOR THE WAIT")
rect(185, 58, 194, 58, "2") // the corridor's east end stays walled
rect(185, 72, 194, 72, "2")
rect(185, 59, 185, 71, "0")
prop(190, 65, "chest", { drops: "coin", count: 8 })
item(188, 61, "coin")
item(192, 69, "green-apple")
// the corridor band is sealed above and below so the walls can't be
// walked around
rect(166, 57, 194, 57, "2")
rect(166, 73, 194, 73, "2")
grid[57][168] = "0" // the way in from the entry side
grid[73][168] = "0"
rect(166, 74, 194, 106, "h")

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
  if (
    !(catalog.actors[s.type] || catalog.items[s.type] || catalog.props[s.type])
  ) {
    console.error("unknown type:", s)
    Deno.exit(1)
  }
}
const cellEnter = (x: number, y: number) =>
  x >= 0 && x < SIZE && y >= 0 && y < SIZE &&
  (catalog.cells[grid[y][x]]?.canEnter ?? false)
const isIce = (x: number, y: number) => grid[y][x] === "i"
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
  if (puzzleWalls.has(p.type)) puzzleBlock.add(key)
  else if (!def.canEnter && !freelyPassable.has(p.type)) hardBlock.add(key)
}
let wallsOpen = false
const open = (x: number, y: number) =>
  cellEnter(x, y) && !hardBlock.has(`${x}.${y}`) &&
  (wallsOpen || !puzzleBlock.has(`${x}.${y}`))

function reachable(sx: number, sy: number): Set<string> {
  const seen = new Set<string>([`${sx}.${sy}`])
  const queue: [number, number][] = [[sx, sy]]
  while (queue.length > 0) {
    const [x, y] = queue.pop()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let nx = x + dx
      let ny = y + dy
      if (!open(nx, ny)) continue
      while (isIce(nx, ny) && open(nx + dx, ny + dy)) {
        nx += dx
        ny += dy
      }
      const key = `${nx}.${ny}`
      if (!seen.has(key)) {
        seen.add(key)
        queue.push([nx, ny])
      }
    }
  }
  return seen
}

let ok = true
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "ok" : "NG"} ${name}`)
  if (!cond) ok = false
}
const ENTRY: [number, number] = [100, 22]
const sealed = reachable(...ENTRY)
wallsOpen = true
const solved = reachable(...ENTRY)
wallsOpen = false

for (
  const [name, x, y] of [
    ["K1 boulder push spot", 27, 51],
    ["K1 hole", 27, 59],
    ["K2 boulder push spot", 60, 51],
    ["K3 entry strip", 104, 50],
    ["K4 push spot", 145, 70],
    ["K5 corridor entry", 168, 60],
  ] as [string, number, number][]
) check(`${name} reachable`, sealed.has(`${x}.${y}`))

for (
  const [name, x, y] of [
    ["K1 button", 34, 60],
    ["K1 alcove", 34, 70],
    ["K2 switch side of the water", 64, 56],
    ["K2 lane 2", 56, 70],
    ["K2 button", 76, 70],
    ["K2 alcove", 64, 80],
    ["K3 island", 104, 80],
    ["K4 far switch", 158, 70],
    ["K4 alcove", 144, 78],
    ["K5 chest", 189, 65],
    ["K5 first pocket", 174, 65],
  ] as [string, number, number][]
) check(`${name} sealed`, !sealed.has(`${x}.${y}`))

for (
  const [name, x, y] of [
    ["K1 alcove", 34, 70],
    ["K2 alcove", 64, 80],
    ["K4 alcove", 144, 78],
    ["K5 chest", 189, 65],
  ] as [string, number, number][]
) check(`${name} solved`, solved.has(`${x}.${y}`))

// K1/K2: the bridge extends the patrol's lap to the button
for (
  const [name, wx, wy, bx, by] of [
    ["K1", 31, 60, 33, 60],
    ["K2", 63, 56, 65, 56],
  ] as [string, number, number, number, number][]
) {
  grid[wy][wx] = "0"
  check(
    `${name} button reachable over the bridge`,
    reachable(...ENTRY).has(`${bx}.${by}`),
  )
  grid[wy][wx] = "w"
}
// K4: the far switch is reachable once both channels are bridged
grid[70][150] = "0"
grid[70][154] = "0"
check(
  "K4 far lane reachable over both bridges",
  reachable(...ENTRY).has("158.70"),
)
grid[70][150] = "w"
grid[70][154] = "w"

// K3: two-switch ice solver. Sliding or walking into a switch flips it.
{
  const switches: Record<string, "p" | "q"> = { "118.63": "p", "90.89": "q" }
  const walls: Record<string, ["p" | "q", "blue" | "red"]> = {
    "104.83": ["q", "blue"],
    "117.72": ["p", "red"],
    "95.71": ["p", "red"],
    "105.89": ["p", "red"],
    "104.60": ["q", "red"],
  }
  type St = { p: boolean; q: boolean }
  const passable = (x: number, y: number, st: St, live: Set<string>) => {
    const key = `${x}.${y}`
    if (switches[key]) return live.has(switches[key]) ? "flip" : "wall"
    const w = walls[key]
    if (w) {
      const on = st[w[0]]
      return (w[1] === "blue" ? on : !on) ? "open" : "wall"
    }
    return cellEnter(x, y) ? "open" : "wall"
  }
  const solve = (sx: number, sy: number, st0: St, live: Set<string>) => {
    const seen = new Set<string>([`${sx}.${sy}.${st0.p}.${st0.q}`])
    const queue: [number, number, St][] = [[sx, sy, st0]]
    while (queue.length > 0) {
      const [x, y, st] = queue.pop()!
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let nx = x
        let ny = y
        let s = { ...st }
        const flip = (k: string) => {
          const g = switches[k]
          s = { ...s, [g]: !s[g] }
        }
        const first = passable(x + dx, y + dy, s, live)
        if (first === "wall") continue
        if (first === "flip") {
          flip(`${x + dx}.${y + dy}`)
        } else {
          nx = x + dx
          ny = y + dy
          while (isIce(nx, ny)) {
            const next = passable(nx + dx, ny + dy, s, live)
            if (next === "flip") {
              flip(`${nx + dx}.${ny + dy}`)
              break
            }
            if (next === "wall") break
            nx += dx
            ny += dy
          }
        }
        const key = `${nx}.${ny}.${s.p}.${s.q}`
        if (!seen.has(key)) {
          seen.add(key)
          queue.push([nx, ny, s])
        }
      }
    }
    return seen
  }
  const onIsland = (r: Set<string>) =>
    [...r].filter((k) => k.startsWith("104.80."))
  const both = solve(104, 51, { p: false, q: false }, new Set(["p", "q"]))
  const islands = onIsland(both)
  check("K3 island reachable", islands.length > 0)
  check(
    "K3 needs switch P",
    onIsland(solve(104, 51, { p: false, q: false }, new Set(["q"]))).length ===
      0,
  )
  check(
    "K3 needs switch Q",
    onIsland(solve(104, 51, { p: false, q: false }, new Set(["p"]))).length ===
      0,
  )
  const back = islands.some((k) => {
    const [, , p, q] = k.split(".")
    const r = solve(
      104,
      80,
      { p: p === "true", q: q === "true" },
      new Set(["p", "q"]),
    )
    return [...r].some((s) => s.startsWith("104.51."))
  })
  check("K3 return trip", back)
}

if (!ok) {
  console.error("verification failed")
  Deno.exit(1)
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
  new URL("../static/map/block_400.200.json", import.meta.url),
  JSON.stringify(json, null, 2),
)
console.log("generated block_400.200.json (puzzle dungeon B4F)")
