// The hall of the debug portals on the START island
// (tools/start_portals.ts): every debug place has a portal there, walked
// to from the start, landing on a walkable cell of its map, with its name
// written on the ground beside it (no sign), and no two portals on a cell
import { assert, assertEquals } from "@std/assert"
import { loadCatalog } from "../model/catalog.ts"
import { DESTINATIONS, resolve, slot } from "./start_portals.ts"

// deno-lint-ignore no-explicit-any
type Spawn = { i: number; j: number; type: string; data?: any }
type Block = {
  i: number
  j: number
  props: Spawn[]
  actors?: Spawn[]
  items?: Spawn[]
  field: string[]
}
const SIZE = 200
const read = async (i: number, j: number) =>
  JSON.parse(
    await Deno.readTextFile(
      new URL(`../static/map/block_${i}.${j}.json`, import.meta.url),
    ),
  ) as Block
const catalog = await loadCatalog(
  new URL("../static/catalog/base.json", import.meta.url).href,
  ["base.json"],
)
const start = await read(-10000, -10000)
/** The start position of the game (see game/game-screen.ts) */
const START = { i: -9964, j: -9981 }
const places = await resolve()
const portals = start.props.filter((p) => p.type === "portal")
const propAt = (b: Block, i: number, j: number) =>
  b.props.filter((p) => p.i === i && p.j === j)

Deno.test("start portals: the debug places are the ones the maps have", () => {
  assertEquals(
    places.map((p) => p.name),
    ["DEBUG", "GROUPS", "CAYLEY", "GOALS", "ZOO", "TOWN", "BAIT", "HOMES"],
  )
  assertEquals(places.length, DESTINATIONS.length)
})

Deno.test("start portals: one portal on START to each place, named on the ground", () => {
  places.forEach(({ name, to }, n) => {
    const here = portals.filter((p) => p.data.i === to.i && p.data.j === to.j)
    assertEquals(here.length, 1, name)
    const { x, y } = slot(n)
    const p = here[0]
    assertEquals([p.i - start.i, p.j - start.j], [x, y], name)
    // the name, a white letter a cell, right of the portal
    const word = [...name.toLowerCase()].map((_ch, k) => {
      const at = propAt(start, p.i + 1 + k, p.j)
      assertEquals(at.length, 1, `${name}: ${k}`)
      return at[0].type
    })
    assertEquals(word, [...name.toLowerCase()].map((ch) => `${ch}_white`))
  })
})

Deno.test("start portals: each lands on a walkable cell of its map", async () => {
  for (const { name, to } of places) {
    const bi = Math.floor(to.i / SIZE) * SIZE
    const bj = Math.floor(to.j / SIZE) * SIZE
    const block = await read(bi, bj)
    const cell = block.field[to.j - bj][to.i - bi]
    assert(catalog.cells[cell]?.canEnter, `${name}: lands on ${cell}`)
    for (const p of propAt(block, to.i, to.j)) {
      assert(catalog.props[p.type]?.canEnter, `${name}: lands on ${p.type}`)
      assert(p.type !== "portal", `${name}: lands on a portal`)
    }
  }
})

Deno.test("start portals: no two portals share a cell, no signs in the hall", () => {
  const cells = portals.map((p) => `${p.i},${p.j}`)
  assertEquals(new Set(cells).size, cells.length)
  const at = new Map<string, string[]>()
  for (const p of start.props) {
    const k = `${p.i},${p.j}`
    at.set(k, [...(at.get(k) ?? []), p.type])
  }
  for (const [k, types] of at) assertEquals(types.length, 1, `${k}: ${types}`)
  const ys = places.map((_, n) => slot(n).y)
  const xs = places.map((_, n) => slot(n).x)
  const signs = start.props.filter((p) => {
    const x = p.i - start.i, y = p.j - start.j
    return p.type === "sign" && y >= Math.min(...ys) - 2 &&
      y <= Math.max(...ys) + 1 && x >= Math.min(...xs) - 1 &&
      x <= Math.max(...xs) + 8
  })
  assertEquals(signs, [])
})

Deno.test("start portals: every one is walked to from the start", () => {
  const N = start.field.length
  const seen = new Set<string>()
  const queue = [[START.i - start.i, START.j - start.j]]
  seen.add(String(queue[0]))
  while (queue.length) {
    const [x, y] = queue.pop()!
    // a portal takes you away: no walking on past it
    if (portals.some((p) => p.i - start.i === x && p.j - start.j === y)) {
      continue
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue
      if (seen.has(String([nx, ny]))) continue
      if (!catalog.cells[start.field[ny][nx]]?.canEnter) continue
      seen.add(String([nx, ny]))
      queue.push([nx, ny])
    }
  }
  places.forEach(({ name }, n) => {
    const { x, y } = slot(n)
    assert(seen.has(String([x, y])), `${name} can't be walked to`)
  })
})
