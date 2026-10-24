// The GOALS debug map (tools/generate_goals_map.ts, tools/goals_map.ts):
// a bay for every ring signature, every bell signature and every pair
// signature and kind, each solvable and of the signature it is named for; a bay for every odd one
// family; the resets
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
  readBellBay,
  readClearBay,
  readGazeBay,
  readPairBay,
  readRingBay,
  SIZE,
} from "./goals_map.ts"
import { MAX_PUSHES, MIN_PUSHES, sigName, signature, solve } from "./rings.ts"
import { BELL_MAX_PUSHES, BELL_MIN_PUSHES } from "./bells.ts"
import { PAIR_MAX_PUSHES, PAIR_MIN_PUSHES, wantOf, withWant } from "./pairs.ts"
import { CLEAR_MAX_PUSHES, CLEAR_MIN_PUSHES } from "./clears.ts"
import { GAZE_MAX_PUSHES, GAZE_MIN_PUSHES } from "./gazes.ts"

const read = async (name: string) =>
  JSON.parse(
    await Deno.readTextFile(new URL(`../static/map/${name}`, import.meta.url)),
  ) as BlockJson
const block = await read(`block_${BI}.${BJ}.json`)
const slots = block.props.filter((p) => p.type === "ring-slot")
const bells = block.props.filter((p) => p.type === "goal-bell")
const plinths = block.props.filter((p) => p.type === "pair-plinth")
const daises = block.props.filter((p) => p.type === "clear-dais")
const statues = block.props.filter((p) => p.type === "gaze-statue")

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

Deno.test("goals map: a bell for every signature, each solvable and of its signature", () => {
  // the WILDS have 12 signatures; the map has them and maybe more
  assert(bells.length >= 12, `${bells.length} bells`)
  const ids = new Set<string>()
  for (let n = 0; n < bells.length; n++) {
    const bay = readBellBay(block, slots.length, n)
    assert(bay, `bell bay ${n}`)
    const { id, layout } = bay
    assert(id.startsWith(PREFIX), id)
    assert(!ids.has(id), `${id} twice`)
    ids.add(id)
    const solved = solve(layout)
    assert(solved, `${id} can't be solved`)
    assert(
      solved.pushes >= BELL_MIN_PUSHES && solved.pushes <= BELL_MAX_PUSHES,
      id,
    )
    assertEquals(PREFIX + sigName(signature(layout)!), id)
    const signs = block.props.filter((p) =>
      p.type === "sign" &&
      (p.data as { text: string }).text.startsWith(`BELL ${n + 1}: `)
    )
    assertEquals(signs.length, 1)
    const text = (signs[0].data as { text: string }).text
    assert(text.includes(`${solved.pushes} PUSHES`), text)
  }
})

Deno.test("goals map: a pair for every signature and kind, each solvable, its decoy too", () => {
  assert(plinths.length >= 8, `${plinths.length} pairs`)
  const ids = new Set<string>()
  for (let n = 0; n < plinths.length; n++) {
    const bay = readPairBay(block, n)
    assert(bay, `pair bay ${n}`)
    const { id, layout } = bay
    assert(!ids.has(id), `${id} twice`)
    ids.add(id)
    const solved = solve(layout)
    assert(solved, `${id} can't be solved`)
    assert(
      solved.pushes >= PAIR_MIN_PUSHES && solved.pushes <= PAIR_MAX_PUSHES,
      id,
    )
    const want = wantOf(layout)
    assertEquals(`${PREFIX}${sigName(signature(layout)!)}-${want}`, id)
    // the other kind can be brought too, no harder
    const other = solve(
      withWant(layout, want === "stone" ? "boulder" : "stone"),
    )
    assert(other && other.pushes <= solved.pushes, id)
    const signs = block.props.filter((p) =>
      p.type === "sign" &&
      (p.data as { text: string }).text.startsWith(`PAIR ${n + 1}: `)
    )
    assertEquals(signs.length, 1)
  }
})

Deno.test("goals map: a dais for every signature and kind, each solvable", () => {
  assert(daises.length >= 8, `${daises.length} daises`)
  const ids = new Set<string>()
  for (let n = 0; n < daises.length; n++) {
    const bay = readClearBay(block, plinths.length, n)
    assert(bay, `dais bay ${n}`)
    const { id, layout } = bay
    assert(!ids.has(id), `${id} twice`)
    ids.add(id)
    const solved = solve(layout)
    assert(solved, `${id} can't be solved`)
    assert(
      solved.pushes >= CLEAR_MIN_PUSHES && solved.pushes <= CLEAR_MAX_PUSHES,
      id,
    )
    assertEquals(
      `${PREFIX}${sigName(signature(layout)!)}-${layout.things[0].kind}`,
      id,
    )
    const signs = block.props.filter((p) =>
      p.type === "sign" &&
      (p.data as { text: string }).text.startsWith(`DAIS ${n + 1}: `)
    )
    assertEquals(signs.length, 1)
  }
})

Deno.test("goals map: a statue for every signature, each solvable", () => {
  assert(statues.length >= 6, `${statues.length} statues`)
  const ids = new Set<string>()
  for (let n = 0; n < statues.length; n++) {
    const bay = readGazeBay(block, plinths.length, daises.length, n)
    assert(bay, `statue bay ${n}`)
    const { id, layout } = bay
    assert(!ids.has(id), `${id} twice`)
    ids.add(id)
    const solved = solve(layout)
    assert(solved, `${id} can't be solved`)
    assert(
      solved.pushes >= GAZE_MIN_PUSHES && solved.pushes <= GAZE_MAX_PUSHES,
      id,
    )
    assertEquals(PREFIX + sigName(signature(layout)!), id)
    const signs = block.props.filter((p) =>
      p.type === "sign" &&
      (p.data as { text: string }).text.startsWith(`STATUE ${n + 1}: `)
    )
    assertEquals(signs.length, 1)
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
