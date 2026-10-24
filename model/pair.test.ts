// The pair at runtime (model/pair.ts): a thing of the twin's kind at rest
// on the empty plinth makes the pair whole and gives its letter once,
// kept (in the save too); the other kind does nothing
import { assert, assertEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { Actor, goneActorKey, spawnActor } from "./actor.ts"
import { Item } from "./item.ts"
import { Prop } from "./prop.ts"
import { PropSpawn } from "./field-block.ts"
import { isPairKey, pairKey, pairRewardKey, pairRewardType } from "./pair.ts"
import { goalsDone } from "./goal.ts"
import type { IActor, IField, IItem } from "./types.ts"
import * as signal from "../util/signals.ts"

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

/** A pair wanting a boulder: the twin at (100, 0), the plinth at (101, 0) */
class Sim {
  time = 0
  items: { id: string; i: number; j: number; type: string }[] = []
  actorList: IActor[] = [new Actor(101, 4, catalog.actors["static"], "main")]
  twin = Prop.fromSpawn(
    new PropSpawn(100, 0, catalog.props["pair-twin"], {
      id: "P",
      holds: "boulder",
    }),
  )
  plinth = Prop.fromSpawn(
    new PropSpawn(101, 0, catalog.props["pair-plinth"], {
      id: "P",
      want: "boulder",
      reward: [101, 3],
    }),
  )
  get field() {
    return this as unknown as IField
  }
  canEnterStatic(i: number, j: number) {
    return this.props.get(i, j)?.canEnter ?? true
  }
  isWater() {
    return false
  }
  actors = {
    get: (i: number, j: number) =>
      this.actorList.filter((a) => a.i === i && a.j === j),
    remove: (a: IActor) => {
      this.actorList = this.actorList.filter((x) => x !== a)
    },
  }
  props = {
    get: (i: number, j: number) =>
      j !== 0
        ? undefined
        : i === 100
        ? this.twin
        : i === 101
        ? this.plinth
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
  /** A thing of the kind, at rest on the plinth */
  put(kind: "stone" | "boulder", id = `${kind}0`) {
    const a = spawnActor(id, 101, 0, catalog.actors[kind])
    this.actorList.push(a)
    return a
  }
  step(n = 1) {
    for (let k = 0; k < n; k++) {
      this.time++
      this.twin.step(this.field)
      this.plinth.step(this.field)
    }
  }
}

Deno.test("pair: its props, the plinth open, the twin solid", () => {
  const plinth = catalog.props["pair-plinth"]
  const twin = catalog.props["pair-twin"]
  assert(plinth.canEnter && !twin.canEnter)
  assertEquals(plinth.growth?.hrefs.length, 3)
  assertEquals(twin.growth?.hrefs.length, 4)
})

Deno.test("pair: the other kind on the plinth makes no pair", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  sim.put("stone")
  sim.step(40)
  assert(!Item.isCollected(pairKey("P")))
  assertEquals(signal.message.get()?.text, "NOT A PAIR")
  assertEquals(sim.items, [])
  assertEquals(sim.twin.growthState?.stage, 1)
  assertEquals(sim.plinth.growthState?.stage, 0)
})

Deno.test("pair: the same kind on the plinth makes it whole, once", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  const boulder = sim.put("boulder", "b.1.2")
  sim.step(1)
  assert(Item.isCollected(pairKey("P")))
  assert(Item.isCollected(goneActorKey("b.1.2")))
  // the boulder settles on the plinth, both lit
  assert(!sim.actorList.includes(boulder))
  sim.step(1)
  assertEquals(sim.plinth.growthState?.stage, 2)
  assertEquals(sim.twin.growthState?.stage, 3)
  assert(!sim.plinth.canEnter)
  // the letter, a little way off
  assertEquals(sim.items.length, 1)
  const [letter] = sim.items
  assertEquals(letter.id, pairRewardKey("P"))
  assertEquals(letter.type, pairRewardType("P"))
  const d = Math.max(Math.abs(letter.i - 101), Math.abs(letter.j))
  assert(d >= 3 && d <= 4, `${d}`)
  sim.step(200)
  assertEquals(sim.items.length, 1)
})

Deno.test("pair: a whole one stays whole after a reload, and counts", () => {
  Item.deserializeCollected([])
  assertEquals(goalsDone(), 0)
  const first = new Sim()
  first.put("boulder")
  first.step(1)
  assertEquals(goalsDone(), 1)
  const saved = Item.serializeCollected()

  Item.deserializeCollected(saved)
  const second = new Sim()
  second.step(60)
  assertEquals(second.plinth.growthState?.stage, 2)
  assertEquals(second.twin.growthState?.stage, 3)
  assertEquals(second.items, first.items)
  Item.collect(pairRewardKey("P"))
  assertEquals(goalsDone(), 1)
  assert(isPairKey(pairKey("P")))
  assert(!isPairKey(pairRewardKey("P")))
})
