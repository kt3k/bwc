// The stray sheep's fold at runtime (model/fold.ts): a sheep inside the
// fold shuts the gate and gives its letter once, kept (in the save too);
// loaded again, the fold has a sheep of its own in it
import { assert, assertEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { Actor, goneActorKey, spawnActor } from "./actor.ts"
import { Item } from "./item.ts"
import { Prop } from "./prop.ts"
import { PropSpawn } from "./field-block.ts"
import { foldKey, foldRewardKey, foldRewardType, isFoldKey } from "./fold.ts"
import { goalsDone } from "./goal.ts"
import type { Dir, IActor, IField, IItem } from "./types.ts"

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

/** A fold inside (100..101, 0..1), its gate at (102, 1); a sheep outside */
class Sim {
  time = 0
  items: { id: string; i: number; j: number; type: string }[] = []
  me = new Actor(105, 5, catalog.actors["static"], "main")
  sheep = spawnActor("sheep.104.1", 104, 1, catalog.actors["sheep"])
  actorList: IActor[] = [this.me, this.sheep]
  gate = Prop.fromSpawn(
    new PropSpawn(102, 1, catalog.props["fold-gate"], {
      id: "F",
      i0: 100,
      j0: 0,
      i1: 101,
      j1: 1,
      reward: [103, 3],
    }),
  )
  get field() {
    return this as unknown as IField
  }
  canEnterStatic(i: number, j: number) {
    return !(i === 102 && j === 1) || this.gate.canEnter
  }
  isWater() {
    return false
  }
  actors = {
    iter: () => this.actorList[Symbol.iterator](),
    get: (i: number, j: number) =>
      this.actorList.filter((a) => a.i === i && a.j === j),
  }
  props = {
    get: (i: number, j: number) => i === 102 && j === 1 ? this.gate : undefined,
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
  spawned: [string, number, number, Dir][] = []
  spawnActor(type: string, i: number, j: number, dir: Dir) {
    this.spawned.push([type, i, j, dir])
    const a = spawnActor(
      `spawned${this.spawned.length}`,
      i,
      j,
      catalog.actors[type],
    )
    this.actorList.push(a)
    return a
  }
  /** Puts the sheep at (i, j) at once */
  sheepTo(i: number, j: number) {
    this.actorList = this.actorList.filter((a) => a !== this.sheep)
    this.sheep = spawnActor(this.sheep.id, i, j, catalog.actors["sheep"])
    this.actorList.push(this.sheep)
  }
  step(n = 1) {
    for (let k = 0; k < n; k++) {
      this.time++
      this.gate.step(this.field)
    }
  }
}

Deno.test("fold: its gate, open and shut", () => {
  const def = catalog.props["fold-gate"]
  assert(def.canEnter)
  assertEquals(def.growth?.hrefs.length, 2)
})

Deno.test("fold: a sheep outside, or in the gateway, doesn't count", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  sim.step(60)
  sim.sheepTo(102, 1)
  sim.step(60)
  assert(!Item.isCollected(foldKey("F")))
  assert(sim.gate.canEnter)
})

Deno.test("fold: the sheep inside, the gate shuts on it, once", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  sim.sheepTo(101, 1)
  sim.step(10)
  assert(Item.isCollected(foldKey("F")))
  assert(Item.isCollected(goneActorKey("sheep.104.1")))
  assert(!sim.gate.canEnter)
  assertEquals(sim.gate.growthState?.stage, 1)
  assertEquals(sim.items.length, 1)
  const [letter] = sim.items
  assertEquals(letter.id, foldRewardKey("F"))
  assertEquals(letter.type, foldRewardType("F"))
  sim.step(200)
  assertEquals(sim.items.length, 1)
  // the sheep is there: none put in
  assertEquals(sim.spawned, [])
})

Deno.test("fold: loaded again, a full fold has its sheep, and counts", () => {
  Item.deserializeCollected([])
  assertEquals(goalsDone(), 0)
  const first = new Sim()
  first.sheepTo(100, 0)
  first.step(10)
  assertEquals(goalsDone(), 1)
  const saved = Item.serializeCollected()
  Item.deserializeCollected(saved)
  // (the stray is gone with the save: not spawned)
  const second = new Sim()
  second.actorList = [second.me]
  second.step(60)
  assertEquals(second.spawned, [["sheep", 100, 0, "down"]])
  assert(!second.gate.canEnter)
  assertEquals(second.items, first.items)
  second.step(60)
  assertEquals(second.spawned.length, 1)
  Item.collect(foldRewardKey("F"))
  assertEquals(goalsDone(), 1)
  assert(isFoldKey(foldKey("F")))
  assert(!isFoldKey(foldRewardKey("F")))
})
