// The save keeps the unreadable letters held (model/glyph.ts): their
// ids and signs, not only how many
import { assertEquals } from "@std/assert"
import { clearSave, restoreSave } from "./save.ts"
import * as signal from "./signals.ts"
import { Item } from "../model/item.ts"

const KEY = "bwc-save-v1"

Deno.test("save: the letters held are written and restored", () => {
  clearSave()
  const glyphs = [
    { id: "ring.798.791.reward", glyph: 5 },
    { id: "ring.665.1509.reward", glyph: 17 },
  ]
  localStorage.setItem(
    KEY,
    JSON.stringify({ glyphs, collectedItemIds: glyphs.map((g) => g.id) }),
  )
  restoreSave()
  assertEquals(signal.glyphs.get(), glyphs)
  assertEquals(Item.isCollected("ring.798.791.reward"), true)

  // a new one taken is written
  const more = [...glyphs, { id: "ring.1.2.reward", glyph: 0 }]
  Item.collect("ring.1.2.reward")
  signal.glyphs.update(more)
  const saved = JSON.parse(localStorage.getItem(KEY)!)
  assertEquals(saved.glyphs, more)
  assertEquals(saved.collectedItemIds.includes("ring.1.2.reward"), true)

  clearSave()
  signal.glyphs.update([])
  Item.deserializeCollected([])
})
