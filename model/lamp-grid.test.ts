// The lamp grids (model/lamp-grid.ts, model/lamp-room.ts): one lamp lit
// in each row and column whatever the levers do, a lever permutes the
// columns (the lit lamps stay in their rows), the groups the rooms' levers
// make (S3 6, Z3 3, S4 24, A4 12, D4 8, Z4 4, Z2xZ2 4, S5 120, A5 60),
// the order of the pulls mattering in S3, S4 and D4, the lamps showing
// the arrangement, the door opening on the target once and kept, the
// reset
import { assert, assertEquals, assertFalse, assertNotEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { spawnActor } from "./actor.ts"
import { Item } from "./item.ts"
import { Prop } from "./prop.ts"
import { PropSpawn } from "./field-block.ts"
import { goalsDone } from "./goal.ts"
import { resetGoals } from "./goal-reset.ts"
import {
  arrangementOf,
  groupKey,
  groupRewardKey,
  isGroupKey,
  isSolved,
  resetGroupStates,
} from "./group-lever.ts"
import {
  commutes,
  composeArr,
  type Cycles,
  evalLevers,
  isLit,
  isPermutationMatrix,
  keyOf,
  lampMatrix,
  LAMPS_TEXT,
  pickTarget,
  reachable,
} from "./lamp-grid.ts"
import { pull } from "./group.ts"
import type { IActor, IField, IItem } from "./types.ts"

const SWAP12: Cycles = [[0, 1]], SWAP23: Cycles = [[1, 2]]
const SWAP34: Cycles = [[2, 3]]
const TURN3: Cycles = [[0, 1, 2]], TURN234: Cycles = [[1, 2, 3]]
const TURN4: Cycles = [[0, 1, 2, 3]], FLIP: Cycles = [[1, 3]]

/** The groups of the rooms: their levers, their size, their order */
const GROUPS: [string, Cycles[], number, number][] = [
  ["S3", [SWAP12, SWAP23], 3, 6],
  ["D3", [SWAP12, TURN3], 3, 6],
  ["Z3", [TURN3], 3, 3],
  ["S4", [SWAP12, SWAP23, SWAP34], 4, 24],
  ["A4", [TURN3, TURN234], 4, 12],
  ["D4", [TURN4, FLIP], 4, 8],
  ["Z4", [TURN4], 4, 4],
  ["Z2xZ2", [SWAP12, SWAP34], 4, 4],
  ["S5", [[[0, 1]], [[0, 1, 2, 3, 4]]], 5, 120],
  ["A5", [[[0, 1, 2]], [[2, 3, 4]]], 5, 60],
]

/** A word of pulls of the levers, the same every run */
function* randomWords(levers: number, count: number, length: number) {
  let seed = 7
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648)
  for (let w = 0; w < count; w++) {
    yield Array.from({ length }, () => next() % levers)
  }
}

Deno.test("lamp grid: one lamp lit in each row and each column, whatever the levers", () => {
  for (const [name, levers, n] of GROUPS) {
    assert(isPermutationMatrix(lampMatrix([], n)), name)
    // at first the diagonal
    assertEquals(
      lampMatrix([], n),
      [...Array(n).keys()].map((r) => [...Array(n).keys()].map((c) => r === c)),
    )
    for (const word of randomWords(levers.length, 30, 12)) {
      let arr: number[] = []
      for (const k of word) {
        arr = pull(arr, levers[k])
        assert(isPermutationMatrix(lampMatrix(arr, n)), `${name} ${word}`)
      }
    }
  }
  assertFalse(isPermutationMatrix([[true, true], [false, false]]))
  assertFalse(isPermutationMatrix([[true, false], [true, false]]))
})

Deno.test("lamp grid: a lever permutes the columns, each lit lamp stays in its row", () => {
  for (const [name, levers, n] of GROUPS) {
    for (const word of randomWords(levers.length, 10, 6)) {
      const before = evalLevers(levers, word, n)
      for (const cycles of levers) {
        const after = pull(before, cycles)
        // where the cycles send each column
        const to = [...Array(n).keys()]
        for (const c of cycles) {
          c.forEach((p, k) => to[p] = c[(k + 1) % c.length])
        }
        for (let row = 0; row < n; row++) {
          for (let col = 0; col < n; col++) {
            assertEquals(
              isLit(after, row, to[col]),
              isLit(before, row, col),
              `${name}: row ${row}, column ${col}`,
            )
          }
        }
      }
    }
  }
  // (1 2 3): the lit lamp of column 1 goes to 2, of 2 to 3, of 3 to 1
  const arr = pull([], TURN3)
  assertEquals(lampMatrix(arr, 3), [
    [false, true, false],
    [false, false, true],
    [true, false, false],
  ])
})

Deno.test("lamp grid: g then x is g·x (the switch's right action)", () => {
  for (const [name, levers, n] of GROUPS) {
    for (const word of randomWords(levers.length, 10, 8)) {
      const half = Math.floor(word.length / 2)
      const g = evalLevers(levers, word.slice(0, half), n)
      const x = evalLevers(levers, word.slice(half), n)
      assertEquals(
        keyOf(composeArr(g, x, n), n),
        keyOf(evalLevers(levers, word, n), n),
        name,
      )
    }
  }
})

Deno.test("lamp grid: the rooms' levers reach as many patterns as their groups", () => {
  for (const [name, levers, n, order] of GROUPS) {
    const all = reachable(levers, n)
    assertEquals(all.size, order, name)
    // and the words found light them
    for (const [key, { arr, word }] of all) {
      assertEquals(keyOf(evalLevers(levers, word, n), n), key, name)
      assertEquals(keyOf(arr, n), key, name)
    }
  }
  // A4: only the even ones, never a single swap
  const a4 = reachable([TURN3, TURN234], 4)
  assertFalse(a4.has(keyOf(pull([], SWAP12), 4)))
  assert(a4.has(keyOf(pull(pull([], SWAP12), SWAP34), 4)))
  // Z3: the turns only, no swap
  const z3 = reachable([TURN3], 3)
  assertFalse(z3.has(keyOf(pull([], SWAP12), 3)))
})

Deno.test("lamp grid: in S3, S4 and D4 the order of the pulls matters, in Z4 and Z2xZ2 not", () => {
  const ab = (a: Cycles, b: Cycles, n: number) => keyOf(pull(pull([], a), b), n)
  // S3: L then R is not R then L
  assertNotEquals(ab(SWAP12, SWAP23, 3), ab(SWAP23, SWAP12, 3))
  assertNotEquals(ab(SWAP12, SWAP23, 4), ab(SWAP23, SWAP12, 4))
  assertNotEquals(ab(TURN4, FLIP, 4), ab(FLIP, TURN4, 4))
  // D4: s r s = r⁻¹
  assertEquals(
    keyOf(evalLevers([TURN4, FLIP], [1, 0, 1], 4), 4),
    keyOf(evalLevers([TURN4, FLIP], [0, 0, 0], 4), 4),
  )
  for (const [name, levers, n] of GROUPS) {
    const abelian = ["Z3", "Z4", "Z2xZ2"].includes(name)
    assertEquals(commutes(levers, n), abelian, name)
  }
  // Z2xZ2: each lever twice is back; Z4 needs four
  assertEquals(keyOf(evalLevers([SWAP12, SWAP34], [0, 0], 4), 4), "0,1,2,3")
  assertNotEquals(keyOf(evalLevers([TURN4], [0, 0], 4), 4), "0,1,2,3")
})

Deno.test("lamp grid: the target is reached, and where it can the order matters", () => {
  for (const [name, levers, n] of GROUPS) {
    const { arr, word } = pickTarget(levers, n)
    assert(word.length > 0, name)
    assertEquals(keyOf(evalLevers(levers, word, n), n), keyOf(arr, n), name)
    if (!commutes(levers, n)) {
      assertNotEquals(
        keyOf(evalLevers(levers, [...word].reverse(), n), n),
        keyOf(arr, n),
        name,
      )
    }
  }
})

// ---------------------------------------------------------------------
// the props

const catalog = Catalog.fromJSON(
  [{
    src: "base.json",
    json: JSON.parse(
      await Deno.readTextFile(
        new URL("../static/catalog/base.json", import.meta.url),
      ),
    ),
  }],
  "http://localhost/catalog/",
)
const spawn = (i: number, j: number, type: string, data: unknown) =>
  Prop.fromSpawn(new PropSpawn(i, j, catalog.props[type], data))

/** A small field: props, actors and the items laid */
class Sim {
  time = 0
  items: { id: string; i: number; j: number; type: string }[] = []
  propList: Prop[] = []
  actorList: IActor[] = []
  me: IActor = spawnActor("main", 0, 50, catalog.actors["static"])
  constructor() {
    this.actorList.push(this.me)
  }
  get field() {
    return this as unknown as IField
  }
  add<T extends Prop>(prop: T): T {
    this.propList.push(prop)
    return prop
  }
  actors = {
    iter: () => this.actorList,
    get: (i: number, j: number) =>
      this.actorList.filter((a) => a.i === i && a.j === j),
  }
  props = {
    get: (i: number, j: number) =>
      this.propList.find((p) => p.i === i && p.j === j),
    iter: () => this.propList,
  }
  effects = { add: () => {} }
  peekItems(i: number, j: number) {
    return this.items.filter((t) =>
      t.i === i && t.j === j
    ) as unknown as IItem[]
  }
  spawnItem(type: string, i: number, j: number, id?: string) {
    const item = { id: id ?? "", i, j, type }
    this.items.push(item)
    return item as unknown as IItem
  }
  bump(prop: Prop) {
    prop.onPushed(
      { type: "pushed", dir: "up", peakAt: 7, pusher: this.me },
      this.field,
    )
  }
  step(n = 1) {
    for (let k = 0; k < n; k++) {
      this.time++
      for (const p of this.propList) p.step(this.field)
    }
  }
}

/** A room as the LAMPS map lays it: lamps, plaques, levers, a door */
function room(
  sim: Sim,
  id: string,
  n: number,
  levers: Cycles[],
  target: number[],
) {
  const lamps = [...Array(n).keys()].map((row) =>
    [...Array(n).keys()].map((col) =>
      sim.add(spawn(10 + col, row, "lamp-cell", { group: id, row, col }))
    )
  )
  const plaques = [...Array(n).keys()].flatMap((row) =>
    [...Array(n).keys()].map((col) =>
      sim.add(
        spawn(20 + col, row, "lamp-plaque", { lit: isLit(target, row, col) }),
      )
    )
  )
  const pulls = levers.map((cycles, k) =>
    sim.add(spawn(10 + 2 * k, 8, "group-lever", { group: id, cycles }))
  )
  const door = sim.add(
    spawn(30, 1, "group-door", {
      group: id,
      id,
      target,
      reward: [30, 0],
      text: LAMPS_TEXT,
    }),
  )
  return { lamps, plaques, levers: pulls, door }
}

const fresh = () => {
  Item.deserializeCollected([])
  resetGroupStates()
}

const litOf = (lamps: Prop[][]) =>
  lamps.map((row) => row.map((p) => p.growthState?.stage === 1))

Deno.test("lamp props: the catalog's parts", () => {
  assertEquals(catalog.props["lamp-cell"].growth?.hrefs.length, 2)
  assertEquals(catalog.props["lamp-plaque"].growth?.hrefs.length, 2)
  assertFalse(catalog.props["lamp-cell"].canEnter)
  assertFalse(catalog.props["lamp-plaque"].canEnter)
  for (const d of "12345") assert(catalog.props[`${d}_white`]?.canEnter, d)
})

Deno.test("lamp props: the lamps show the levers' columns, the plaques the target", () => {
  fresh()
  const sim = new Sim()
  const levers = [SWAP12, SWAP23]
  const target = evalLevers(levers, [0, 1], 3)
  const r = room(sim, "t-s3", 3, levers, target)
  sim.step()
  assertEquals(litOf(r.lamps), lampMatrix([], 3))
  assertEquals(
    r.plaques.map((p) => p.growthState?.stage === 1),
    lampMatrix(target, 3).flat(),
  )
  // B then A: not the target
  sim.bump(r.levers[1])
  sim.bump(r.levers[0])
  sim.step()
  const ba = evalLevers(levers, [1, 0], 3)
  assertEquals(litOf(r.lamps), lampMatrix(ba, 3))
  assert(isPermutationMatrix(litOf(r.lamps)))
  assertNotEquals(keyOf(ba, 3), keyOf(target, 3))
  assertFalse(r.door.canEnter)
  assertFalse(isSolved("t-s3"))
})

Deno.test("lamp props: the door opens on the plaques' pattern once, kept, with the letter", () => {
  fresh()
  const sim = new Sim()
  const levers = [TURN3, TURN234]
  // A4: (1 2)(3 4) by B then A
  const target = [1, 0, 3, 2]
  const r = room(sim, "t-a4", 4, levers, target)
  sim.step()
  assertFalse(r.door.canEnter)
  sim.bump(r.levers[1])
  sim.bump(r.levers[0])
  sim.step()
  assertEquals(keyOf(arrangementOf("t-a4"), 4), keyOf(target, 4))
  assertEquals(litOf(r.lamps), lampMatrix(target, 4))
  assert(r.door.canEnter)
  assert(isSolved("t-a4"))
  assertEquals(goalsDone(), 1)
  assertEquals(sim.items.length, 1)
  assertEquals(sim.items[0].id, groupRewardKey("t-a4"))
  assertEquals([sim.items[0].i, sim.items[0].j], [30, 0])
  // pulling on: the door stays open, no second goal or letter
  sim.bump(r.levers[0])
  sim.step(100)
  assert(r.door.canEnter)
  assertEquals(sim.items.length, 1)
  assertEquals(goalsDone(), 1)
  // reloaded (the arrangement back to e): the door is still open
  resetGroupStates()
  const again = new Sim()
  const r2 = room(again, "t-a4", 4, levers, target)
  again.step()
  assert(r2.door.canEnter)
  assertEquals(goalsDone(), 1)
})

Deno.test("lamp props: the reset of the lamp rooms undoes their goals", () => {
  Item.deserializeCollected([
    groupKey("lamps-s3"),
    groupRewardKey("lamps-s3"),
    groupKey("s3"),
  ])
  assert(isGroupKey(groupKey("lamps-s3")))
  assertEquals(goalsDone(), 2)
  resetGoals({ prefix: "lamps-", box: [0, 0, 0, 0] })
  assertFalse(Item.isCollected(groupKey("lamps-s3")))
  assertFalse(Item.isCollected(groupRewardKey("lamps-s3")))
  assert(Item.isCollected(groupKey("s3")))
  assertEquals(goalsDone(), 1)
})
