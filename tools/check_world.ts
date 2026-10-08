// Checks that the world is one walkable map: from where the START
// portals land, every dungeon floor is reached on foot across the block
// borders (no portals), and the floors past B1F stay sealed until the
// B1F vault is open.
//
// The walk is optimistic: puzzle walls, gates and doors count as open
// (except the key gates when checking the seal), ice and belts as plain
// floor, and breakable props as passable.
//
// Usage: deno -A tools/check_world.ts
import { loadCatalog } from "../model/catalog.ts"

type Spawn = { i: number; j: number; type: string; data?: unknown }
type BlockJson = { i: number; j: number; props: Spawn[]; field: string[] }

const catalog = await loadCatalog(
  new URL("../static/catalog/base.json", import.meta.url).href,
  ["base.json"],
)

/** The world blocks (START, DEBUG and ZOO are separate islands) */
const blocks = new Map<string, BlockJson>()
for await (
  const e of Deno.readDir(new URL("../static/map/", import.meta.url))
) {
  const m = e.name.match(/^block_(-?\d+)\.(-?\d+)\.json$/)
  if (!m || Math.abs(Number(m[1])) >= 10000) continue
  const url = new URL(`../static/map/${e.name}`, import.meta.url)
  blocks.set(`${m[1]}.${m[2]}`, JSON.parse(await Deno.readTextFile(url)))
}

const OPEN_PROPS = new Set([
  "blue-wall",
  "red-wall",
  "and-wall",
  "shutter",
  "seal-wall",
  "slide-wall",
  "door",
  "apple-gate",
  "timer-gate",
  "moon-gate",
  "crate",
  "hatena",
  "chest",
])
const blocking = new Map<string, string>()
for (const b of blocks.values()) {
  for (const p of b.props) {
    if (!catalog.props[p.type]?.canEnter) blocking.set(`${p.i}.${p.j}`, p.type)
  }
}
const floor = (v: number) => Math.floor(v / 200) * 200

function passable(i: number, j: number, keyGatesOpen: boolean): boolean {
  const b = blocks.get(`${floor(i)}.${floor(j)}`)
  if (!b) return false
  const cell = b.field[j - b.j]?.[i - b.i]
  if (!cell || !catalog.cells[cell]?.canEnter) return false
  const prop = blocking.get(`${i}.${j}`)
  if (!prop) return true
  if (prop === "key-gate") return keyGatesOpen
  return OPEN_PROPS.has(prop)
}

function walk(starts: [number, number][], keyGatesOpen: boolean) {
  const seen = new Set<string>(starts.map(([i, j]) => `${i}.${j}`))
  const queue = [...starts]
  while (queue.length > 0) {
    const [i, j] = queue.pop()!
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di
      const nj = j + dj
      const key = `${ni}.${nj}`
      if (!seen.has(key) && passable(ni, nj, keyGatesOpen)) {
        seen.add(key)
        queue.push([ni, nj])
      }
    }
  }
  return seen
}

/** Where the START portals land in the world (tutorial, free roam, WILDS, CITY) */
const startBlock = JSON.parse(
  await Deno.readTextFile(
    new URL("../static/map/block_-10000.-10000.json", import.meta.url),
  ),
) as BlockJson
const ARRIVALS: [number, number][] = startBlock.props
  .filter((p) => p.type === "portal")
  .map((p) => p.data as { i: number; j: number })
  .filter((d) => Math.abs(d.i) < 10000 && Math.abs(d.j) < 10000)
  .map((d) => [d.i, d.j])

// the WILDS, its CAVERN and the CITY, where their generators put them
const plan = JSON.parse(
  await Deno.readTextFile(new URL("./wilds_plan.json", import.meta.url)),
) as {
  origin: { i: number; j: number }
  blocks: { w: number; h: number }
  cave: { x: number; y: number }
}
const WILDS_W = plan.blocks.w * 200
const WILDS_H = plan.blocks.h * 200
/** The middle of the cavern's great hall (75 cells in from its entrance) */
const CAVERN_IN: [number, number] = [
  plan.origin.i + Math.round(plan.cave.x * WILDS_W),
  plan.origin.j + Math.round(plan.cave.y * WILDS_H) + 75,
]
/** The WILDS arrival: the START portal landing inside the WILDS */
const WILDS_ARRIVAL = ARRIVALS.find(([i, j]) =>
  i >= plan.origin.i && i < plan.origin.i + WILDS_W &&
  j >= plan.origin.j && j < plan.origin.j + WILDS_H
)!
/** The CITY arrival: the START portal landing east of the WILDS */
const CITY_ARRIVAL = ARRIVALS.find(([i]) => i >= plan.origin.i + WILDS_W)!
/** A plaza cell of every dungeon floor (world coordinates) */
const FLOORS: [string, number, number][] = [
  ["B1F", -300, 422],
  ["B2F", 300, 422],
  ["B3F", 500, 422],
  ["B4F", 500, 222],
  ["B5F", 700, 218],
]

let ok = true
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "ok" : "NG"} ${name}`)
  if (!cond) ok = false
}

let portals = 0
for (const [id, b] of blocks) {
  for (const p of b.props) {
    if (p.type === "portal") {
      console.log(`  portal in block_${id} at ${p.i},${p.j}`)
      portals++
    }
  }
}
check("no portals inside the world", portals === 0)

const open = walk(ARRIVALS, true)
for (const [name, i, j] of FLOORS) {
  check(`${name} reached on foot`, open.has(`${i}.${j}`))
}
// from the WILDS arrival alone: the CAVERN inside the mountain (by the
// cave mouth) and the CITY (over the long bridge from the east pier)
check("WILDS and CITY portals found", !!WILDS_ARRIVAL && !!CITY_ARRIVAL)
const fromWilds = walk([WILDS_ARRIVAL], true)
check(
  "CAVERN reached on foot from the WILDS",
  // (the middle itself may hold a stalagmite)
  [...Array(49).keys()].some((k) =>
    fromWilds.has(
      `${CAVERN_IN[0] + (k % 7) - 3}.${CAVERN_IN[1] + Math.floor(k / 7) - 3}`,
    )
  ),
)
check(
  "CITY reached on foot from the WILDS",
  fromWilds.has(CITY_ARRIVAL.join(".")),
)
const sealed = walk(ARRIVALS, false)
check("B1F reached without keys", sealed.has(`${FLOORS[0][1]}.${FLOORS[0][2]}`))
for (const [name, i, j] of FLOORS.slice(1)) {
  check(`${name} sealed behind the B1F vault`, !sealed.has(`${i}.${j}`))
}

if (!ok) {
  console.error("world check failed")
  Deno.exit(1)
}
