// The patrol's beacon at runtime (model/beacon.ts): lit by the patrol
// bumping into it, once, kept (in the save too); anyone else's bump does
// nothing
import { assert, assertEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { Actor, spawnActor } from "./actor.ts"
import { Item } from "./item.ts"
import { Prop } from "./prop.ts"
import { PropSpawn } from "./field-block.ts"
import {
  beaconKey,
  beaconRewardKey,
  beaconRewardType,
  isBeaconKey,
} from "./beacon.ts"
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

/** A beacon at (100, 0) */
class Sim {
  time = 0
  items: { id: string; i: number; j: number; type: string }[] = []
  me = new Actor(100, 1, catalog.actors["static"], "main")
  patrol = spawnActor("p", 101, 0, catalog.actors["patrol"])
  stone = spawnActor("s", 99, 0, catalog.actors["stone"])
  beacon = Prop.fromSpawn(
    new PropSpawn(100, 0, catalog.props["patrol-beacon"], {
      id: "B",
      reward: [100, 3],
    }),
  )
  get field() {
    return this as unknown as IField
  }
  canEnterStatic(i: number, j: number) {
    return !(i === 100 && j === 0)
  }
  isWater() {
    return false
  }
  props = {
    get: (i: number, j: number) =>
      i === 100 && j === 0 ? this.beacon : undefined,
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
  bump(pusher: IActor) {
    this.beacon.onPushed(
      { type: "pushed", dir: "left", peakAt: 7, pusher },
      this.field,
    )
  }
  step(n = 1) {
    for (let k = 0; k < n; k++) {
      this.time++
      this.beacon.step(this.field)
    }
  }
}

Deno.test("beacon: its prop is solid and takes bumps", () => {
  const def = catalog.props["patrol-beacon"]
  assert(!def.canEnter)
  assertEquals(def.pushed, "patrol-beacon")
  assertEquals(def.growth?.hrefs.length, 2)
})

Deno.test("beacon: the player's bump or a thing's does nothing", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  sim.bump(sim.me)
  assertEquals(signal.message.get()?.text, "ONLY THE WATCH CAN LIGHT IT")
  sim.bump(sim.stone)
  sim.step(60)
  assert(!Item.isCollected(beaconKey("B")))
  assertEquals(sim.items, [])
  assertEquals(sim.beacon.growthState?.stage, 0)
})

Deno.test("beacon: the patrol's bump lights it, once", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  sim.bump(sim.patrol)
  assert(Item.isCollected(beaconKey("B")))
  assertEquals(sim.beacon.growthState?.stage, 1)
  assertEquals(sim.items.length, 1)
  const [letter] = sim.items
  assertEquals(letter.id, beaconRewardKey("B"))
  assertEquals(letter.type, beaconRewardType("B"))
  sim.bump(sim.patrol)
  sim.step(200)
  assertEquals(sim.items.length, 1)
})

Deno.test("beacon: a lit one stays lit after a reload, and counts", () => {
  Item.deserializeCollected([])
  assertEquals(goalsDone(), 0)
  const first = new Sim()
  first.bump(first.patrol)
  assertEquals(goalsDone(), 1)
  const saved = Item.serializeCollected()
  Item.deserializeCollected(saved)
  const second = new Sim()
  second.step(60)
  assertEquals(second.beacon.growthState?.stage, 1)
  assertEquals(second.items, first.items)
  Item.collect(beaconRewardKey("B"))
  assertEquals(goalsDone(), 1)
  assert(isBeaconKey(beaconKey("B")))
  assert(!isBeaconKey(beaconRewardKey("B")))
})
