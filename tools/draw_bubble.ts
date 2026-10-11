// Draws the speech bubble's frame (static/ui/bubble_frame.png): a
// white box with a 1px black line and pixel-rounded corners, used as a
// border-image (static/index.html). Drawn by hand in palette colors -
// CSS border-radius would anti-alias the curve into in-between colors
// (docs/art-guide.md), stepped pixels keep it clean.
//
// Usage: deno -A tools/draw_bubble.ts
import { Palette } from "../util/palette.ts"
import { encodePng } from "./png.ts"

// 12x12, sliced 4px (corners 4x4, edges and the fill stretch).
// K the line, w the paper, . clear (the world shows at the corners)
const FRAME = [
  "..KKKKKKKK..",
  ".KwwwwwwwwK.",
  "KwwwwwwwwwwK",
  "KwwwwwwwwwwK",
  "KwwwwwwwwwwK",
  "KwwwwwwwwwwK",
  "KwwwwwwwwwwK",
  "KwwwwwwwwwwK",
  "KwwwwwwwwwwK",
  "KwwwwwwwwwwK",
  ".KwwwwwwwwK.",
  "..KKKKKKKK..",
]

const INK: Record<string, string> = {
  K: Palette.black,
  w: Palette.white,
}
const rgba = new Uint8Array(12 * 12 * 4)
FRAME.forEach((row, y) => {
  ;[...row].forEach((ch, x) => {
    const hex = INK[ch]
    if (!hex) return // transparent
    const p = (y * 12 + x) * 4
    rgba[p] = parseInt(hex.slice(1, 3), 16)
    rgba[p + 1] = parseInt(hex.slice(3, 5), 16)
    rgba[p + 2] = parseInt(hex.slice(5, 7), 16)
    rgba[p + 3] = 255
  })
})
await Deno.mkdir(new URL("../static/ui/", import.meta.url), {
  recursive: true,
})
await Deno.writeFile(
  new URL("../static/ui/bubble_frame.png", import.meta.url),
  await encodePng(12, 12, rgba),
)
console.log("drew the bubble frame")
