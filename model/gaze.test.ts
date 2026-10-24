// The statue's gaze at runtime (model/gaze.ts): once nothing solid stands
// in its line (having seen it blocked first), the statue sees the
// sun-stone and gives its letter once, kept (in the save too); water and
// the player don't block it
import { assert, assertEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { Actor, spawnActor } from "./actor.ts"
import { Item } from "./item.ts"
import { Prop } from "./prop.ts"
import { PropSpawn } from "./field-block.ts"
import {
  gazeKey,
  gazeRewardKey,
  gazeRewardType,
  isGazeKey,
  lineClear,
} from "./gaze.ts"
import { goalsDone } from "./goal.ts"
import type { IActor, IField, IItem } from "./types.ts"

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

/**
 * A statue at (100, 0) looking right at the sun-stone at (106, 0): a
 * pool at (102, 0), a bush at (104, 0) (flattened by `flat`), a stone at
 * (103, 0)
 */
class Sim {
  time = 0
  items: { id: string; i: number; j: number; type: string }[] = []
  flat = false
  me = new Actor(101, 0, catalog.actors["static"], "main")
  stone = spawnActor("s.103.0", 103, 0, catalog.actors["stone"])
  actorList: IActor[] = [this.me, this.stone]
  statue = Prop.fromSpawn(
    new PropSpawn(100, 0, catalog.props["gaze-statue"], {
      id: "G",
      dir: "right",
      to: [106, 0],
      reward: [100, 3],
    }),
  )
  sun = Prop.fromSpawn(
    new PropSpawn(106, 0, catalog.props["gaze-sun"], { id: "G" }),
  )
  get field() {
    return this as unknown as IField
  }
  canEnterStatic(i: number, j: number) {
    if (j === 0 && (i === 100 || i === 106)) return false
    if (j === 0 && i === 104) return this.flat
    return !this.isWater(i, j)
  }
  isWater(i: number, j: number) {
    return i === 102 && j === 0
  }
  actors = {
    get: (i: number, j: number) =>
      this.actorList.filter((a) => a.i === i && a.j === j),
  }
  props = {
    get: (i: number, j: number) =>
      j !== 0
        ? undefined
        : i === 100
        ? this.statue
        : i === 106
        ? this.sun
        : undefined,
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
  step(n = 1) {
    for (let k = 0; k < n; k++) {
      this.time++
      this.statue.step(this.field)
      this.sun.step(this.field)
    }
  }
}

Deno.test("gaze: its props, the statue's eight looks and the sun-stone's two", () => {
  assertEquals(catalog.props["gaze-statue"].growth?.hrefs.length, 8)
  assertEquals(catalog.props["gaze-sun"].growth?.hrefs.length, 2)
  assert(!catalog.props["gaze-statue"].canEnter)
})

Deno.test("gaze: a bush and a stone block the line; water and the player don't", () => {
  const sim = new Sim()
  assert(!lineClear(sim.field, 100, 0, "right", [106, 0]))
  sim.flat = true
  assert(!lineClear(sim.field, 100, 0, "right", [106, 0]))
  sim.actorList = [sim.me]
  assert(lineClear(sim.field, 100, 0, "right", [106, 0]))
})

Deno.test("gaze: the line cleared, the statue sees, once", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  sim.step(20)
  assert(!Item.isCollected(gazeKey("G")))
  assertEquals(sim.statue.growthState?.stage, 3)
  sim.flat = true
  sim.step(20)
  assert(!Item.isCollected(gazeKey("G")))
  sim.actorList = [sim.me]
  sim.step(4)
  assert(Item.isCollected(gazeKey("G")))
  sim.step(1)
  assertEquals(sim.statue.growthState?.stage, 7)
  assertEquals(sim.sun.growthState?.stage, 1)
  assertEquals(sim.items.length, 1)
  const [letter] = sim.items
  assertEquals(letter.id, gazeRewardKey("G"))
  assertEquals(letter.type, gazeRewardType("G"))
  sim.step(200)
  assertEquals(sim.items.length, 1)
})

Deno.test("gaze: a line clear at first is not counted (the actors come later)", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  sim.flat = true
  sim.actorList = [sim.me]
  sim.step(40)
  assert(!Item.isCollected(gazeKey("G")))
})

Deno.test("gaze: a statue that has seen stays so after a reload, and counts", () => {
  Item.deserializeCollected([])
  assertEquals(goalsDone(), 0)
  const first = new Sim()
  first.step(4)
  first.flat = true
  first.actorList = [first.me]
  first.step(4)
  assertEquals(goalsDone(), 1)
  const saved = Item.serializeCollected()
  Item.deserializeCollected(saved)
  const second = new Sim()
  second.step(60)
  assertEquals(second.statue.growthState?.stage, 7)
  assertEquals(second.items, first.items)
  Item.collect(gazeRewardKey("G"))
  assertEquals(goalsDone(), 1)
  assert(isGazeKey(gazeKey("G")))
  assert(!isGazeKey(gazeRewardKey("G")))
})
