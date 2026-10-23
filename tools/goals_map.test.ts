// The GOALS debug map (tools/generate_goals_map.ts, tools/goals_map.ts):
// a bay for every ring signature, each ring solvable and of the
// signature it is named for; a bay for every odd one family; the resets
// scoped to the map; the portal to it on the start island
import { assert, assertEquals } from "@std/assert"
import { ODD_FAMILIES, unlikeType } from "../model/odd-families.ts"
import {
  ARRIVAL,
  BI,
  BJ,
  type BlockJson,
  oddId,
  PREFIX,
  readRingBay,
  SIZE,
} from "./goals_map.ts"
import { MAX_PUSHES, MIN_PUSHES, sigName, signature, solve } from "./rings.ts"

const read = async (name: string) =>
  JSON.parse(
    await Deno.readTextFile(new URL(`../static/map/${name}`, import.meta.url)),
  ) as BlockJson
const block = await read(`block_${BI}.${BJ}.json`)
const slots = block.props.filter((p) => p.type === "ring-slot")

Deno.test("goals map: a ring for every signature, each solvable and of its signature", () => {
  // the WILDS have 13 signatures; the map has them and maybe more
  assert(slots.length >= 13, `${slots.length} rings`)
  const ids = new Set<string>()
  for (let n = 0; n < slots.length; n++) {
    const bay = readRingBay(block, n)
    assert(bay, `ring bay ${n}`)
    const { id, layout } = bay
    assert(id.startsWith(PREFIX), id)
    assert(!ids.has(id), `${id} twice`)
    ids.add(id)
    const solved = solve(layout)
    assert(solved, `${id} can't be solved`)
    assert(solved.pushes >= MIN_PUSHES && solved.pushes <= MAX_PUSHES, id)
    assertEquals(PREFIX + sigName(signature(layout)!), id)
    // the signs by the way in name it and give the pushes
    const signs = block.props.filter((p) =>
      p.type === "sign" &&
      (p.data as { text: string }).text.startsWith(`RING ${n + 1}: `)
    )
    assertEquals(signs.length, 1)
    const text = (signs[0].data as { text: string }).text
    assert(text.includes(`${solved.pushes} PUSHES`), text)
    assert(text.includes(id.slice(PREFIX.length).toUpperCase()), text)
  }
})

Deno.test("goals map: an odd one for every family", () => {
  for (const family of ODD_FAMILIES) {
    const odd = block.props.filter((p) =>
      (p.data as { id?: string } | undefined)?.id === oddId(family)
    )
    assertEquals(odd.map((p) => p.type), [unlikeType(family)], family)
    const signs = block.props.filter((p) =>
      p.type === "sign" &&
      (p.data as { text: string }).text.startsWith(
        `ODD ONE: ${family.toUpperCase()}.`,
      )
    )
    assertEquals(signs.length, 1, family)
  }
})

Deno.test("goals map: the resets undo this map's goals only", () => {
  const resets = block.props.filter((p) => p.type === "goal-reset")
  assert(resets.length > 0)
  for (const r of resets) {
    const data = r.data as { prefix: string; box: number[]; to: number[] }
    assertEquals(data.prefix, PREFIX)
    assertEquals(data.box, [BI, BJ, BI + SIZE - 1, BJ + SIZE - 1])
    // back where it stands, on the floor
    const [x, y] = [data.to[0] - BI, data.to[1] - BJ]
    assertEquals(block.field[y][x], "0")
  }
  // every goal of the map is named with the prefix
  for (const p of block.props) {
    const id = (p.data as { id?: string } | undefined)?.id
    if (id !== undefined) assert(id.startsWith(PREFIX), id)
  }
})

Deno.test("goals map: the start island has the GOALS portal", async () => {
  const start = await read("block_-10000.-10000.json")
  const portals = start.props.filter((p) => {
    const d = p.data as { i?: number; j?: number } | undefined
    return p.type === "portal" && d?.i === BI + ARRIVAL.i &&
      d?.j === BJ + ARRIVAL.j
  })
  assertEquals(portals.length, 1)
})
