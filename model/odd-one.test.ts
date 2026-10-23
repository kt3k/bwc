// The odd one out at runtime (model/odd-one.ts): bumping the odd one
// gives its letter once and is kept (in the save too); bumping the
// others gives nothing
import { assert, assertEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { Actor } from "./actor.ts"
import { Item } from "./item.ts"
import { Prop } from "./prop.ts"
import { PropSpawn } from "./field-block.ts"
import {
  alikeType,
  isOddKey,
  ODD_FAMILIES,
  oddKey,
  oddRewardKey,
  oddRewardType,
  unlikeType,
} from "./odd-one.ts"
import { goalsDone } from "./goal.ts"
import type { IField, IItem } from "./types.ts"

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

/** A row of tulips at (100..104, 0), the odd one at (102, 0) */
class Sim {
  time = 0
  items: { id: string; i: number; j: number; type: string }[] = []
  row: Prop[] = []
  me = new Actor(102, 1, catalog.actors["static"], "main")
  stranger = new Actor(101, 1, catalog.actors["static"], "rabbit")
  constructor() {
    for (let k = 0; k < 5; k++) {
      this.row.push(Prop.fromSpawn(
        k === 2
          ? new PropSpawn(100 + k, 0, catalog.props[unlikeType("tulip")], {
            id: "T",
            reward: [103, -1],
          })
          : new PropSpawn(
            100 + k,
            0,
            catalog.props[alikeType("tulip")],
            undefined,
          ),
      ))
    }
  }
  get odd() {
    return this.row[2]
  }
  get field() {
    return this as unknown as IField
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
  /** The player (or someone else) bumps into the k-th of the row */
  bump(k: number, pusher = this.me) {
    this.row[k].onPushed(
      { type: "pushed", dir: "up", peakAt: 7, pusher },
      this.field,
    )
  }
  step(n = 1) {
    for (let k = 0; k < n; k++) {
      this.time++
      for (const prop of this.row) prop.step(this.field)
    }
  }
}

Deno.test("odd one: every family has its props, the odd one found as a stage", () => {
  for (const f of ODD_FAMILIES) {
    const alike = catalog.props[alikeType(f)]
    const unlike = catalog.props[unlikeType(f)]
    assert(alike && unlike, f)
    assert(!alike.canEnter && !unlike.canEnter, f)
    assertEquals(unlike.pushed, "unlike")
    assertEquals(unlike.growth?.hrefs.length, 2)
  }
})

Deno.test("odd one: the odd one bumped gives its letter, once", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  sim.step(40)
  assertEquals(sim.items, [])
  assertEquals(sim.odd.growthState?.stage, 0)
  sim.bump(2)
  assert(Item.isCollected(oddKey("T")))
  // fallen in line, the letter by it
  assertEquals(sim.odd.growthState?.stage, 1)
  assertEquals(sim.items, [
    { id: oddRewardKey("T"), i: 103, j: -1, type: oddRewardType("T") },
  ])
  // only once: bumped again, or the time passing
  sim.bump(2)
  sim.step(200)
  assertEquals(sim.items.length, 1)
  // taken, it doesn't come back
  Item.collect(oddRewardKey("T"))
  sim.items.length = 0
  sim.step(200)
  sim.bump(2)
  assertEquals(sim.items, [])
})

Deno.test("odd one: the others give nothing, nor does someone else's bump", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  for (const k of [0, 1, 3, 4]) sim.bump(k)
  sim.bump(2, sim.stranger)
  sim.step(100)
  assert(!Item.isCollected(oddKey("T")))
  assertEquals(sim.items, [])
  assert(sim.row.every((p) => (p.growthState?.stage ?? 0) === 0))
})

Deno.test("odd one: a found one stays found after a reload", () => {
  Item.deserializeCollected([])
  const first = new Sim()
  first.bump(2)
  const saved = Item.serializeCollected()

  // reloaded, the letter not taken yet: it lies there again
  Item.deserializeCollected(saved)
  const second = new Sim()
  second.step(60)
  assertEquals(second.odd.growthState?.stage, 1)
  assertEquals(second.items.map((t) => t.id), [oddRewardKey("T")])
})

Deno.test("odd one: a found one counts as a goal done (its letter doesn't)", () => {
  Item.deserializeCollected([])
  assertEquals(goalsDone(), 0)
  const sim = new Sim()
  sim.bump(2)
  assertEquals(goalsDone(), 1)
  Item.collect(oddRewardKey("T"))
  assertEquals(goalsDone(), 1)
  assert(isOddKey(oddKey("T")) && !isOddKey(oddRewardKey("T")))
})
