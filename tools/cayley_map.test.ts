// The CAYLEY map (tools/generate_cayley_map.ts, tools/cayley_rooms.ts,
// ideas/groups.md), read back from the blocks written: every group of
// order 1 to 20 has its room, the gates and levers of a room are wired to
// one room and one group, a gate for each element and its alcove behind
// it, the levers reach every gate and the target, the signs name the
// group the table is (order, GAP id, commuting or not) and a solution
// that opens the target, and the rings turn as their pictures say
import { assert, assertEquals, assertNotEquals } from "@std/assert"
import {
  ALL_GROUPS,
  evalWord,
  generates,
  groupByKey,
  isAbelian,
  mul,
  shortestWords,
} from "../model/cayley.ts"
import { CAYLEY_GROUPS } from "../model/cayley-groups.ts"
import { LEVER_NAMES, nameText, PREFIX, ROOMS } from "./cayley_rooms.ts"
import { BI, BJ, HEIGHT, SIZE } from "./generate_cayley_map.ts"

// deno-lint-ignore no-explicit-any
type Spawn = { i: number; j: number; type: string; data?: any }
const blocks = await Promise.all(
  [BJ, BJ + SIZE].map(async (j) =>
    JSON.parse(
      await Deno.readTextFile(
        new URL(`../static/map/block_${BI}.${j}.json`, import.meta.url),
      ),
    ) as { i: number; j: number; props: Spawn[]; field: string[] }
  ),
)
const props = blocks.flatMap((b) => b.props)
const field = blocks.flatMap((b) => b.field)
const cell = (i: number, j: number) => field[j - BJ][i - BI]
const propAt = new Map(props.map((p) => [`${p.i}.${p.j}`, p]))

const gatesOf = (room: string) =>
  props.filter((p) => p.type === "cayley-gate" && p.data.room === room)
const leversOf = (room: string) =>
  props.filter((p) => p.type === "cayley-lever" && p.data.room === room)
const roomIds = [
  ...new Set(
    props.filter((p) => p.type === "cayley-gate").map((p) => p.data.room),
  ),
]

Deno.test("cayley map: two blocks, every group of order 1 to 20 has a room", () => {
  assertEquals(field.length, HEIGHT)
  assertEquals(roomIds.length, ROOMS.length)
  const keys = new Set(roomIds.map((id) => gatesOf(id)[0].data.group))
  assertEquals([...keys].sort(), ALL_GROUPS.map((g) => g.key).sort())
  assert(roomIds.every((id) => id.startsWith(PREFIX)))
  // Z6 twice: one lever of order 6, and levers of orders 3 and 2
  assertEquals(
    roomIds.filter((id) => gatesOf(id)[0].data.group === "6.2").length,
    2,
  )
})

Deno.test("cayley map: the copied tables are kt3k/group's", async () => {
  // the copy itself: one row per group, the table n x n
  for (const [order, , , , , , t] of CAYLEY_GROUPS) {
    assertEquals(t.length, order * order)
  }
  const source = "/home/user/kt3k/group/data.json"
  let data: { order: number; id: number; t: number[]; gens: number[] }[]
  try {
    data = JSON.parse(await Deno.readTextFile(source))
  } catch {
    return // the other repo isn't here: the copy is what the game uses
  }
  assertEquals(data.length, ALL_GROUPS.length)
  for (const d of data) {
    const g = groupByKey(`${d.order}.${d.id}`)!
    assertEquals(g.t, d.t)
    assertEquals(g.gens, d.gens)
  }
})

Deno.test("cayley map: a gate for each element, its alcove behind it, one room and group", () => {
  for (const id of roomIds) {
    const gates = gatesOf(id)
    const g = groupByKey(gates[0].data.group)!
    assert(gates.every((p) => p.data.group === g.key), id)
    assertEquals(gates.map((p) => p.data.el).sort((a, b) => a - b), [
      ...Array(g.order).keys(),
    ])
    for (const gate of gates) {
      const [ai, aj] = gate.data.alcove
      assertEquals([ai, aj], [gate.i, gate.j - 1], id)
      assertEquals(cell(ai, aj), "0")
      assert(!propAt.has(`${ai}.${aj}`), id)
      // walled in but for the gate
      for (const [di, dj] of [[-1, 0], [1, 0], [0, -1]]) {
        assertEquals(cell(ai + di, aj + dj), "1", id)
      }
      // the way to it below
      assertEquals(cell(gate.i, gate.j + 1), "0")
      assert(!propAt.has(`${gate.i}.${gate.j + 1}`), id)
    }
    // e's gate has the ring, the target's the diamond and the goal's id
    assertEquals(gates.find((p) => p.data.el === 0)!.data.mark, 1)
    const targets = gates.filter((p) => p.data.id)
    if (g.order === 1) {
      assertEquals(targets.length, 0)
      continue
    }
    assertEquals(targets.length, 1, id)
    assertEquals(targets[0].data.id, id)
    assertEquals(targets[0].data.mark, 2)
    assertNotEquals(targets[0].data.el, 0)
  }
})

Deno.test("cayley map: the levers are the room's, generate its group and reach the target", () => {
  for (const id of roomIds) {
    const g = groupByKey(gatesOf(id)[0].data.group)!
    const levers = leversOf(id)
    assert(levers.every((p) => p.data.group === g.key), id)
    const gens = levers.map((p) => p.data.by as number)
    assertEquals(levers.length, ROOMS.find((r) => r.id === id)!.gens.length)
    if (g.order === 1) {
      assertEquals(levers.length, 0)
      continue
    }
    assert(generates(g, gens), id)
    const target = gatesOf(id).find((p) => p.data.id)!.data.el
    assert(shortestWords(g, gens)[target] !== null, id)
    // each lever's letter above it
    levers.forEach((lever, k) => {
      assertEquals(
        propAt.get(`${lever.i}.${lever.j - 1}`)?.type,
        `${LEVER_NAMES[k]}_white`,
        id,
      )
    })
  }
})

Deno.test("cayley map: the signs name the group the table is, and a solution", () => {
  const signs = props.filter((p) => p.type === "sign")
  for (const room of ROOMS) {
    const g = room.group
    // the name sign: under the room's left wall
    const name = signs.find((s) => s.data.text === nameText(room))
    assert(name, room.id)
    assert(
      name.data.text.includes(`GAP SMALLGROUP (${g.order},${g.id})`) &&
        name.data.text.includes(`${g.order} GATE`),
      room.id,
    )
    assert(
      name.data.text.includes(
        isAbelian(g) ? "IT COMMUTES" : "IT DOES NOT COMMUTE",
      ),
      room.id,
    )
    if (room.target === null) continue
    // the debug sign's solution opens the target
    const debug = signs.filter((s) =>
      s.j === name.j && s.data.text.startsWith("DEBUG: SOLUTION") &&
      s.i > name.i
    ).sort((x, y) =>
      x.i - y.i
    )[0]
    assert(debug, room.id)
    const word = /SOLUTION ([A-D ]+?)(?: \(| IN|$)/.exec(debug.data.text)![1]
      .split(" ").map((c) => room.gens[LEVER_NAMES.indexOf(c.toLowerCase())])
    assertEquals(evalWord(g, word), room.target, room.id)
  }
})

/** The angle of the gate round the middle of the room's gates */
function anglesOf(id: string) {
  const gates = gatesOf(id)
  const cx = gates.reduce((s, p) => s + p.i, 0) / gates.length
  const cy = gates.reduce((s, p) => s + p.j, 0) / gates.length
  const at = new Map<number, { a: number; r: number }>(
    gates.map((p) => [
      p.data.el,
      { a: Math.atan2(p.j - cy, p.i - cx), r: Math.hypot(p.i - cx, p.j - cy) },
    ]),
  )
  return at
}

/** +1 if a moves the gate clockwise (on the screen), -1 if not */
function turnOf(id: string, x: number, from: number) {
  const g = groupByKey(gatesOf(id)[0].data.group)!
  const at = anglesOf(id)
  let d = at.get(mul(g, from, x))!.a - at.get(from)!.a
  d = Math.atan2(Math.sin(d), Math.cos(d))
  return Math.sign(d)
}

Deno.test("cayley map: two rings, b straight across; a turns the outer one back in S3, D4, not in Z3xZ2, Z4xZ2", () => {
  const cases: [string, boolean][] = [
    ["cayley-6-1", true],
    ["cayley-8-3", true],
    ["cayley-10-1", true],
    ["cayley-12-4", true],
    ["cayley-6-2-z3xz2", false],
    ["cayley-8-2", false],
    ["cayley-12-5", false],
  ]
  for (const [id, back] of cases) {
    const room = ROOMS.find((r) => r.id === id)!
    assertEquals(room.layout, "concentric", id)
    const [a, b] = room.gens
    const at = anglesOf(id)
    // b: from the inner ring to the outer one, on the same side
    const d = at.get(b)!.a - at.get(0)!.a
    assert(Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < 0.35, id)
    assert(at.get(b)!.r > at.get(0)!.r, id)
    // a, inside and outside
    const inner = turnOf(id, a, 0), outer = turnOf(id, a, b)
    assertEquals(inner, 1, id)
    assertEquals(outer, back ? -1 : 1, id)
  }
})
