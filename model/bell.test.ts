// The bell out of reach at runtime (model/bell.ts): a thing bumping into
// it rings it and gives its letter once, kept (in the save too); the
// player's knock doesn't ring it
import { assert, assertEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { Actor } from "./actor.ts"
import { Item } from "./item.ts"
import { Prop } from "./prop.ts"
import { PropSpawn } from "./field-block.ts"
import {
  bellKey,
  bellRewardKey,
  bellRewardType,
  isBellKey,
  SWING_FRAMES,
} from "./bell.ts"
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

/** A bell at (100, 0), the player by it at (100, 3) */
class Sim {
  time = 0
  items: { id: string; i: number; j: number; type: string }[] = []
  bell = Prop.fromSpawn(
    new PropSpawn(100, 0, catalog.props["goal-bell"], {
      id: "B",
      reward: [100, 3],
    }),
  )
  me = new Actor(100, 3, catalog.actors["static"], "main")
  stone = new Actor(100, 1, catalog.actors["stone"], "stone0")
  get field() {
    return this as unknown as IField
  }
  canEnterStatic(i: number, j: number) {
    return !this.props.get(i, j)
  }
  isWater() {
    return false
  }
  actors = {
    iter: () => [this.me as IActor][Symbol.iterator](),
  }
  props = {
    get: (i: number, j: number) => i === 100 && j === 0 ? this.bell : undefined,
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
  /** Something bumps into the bell (the stone by default) */
  bump(pusher: IActor = this.stone) {
    this.bell.onPushed(
      { type: "pushed", dir: "up", peakAt: 0, pusher },
      this.field,
    )
  }
  step(n = 1) {
    for (let k = 0; k < n; k++) {
      this.time++
      this.bell.step(this.field)
    }
  }
}

Deno.test("bell: its prop is solid, takes bumps and has its four looks", () => {
  const def = catalog.props["goal-bell"]
  assert(def && !def.canEnter)
  assertEquals(def.pushed, "goal-bell")
  assertEquals(def.growth?.hrefs.length, 4)
})

Deno.test("bell: a thing bumping into it rings it and gives its letter, once", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  sim.step(40)
  assertEquals(sim.items, [])
  assertEquals(sim.bell.growthState?.stage, 0)
  sim.bump()
  assert(Item.isCollected(bellKey("B")))
  assertEquals(sim.items.length, 1)
  const [letter] = sim.items
  assertEquals(letter.id, bellRewardKey("B"))
  assertEquals(letter.type, bellRewardType("B"))
  const d = Math.max(Math.abs(letter.i - 100), Math.abs(letter.j))
  assert(d >= 3 && d <= 4, `${d}`)
  // it swings a while, then hangs still, lit
  sim.step(1)
  assert([1, 2].includes(sim.bell.growthState!.stage))
  sim.step(SWING_FRAMES)
  assertEquals(sim.bell.growthState?.stage, 3)
  // only once: bumped again, or the time passing
  sim.bump()
  sim.step(200)
  assertEquals(sim.items.length, 1)
  // taken, it doesn't come back
  Item.collect(bellRewardKey("B"))
  sim.items.length = 0
  sim.step(200)
  sim.bump()
  assertEquals(sim.items, [])
})

Deno.test("bell: the player's knock doesn't ring it", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  sim.bump(sim.me)
  sim.step(100)
  assert(!Item.isCollected(bellKey("B")))
  assertEquals(sim.items, [])
  assertEquals(sim.bell.growthState?.stage, 0)
})

Deno.test("bell: rung far from the player, it is left be", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  sim.me = new Actor(140, 3, catalog.actors["static"], "main")
  sim.bump()
  assert(!Item.isCollected(bellKey("B")))
})

Deno.test("bell: a rung one stays rung after a reload", () => {
  Item.deserializeCollected([])
  const first = new Sim()
  first.bump()
  const saved = Item.serializeCollected()

  // reloaded, the letter not taken yet: it lies there again, in the
  // same place
  Item.deserializeCollected(saved)
  const second = new Sim()
  second.step(60)
  assertEquals(second.bell.growthState?.stage, 3)
  assertEquals(second.items, first.items)
})

Deno.test("bell: a rung one counts as a goal done (its letter doesn't)", () => {
  Item.deserializeCollected([])
  assertEquals(goalsDone(), 0)
  const sim = new Sim()
  sim.bump()
  assertEquals(goalsDone(), 1)
  Item.collect(bellRewardKey("B"))
  assertEquals(goalsDone(), 1)
  assert(isBellKey(bellKey("B")))
  assert(!isBellKey(bellRewardKey("B")))
})
