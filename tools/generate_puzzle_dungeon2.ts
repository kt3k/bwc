// Generates the second floor of the puzzle dungeon (block_200.400),
// reached by the portal inside the first floor's vault (3 keys).
// Harder combination puzzles than the first floor:
//
// - S1 ice x conveyor weave: belts redirect the slide mid-lane (B-7+B-2)
// - S2 double water channel: 4 boulders bridge 2 channels in order (B-1)
// - S3 chaser doorman: lure a chaser onto the plates to open the door
//   (A-1 x B-3: ANY actor on a plate holds the door)
// - S4 dual boulder parking: park 2 boulders on 2 plates with tree
//   stoppers to open the twin doors (B-4 x A-1)
// - S5 moon garden: rich coin garden behind the moon gate, with ghosts
//   inside and unlit lanterns to make farming safe (B-5)
// - S6 purple dash: timer gates tuned for the purple mushroom's 4x
//   straight dash (A-5)
// - Vault 2: two key gates (keys from S3 and S4), the grand treasure
//   and a shortcut portal back to the first floor
//
// The layout is verified with an ice+conveyor movement simulation.
//
// Usage: deno -A tools/generate_puzzle_dungeon2.ts
import { loadCatalog } from "../model/catalog.ts"

const SIZE = 200
const BI = 200
const BJ = 400

type Spawn = { i: number; j: number; type: string; data?: unknown }

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

const actor = (i: number, j: number, type: string) =>
  actors.push({ i: i + BI, j: j + BJ, type })
const item = (i: number, j: number, type: string) =>
  items.push({ i: i + BI, j: j + BJ, type })
const prop = (i: number, j: number, type: string, data?: unknown) =>
  props.push({ i: i + BI, j: j + BJ, type, data })
const sign = (i: number, j: number, text: string) =>
  prop(i, j, "sign", { text })

// ---------------------------------------------------------------------
// corridors (base floor "4" to distinguish the floor from B1F)

rect(8, 58, 192, 62, "4") // horizontal spine
rect(98, 55, 102, 132, "4") // center: plaza -> vault approach
rect(74, 62, 78, 190, "4") // west corridor
rect(122, 62, 126, 190, "4") // east corridor

// ---------------------------------------------------------------------
// plaza (entry from the B1F vault)

rect(80, 10, 120, 55, "4")
prop(100, 20, "portal-out")
prop(96, 20, "portal", { i: -292, j: 545 }) // back to the B1F vault
sign(104, 20, "DUNGEON B2F: MASTERS ONLY")
sign(93, 20, "BACK TO B1F")
grid[50][85] = "x" // dig spot

// ---------------------------------------------------------------------
// S1 (NW): ice x conveyor weave -> coins

rect(10, 10, 70, 53, "4")
rect(36, 53, 40, 58, "4") // door stub
rect(14, 14, 66, 50, "i")
// belts crossing the ice redirect the slide
for (let x = 24; x <= 32; x++) grid[30][x] = "e"
for (let x = 40; x <= 48; x++) grid[38][x] = "o"
// pegs
for (
  const [px, py] of [
    [24, 20],
    [50, 24],
    [30, 44],
    [56, 36],
    [44, 18],
    [18, 34],
    [62, 44],
  ]
) {
  grid[py][px] = "2"
}
// the island with the reward
rect(38, 22, 44, 26, "4")
for (const [x, y] of [[39, 24], [41, 24], [43, 24]]) item(x, y, "coin")
item(40, 23, "green-apple")
// entry strip
rect(36, 46, 40, 50, "4")
prop(38, 48, "spring")
sign(36, 47, "BELTS BEND THE SLIDE")

// ---------------------------------------------------------------------
// S2 (NE): double water channels -> chest

rect(130, 10, 190, 53, "4")
rect(158, 53, 162, 58, "4") // door stub
rect(146, 12, 147, 51, "w") // channel 1
rect(166, 12, 167, 51, "w") // channel 2
// Spaced out: pushing a west boulder first crushes the one ahead,
// so the east-most-first order matters
actor(131, 30, "boulder")
actor(134, 30, "boulder")
actor(136, 30, "boulder")
actor(140, 30, "boulder")
sign(135, 26, "FOUR BOULDERS, FOUR WATER CELLS")
sign(140, 34, "PUSH THE EAST ONE FIRST. LEAVE TO RESET")
for (const [x, y] of [[172, 30], [176, 25], [180, 35]]) item(x, y, "coin")
prop(180, 30, "chest", { drops: "coin", count: 12 })
item(184, 30, "green-apple")

// ---------------------------------------------------------------------
// S3 (W): chaser doorman -> key 1

rect(10, 70, 70, 115, "4")
rect(70, 90, 74, 94, "4") // door stub
// reward alcove behind the door
rect(24, 74, 36, 86, "2")
rect(26, 76, 34, 84, "4")
grid[86][30] = "4"
prop(30, 86, "door", { group: "s3" })
item(30, 80, "key")
item(28, 78, "coin")
item(32, 82, "coin")
// plates in front of the door approach: any actor holds the door open
prop(29, 88, "plate", { group: "s3" })
prop(30, 88, "plate", { group: "s3" })
prop(31, 88, "plate", { group: "s3" })
actor(50, 100, "chaser")
item(55, 105, "apple")
item(45, 108, "apple")
sign(34, 90, "THE DOOR OPENS WHILE ANYONE STANDS ON A PLATE")
sign(55, 98, "EVEN AN ENEMY...")

// ---------------------------------------------------------------------
// S4 (E): dual boulder parking -> key 2

rect(130, 70, 190, 115, "4")
rect(126, 90, 130, 94, "4") // door stub
// lane 1: push the boulder west along y=80, park it on the plate
prop(150, 80, "plate", { group: "s4a" })
actor(184, 80, "boulder")
// lane 2: push the boulder north along x=170, park it on the plate
prop(170, 96, "plate", { group: "s4b" })
actor(170, 112, "boulder")
// twin doors guarding the alcove, on a 1-wide entry tunnel
rect(132, 100, 140, 112, "2")
rect(134, 102, 138, 110, "4")
rect(141, 104, 144, 108, "2")
grid[106][140] = "4"
grid[106][141] = "4"
grid[106][142] = "4"
grid[106][143] = "4"
grid[106][144] = "4"
prop(140, 106, "door", { group: "s4a" })
prop(142, 106, "door", { group: "s4b" })
item(136, 106, "key")
item(134, 104, "coin")
item(138, 108, "coin")
for (const [x, y] of [[155, 88], [160, 88], [158, 92], [162, 90]]) {
  item(x, y, "seed")
}
sign(146, 76, "PARK BOTH BOULDERS ON BOTH PLATES")
sign(166, 108, "TREES STOP ROLLING BOULDERS")

// ---------------------------------------------------------------------
// S5 (SW): moon garden

rect(10, 130, 70, 190, "4")
rect(70, 148, 74, 152, "4") // door stub
// the moon-gate wall splits the room
for (let y = 130; y <= 190; y++) grid[y][48] = "2"
grid[150][48] = "4"
prop(48, 150, "moon-gate")
sign(52, 148, "MOON GARDEN: RICHES BY NIGHT, GHOSTS TOO")
// the garden: coins, ghosts and unlit lanterns
for (let y = 138; y <= 182; y += 6) {
  for (let x = 16; x <= 44; x += 7) {
    item(x, y, "coin")
  }
}
for (const [x, y] of [[20, 150], [40, 165], [30, 178]]) {
  item(x, y, "green-apple")
}
actor(25, 145, "ghost")
actor(40, 160, "ghost")
actor(20, 175, "ghost")
prop(32, 144, "lantern-unlit")
prop(22, 162, "lantern-unlit")
prop(42, 176, "lantern-unlit")
prop(32, 184, "lantern-unlit")

// ---------------------------------------------------------------------
// S6 (SE): purple dash through the timer gates

rect(130, 130, 190, 190, "4")
rect(126, 148, 130, 152, "4") // door stub
// entry chamber with the purple mushroom
item(133, 150, "purple-mushroom")
sign(133, 146, "PURPLE DASH BEATS THE CLOCK")
sign(133, 154, "OPEN THE GATE, THEN DASH EAST")
// the corridor legs are all 1 cell wide so the gates can't be skipped
for (let y = 132; y <= 190; y++) {
  for (let x = 136; x <= 190; x++) grid[y][x] = "2"
}
grid[150][136] = "4"
prop(136, 150, "timer-gate", { duration: 400 })
rect(137, 150, 185, 150, "4") // leg 1: a long straight dash east
for (const x of [150, 160, 170]) item(x, 150, "coin")
rect(185, 151, 185, 180, "4") // leg 2: south
prop(185, 168, "timer-gate", { duration: 240 })
rect(150, 180, 184, 180, "4") // leg 3: back west to the reward
for (const x of [175, 165]) item(x, 180, "coin")
item(151, 180, "green-apple")
prop(150, 180, "chest", { drops: "coin", count: 10 })

// ---------------------------------------------------------------------
// vault 2: two key gates -> the grand treasure

rect(86, 135, 114, 172, "2")
rect(88, 136, 112, 170, "4")
rect(100, 132, 100, 136, "4") // 1-wide gate corridor
prop(100, 132, "key-gate")
prop(100, 134, "key-gate")
sign(97, 129, "VAULT 2: TWO KEYS")
for (let y = 142; y <= 162; y += 4) {
  for (let x = 90; x <= 110; x += 4) {
    item(x, y, "coin")
  }
}
prop(92, 168, "chest", { drops: "coin", count: 12 })
prop(108, 168, "chest", { drops: "seed", count: 4 })
sign(100, 139, "GIMMICK GRANDMASTER!")
grid[166][95] = "x" // dig spots
grid[166][105] = "x"
prop(100, 166, "portal", { i: -300, j: 420 }) // shortcut to the B1F plaza
sign(103, 166, "SHORTCUT OUT")

// ---------------------------------------------------------------------
// verification (movement simulation with ice and conveyor belts)

const catalog = await loadCatalog(
  new URL("../static/catalog/base.json", import.meta.url).href,
  ["base.json"],
)
const cellEnter = (x: number, y: number) =>
  x >= 0 && x < SIZE && y >= 0 && y < SIZE &&
  (catalog.cells[grid[y][x]]?.canEnter ?? false)
const isIce = (x: number, y: number) => grid[y][x] === "i"
const beltDir = (x: number, y: number): [number, number] | null => {
  switch (grid[y][x]) {
    case "n":
      return [0, -1]
    case "s":
      return [0, 1]
    case "o":
      return [-1, 0]
    case "e":
      return [1, 0]
    default:
      return null
  }
}

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

/** Resolves the forced movement (belts and ice) after entering (x, y) */
function resolve(
  x: number,
  y: number,
  dx: number,
  dy: number,
): [number, number] {
  for (let guard = 0; guard < 500; guard++) {
    const belt = beltDir(x, y)
    if (belt) {
      const [bx, by] = belt
      if (open(x + bx, y + by)) {
        x += bx
        y += by
        dx = bx
        dy = by
        continue
      }
      break
    }
    if (isIce(x, y) && open(x + dx, y + dy)) {
      x += dx
      y += dy
      continue
    }
    break
  }
  return [x, y]
}

function reachable(sx: number, sy: number): Set<string> {
  const seen = new Set<string>([`${sx}.${sy}`])
  const queue: [number, number][] = [[sx, sy]]
  while (queue.length > 0) {
    const [x, y] = queue.pop()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!open(x + dx, y + dy)) continue
      const [fx, fy] = resolve(x + dx, y + dy, dx, dy)
      const key = `${fx}.${fy}`
      if (!seen.has(key)) {
        seen.add(key)
        queue.push([fx, fy])
      }
    }
  }
  return seen
}

const fromEntry = reachable(100, 22)
const mustReach: [string, number, number][] = [
  ["S1 entry strip", 38, 48],
  ["S1 island (ice+belt puzzle)", 40, 24],
  ["S2 boulders", 136, 30],
  ["S3 plates", 30, 89],
  ["S4 lanes", 160, 80],
  ["S5 gate front", 52, 150],
  ["S6 mushroom chamber", 133, 151],
  ["vault 2 door", 100, 130],
]
let ok = true
for (const [name, x, y] of mustReach) {
  const r = fromEntry.has(`${x}.${y}`)
  if (!r) ok = false
  console.log(`${r ? "ok" : "NG"} ${name} (${x}, ${y})`)
}
// the return trip from the S1 island
const iceReturn = reachable(40, 24).has("38.48")
console.log(`${iceReturn ? "ok" : "NG"} S1 island return trip`)
// S2 far side opens after sinking all four boulders
const backup = [grid[30][146], grid[30][147], grid[30][166], grid[30][167]]
grid[30][146] =
  grid[30][147] =
  grid[30][166] =
  grid[30][167] =
    "4"
const bridged = reachable(100, 22).has("180.31")
;[grid[30][146], grid[30][147], grid[30][166], grid[30][167]] = backup
console.log(`${bridged ? "ok" : "NG"} S2 far side after bridging`)
// the vault must stay sealed without keys
const vaultSealed = !fromEntry.has("100.150")
console.log(`${vaultSealed ? "ok" : "NG"} vault 2 sealed without keys`)
// the moon garden must stay sealed while the gate is closed
hardBlock.add("48.150")
const gardenSealed = !reachable(100, 22).has("30.150")
hardBlock.delete("48.150")
console.log(`${gardenSealed ? "ok" : "NG"} moon garden sealed by day`)
if (!ok || !iceReturn || !bridged || !vaultSealed || !gardenSealed) {
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
  new URL("../static/map/block_200.400.json", import.meta.url),
  JSON.stringify(json, null, 2),
)
console.log("generated block_200.400.json (puzzle dungeon B2F)")
