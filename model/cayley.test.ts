// The Cayley rooms (model/cayley.ts, model/cayley-room.ts): the tables
// are groups, the room's one open gate, a lever moving it from g to g·x,
// the order of the pulls mattering in S3, D4 and Q8 and not in the
// abelian groups, a lever pulled its order times coming back, the gate
// of the target giving its goal and letter once, and the reset
import { assert, assertEquals, assertFalse, assertNotEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { spawnActor } from "./actor.ts"
import { Item } from "./item.ts"
import { Prop } from "./prop.ts"
import { PropSpawn } from "./field-block.ts"
import { goalsDone } from "./goal.ts"
import { resetGoals } from "./goal-reset.ts"
import {
  ALL_GROUPS,
  asciiName,
  brokenAxiom,
  type CayleyGroup,
  elementOrder,
  evalWord,
  generates,
  groupByKey,
  inverse,
  isAbelian,
  mul,
  openGateOf,
  pickTarget,
  pullCayley,
  resetCayleyStates,
  shortestWords,
} from "./cayley.ts"
import {
  cayleyKey,
  cayleyRewardKey,
  isCayleyKey,
  isCayleySolved,
} from "./cayley-room.ts"
import type { IActor, IField, IItem } from "./types.ts"

const group = (key: string): CayleyGroup => {
  const g = groupByKey(key)
  if (!g) throw new Error(key)
  return g
}
const S3 = group("6.1"), D4 = group("8.3"), Q8 = group("8.4")

Deno.test("cayley: the 54 tables are groups, as many of each order as there are (OEIS A000001)", () => {
  const counts = [1, 1, 1, 2, 1, 2, 1, 5, 2, 2, 1, 5, 1, 2, 1, 14, 1, 5, 1, 5]
  assertEquals(ALL_GROUPS.length, 54)
  for (const [k, count] of counts.entries()) {
    assertEquals(ALL_GROUPS.filter((g) => g.order === k + 1).length, count)
  }
  for (const g of ALL_GROUPS) {
    assertEquals(brokenAxiom(g.order, g.t), null, g.key)
    assert(generates(g, g.gens), g.key)
    assertEquals(new Set(ALL_GROUPS.map((h) => h.key)).size, 54)
  }
  // a broken table is told
  assertEquals(brokenAxiom(2, [0, 1, 1, 1]), "inverses")
  assertEquals(brokenAxiom(2, [1, 0, 0, 1]), "identity")
})

Deno.test("cayley: the names say what the tables are", () => {
  assert(isAbelian(group("4.2")))
  assertFalse(isAbelian(S3))
  assertFalse(isAbelian(D4))
  assertFalse(isAbelian(Q8))
  assert(isAbelian(group("8.5")))
  // Q8 has a single element of order 2, D4 five
  const ofOrder2 = (g: CayleyGroup) =>
    [...Array(g.order).keys()].filter((x) => elementOrder(g, x) === 2).length
  assertEquals(ofOrder2(Q8), 1)
  assertEquals(ofOrder2(D4), 5)
  // Z6 has an element of order 6, S3 none
  assert([...Array(6).keys()].some((x) => elementOrder(group("6.2"), x) === 6))
  assertFalse([...Array(6).keys()].some((x) => elementOrder(S3, x) === 6))
  assertEquals(asciiName("Z₂³"), "Z2^3")
  assertEquals(asciiName("Z₃⋊Z₄"), "Z3:Z4")
  assertEquals(asciiName("D₄×Z₂"), "D4XZ2")
})

Deno.test("cayley: a lever moves the open gate from g to g·x; x then y is g·x·y", () => {
  resetCayleyStates()
  for (const g of ALL_GROUPS) {
    const room = `t-${g.key}`
    assertEquals(openGateOf(room), 0)
    let expected = 0
    // a walk of pulls, every lever in turn and some twice
    const word = [...g.gens, ...g.gens.slice(0, 1), ...g.gens.toReversed()]
    for (const x of word) {
      const before = openGateOf(room)
      pullCayley(room, g, x)
      assertEquals(openGateOf(room), mul(g, before, x))
      expected = mul(g, expected, x)
    }
    assertEquals(openGateOf(room), expected, g.key)
    assertEquals(openGateOf(room), evalWord(g, word), g.key)
  }
  resetCayleyStates()
})

Deno.test("cayley: pulling a lever its order times opens the gate it began at", () => {
  for (const g of ALL_GROUPS) {
    for (const x of g.gens) {
      resetCayleyStates()
      const n = elementOrder(g, x)
      pullCayley("t", g, g.gens.at(-1)!)
      const start = openGateOf("t")
      for (let k = 0; k < n - 1; k++) pullCayley("t", g, x)
      // n - 1 pulls undo one
      assertEquals(openGateOf("t"), mul(g, start, inverse(g, x)), g.key)
      pullCayley("t", g, x)
      assertEquals(openGateOf("t"), start, g.key)
    }
  }
  resetCayleyStates()
})

Deno.test("cayley: in S3, D4 and Q8 the order of the pulls matters, in Zm x Zn not", () => {
  for (const g of [S3, D4, Q8]) {
    const [a, b] = g.gens
    assertNotEquals(evalWord(g, [a, b]), evalWord(g, [b, a]), g.key)
  }
  for (const key of ["4.2", "6.2", "8.2", "8.5", "12.5", "16.14"]) {
    const g = group(key)
    for (const a of g.gens) {
      for (const b of g.gens) {
        assertEquals(evalWord(g, [a, b]), evalWord(g, [b, a]), key)
      }
    }
  }
  // D4: a b a = b (s r s = r⁻¹, so r s r = s), Q8: a a = b b (i² = j²)
  const [r, s] = D4.gens
  assertEquals(evalWord(D4, [r, s, r]), s)
  const [i, j] = Q8.gens
  assertEquals(evalWord(Q8, [i, i]), evalWord(Q8, [j, j]))
})

Deno.test("cayley: the target needs several pulls, and the order of them where it can", () => {
  for (const g of ALL_GROUPS) {
    const target = pickTarget(g, g.gens)
    if (g.order === 1) {
      assertEquals(target, null)
      continue
    }
    assert(target !== null && target !== 0, g.key)
    const word = shortestWords(g, g.gens)[target]!
    assertEquals(evalWord(g, word.map((k) => g.gens[k])), target)
    assert(word.length >= Math.min(g.order - 1, 2), g.key)
    if (!isAbelian(g)) {
      const back = word.map((k) => g.gens[k]).reverse()
      assertNotEquals(evalWord(g, back), target, g.key)
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

/** A room of the group: a gate per element in a row, a lever per generator */
function room(sim: Sim, g: CayleyGroup, id: string, target: number) {
  const gates = [...Array(g.order).keys()].map((el) =>
    sim.add(
      spawn(10 + 2 * el, 1, "cayley-gate", {
        room: id,
        group: g.key,
        el,
        alcove: [10 + 2 * el, 0],
        mark: el === 0 ? 1 : el === target ? 2 : 0,
        ...(el === target ? { id } : {}),
      }),
    )
  )
  const levers = g.gens.map((by, k) =>
    sim.add(
      spawn(10 + 2 * k, 5, "cayley-lever", {
        room: id,
        group: g.key,
        by,
        look: 1,
      }),
    )
  )
  return { gates, levers }
}

const fresh = () => {
  Item.deserializeCollected([])
  resetCayleyStates()
}

const openGates = (gates: Prop[]) =>
  gates.flatMap((p, el) => p.canEnter ? [el] : [])

Deno.test("cayley props: the catalog's parts", () => {
  assertEquals(catalog.props["cayley-gate"].growth?.hrefs.length, 6)
  assertEquals(catalog.props["cayley-lever"].growth?.hrefs.length, 6)
  assertFalse(catalog.props["cayley-gate"].canEnter)
  assertFalse(catalog.props["cayley-lever"].canEnter)
})

Deno.test("cayley props: exactly one gate is open, the one the levers made", () => {
  fresh()
  const sim = new Sim()
  const [a, b] = D4.gens
  const { gates, levers } = room(sim, D4, "t-d4", 7)
  sim.step()
  assertEquals(openGates(gates), [0])
  // e's gate shows its ring, open
  assertEquals(gates[0].growthState?.stage, 3)
  assertEquals(gates[1].growthState?.stage, 0)
  const word = [0, 1, 1, 0, 0, 0, 1]
  let g = 0
  for (const k of word) {
    sim.bump(levers[k])
    sim.step()
    g = mul(D4, g, [a, b][k])
    assertEquals(openGates(gates), [g])
  }
  // the handle flips at each pull: lever a pulled 4 times, b 3 times
  assertEquals(levers[0].growthState?.stage, 2)
  assertEquals(levers[1].growthState?.stage, 3)
})

Deno.test("cayley props: a then b is not b then a (S3)", () => {
  fresh()
  const [a, b] = S3.gens
  const ab = new Sim(), ba = new Sim()
  const r1 = room(ab, S3, "t-ab", 5)
  const r2 = room(ba, S3, "t-ba", 5)
  ab.bump(r1.levers[0])
  ab.bump(r1.levers[1])
  ba.bump(r2.levers[1])
  ba.bump(r2.levers[0])
  ab.step()
  ba.step()
  assertEquals(openGates(r1.gates), [evalWord(S3, [a, b])])
  assertEquals(openGates(r2.gates), [evalWord(S3, [b, a])])
  assertNotEquals(openGates(r1.gates), openGates(r2.gates))
})

Deno.test("cayley props: the target's gate gives the goal and its letter once", () => {
  fresh()
  const sim = new Sim()
  const [i, j] = Q8.gens
  const target = evalWord(Q8, [i, j])
  const { gates, levers } = room(sim, Q8, "t-q8", target)
  // j then i opens another gate (ji = -ij)
  sim.bump(levers[1])
  sim.bump(levers[0])
  sim.step(3)
  assertNotEquals(openGates(gates), [target])
  assertFalse(isCayleySolved("t-q8"))
  assertEquals(sim.items, [])
  // back to e: j i is of order 4 in Q8, so three more j i
  for (let k = 0; k < 3; k++) {
    sim.bump(levers[1])
    sim.bump(levers[0])
  }
  sim.step()
  assertEquals(openGates(gates), [0])
  sim.bump(levers[0])
  sim.bump(levers[1])
  sim.step()
  assertEquals(openGates(gates), [target])
  assert(isCayleySolved("t-q8"))
  assertEquals(goalsDone(), 1)
  assertEquals(gates[target].growthState?.stage, 5)
  // the letter in its alcove
  assertEquals(sim.items.length, 1)
  assertEquals(sim.items[0].id, cayleyRewardKey("t-q8"))
  assertEquals([sim.items[0].i, sim.items[0].j], [10 + 2 * target, 0])
  // pulling on: the gate shuts, no second goal or letter
  sim.bump(levers[0])
  sim.step(100)
  assertEquals(openGates(gates).length, 1)
  assertFalse(gates[target].canEnter)
  assertEquals(sim.items.length, 1)
  assertEquals(goalsDone(), 1)
})

Deno.test("cayley props: a gate never shuts on someone in it or its alcove", () => {
  fresh()
  const sim = new Sim()
  const { gates, levers } = room(sim, group("2.1"), "t-z2", 1)
  sim.step()
  // someone in e's alcove
  const someone = spawnActor("someone", 10, 0, catalog.actors["static"])
  sim.actorList.push(someone)
  sim.bump(levers[0])
  sim.step()
  assert(gates[0].canEnter)
  assert(gates[1].canEnter)
  // out of it, the gate shuts
  sim.actorList = sim.actorList.filter((a) => a !== someone)
  sim.step()
  assertEquals(openGates(gates), [1])
})

Deno.test("cayley props: the reset of the rooms undoes their goals", () => {
  Item.deserializeCollected([
    cayleyKey("cayley-8-3"),
    cayleyRewardKey("cayley-8-3"),
    cayleyKey("elsewhere"),
  ])
  assert(isCayleyKey(cayleyKey("cayley-8-3")))
  assertFalse(isCayleyKey(cayleyRewardKey("cayley-8-3")))
  resetGoals({ prefix: "cayley-", box: [0, 0, 0, 0] })
  assertFalse(Item.isCollected(cayleyKey("cayley-8-3")))
  assertFalse(Item.isCollected(cayleyRewardKey("cayley-8-3")))
  assert(Item.isCollected(cayleyKey("elsewhere")))
})
