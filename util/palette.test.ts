import { assert, assertEquals, assertFalse } from "@std/assert"
import { isPaletteColor, PALETTE, Palette } from "./palette.ts"

Deno.test("the palette has the 54 unique colors of vscode-pixeledit", () => {
  assertEquals(PALETTE.length, 54)
  assertEquals(new Set(PALETTE).size, 54)
  for (const c of PALETTE) assert(/^#[0-9a-f]{6}$/.test(c), c)
})

Deno.test("isPaletteColor", () => {
  assert(isPaletteColor(Palette.gray2))
  assert(isPaletteColor("#B9BCB9"))
  assertFalse(isPaletteColor("#bcbcbc"))
  assertFalse(isPaletteColor("white"))
})
