// Draws the treasure chest (`chest`, static/prop/chest.png): a chest with
// a domed lid, two iron straps over it and a lock plate with a keyhole on
// the seam. In the grays only, as the props are (docs/art-guide.md),
// lit from the top left: the lid lighter than the front.
//
// Usage: deno -A tools/draw_chest.ts
import { Palette, type PaletteColor } from "../util/palette.ts"
import { encodePng } from "./png.ts"

const N = 16

const COLORS: Record<string, PaletteColor> = {
  W: Palette.white,
  "1": Palette.gray1,
  "2": Palette.gray2,
  "3": Palette.gray3,
  "4": Palette.gray4,
  K: Palette.black,
}

/** The chest; `.` is see-through */
export const CHEST = [
  "................",
  "................",
  ".....KKKKKK.....",
  "...KK1WW122KK...",
  "..K14W1112243K..",
  ".K114112222433K.",
  ".KKKKKKKKKKKKKK.",
  ".K2242KW1K2433K.",
  ".K2242KK1K2433K.",
  ".K2242KKKK2433K.",
  ".K334333333444K.",
  ".K224222222433K.",
  ".K334333333444K.",
  "..KKKKKKKKKKKK..",
  "................",
  "................",
]

const hex = (c: PaletteColor) =>
  [1, 3, 5].map((s) => parseInt(c.slice(s, s + 2), 16))

if (import.meta.main) {
  const rgba = new Uint8Array(N * N * 4)
  CHEST.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const color = COLORS[c]
      if (color) rgba.set([...hex(color), 255], (y * N + x) * 4)
    })
  )
  const path = new URL("../static/prop/chest.png", import.meta.url).pathname
  await Deno.writeFile(path, await encodePng(N, N, rgba))
  console.log("prop/chest.png")
}
