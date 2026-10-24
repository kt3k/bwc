// The missing ring at runtime (model/ring.ts): a stone at rest in the
// gap makes the ring whole, once; the whole ring, the stone that went in
// and the reward taken last in the save
import { assert, assertEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { Actor, goneActorKey, spawnActor } from "./actor.ts"
import { Item } from "./item.ts"
import { Prop } from "./prop.ts"
import { PropSpawn } from "./field-block.ts"
import { ringKey, ringRewardKey, ringRewardType } from "./ring.ts"
import type { IActor, IField, IItem } from "./types.ts"

/** Cells from the gap, as a king moves */
const fromGap = (t: { i: number; j: number }) =>
  Math.max(Math.abs(t.i - 100), Math.abs(t.j - 0))

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
 * The gap at (100, 0), the heart above it, the cell by the ring the
 * reward is reached from at (102, 0) (it comes up 3 or 4 cells off)
 */
class Sim {
  time = 0
  actorList: IActor[] = []
  items: { id: string; i: number; j: number; type: string }[] = []
  slot: Prop
  heart: Prop
  me = new Actor(100, 5, catalog.actors["static"], "main")
  constructor() {
    this.slot = Prop.fromSpawn(
      new PropSpawn(100, 0, catalog.props["ring-slot"], {
        id: "R",
        kind: "stone",
        reward: [102, 0],
      }),
    )
    this.heart = Prop.fromSpawn(
      new PropSpawn(100, -1, catalog.props["ring-heart"], { id: "R" }),
    )
    this.actorList.push(this.me)
  }
  get field() {
    return this as unknown as IField
  }
  canEnter(i: number, j: number) {
    return !this.actorList.some((a) => a.i === i && a.j === j) &&
      this.canEnterStatic(i, j)
  }
  canEnterStatic(i: number, j: number) {
    if (i === 100 && j === 0) return this.slot.canEnter
    return !(i === 100 && j === -1)
  }
  isSlippery() {
    return false
  }
  isWater() {
    return false
  }
  conveyorDir() {
    return null
  }
  actors = {
    iter: () => this.actorList[Symbol.iterator](),
    get: (i: number, j: number) =>
      this.actorList.filter((a) => a.i === i && a.j === j),
    add: (a: IActor) => void this.actorList.push(a),
    remove: (a: IActor) => {
      this.actorList = this.actorList.filter((x) => x !== a)
    },
  }
  props = {
    get: (i: number, j: number) => i === 100 && j === 0 ? this.slot : undefined,
    remove: () => {},
    iter: () => [this.slot, this.heart][Symbol.iterator](),
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
      for (const a of [...this.actorList]) {
        if (this.actorList.includes(a)) a.step(this.field)
      }
      this.slot.step(this.field)
      this.heart.step(this.field)
    }
  }
}

Deno.test("ring: a stone pushed into the gap makes the ring whole, once", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  const stone = spawnActor("stone-1", 100, 2, catalog.actors["stone"])
  sim.actors.add(stone)
  sim.step(5)
  assert(!Item.isCollected(ringKey("R")))
  assert(sim.slot.canEnter)
  // pushed up from below: a cell, then a cell into the gap
  stone.onPushed({ type: "pushed", dir: "up", peakAt: 7 }, sim.field)
  sim.step(40)
  assertEquals([stone.i, stone.j], [100, 1])
  assert(!Item.isCollected(ringKey("R")))
  stone.onPushed({ type: "pushed", dir: "up", peakAt: 7 }, sim.field)
  // not while it's still moving in
  sim.step(4)
  assertEquals([stone.i, stone.j], [100, 0])
  assert(!Item.isCollected(ringKey("R")))
  sim.step(40)
  // settled in: the ring is whole, the gap filled and solid, the stone
  // gone for good, the heart awake and the reward by the ring
  assert(Item.isCollected(ringKey("R")))
  assert(Item.isCollected(goneActorKey("stone-1")))
  assert(!sim.actorList.includes(stone))
  assert(!sim.slot.canEnter)
  assertEquals(sim.slot.growthState?.stage, 1)
  assertEquals(sim.heart.growthState?.stage, 1)
  assertEquals(sim.items.length, 1)
  const [reward] = sim.items
  assertEquals(reward.id, ringRewardKey("R"))
  assertEquals(reward.type, ringRewardType("R"))
  // a little way off the ring, on open ground
  const d = fromGap(reward)
  assert(d >= 3 && d <= 4, `${d}`)
  assert(sim.canEnterStatic(reward.i, reward.j))
  // only once
  sim.step(200)
  assertEquals(sim.items.length, 1)
})

Deno.test("ring: what isn't a stone or a boulder doesn't fill the gap", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  sim.actors.add(spawnActor("rabbit", 100, 0, catalog.actors["rabbit"]))
  sim.me.fastTravel(100, 0)
  sim.step(10)
  assert(!Item.isCollected(ringKey("R")))
})

Deno.test("ring: a whole ring stays whole after a reload", () => {
  Item.deserializeCollected([])
  const first = new Sim()
  const boulder = spawnActor("b", 100, 0, catalog.actors["boulder"])
  first.actors.add(boulder)
  first.step(2)
  assert(Item.isCollected(ringKey("R")))
  const saved = Item.serializeCollected()
  const [laid] = first.items

  // reloaded, the reward not taken yet: it lies there again, in the
  // same place (the ids go by the ring, the place by its id)
  Item.deserializeCollected(saved)
  const second = new Sim()
  second.step(60)
  assert(!second.slot.canEnter)
  assertEquals(second.slot.growthState?.stage, 1)
  assertEquals(second.heart.growthState?.stage, 1)
  assertEquals(second.items, [laid])

  // taken, it doesn't come back
  Item.collect(ringRewardKey("R"))
  const third = new Sim()
  third.step(60)
  assertEquals(third.items, [])
  assert(!third.slot.canEnter)
})
