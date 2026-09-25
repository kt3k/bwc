// Generates the fifth floor of the puzzle dungeon (block_600.200),
// reached from the B4F plaza. Three rooms, one per animal with a mind
// of its own (see ideas/game-ideas-4.md). As on B4F, the player never
// presses the button: the animal does, and the player arranges it.
//
// - M1 the mirror hall: the mirror child copies every step with left
//   and right swapped. Its room has a pillar the player's room lacks;
//   stalling it there shifts the pair out of sync, which is the only
//   way to reach the two buttons in its walls
// - M2 the pasture: the sheep runs from the player and can't be pushed.
//   Herd it down the chute onto the plate that holds the far door open
// - M3 the crow's lake: the crow ferries the key from its island to its
//   nest over the water. Its flight crosses the one strip of land; bump
//   it there and it drops the key
//
// Usage: deno -A tools/generate_puzzle_dungeon5.ts
import { loadCatalog } from "../model/catalog.ts"

const SIZE = 200
const BI = 600
const BJ = 200

type Spawn = {
  i: number
  j: number
  type: string
  dir?: string
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
const actor = (i: number, j: number, type: string, dir?: string) =>
  actors.push({ i: i + BI, j: j + BJ, type, dir })
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

// ---------------------------------------------------------------------
// skeleton: plaza, spine, three rooms in a row

rect(80, 6, 120, 30, "c") // cobbled plaza
rect(98, 31, 102, 39, "0")
rect(10, 40, 190, 44, "0")
prop(100, 16, "portal-out")
prop(96, 16, "portal", { i: 500, j: 220 }) // back to the B4F plaza
sign(104, 16, "DUNGEON B5F: THE MENAGERIE")
sign(93, 16, "BACK TO B4F")
sign(100, 26, "THEY ALL HAVE MINDS OF THEIR OWN. WORK WITH THEM")
sign(100, 36, "LOST? WALK FAR AWAY AND THE ROOM RESETS")
item(84, 10, "coin")
item(116, 28, "coin")
grid[10][116] = "x" // dig spot

// ---------------------------------------------------------------------
// M1 (x 20..60): the mirror hall -> chest
//
// Two identical 7x7 rooms side by side. While the pair stays in sync
// they hit the walls together and the mirror never reaches a button.
// The pillar in its room is the one thing that stalls it alone.

const M1_ENTRY: [number, number] = [31, 45]
rect(31, 45, 31, 48, "0") // the vestibule
rect(28, 50, 34, 56, "0") // the player's room
rect(36, 50, 42, 56, "0") // the mirror's room
grid[49][31] = "0" // the way in
grid[53][40] = "2" // the pillar
actor(39, 53, "mirror", "down")
gate(37, 49, "seq-button", { group: "m1", order: 1 })
gate(43, 51, "seq-button", { group: "m1", order: 2 })
alcove(27, 57, 35, 63)
gate(31, 57, "seal-wall", { group: "m1", count: 2 })
prop(31, 60, "chest", { drops: "coin", count: 8 })
item(28, 58, "coin")
item(34, 62, "green-apple")
sign(30, 46, "THE MIRROR CHILD COPIES YOU, LEFT AND RIGHT SWAPPED")
sign(32, 46, "WALLS STOP IT. THEY DON'T STOP YOU")
sign(33, 48, "ITS BUTTONS: 1 ABOVE IT, 2 TO ITS RIGHT")

// ---------------------------------------------------------------------
// M2 (x 80..120): the pasture -> chest
//
// A grass pasture with a one-wide chute in its south fence. The plate
// at the bottom of the chute holds the door on the far side open.

const M2_ENTRY: [number, number] = [100, 45]
rect(100, 45, 100, 48, "0") // the vestibule
rect(90, 50, 110, 60, "f") // the pasture
grid[49][100] = "f" // the gate in the fence
rect(108, 61, 108, 63, "f") // the chute
prop(108, 63, "plate", { group: "m2" })
actor(96, 54, "sheep", "down")
alcove(83, 52, 89, 58)
gate(89, 55, "door", { group: "m2" })
prop(85, 55, "chest", { drops: "coin", count: 10 })
item(84, 53, "coin")
item(84, 57, "coin")
for (const [x, y] of [[92, 51], [106, 51], [92, 59]]) item(x, y, "coin")
sign(98, 46, "SHEEP RUN FROM YOU. THEY CAN'T BE PUSHED")
sign(102, 46, "THE DOOR IS OPEN WHILE SOMETHING STANDS ON THE PLATE")
sign(110, 62, "A CORNERED SHEEP STAYS PUT")

// ---------------------------------------------------------------------
// M3 (x 140..180): the crow's lake -> chest
//
// The key sits on one island, the nest on another, 7 cells apart. The
// only land between them is the strip the player walks down.

const M3_ENTRY: [number, number] = [160, 45]
const KEY: [number, number] = [157, 62]
const NEST: [number, number] = [164, 62]
rect(150, 50, 170, 72, "w") // the lake
rect(160, 45, 160, 72, "y") // the strip (sand)
grid[KEY[1]][KEY[0]] = "0"
grid[NEST[1]][NEST[0]] = "0"
item(KEY[0], KEY[1], "key")
actor(NEST[0], NEST[1], "crow", "left")
alcove(156, 73, 164, 79)
gate(160, 73, "key-gate")
prop(160, 76, "chest", { drops: "coin", count: 10 })
item(157, 74, "coin")
item(163, 78, "coin")
for (const y of [47, 50]) item(160, y, "coin")
sign(159, 46, "CROWS STEAL SHINY THINGS AND FLY OVER WATER")
sign(161, 46, "A CROW BUMPED ON LAND DROPS WHAT IT CARRIES")
sign(159, 72, "THE KEY GATE")

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
const propAt = new Map<string, Spawn>()
for (const p of props) propAt.set(`${p.i - BI}.${p.j - BJ}`, p)
const cellEnter = (x: number, y: number) =>
  x >= 0 && x < SIZE && y >= 0 && y < SIZE &&
  (catalog.cells[grid[y][x]]?.canEnter ?? false)
/** Walkable terrain without a blocking prop (puzzle walls closed) */
const open = (x: number, y: number) => {
  const p = propAt.get(`${x}.${y}`)
  return cellEnter(x, y) && (!p || catalog.props[p.type]!.canEnter)
}
const DIRS4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

function reachable(sx: number, sy: number): Set<string> {
  const seen = new Set<string>([`${sx}.${sy}`])
  const queue: [number, number][] = [[sx, sy]]
  while (queue.length > 0) {
    const [x, y] = queue.pop()!
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx
      const ny = y + dy
      const key = `${nx}.${ny}`
      if (open(nx, ny) && !seen.has(key)) {
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
const ENTRY: [number, number] = [100, 18]
const sealed = reachable(...ENTRY)
for (
  const [name, [x, y]] of [
    ["M1 player room", [31, 53]],
    ["M2 pasture", [100, 55]],
    ["M2 plate", [108, 63]],
    ["M3 strip", [160, 62]],
    ["M3 key gate front", [160, 72]],
  ] as [string, [number, number]][]
) check(`${name} reachable`, sealed.has(`${x}.${y}`))
for (
  const [name, [x, y]] of [
    ["M1 mirror room", [39, 53]],
    ["M1 alcove", [31, 60]],
    ["M2 alcove", [85, 56]],
    ["M3 key island", KEY],
    ["M3 nest", NEST],
    ["M3 alcove", [160, 77]],
  ] as [string, [number, number]][]
) check(`${name} sealed`, !sealed.has(`${x}.${y}`))

// M1: search over (player, mirror, buttons lit). A player step that
// succeeds makes the mirror try the mirrored step; a mirror step into a
// button presses it (the right one lights, a skipped one resets).
{
  const buttonOrder = (x: number, y: number) => {
    const p = propAt.get(`${x}.${y}`)
    return p?.type === "seq-button" ? (p.data as { order: number }).order : 0
  }
  const playerCells = [...reachable(...M1_ENTRY)].filter((k) => {
    const [x, y] = k.split(".").map(Number)
    return x >= 28 && x <= 34 && y >= 45 && y <= 56
  })
  const mirrorCells: [number, number][] = []
  for (let y = 50; y <= 56; y++) {
    for (let x = 36; x <= 42; x++) if (open(x, y)) mirrorCells.push([x, y])
  }
  const inPlayerArea = new Set(playerCells)
  type St = [number, number, number, number, number]
  const next = ([px, py, mx, my, lit]: St, [dx, dy]: [number, number]) => {
    const nx = px + dx
    const ny = py + dy
    if (!inPlayerArea.has(`${nx}.${ny}`)) return null
    const tx = mx - dx
    const ty = my + dy
    const order = buttonOrder(tx, ty)
    if (order > 0) {
      const lit2 = order === lit + 1 ? lit + 1 : order > lit + 1 ? 0 : lit
      return [nx, ny, mx, my, lit2] as St
    }
    if (open(tx, ty) && tx >= 36 && tx <= 42) {
      return [nx, ny, tx, ty, lit] as St
    }
    return [nx, ny, mx, my, lit] as St
  }
  const key = (s: St) => s.join(",")
  const explore = (start: St) => {
    const dist = new Map<string, number>([[key(start), 0]])
    const queue: St[] = [start]
    let solvedIn = -1
    for (let n = 0; n < queue.length; n++) {
      const s = queue[n]
      if (s[4] === 2 && solvedIn < 0) solvedIn = dist.get(key(s))!
      for (const d of DIRS4) {
        const t = next(s, d)
        if (t && !dist.has(key(t))) {
          dist.set(key(t), dist.get(key(s))! + 1)
          queue.push(t)
        }
      }
    }
    return { solvedIn, states: queue }
  }
  // Every state reachable from any start, and the ones that can still
  // reach the goal (a backward search over the same graph)
  const all = new Map<string, St>()
  const preds = new Map<string, string[]>()
  const queue: St[] = mirrorCells.map(([mx, my]) => [...M1_ENTRY, mx, my, 0])
  for (const s of queue) all.set(key(s), s)
  let everyStart = true
  for (const s of queue.slice()) {
    if (explore(s).solvedIn < 0) everyStart = false
  }
  for (let n = 0; n < queue.length; n++) {
    const s = queue[n]
    for (const d of DIRS4) {
      const t = next(s, d)
      if (!t) continue
      const k = key(t)
      if (!preds.has(k)) preds.set(k, [])
      preds.get(k)!.push(key(s))
      if (!all.has(k)) {
        all.set(k, t)
        queue.push(t)
      }
    }
  }
  const alive = new Set<string>()
  const back = [...all.values()].filter((s) => s[4] === 2).map(key)
  for (const k of back) alive.add(k)
  while (back.length > 0) {
    for (const p of preds.get(back.pop()!) ?? []) {
      if (!alive.has(p)) {
        alive.add(p)
        back.push(p)
      }
    }
  }
  const softLock = [...all.keys()].some((k) => !alive.has(k))
  check("M1 solvable from every mirror position", everyStart)
  check("M1 has no soft lock", !softLock)
  const synced = explore([...M1_ENTRY, 39, 53, 0]).solvedIn
  console.log(`   M1 shortest solution: ${synced} steps`)
  check("M1 is no walk-in", synced >= 12)
}

// M2: the sheep flees one step per turn, widening the manhattan
// distance (straight away first, then a random sidestep). The random
// sidestep is played by an adversary: the player must be able to force
// the sheep onto the plate whatever it picks, by day and by night.
{
  const pasture = new Set<string>()
  for (let y = 49; y <= 63; y++) {
    for (let x = 88; x <= 112; x++) {
      if (open(x, y) && grid[y][x] === "f") pasture.add(`${x}.${y}`)
    }
  }
  const PLATE = "108.63"
  const sheepSteps = (
    [px, py]: number[],
    [sx, sy]: number[],
    range: number,
  ): number[][] => {
    const di = sx - px
    const dj = sy - py
    const dist = Math.abs(di) + Math.abs(dj)
    if (dist > range) return [[sx, sy]]
    const away: [number, number][] = []
    const ax: [number, number] | null = di !== 0 ? [Math.sign(di), 0] : null
    const ay: [number, number] | null = dj !== 0 ? [0, Math.sign(dj)] : null
    for (
      const d of Math.abs(di) >= Math.abs(dj) ? [ax, ay] : [ay, ax]
    ) if (d) away.push(d)
    const enter = (x: number, y: number) =>
      (pasture.has(`${x}.${y}`) || open(x, y)) && !(x === px && y === py)
    for (const [dx, dy] of away) {
      if (enter(sx + dx, sy + dy)) return [[sx + dx, sy + dy]]
    }
    const sideways = DIRS4.filter(([dx, dy]) =>
      !away.some(([ex, ey]) => ex === dx && ey === dy) &&
      Math.abs(sx + dx - px) + Math.abs(sy + dy - py) > dist
    ).filter(([dx, dy]) => enter(sx + dx, sy + dy))
    if (sideways.length === 0) return [[sx, sy]]
    return sideways.map(([dx, dy]) => [sx + dx, sy + dy])
  }
  const playerArea = [...reachable(...M2_ENTRY)].filter((k) => {
    const [x, y] = k.split(".").map(Number)
    return x >= 88 && x <= 112 && y >= 45 && y <= 63
  })
  const inArea = new Set(playerArea)
  const sheepArea = [...pasture]
  const P = playerArea.length
  const S = sheepArea.length
  const sheepIndex = new Map(sheepArea.map((k, n) => [k, n]))
  const plate = sheepIndex.get(PLATE)!
  const entry = playerArea.indexOf(M2_ENTRY.join("."))
  const start = sheepIndex.get("96.54")!
  for (const range of [3, 6]) {
    // The outcomes of each (player cell, sheep cell, player move) as
    // state indices; -1 stands for a sheep that left the pasture (a loss)
    const moves: [number, number][] = [[0, 0], ...DIRS4]
    const outcomes: Int32Array[] = []
    for (let pi = 0; pi < P; pi++) {
      const [px, py] = playerArea[pi].split(".").map(Number)
      for (let si = 0; si < S; si++) {
        const [sx, sy] = sheepArea[si].split(".").map(Number)
        for (const [dx, dy] of moves) {
          const nx = px + dx
          const ny = py + dy
          const moved = inArea.has(`${nx}.${ny}`) && !(nx === sx && ny === sy)
          const pp = moved ? `${nx}.${ny}` : `${px}.${py}`
          const ppi = moved ? playerArea.indexOf(pp) : pi
          const [qx, qy] = pp.split(".").map(Number)
          outcomes.push(
            Int32Array.from(
              sheepSteps([qx, qy], [sx, sy], range).map(([tx, ty]) => {
                const ti = sheepIndex.get(`${tx}.${ty}`)
                return ti === undefined ? -1 : ppi * S + ti
              }),
            ),
          )
        }
      }
    }
    // Attractor: states from which the player can force the goal
    const win = new Uint8Array(P * S)
    for (let pi = 0; pi < P; pi++) win[pi * S + plate] = 1
    let grew = true
    while (grew) {
      grew = false
      for (let st = 0; st < P * S; st++) {
        if (win[st]) continue
        for (let m = 0; m < moves.length; m++) {
          const out = outcomes[st * moves.length + m]
          if (out.every((t) => t >= 0 && win[t] === 1)) {
            win[st] = 1
            grew = true
            break
          }
        }
      }
    }
    check(
      `M2 the sheep can be herded onto the plate (range ${range})`,
      win[entry * S + start] === 1,
    )
  }
  // A sheep on the plate is cornered: the player can leave for the door
  const [plx, ply] = PLATE.split(".").map(Number)
  check(
    "M2 the chute is a dead end",
    DIRS4.filter(([dx, dy]) => pasture.has(`${plx + dx}.${ply + dy}`))
      .length === 1,
  )
  check(
    "M2 the plate is far from the door",
    Math.abs(plx - 89) + Math.abs(ply - 55) > 12,
  )
}

// M3: the crow's flight from the nest to the key crosses the strip, and
// the key is within its reach
{
  check(
    "M3 the flight line is walkable from the strip's entry",
    reachable(...M3_ENTRY).has(`160.${KEY[1]}`),
  )
  const reach = Math.abs(KEY[0] - NEST[0]) + Math.abs(KEY[1] - NEST[1])
  check("M3 key within the crow's range (7)", reach <= 7)
  let crossesLand = false
  for (let x = KEY[0] + 1; x < NEST[0]; x++) {
    if (open(x, KEY[1])) crossesLand = true
  }
  check("M3 the flight crosses the strip", crossesLand)
  check(
    "M3 the strip is in the crow's wake range (8) near the flight line",
    Math.abs(160 - NEST[0]) + 1 <= 8,
  )
  check(
    "M3 the strip coins are out of the crow's reach",
    [47, 50].every((y) => Math.abs(160 - NEST[0]) + Math.abs(y - NEST[1]) > 7),
  )
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
  new URL("../static/map/block_600.200.json", import.meta.url),
  JSON.stringify(json, null, 2),
)
console.log("generated block_600.200.json (puzzle dungeon B5F)")
