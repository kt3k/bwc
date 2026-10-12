// Draws the speech bubble's frame (static/ui/bubble_frame.png): a
// white box with a 1px black line and pixel-rounded corners, used as a
// border-image (static/index.html). Drawn by hand in palette colors -
// CSS border-radius would anti-alias the curve into in-between colors
// (docs/art-guide.md), stepped pixels keep it clean.
//
// Usage: deno -A tools/draw_bubble.ts
import { Palette } from "../util/palette.ts"
import { encodePng } from "./png.ts"

// 16x16, sliced 5px (corners 5x5, edges and the fill stretch).
// K the 2px line, w the paper (light gray), r the 1px ring of
// lighter gray just outside the line - the same idea as the ring
// around the item sprites (docs/art-guide.md) - and . clear
const FRAME = [
  "...rrrrrrrrrr...",
  "..rKKKKKKKKKKr..",
  ".rKKKKKKKKKKKKr.",
  "rKKKwwwwwwwwKKKr",
  "rKKwwwwwwwwwwKKr",
  "rKKwwwwwwwwwwKKr",
  "rKKwwwwwwwwwwKKr",
  "rKKwwwwwwwwwwKKr",
  "rKKwwwwwwwwwwKKr",
  "rKKwwwwwwwwwwKKr",
  "rKKwwwwwwwwwwKKr",
  "rKKwwwwwwwwwwKKr",
  "rKKKwwwwwwwwKKKr",
  ".rKKKKKKKKKKKKr.",
  "..rKKKKKKKKKKr..",
  "...rrrrrrrrrr...",
]

const INK: Record<string, string> = {
  K: Palette.black,
  w: Palette.gray1,
  r: Palette.gray2,
}
// The tail: a thin curved whisker in the Romancing SaGa 3 manner -
// it leaves the bubble, swings out to the side and hooks back to a
// tapering tip over the speaker, instead of a plain triangle. The
// same 2px line and 1px ring as the frame; the downward bubble flips
// it with scaleY(-1), which moves pixels without blending any. Its
// top three rows overlap the frame's line and ring, opening them
const TAIL = [
  "..KwwwwK........",
  "..KKwwwK........",
  "..rKKwwKr.......",
  "...rKwwwKr......",
  "....rKwwKr......",
  ".....rKwwKr.....",
  "......rKwKr.....",
  "......rKKKr.....",
  ".....rKKKr......",
  "....rKKr........",
  "...rKr..........",
  "...rr...........",
]

function draw(rows: string[], w: number, h: number) {
  const rgba = new Uint8Array(w * h * 4)
  rows.forEach((row, y) => {
    ;[...row].forEach((ch, x) => {
      const hex = INK[ch]
      if (!hex) return // transparent
      const p = (y * w + x) * 4
      rgba[p] = parseInt(hex.slice(1, 3), 16)
      rgba[p + 1] = parseInt(hex.slice(3, 5), 16)
      rgba[p + 2] = parseInt(hex.slice(5, 7), 16)
      rgba[p + 3] = 255
    })
  })
  return encodePng(w, h, rgba)
}

await Deno.mkdir(new URL("../static/ui/", import.meta.url), {
  recursive: true,
})
await Deno.writeFile(
  new URL("../static/ui/bubble_frame.png", import.meta.url),
  await draw(FRAME, 16, 16),
)
await Deno.writeFile(
  new URL("../static/ui/bubble_tail.png", import.meta.url),
  await draw(TAIL, 16, 12),
)
console.log("drew the bubble frame and tail")
