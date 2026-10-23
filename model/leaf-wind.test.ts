import { assert, assertAlmostEquals, assertEquals } from "@std/assert"
import * as signal from "../util/signals.ts"
import { isPaletteColor, Palette } from "../util/palette.ts"
import {
  ARRIVE_RADIUS,
  arrived,
  BURST_FRAMES,
  driftDir,
  EffectLeaf,
  FAR,
  GUST_EVERY_FAR,
  GUST_EVERY_NEAR,
  GUST_LEAVES,
  GUST_WALK,
  gustEvery,
  leafGust,
  LeafWind,
  NEAR,
} from "./leaf-wind.ts"
import type { IField } from "./types.ts"

/** A field with only what the wind looks at */
function fakeField(i: number, j: number) {
  const effects: EffectLeaf[] = []
  const field = {
    time: 0,
    me: { i, j },
    effects: { add: (e: EffectLeaf) => effects.push(e) },
  }
  return { field, asField: field as unknown as IField, effects }
}

/** A repeatable 0..1 random source */
function rand() {
  let s = 1
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

Deno.test("the leaves drift toward the place", () => {
  assertEquals(driftDir(0, 0, 10, 0), [1, 0])
  assertEquals(driftDir(0, 0, 0, -5), [0, -1])
  const [dx, dy] = driftDir(0, 0, 3, 4)
  assertAlmostEquals(dx, 0.6)
  assertAlmostEquals(dy, 0.8)
  assertEquals(driftDir(2, 2, 2, 2), [0, 0])
  // each leaf of a gust moves that way, in leaf colors
  for (const leaf of leafGust(0, 0, 1, 0, 8, rand(), 0)) {
    assert(isPaletteColor(leaf.color))
    const x = leaf.x
    for (let n = 0; n < 20; n++) leaf.step(null as unknown as IField)
    assert(leaf.x > x + 20)
  }
})

Deno.test("the nearer the place, the more often the gusts", () => {
  assertEquals(gustEvery(0), GUST_EVERY_NEAR)
  assertEquals(gustEvery(NEAR), GUST_EVERY_NEAR)
  assertEquals(gustEvery(FAR), GUST_EVERY_FAR)
  assertEquals(gustEvery(FAR * 3), GUST_EVERY_FAR)
  assert(gustEvery(300) < gustEvery(600))
  assert(gustEvery(600) < gustEvery(900))
})

Deno.test("a leaf drifts a while, then is gone at once", () => {
  const leaf = new EffectLeaf(0, 0, 1, 0, Palette.lime2, 10, 2)
  assertEquals(leaf.visible, false)
  leaf.step(null as unknown as IField)
  leaf.step(null as unknown as IField)
  assertEquals(leaf.visible, true)
  for (let n = 0; n < 9; n++) leaf.step(null as unknown as IField)
  assertEquals(leaf.finished, false)
  leaf.step(null as unknown as IField)
  assertEquals(leaf.finished, true)
  assertEquals(leaf.w + leaf.h, 3)
})

Deno.test("the place heard of is remembered, and leaves drift there", () => {
  const wind = new LeafWind(rand())
  const { field, asField, effects } = fakeField(0, 0)
  wind.hear({ topic: "THE CAPE", i: 300, j: 0 }, asField)
  assertEquals(signal.rumorPlace.get(), { topic: "THE CAPE", i: 300, j: 0 })
  // a drift of leaves right after the rumor
  for (; field.time < BURST_FRAMES; field.time++) wind.step(asField)
  assert(effects.length > 10)
  // all of them eastward
  for (const leaf of effects) assert(leaf.vx > 0 && leaf.vy === 0)
  signal.rumorPlace.update(null)
})

Deno.test("while walking, a gust now and then; standing, none", () => {
  const wind = new LeafWind(rand())
  const { field, asField, effects } = fakeField(0, 0)
  wind.hear({ topic: "THE CAPE", i: 300, j: 0 }, asField)
  for (; field.time < BURST_FRAMES; field.time++) wind.step(asField)
  const after = effects.length
  // standing still long after: no gust
  for (; field.time < BURST_FRAMES + gustEvery(300) * 2; field.time++) {
    wind.step(asField)
  }
  assertEquals(effects.length, after)
  // walking on: a gust
  field.me.i += GUST_WALK
  wind.step(asField)
  assertEquals(effects.length, after + GUST_LEAVES)
  // and not another right away
  field.me.i += GUST_WALK
  field.time++
  wind.step(asField)
  assertEquals(effects.length, after + GUST_LEAVES)
  signal.rumorPlace.update(null)
})

Deno.test("there at last: the place is forgotten and the leaves stop", () => {
  const wind = new LeafWind(rand())
  const { field, asField, effects } = fakeField(0, 0)
  wind.hear({ topic: "THE CAPE", i: 100, j: 0 }, asField)
  assert(!arrived(0, 0, { i: 100, j: 0 }))
  field.me.i = 100 - ARRIVE_RADIUS
  assert(arrived(field.me.i, 0, { i: 100, j: 0 }))
  wind.step(asField)
  assertEquals(signal.rumorPlace.get(), null)
  const count = effects.length
  for (; field.time < BURST_FRAMES * 20; field.time++) {
    field.me.j = field.time % 50
    wind.step(asField)
  }
  assertEquals(effects.length, count)
})
