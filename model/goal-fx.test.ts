// The moment a goal is done (model/celebrate.ts, model/goal-fx.ts): the
// hit stop holds the world still and lets go, the burst goes off once
// (the sound and the message as it lets go), and the reward letter rises
// slowly and can't be picked up until it has; laid again after a reload,
// it just lies there
import { assert, assertEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { Actor, spawnActor } from "./actor.ts"
import { collectAll, Item } from "./item.ts"
import { Prop } from "./prop.ts"
import { PropSpawn } from "./field-block.ts"
import { celebrateGoal } from "./celebrate.ts"
import {
  BURST_FRAMES,
  GlyphReveal,
  GOAL_HIT_STOP,
  GoalBurst,
  REVEAL,
  REVEAL_DELAY,
  REVEAL_FRAMES,
  revealPose,
} from "./goal-fx.ts"
import { layGlyph, revealGlyph } from "./glyph.ts"
import { ringKey, ringRewardKey, stepRingSlot } from "./ring.ts"
import { oddRewardKey, unlikeType } from "./odd-one.ts"
import { seeded } from "./break-fx.ts"
import { juice, stepWorld } from "../util/juice.ts"
import { isPaletteColor } from "../util/palette.ts"
import * as signal from "../util/signals.ts"
import type { IColorBox, IField, IItem } from "./types.ts"

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

type Fx = { step(f: IField): void; finished: boolean }

/** A field of real items that keeps the effects added, and its time */
function makeField() {
  const items: Item[] = []
  const effects: Fx[] = []
  const field = {
    time: 0,
    actorList: [] as unknown[],
    peekItems: (i: number, j: number) =>
      items.filter((t) => t.i === i && t.j === j) as IItem[],
    spawnItem: (type: string, i: number, j: number, id?: string) => {
      const item = new Item(id ?? null, i, j, catalog.items[type])
      items.push(item)
      return item
    },
    collectItem: (_i: number, _j: number, id: string) => {
      Item.collect(id)
      const k = items.findIndex((t) => t.id === id)
      if (k >= 0) items.splice(k, 1)
    },
    effects: { add: (e: Fx) => void effects.push(e) },
  }
  /** A frame of the game loop: the world, unless held still */
  const frame = () =>
    stepWorld(() => {
      field.time++
      for (const item of [...items]) item.step(field as unknown as IField)
      for (const e of [...effects]) {
        e.step(field as unknown as IField)
        if (e.finished) effects.splice(effects.indexOf(e), 1)
      }
    })
  return { field: field as unknown as IField, items, effects, frame }
}

const reset = () => {
  Item.deserializeCollected([])
  signal.glyphs.update([])
  signal.message.update(null)
  juice.freeze = 0
  juice.shake = 0
}

Deno.test("goal fx: the hit stop holds the world still for its frames, then lets go", () => {
  reset()
  let stepped = 0
  juice.freeze = 3
  const runs = Array.from({ length: 5 }, () => stepWorld(() => stepped++))
  assertEquals(runs, [false, false, false, true, true])
  assertEquals(stepped, 2)
  assertEquals(juice.freeze, 0)
})

Deno.test("goal fx: a goal done holds still, then bursts once with its message", () => {
  reset()
  const { field, effects, frame } = makeField()
  const sounds: string[] = []
  const off = signal.sound.subscribe((s) => s && sounds.push(s.name))
  celebrateGoal(field, 10, 10, "A GOAL")
  assertEquals(juice.freeze, GOAL_HIT_STOP)
  assert(juice.shake > GOAL_HIT_STOP)
  assertEquals(effects.length, 1)
  assert(effects[0] instanceof GoalBurst)
  // in the same frame (the rest of the field's step): not yet
  effects[0].step(field)
  assertEquals((effects[0] as GoalBurst).f, 0)
  // held still: nothing moves, no message, no sound yet
  for (let k = 0; k < GOAL_HIT_STOP; k++) assert(!frame())
  assertEquals((effects[0] as GoalBurst).f, 0)
  assertEquals(signal.message.get(), null)
  assertEquals(sounds, [])
  // let go: the message and the sound, once
  assert(frame())
  assertEquals(signal.message.get(), { text: "A GOAL" })
  assertEquals(sounds, ["powerUp"])
  for (let k = 0; k < BURST_FRAMES + 5; k++) frame()
  assertEquals(sounds, ["powerUp"])
  assertEquals(effects, [])
  off()
})

Deno.test("goal fx: the letter can't be picked up while it rises, and can after", () => {
  reset()
  const { field, items, effects, frame } = makeField()
  const me = new Actor(5, 5, catalog.actors["static"], "main")
  const id = ringRewardKey("A")
  const item = revealGlyph(field, 5, 5, id)
  assert(item)
  assert(effects.some((e) => e instanceof GlyphReveal))
  assert(item.revealing)
  // nothing shown yet, then it comes up a row at a time
  assertEquals(item.clipH, 0)
  // not to be taken, even standing on it
  for (let k = 0; k < REVEAL_FRAMES - 1; k++) {
    frame()
    collectAll(me, field, field.peekItems(5, 5))
    assertEquals(items.length, 1, `frame ${k}`)
  }
  assert(!Item.isCollected(id))
  frame()
  // settled: all of it, on its cell, and it can be taken
  assert(!item.revealing)
  assertEquals(item.clipH, undefined)
  assertEquals(item.y, 5 * 16)
  collectAll(me, field, field.peekItems(5, 5))
  assertEquals(items, [])
  assert(Item.isCollected(id))
  assertEquals(signal.glyphs.get().map((g) => g.id), [id])
  reset()
})

Deno.test("goal fx: the letter rises out of the ground a row at a time, then hops", () => {
  const [r0, r1] = REVEAL.rise
  assertEquals(revealPose(0), { rows: 0, dy: 0 })
  assertEquals(revealPose(REVEAL_DELAY + r0 - 1).rows, 0)
  let rows = 0
  for (let t = r0; t < r1; t++) {
    const pose = revealPose(REVEAL_DELAY + t)
    // its bottom stays on the ground line
    assertEquals(pose.rows + pose.dy, 16)
    assert(pose.rows >= rows && pose.rows <= rows + 1)
    rows = pose.rows
  }
  assertEquals(rows, 16)
  // the hop at the climax, then settled
  const hop = Array.from(
    { length: REVEAL.climax[1] - r1 },
    (_, k) => revealPose(REVEAL_DELAY + r1 + k).dy,
  )
  assert(Math.min(...hop) < 0)
  assertEquals(hop.at(-1), 0)
})

Deno.test("goal fx: a ring made whole celebrates once; reloaded, its letter just lies there", () => {
  reset()
  const { field, items, effects, frame } = makeField()
  const slot = Prop.fromSpawn(
    new PropSpawn(100, 0, catalog.props["ring-slot"], {
      id: "R",
      kind: "boulder",
      reward: [102, 0],
    }),
  )
  const boulder = spawnActor("b", 100, 0, catalog.actors["boulder"])
  const f = field as unknown as {
    actors: unknown
    time: number
  }
  let actorList = [boulder]
  f.actors = {
    get: (i: number, j: number) =>
      actorList.filter((a) => a.i === i && a.j === j),
    remove: (a: unknown) => {
      actorList = actorList.filter((x) => x !== a)
    },
  }
  stepRingSlot(slot, field)
  assert(Item.isCollected(ringKey("R")))
  assertEquals(effects.filter((e) => e instanceof GoalBurst).length, 1)
  assertEquals(effects.filter((e) => e instanceof GlyphReveal).length, 1)
  assertEquals(items.length, 1)
  assert(items[0].revealing)
  // whole now: stepped on, it doesn't celebrate again
  for (let k = 0; k < 200; k++) {
    frame()
    stepRingSlot(slot, field)
  }
  assertEquals(effects, [])
  assertEquals(items.length, 1)
  assert(!items[0].revealing)

  // reloaded, the letter not taken: laid again with no reveal
  const saved = Item.serializeCollected()
  reset()
  Item.deserializeCollected(saved)
  const second = makeField()
  for (let k = 0; k < 31; k++) {
    second.frame()
    stepRingSlot(slot, second.field)
  }
  assertEquals(second.items.map((t) => t.id), [ringRewardKey("R")])
  assert(!second.items[0].revealing)
  assertEquals(second.effects, [])
  assertEquals(juice.freeze, 0)
  // and layGlyph alone never reveals
  reset()
  const third = makeField()
  const laid = layGlyph(third.field, 1, 1, oddRewardKey("X"))
  assert(laid && !laid.revealing)
  reset()
})

Deno.test("goal fx: the odd one found celebrates with its letter rising", () => {
  reset()
  const { field, items, effects } = makeField()
  const odd = Prop.fromSpawn(
    new PropSpawn(100, 0, catalog.props[unlikeType("tulip")], {
      id: "T",
      reward: [101, 0],
    }),
  )
  const me = new Actor(100, 1, catalog.actors["static"], "main")
  odd.onPushed({ type: "pushed", dir: "up", peakAt: 7, pusher: me }, field)
  assertEquals(juice.freeze, GOAL_HIT_STOP)
  assertEquals(effects.filter((e) => e instanceof GoalBurst).length, 1)
  assertEquals(items.map((t) => t.id), [oddRewardKey("T")])
  assert(items[0].revealing)
  // bumped again: no more
  odd.onPushed({ type: "pushed", dir: "up", peakAt: 7, pusher: me }, field)
  assertEquals(effects.filter((e) => e instanceof GoalBurst).length, 1)
  reset()
})

Deno.test("goal fx: palette colors and whole pixels only, every frame", () => {
  const rand = seeded(7)
  const field = { time: 1 } as IField
  const fxs = [
    new GoalBurst(3, 4, 0, undefined, rand),
    new GlyphReveal(3, 4, 0, undefined, rand),
  ]
  for (const fx of fxs) {
    let frames = 0
    while (!fx.finished && frames < 500) {
      for (const b of fx.boxes() as Iterable<IColorBox>) {
        assert(isPaletteColor(b.color), b.color)
        for (const v of [b.x, b.y, b.w, b.h]) {
          assert(Number.isInteger(v), `${fx.constructor.name} ${frames}`)
        }
        assert(b.w > 0 && b.h > 0)
      }
      fx.step(field)
      frames++
    }
    assert(fx.finished)
  }
})
