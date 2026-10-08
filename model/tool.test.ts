import { assert, assertEquals } from "@std/assert"
import { Actor, IdleDelegateChase } from "./actor.ts"
import { Item } from "./item.ts"
import { CatDelegate } from "./townsfolk.ts"
import { chooseTool, nextTool, putTool } from "./tool.ts"
import type { IActor, IField, IItem } from "./types.ts"
import * as signal from "../util/signals.ts"

const def = { type: "npc", src: "", href: "" }
const appleDef = { type: "apple", collect: "apple", src: "", href: "" }
const fishDef = { type: "fish", collect: "fish", src: "", href: "" }

/** Open floor holding the given actors and items; the time can advance */
function makeField(me: Actor, others: Actor[] = []) {
  let time = 0
  const items: IItem[] = []
  const all = () => [me, ...others]
  const field: IField = {
    get me() {
      return me
    },
    canEnter: (i, j) => !all().some((a) => a.i === i && a.j === j),
    canEnterStatic: () => true,
    isSlippery: () => false,
    isWater: () => false,
    conveyorDir: () => null,
    isDiggable: () => false,
    updateCell: () => {},
    peekItem: (i, j) => items.find((it) => it.i === i && it.j === j),
    peekItems: (i, j) => items.filter((it) => it.i === i && it.j === j),
    spawnActor: () => null,
    spawnItem: (type, i, j) => {
      const item = new Item(null, i, j, type === "fish" ? fishDef : appleDef)
      items.push(item)
      return item
    },
    spawnProp: () => null,
    collectItem: (_i, _j, id) => {
      const n = items.findIndex((it) => it.id === id)
      if (n >= 0) items.splice(n, 1)
    },
    actors: {
      iter: () => all(),
      get: (i, j) => all().filter((a) => a.i === i && a.j === j) as IActor[],
      add: () => {},
      remove: () => {},
    },
    props: { get: () => undefined, remove: () => {}, iter: () => [] },
    effects: { add: () => {} },
    get time() {
      return time
    },
    colorCell: () => {},
  }
  return { field, items, tick: (n: number) => time += n }
}

Deno.test("the tools cycle: none, apple, fish, seed, none", () => {
  assertEquals(nextTool(null), "apple")
  assertEquals(nextTool("apple"), "fish")
  assertEquals(nextTool("fish"), "seed")
  assertEquals(nextTool("seed"), null)
})

Deno.test("putTool", async (t) => {
  await t.step("does nothing without a tool (space does the usual)", () => {
    chooseTool(null)
    const me = new Actor(0, 0, def, "main")
    const { field } = makeField(me)
    assertEquals(putTool(me, field), false)
  })

  await t.step("puts an apple in front, one fewer in the pocket", () => {
    signal.appleCount.update(2)
    chooseTool("apple")
    const me = new Actor(0, 0, def, "main")
    me.setDir("right")
    const { field, items } = makeField(me)
    assert(putTool(me, field))
    assertEquals(signal.appleCount.get(), 1)
    assertEquals(items.map((it) => [it.def.type, it.i, it.j]), [
      ["apple", 1, 0],
    ])
    chooseTool(null)
    signal.appleCount.update(0)
  })

  await t.step("puts nothing without apples", () => {
    signal.appleCount.update(0)
    chooseTool("apple")
    const me = new Actor(0, 0, def, "main")
    const { field, items } = makeField(me)
    assert(putTool(me, field))
    assertEquals(items.length, 0)
    chooseTool(null)
  })
})

Deno.test("the chaser goes for an apple, eats it and sits full", () => {
  const me = new Actor(30, 30, def, "main")
  const chaser = new Actor(0, 0, def, "npc")
  const { field, items, tick } = makeField(me, [chaser])
  field.spawnItem("apple", 2, 0)
  const chase = new IdleDelegateChase()
  chase.onIdle(chaser, field)
  assertEquals([chaser.i, chaser.j], [1, 0])
  chase.onIdle(chaser, field)
  assertEquals([chaser.i, chaser.j], [2, 0])
  chase.onIdle(chaser, field)
  assertEquals(items.length, 0)
  // full: stays put even with the player in reach
  me.fastTravel(4, 0)
  tick(IdleDelegateChase.FULL - 1)
  chase.onIdle(chaser, field)
  assertEquals([chaser.i, chaser.j], [2, 0])
  tick(1)
  chase.onIdle(chaser, field)
  assertEquals([chaser.i, chaser.j], [3, 0])
})

Deno.test("the cat goes for a fish, eats it and sleeps there", () => {
  const me = new Actor(-1, 0, def, "main")
  const cat = new Actor(4, 0, def, "c")
  const { field, items, tick } = makeField(me, [cat])
  field.spawnItem("fish", 1, 0)
  const delegate = new CatDelegate()
  // toward the fish, past the player standing close by
  for (let n = 0; n < 3; n++) {
    delegate.onIdle(cat, field)
    tick(12)
  }
  assertEquals([cat.i, cat.j], [1, 0])
  delegate.onIdle(cat, field)
  assertEquals(items.length, 0)
  // asleep: the player right next to it doesn't send it off
  tick(CatDelegate.FEAST - 1)
  delegate.onIdle(cat, field)
  assertEquals([cat.i, cat.j], [1, 0])
})

Deno.test("the cat ignores apples, the chaser ignores fish", () => {
  const me = new Actor(30, 30, def, "main")
  const cat = new Actor(0, 0, def, "c")
  const chaser = new Actor(0, 5, def, "npc")
  const { field } = makeField(me, [cat, chaser])
  field.spawnItem("apple", 0, 2)
  field.spawnItem("fish", 0, 7)
  const catDelegate = new CatDelegate()
  const chase = new IdleDelegateChase()
  // the chaser walks up to the apple, away from the fish
  chase.onIdle(chaser, field)
  assertEquals([chaser.i, chaser.j], [0, 4])
  // the cat goes for the fish, not for the nearer apple
  catDelegate.onIdle(cat, field)
  assertEquals([cat.i, cat.j], [0, 1])
})
