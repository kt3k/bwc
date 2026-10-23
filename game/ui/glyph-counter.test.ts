import "./dom-polyfill.ts"
import { mount, register } from "@kt3k/cell"
import { assertEquals } from "@std/assert"
import * as signal from "../../util/signals.ts"
import { GLYPH_FLY_MS, GLYPH_SHOW_MS, GlyphCounter } from "./glyph-counter.ts"

register(GlyphCounter, "js-glyph-counter")

Deno.test("GlyphCounter: hidden while no letter is held, then counts them", async () => {
  signal.glyphs.update([])
  const row = document.createElement("p")
  row.className = "js-glyph-counter hidden"
  row.innerHTML = '<img class="js-glyph-icon" src="./item/glyph-0.png" />' +
    '<span class="glyph-count-label">0</span>'
  document.body.appendChild(row)
  mount()
  assertEquals(row.classList.contains("hidden"), true)

  signal.glyphs.update([{ id: "ring.A.reward", glyph: 7 }])
  // not before the flying letter arrives
  assertEquals(row.classList.contains("hidden"), true)
  await new Promise((ok) => setTimeout(ok, GLYPH_SHOW_MS + GLYPH_FLY_MS + 50))
  assertEquals(row.classList.contains("hidden"), false)
  assertEquals(row.querySelector(".glyph-count-label")!.textContent, "1")
  assertEquals(
    row.querySelector(".js-glyph-icon")!.getAttribute("src"),
    "./item/glyph-7.png",
  )
  signal.glyphs.update([])
  await new Promise((ok) => setTimeout(ok, GLYPH_SHOW_MS + GLYPH_FLY_MS + 50))
  assertEquals(row.classList.contains("hidden"), true)
  row.remove()
})
