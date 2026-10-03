import { collectAll, Item } from "./item.ts"
import { Actor } from "./actor.ts"
import { EffectPopupPixel } from "./effect.ts"
import type { IActor, IField } from "./types.ts"
import * as signal from "../util/signals.ts"
import { assert, assertEquals } from "@std/assert"

const coinDef = { type: "coin", collect: "coin", src: "", href: "" }
const keyDef = { type: "key", collect: "key", src: "", href: "" }

function makeField(me: IActor, collected: string[], effects: unknown[]) {
  const field: IField = {
    get me() {
      return me
    },
    canEnter: () => true,
    canEnterStatic: () => true,
    isSlippery: () => false,
    isWater: () => false,
    conveyorDir: () => null,
    isDiggable: () => false,
    updateCell: () => {},
    peekItem: () => undefined,
    peekItems: () => [],
    spawnActor: () => null,
    spawnItem: () => null,
    spawnProp: () => null,
    collectItem: (_i, _j, id) => collected.push(id),
    actors: { iter: () => [], get: () => [], add: () => {}, remove: () => {} },
    props: { get: () => undefined, remove: () => {}, iter: () => [] },
    effects: { add: (e) => effects.push(e) },
    get time() {
      return 0
    },
    colorCell: () => {},
  }
  return field
}

Deno.test("collectAll", async (t) => {
  const me = new Actor(2, 2, { type: "main", src: "", href: "" }, "main")

  await t.step("takes a whole stack at once and pops up its count", () => {
    signal.coinCount.update(0)
    signal.keyCount.update(0)
    const collected: string[] = []
    const effects: unknown[] = []
    const items = [
      new Item("c1", 2, 2, coinDef),
      new Item("c2", 2, 2, coinDef),
      new Item("c3", 2, 2, coinDef),
      new Item("k1", 2, 2, keyDef),
    ]
    collectAll(me, makeField(me, collected, effects), items)
    assertEquals(signal.coinCount.get(), 3)
    assertEquals(signal.keyCount.get(), 1)
    assertEquals(collected.sort(), ["c1", "c2", "c3", "k1"])
    assert(effects.some((e) => e instanceof EffectPopupPixel))
  })

  await t.step("a single item shows no count", () => {
    signal.coinCount.update(0)
    const collected: string[] = []
    const effects: unknown[] = []
    collectAll(me, makeField(me, collected, effects), [
      new Item("c1", 2, 2, coinDef),
    ])
    assertEquals(signal.coinCount.get(), 1)
    assertEquals(collected, ["c1"])
    assert(!effects.some((e) => e instanceof EffectPopupPixel))
  })
})
