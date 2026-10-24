// The dais to clear at runtime (model/clear.ts): once what sat on it is
// gone, the dais is clear and gives its letter once, kept (in the save
// too); the player standing on it doesn't count
import { assert, assertEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { Actor, goneActorKey, spawnActor } from "./actor.ts"
import { Item } from "./item.ts"
import { Prop } from "./prop.ts"
import { PropSpawn } from "./field-block.ts"
import {
  clearKey,
  clearRewardKey,
  clearRewardType,
  isClearKey,
} from "./clear.ts"
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

/** A dais at (100, 0) with a stone on it, the player below */
class Sim {
  time = 0
  items: { id: string; i: number; j: number; type: string }[] = []
  me = new Actor(100, 4, catalog.actors["static"], "main")
  stone = spawnActor("s.100.0", 100, 0, catalog.actors["stone"])
  actorList: IActor[] = [this.me, this.stone]
  dais = Prop.fromSpawn(
    new PropSpawn(100, 0, catalog.props["clear-dais"], {
      id: "C",
      reward: [100, 3],
    }),
  )
  get field() {
    return this as unknown as IField
  }
  canEnterStatic(i: number, j: number) {
    return !(i === 101 && j === 0)
  }
  isWater() {
    return false
  }
  actors = {
    get: (i: number, j: number) =>
      this.actorList.filter((a) => a.i === i && a.j === j),
  }
  props = {
    get: (i: number, j: number) => i === 100 && j === 0 ? this.dais : undefined,
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
      this.dais.step(this.field)
    }
  }
}

Deno.test("clear: its prop is walked over, two looks", () => {
  const def = catalog.props["clear-dais"]
  assert(def.canEnter)
  assertEquals(def.growth?.hrefs.length, 2)
})

Deno.test("clear: nothing happens while the stone sits there", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  sim.step(100)
  assert(!Item.isCollected(clearKey("C")))
  assertEquals(sim.items, [])
  assertEquals(sim.dais.growthState?.stage, 0)
})

Deno.test("clear: the stone gone, the dais is clear, once", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  sim.step(5)
  // the player comes to stand on it too: still not clear
  sim.actorList.push(new Actor(100, 0, catalog.actors["static"], "main"))
  sim.step(5)
  assert(!Item.isCollected(clearKey("C")))
  // the stone pushed off
  sim.actorList = sim.actorList.filter((a) => a !== sim.stone)
  sim.step(1)
  assert(Item.isCollected(clearKey("C")))
  assert(Item.isCollected(goneActorKey("s.100.0")))
  assertEquals(sim.dais.growthState?.stage, 1)
  assertEquals(sim.items.length, 1)
  const [letter] = sim.items
  assertEquals(letter.id, clearRewardKey("C"))
  assertEquals(letter.type, clearRewardType("C"))
  const d = Math.max(Math.abs(letter.i - 100), Math.abs(letter.j))
  assert(d >= 3 && d <= 4, `${d}`)
  sim.step(200)
  assertEquals(sim.items.length, 1)
})

Deno.test("clear: an empty dais at the start waits for what sits on it", () => {
  // (the map's actors come in after its props)
  Item.deserializeCollected([])
  const sim = new Sim()
  sim.actorList = [sim.me]
  sim.step(30)
  assert(!Item.isCollected(clearKey("C")))
  sim.actorList.push(sim.stone)
  sim.step(30)
  assert(!Item.isCollected(clearKey("C")))
})

Deno.test("clear: a clear one stays clear after a reload, and counts", () => {
  Item.deserializeCollected([])
  assertEquals(goalsDone(), 0)
  const first = new Sim()
  first.step(2)
  first.actorList = [first.me]
  first.step(1)
  assertEquals(goalsDone(), 1)
  const saved = Item.serializeCollected()
  Item.deserializeCollected(saved)
  const second = new Sim()
  second.actorList = [second.me]
  second.step(60)
  assertEquals(second.dais.growthState?.stage, 1)
  assertEquals(second.items, first.items)
  Item.collect(clearRewardKey("C"))
  assertEquals(goalsDone(), 1)
  assert(isClearKey(clearKey("C")))
  assert(!isClearKey(clearRewardKey("C")))
})
