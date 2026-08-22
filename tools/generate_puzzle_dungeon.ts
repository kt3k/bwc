// Generates the puzzle dungeon (block_-400.400): a sealed block of
// puzzle rooms built from gimmick combinations (see game-ideas-2.md).
//
// Rooms:
// - R1 spring/ice slide puzzle with a key on the center island (B-2)
// - R2 chaser arena with boulder lanes (B-3)
// - R3 plate + door + sapling boulder-stopper puzzle with a key (B-4)
// - R4 boulder-into-water bridge puzzle with a key (B-1)
// - R5 night corridor: lightable lanterns, ghosts, moon gate (B-5)
// - R6 fish escort to the shrine across a spring field (B-6)
// - R7 one-way conveyor maze (B-7)
// - Vault: three key gates guarding the treasure (B-8)
// - Plaza: shops, a timer-gate dash annex, a race course and dig spots
//
// The dungeon connects to the tutorial course via portals. Its layout
// is verified: room doors are reachable from the entry, the ice puzzle
// island is solvable, and the vault stays sealed without keys.
//
// Usage: deno -A tools/generate_puzzle_dungeon.ts
import { loadCatalog } from "../model/catalog.ts"

const SIZE = 200
const BI = -400
const BJ = 400

type Spawn = { i: number; j: number; type: string; data?: unknown }

const grid: string[][] = Array.from(
  { length: SIZE },
  () => Array(SIZE).fill("2"),
)
const actors: Spawn[] = []
const items: Spawn[] = []
const props: Spawn[] = []

function rect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cell: string,
) {
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

// ---------------------------------------------------------------------
// corridors

rect(8, 62, 192, 66, "5") // horizontal spine
rect(98, 60, 102, 135, "5") // center: plaza -> vault approach
rect(74, 66, 78, 192, "5") // west corridor
rect(122, 66, 126, 192, "5") // east corridor

// ---------------------------------------------------------------------
// plaza (entry)

rect(80, 10, 120, 60, "5")
prop(100, 20, "portal-out")
prop(96, 20, "portal", { i: -110, j: 115 }) // back to the tutorial course
sign(104, 20, "PUZZLE DUNGEON: 8 TRIALS")
sign(93, 20, "BACK TO TUTORIAL")
prop(110, 30, "shop", { sells: "seed", price: 3 })
prop(113, 30, "shop", { sells: "mushroom", price: 5 })
sign(107, 30, "SHOP: PUSH TO BUY")
item(105, 14, "mushroom")
grid[55][85] = "x" // dig spot
sign(87, 53, "DIG AT CRACKED TILES")

// timer-gate dash annex north of the plaza
rect(86, 4, 114, 8, "5")
grid[9][100] = "5"
prop(100, 9, "timer-gate", { duration: 300 })
sign(97, 12, "QUICK! GRAB A MUSHROOM FIRST")
for (const x of [90, 95, 100, 105, 110]) item(x, 6, "coin")

// race along the center corridor
prop(100, 68, "race-start")
sign(103, 68, "RACE TO THE VAULT DOOR!")
prop(100, 131, "race-goal", { course: "dungeon", par: 900, reward: 10 })

// dig spots on the spine ends
grid[64][10] = "x"
grid[64][190] = "x"

// ---------------------------------------------------------------------
// R1 (NW): spring/ice slide puzzle -> key 1

rect(10, 10, 70, 58, "5")
rect(14, 14, 66, 54, "i")
// entry strip and door stub to the spine
rect(35, 50, 41, 54, "5")
rect(36, 58, 40, 62, "5")
// center island with the key
rect(36, 30, 44, 36, "5")
item(40, 33, "key")
item(38, 34, "coin")
item(42, 34, "coin")
// pegs and water holes to slide around
for (
  const [px, py] of [
    [30, 20],
    [48, 22],
    [24, 38],
    [56, 40],
    [38, 44],
    [50, 48],
    [20, 28],
    [60, 30],
  ]
) {
  grid[py][px] = "2"
}
rect(26, 45, 30, 47, "w")
rect(52, 19, 56, 21, "w")
prop(38, 52, "spring")
sign(35, 51, "SLIDE TO THE ISLAND")

// ---------------------------------------------------------------------
// R2 (NE): chaser arena -> coins

rect(130, 10, 190, 58, "5")
rect(158, 58, 162, 62, "5") // door stub
actor(145, 30, "chaser")
actor(170, 25, "chaser")
actor(160, 45, "chaser")
actor(150, 20, "boulder")
actor(150, 40, "boulder")
for (const [x, y] of [[155, 30], [160, 30], [165, 30], [160, 35], [160, 25]]) {
  item(x, y, "apple")
}
prop(185, 14, "chest", { drops: "coin", count: 10 })
sign(159, 55, "LURE CHASERS INTO THE BOULDER LANES")

// ---------------------------------------------------------------------
// R3 (W): plate + door + sapling stopper -> key 2

rect(10, 70, 70, 120, "5")
rect(70, 93, 74, 97, "5") // door stub to the west corridor
prop(29, 95, "plate", { group: "r3" })
actor(58, 95, "boulder")
item(60, 90, "seed")
item(62, 95, "seed")
item(60, 100, "seed")
sign(33, 90, "PARK THE BOULDER ON THE PLATE. TREES STOP IT")
sign(55, 100, "LEAVE AND RETURN TO RESET THE ROOM")
// reward alcove opened by the door
rect(36, 106, 44, 116, "2")
rect(38, 108, 42, 114, "5")
grid[107][40] = "5"
prop(40, 107, "door", { group: "r3" })
item(40, 111, "key")
item(38, 110, "coin")
item(42, 112, "coin")

// ---------------------------------------------------------------------
// R4 (E): boulder-into-water bridges -> key 3

rect(130, 70, 190, 120, "5")
rect(126, 93, 130, 97, "5") // door stub to the east corridor
rect(158, 72, 160, 118, "w") // the channel
actor(138, 95, "boulder")
actor(142, 95, "boulder")
actor(146, 95, "boulder")
sign(135, 90, "SINK THE BOULDERS TO CROSS")
sign(135, 100, "PUSH THE EAST ONE FIRST. LEAVE TO RESET")
item(175, 95, "key")
prop(180, 90, "chest", { drops: "coin", count: 8 })
for (const [x, y] of [[170, 100], [175, 105], [180, 100]]) item(x, y, "coin")

// ---------------------------------------------------------------------
// R7 (center): one-way conveyor maze

rect(80, 72, 96, 120, "2") // room shell (mostly wall)
rect(90, 86, 95, 112, "5") // entry chamber
rect(96, 91, 97, 93, "5") // door to the center corridor
rect(82, 74, 88, 118, "5") // inner chamber
grid[92][89] = "o" // one-way in (west belt)
grid[92][88] = "o"
grid[110][88] = "e" // one-way out (east belt)
grid[110][89] = "e"
for (const y of [78, 86, 94, 102]) item(85, y, "coin")
item(84, 110, "coin")
grid[76][83] = "x" // dig spot
sign(95, 88, "ONE WAY BELTS")

// ---------------------------------------------------------------------
// R5 (SW): night corridor with ghosts and the moon gate

rect(10, 130, 70, 190, "5")
rect(70, 148, 74, 152, "5") // door stub to the west corridor
prop(66, 150, "lantern")
prop(54, 150, "lantern-unlit")
prop(42, 150, "lantern-unlit")
prop(30, 150, "lantern-unlit")
actor(25, 140, "ghost")
actor(50, 170, "ghost")
sign(66, 146, "GHOSTS FEAR LIGHT. THE MOON GATE OPENS AT NIGHT")
// the moonlit alcove
rect(12, 142, 20, 158, "2")
rect(14, 144, 18, 156, "5")
grid[150][20] = "5"
prop(20, 150, "moon-gate")
for (const [x, y] of [[15, 146], [17, 148], [15, 152]]) item(x, y, "coin")
item(16, 150, "green-apple")
item(17, 154, "green-apple")

// ---------------------------------------------------------------------
// R6 (SE): fish escort to the shrine

rect(130, 130, 190, 190, "5")
rect(126, 148, 130, 152, "5") // door stub to the east corridor
rect(176, 136, 186, 144, "w") // the pond
prop(134, 184, "fish-shrine")
sign(131, 148, "BRING A FISH TO THE SHRINE. NO JUMPING!")
// spring field on the direct route scares the fish off
for (
  const [x, y] of [
    [150, 160],
    [155, 165],
    [160, 158],
    [165, 170],
    [158, 172],
    [145, 168],
    [152, 175],
    [148, 155],
  ]
) {
  prop(x, y, "spring")
}
// crates on the safe detour along the west edge
prop(132, 168, "crate")
prop(133, 168, "crate")
prop(134, 168, "crate")

// ---------------------------------------------------------------------
// vault (B-8): three key gates guard the treasure

rect(86, 140, 114, 172, "2")
rect(88, 141, 112, 170, "5")
rect(100, 136, 100, 140, "5") // the 1-wide gate corridor
prop(100, 136, "key-gate")
prop(100, 138, "key-gate")
prop(100, 140, "key-gate")
sign(97, 133, "THE VAULT: THREE KEYS")
for (let y = 146; y <= 166; y += 4) {
  for (let x = 90; x <= 110; x += 4) {
    item(x, y, "coin")
  }
}
prop(90, 168, "chest", { drops: "coin", count: 10 })
prop(110, 168, "chest", { drops: "seed", count: 3 })
sign(100, 144, "MASTER OF GIMMICKS!")
// The way down to the second floor (block_200.400)
sign(110, 144, "B2F: THE DEEPER TRIAL")
prop(108, 144, "portal", { i: 300, j: 420 })

// ---------------------------------------------------------------------
// verification

const catalog = await loadCatalog(
  new URL("../static/catalog/base.json", import.meta.url).href,
  ["base.json"],
)
const cellEnter = (x: number, y: number) =>
  x >= 0 && x < SIZE && y >= 0 && y < SIZE &&
  (catalog.cells[grid[y][x]]?.canEnter ?? false)
const isIce = (x: number, y: number) => grid[y][x] === "i"

// Props that block for a keyless player. Breakable props and the
// self-opening gates count as passable; key gates do not.
const freelyPassable = new Set([
  "crate",
  "chest",
  "door",
  "moon-gate",
  "timer-gate",
])
const hardBlock = new Set<string>()
for (const p of props) {
  const def = catalog.props[p.type]!
  if (!def.canEnter && !freelyPassable.has(p.type)) {
    hardBlock.add(`${p.i - BI}.${p.j - BJ}`)
  }
}
const open = (x: number, y: number) =>
  cellEnter(x, y) && !hardBlock.has(`${x}.${y}`)

// BFS with the ice sliding mechanics
function reachable(sx: number, sy: number): Set<string> {
  const seen = new Set<string>([`${sx}.${sy}`])
  const queue: [number, number][] = [[sx, sy]]
  while (queue.length > 0) {
    const [x, y] = queue.pop()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let nx = x + dx
      let ny = y + dy
      if (!open(nx, ny)) continue
      // slide across the ice
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

const fromEntry = reachable(100, 22)
const mustReach: [string, number, number][] = [
  ["R1 door", 38, 60],
  ["R1 island (ice puzzle)", 40, 33],
  ["R2 arena", 160, 30],
  ["R3 plate", 29, 95],
  ["R4 boulders", 138, 95],
  ["R5 lanterns", 42, 151],
  ["R6 shrine", 134, 183],
  ["R7 maze entry", 92, 92],
  ["vault door", 100, 133],
  ["race goal", 100, 131],
  ["timer annex gate", 100, 10],
]
let ok = true
for (const [name, x, y] of mustReach) {
  const r = fromEntry.has(`${x}.${y}`)
  if (!r) ok = false
  console.log(`${r ? "ok" : "NG"} ${name} (${x}, ${y})`)
}
// The way back from the ice island must also exist
const fromIsland = reachable(40, 33)
const iceReturn = fromIsland.has("38.52")
console.log(`${iceReturn ? "ok" : "NG"} ice island return trip`)
// After sinking the boulders, the far side of R4 must open up
const backup = [grid[95][158], grid[95][159], grid[95][160]]
grid[95][158] = grid[95][159] = grid[95][160] = "5"
const bridged = reachable(100, 22).has("175.96")
;[grid[95][158], grid[95][159], grid[95][160]] = backup
console.log(`${bridged ? "ok" : "NG"} R4 far side after bridging`)
// The vault interior must NOT be reachable (key gates block it)
const vaultSealed = !fromEntry.has("100.150")
console.log(`${vaultSealed ? "ok" : "NG"} vault sealed without keys`)
// The moon alcove must not be reachable while the gate is closed
const alcoveSealed = !((() => {
  // recompute with moon-gate blocking
  hardBlock.add(`${20}.${150}`)
  const r = reachable(100, 22)
  hardBlock.delete(`${20}.${150}`)
  return r
})().has("16.150"))
console.log(`${alcoveSealed ? "ok" : "NG"} moon alcove sealed by day`)
if (!ok || !vaultSealed || !alcoveSealed || !iceReturn || !bridged) {
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
  new URL("../static/map/block_-400.400.json", import.meta.url),
  JSON.stringify(json, null, 2),
)
console.log("generated block_-400.400.json (puzzle dungeon)")
