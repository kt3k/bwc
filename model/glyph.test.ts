// The unreadable letters (model/glyph.ts): each goal gives its own,
// once; the letters held are kept with their ids and signs
import { assert, assertEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { Actor } from "./actor.ts"
import { collectAll, Item } from "./item.ts"
import {
  GLYPH_COUNT,
  glyphOf,
  glyphOfType,
  glyphType,
  layGlyph,
  recordGlyph,
} from "./glyph.ts"
import { ringRewardKey, ringRewardType } from "./ring.ts"
import * as signal from "../util/signals.ts"
import type { IField, IItem } from "./types.ts"

const catalogJson = JSON.parse(
  await Deno.readTextFile(
    new URL("../static/catalog/base.json", import.meta.url),
  ),
)
const catalog = Catalog.fromJSON(
  [{ src: "base.json", json: catalogJson }],
  "http://localhost/catalog/",
)

/** A field that keeps the items laid, and the ids collected */
function makeField() {
  const items: Item[] = []
  const collected: string[] = []
  const field = {
    time: 0,
    canEnter: () => true,
    canEnterStatic: () => true,
    peekItems: (i: number, j: number) =>
      items.filter((t) => t.i === i && t.j === j) as IItem[],
    spawnItem: (type: string, i: number, j: number, id?: string) => {
      const item = new Item(id ?? null, i, j, catalog.items[type])
      items.push(item)
      return item
    },
    collectItem: (_i: number, _j: number, id: string) => {
      collected.push(id)
      Item.collect(id)
      const k = items.findIndex((t) => t.id === id)
      if (k >= 0) items.splice(k, 1)
    },
    effects: { add: () => {} },
  } as unknown as IField
  return { field, items, collected }
}

const reset = () => {
  Item.deserializeCollected([])
  signal.glyphs.update([])
}

Deno.test("glyph: every sign is an item of the catalog, picked up as a letter", async () => {
  for (let n = 0; n < GLYPH_COUNT; n++) {
    const def = catalog.items[glyphType(n)]
    assert(def, glyphType(n))
    assertEquals(def.collect, "glyph")
    assertEquals(glyphOfType(def.type), n)
    await Deno.stat(
      new URL(`../static/item/${glyphType(n)}.png`, import.meta.url),
    )
  }
  assertEquals(catalog.items[glyphType(GLYPH_COUNT)], undefined)
  assertEquals(glyphOfType("apple"), null)
})

Deno.test("glyph: the sign is drawn from the id, the same every time", () => {
  for (const id of ["a", "ring.798.791.reward", ""]) {
    const n = glyphOf(id)
    assert(Number.isInteger(n) && n >= 0 && n < GLYPH_COUNT)
    assertEquals(glyphOf(id), n)
  }
  // rings spread over the signs (a grid of 48 ring ids, 60 cells apart)
  const signs = new Set<number>()
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 6; y++) {
      signs.add(glyphOf(ringRewardKey(`${x * 60 + 31}.${y * 60 + 17}`)))
    }
  }
  assert(signs.size >= 20, `${signs.size} signs`)
})

Deno.test("glyph: the rings of the maps spread over the signs", async () => {
  const signs = new Set<number>()
  for await (
    const entry of Deno.readDir(new URL("../static/map/", import.meta.url))
  ) {
    if (!entry.name.endsWith(".json")) continue
    const block = JSON.parse(
      await Deno.readTextFile(
        new URL(`../static/map/${entry.name}`, import.meta.url),
      ),
    )
    for (const prop of block.props ?? []) {
      if (prop.type === "ring-slot") {
        const type = ringRewardType(prop.data.id)
        assert(catalog.items[type], type)
        signs.add(glyphOfType(type)!)
      }
    }
  }
  // all of them today; a little slack for when the WILDS are made again
  assert(signs.size >= GLYPH_COUNT - 4, `${signs.size} signs`)
})

Deno.test("glyph: a letter is given once per id, and not after it's taken", () => {
  reset()
  const { field, items } = makeField()
  const a = layGlyph(field, 3, 4, "ring.A.reward")
  assert(a)
  assertEquals(a.def.type, glyphType(glyphOf("ring.A.reward")))
  // already lying there
  assertEquals(layGlyph(field, 3, 4, "ring.A.reward"), null)
  assertEquals(items.length, 1)
  // taken: it doesn't come back
  recordGlyph("ring.A.reward", glyphOf("ring.A.reward"))
  items.length = 0
  assertEquals(layGlyph(field, 3, 4, "ring.A.reward"), null)
  // after a reload too (only the collected ids restored)
  const saved = Item.serializeCollected()
  signal.glyphs.update([])
  Item.deserializeCollected(saved)
  assertEquals(layGlyph(field, 3, 4, "ring.A.reward"), null)
  assertEquals(items.length, 0)
})

Deno.test("glyph: picking letters up records each by its id and sign", () => {
  reset()
  const { field, items, collected } = makeField()
  const me = new Actor(5, 5, catalog.actors["static"], "main")
  // two rings' letters on the same cell: each is kept on its own
  layGlyph(field, 5, 5, ringRewardKey("A"))
  layGlyph(field, 5, 5, ringRewardKey("B"))
  collectAll(me, field, [...items])
  assertEquals(items, [])
  assertEquals(collected.sort(), [ringRewardKey("A"), ringRewardKey("B")])
  assertEquals(signal.glyphs.get(), [
    { id: ringRewardKey("A"), glyph: glyphOf(ringRewardKey("A")) },
    { id: ringRewardKey("B"), glyph: glyphOf(ringRewardKey("B")) },
  ])
  assert(Item.isCollected(ringRewardKey("A")))
  // the same letter recorded again counts once
  recordGlyph(ringRewardKey("A"), glyphOf(ringRewardKey("A")))
  assertEquals(signal.glyphs.get().length, 2)
  // distinct rings, distinct letters
  assert(ringRewardKey("A") !== ringRewardKey("B"))
  reset()
})
