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
// The tail, traced from a Romancing SaGa 3 dialogue shot: the
// window's edge swells into a fin. On the speaker's side a straight,
// near-vertical line with a small outward flare where it joins the
// edge; at the far end an ogee - steep by the crest, easing shallow
// into the edge; and between them a short slanted cap meeting the
// straight side in a sharp corner (no rounding at the tip). Drawn
// down-pointing with the straight side left; the downward bubble
// turns the same sprite 180 degrees with scale(-1,-1), so top/bottom
// AND left/right swap together, as in the original. Its top three
// rows overlap the frame's line and ring, opening them
const TAIL = [
  ".KKwwwwwwwwwwwwwwKK...",
  "..KKwwwwwwwwwwwwKK....",
  "..rKKwwwwwwwwwwKKr....",
  "...rKKwwwwwwwwKKr.....",
  "....rKKwwwwwwKKr......",
  "....rKKwwwwwKKr.......",
  "....rKKwwwwwKKr.......",
  "....rKKwwwwKKr........",
  "....rKKwwwwKKr........",
  "....rKKwwwKKr.........",
  "....rKKwwKKr..........",
  "....rKKwKKr...........",
  "....rKKKKr............",
  "...rKKKKKr............",
  "...rrrrrrr............",
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
  await draw(TAIL, 22, 15),
)
console.log("drew the bubble frame and tail")
