// The LAMPS map (tools/generate_lamp_map.ts, tools/lamp_rooms.ts), read
// back from the block written: every room has its n x n lamps wired to
// it, its plaques showing a target its levers reach (one lit in each row
// and column), its door wanting that target, the levers' cycles and
// counts as the signs say, the debug solution lighting the plaques, a
// RESET for the rooms' goals and the portal back to START
import { assert, assertEquals } from "@std/assert"
import {
  type Cycles,
  evalLevers,
  isPermutationMatrix,
  keyOf,
  reachable,
} from "../model/lamp-grid.ts"
import { START } from "./goals_map.ts"
import { ARRIVAL, BI, BJ, buildLampMap } from "./generate_lamp_map.ts"
import {
  LAMP_ROOMS,
  LEVER_NAMES,
  nameText,
  PREFIX,
  RULE_TEXT,
} from "./lamp_rooms.ts"

// deno-lint-ignore no-explicit-any
type Spawn = { i: number; j: number; type: string; data?: any }
const block = JSON.parse(
  await Deno.readTextFile(
    new URL(`../static/map/block_${BI}.${BJ}.json`, import.meta.url),
  ),
) as { i: number; j: number; name: string; props: Spawn[]; field: string[] }
const props = block.props
const at = (i: number, j: number) => props.filter((p) => p.i === i && p.j === j)
const rooms = LAMP_ROOMS.flat()
const ofRoom = (type: string, id: string) =>
  props.filter((p) => p.type === type && p.data?.group === id)

Deno.test("lamp map: the block is what the generator builds (deterministic)", () => {
  const { grid, props: built } = buildLampMap()
  assertEquals(block.name, "LAMPS")
  assertEquals(block.field, grid.map((r) => r.join("")))
  assertEquals(JSON.stringify(props), JSON.stringify(built))
})

Deno.test("lamp map: the rooms and their groups", () => {
  assertEquals(
    rooms.map((r) => [r.title, r.n, r.order]),
    [
      ["S3", 3, 6],
      ["D3", 3, 6],
      ["Z3", 3, 3],
      ["S4", 4, 24],
      ["A4", 4, 12],
      ["D4", 4, 8],
      ["Z4", 4, 4],
      ["Z2XZ2", 4, 4],
      ["S5", 5, 120],
      ["A5", 5, 60],
    ],
  )
  assert(rooms.every((r) => r.id.startsWith(PREFIX)))
  // S4's plaques: the reversal
  assertEquals(rooms.find((r) => r.title === "S4")!.goal, [3, 2, 1, 0])
  // A4's: two swaps at once, (1 2)(3 4)
  assertEquals(rooms.find((r) => r.title === "A4")!.goal, [1, 0, 3, 2])
})

Deno.test("lamp map: each room has n x n lamps, the plaques of its target, its levers, its door", () => {
  for (const room of rooms) {
    const { id, n } = room
    const lamps = ofRoom("lamp-cell", id)
    assertEquals(lamps.length, n * n, id)
    const cells = new Set(lamps.map((p) => `${p.data.row},${p.data.col}`))
    assertEquals(cells.size, n * n, id)
    // a square: row down, column across
    const x0 = Math.min(...lamps.map((p) => p.i))
    const y0 = Math.min(...lamps.map((p) => p.j))
    for (const p of lamps) {
      assertEquals([p.i - x0, p.j - y0], [p.data.col, p.data.row], id)
    }
    // the plaques: the same square, to the right, the target's matrix
    const plaques = lamps.map((p) => at(p.i + n + 2, p.j)[0])
    assert(plaques.every((p) => p?.type === "lamp-plaque"), id)
    const m = [...Array(n).keys()].map((row) =>
      [...Array(n).keys()].map((col) =>
        plaques[
          lamps.findIndex((p) => p.data.row === row && p.data.col === col)
        ]
          .data.lit as boolean
      )
    )
    assert(isPermutationMatrix(m), id)
    // the columns numbered under the lamps and under the plaques
    for (let col = 0; col < n; col++) {
      assertEquals(at(x0 + col, y0 + n)[0]?.type, `${col + 1}_white`, id)
      assertEquals(at(x0 + col + n + 2, y0 + n)[0]?.type, `${col + 1}_white`)
    }
    // the levers, their letters above them, their cycles the room's
    const levers = ofRoom("group-lever", id)
    assertEquals(levers.map((p) => p.data.cycles), room.levers, id)
    levers.forEach((p, k) =>
      assertEquals(at(p.i, p.j - 1)[0]?.type, `${LEVER_NAMES[k]}_white`)
    )
    const cycles = levers.map((p) => p.data.cycles as Cycles)
    assertEquals(reachable(cycles, n).size, room.order, id)
    // the door wants the plaques, reached by the solution; its letter behind
    const [door] = ofRoom("group-door", id)
    assertEquals(door.data.id, id)
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        assertEquals(m[row][col], door.data.target[col] === row, id)
      }
    }
    assertEquals(
      keyOf(evalLevers(cycles, room.solution, n), n),
      keyOf(door.data.target, n),
      id,
    )
    assertEquals(door.data.reward, [door.i, door.j - 1])
    assertEquals(block.field[door.j - 1 - BJ][door.i - BI], "0")
    // the signs: the group, the rule, a solution
    const signs = props.filter((p) =>
      p.type === "sign" && p.j === y0 + n + 6 && p.i >= x0 - 2 &&
      p.i <= x0 + 2 * n + 8
    ).map((p) => p.data.text as string)
    assert(signs.includes(nameText(room)), id)
    assert(signs.includes(RULE_TEXT), id)
    const debug = signs.find((t) => t.startsWith("DEBUG: SOLUTION "))!
    const word = debug.slice("DEBUG: SOLUTION ".length).split(" (")[0]
      .replace(" IN ANY ORDER", "").split(" ")
      .map((c) => LEVER_NAMES.indexOf(c.toLowerCase()))
    assertEquals(
      keyOf(evalLevers(cycles, word, n), n),
      keyOf(door.data.target, n),
      id,
    )
    // the name on the ground
    const title = [...room.title.toLowerCase()].map((_, k) =>
      at(x0 - 1 + k, y0 - 2)[0]?.type
    )
    assertEquals(title, [...room.title.toLowerCase()].map((c) => `${c}_white`))
  }
})

Deno.test("lamp map: the portal back to START, the RESET of the rooms", () => {
  assertEquals(at(BI + ARRIVAL.i, BJ + ARRIVAL.j)[0].type, "portal-out")
  const back = props.find((p) => p.type === "portal")!
  assertEquals(back.data, { i: START.i, j: START.j })
  const word = [..."start"].map((_, k) => at(back.i + k, back.j + 1)[0]?.type)
  assertEquals(word, [..."start"].map((c) => `${c}_white`))
  const reset = props.find((p) => p.type === "goal-reset")!
  assertEquals(reset.data.prefix, PREFIX)
  assertEquals(reset.data.to, [BI + ARRIVAL.i, BJ + ARRIVAL.j])
})
