// Draws the speech bubble's frame (static/ui/bubble_frame.png): a
// white box with a 1px black line and pixel-rounded corners, used as a
// border-image (static/index.html). Drawn by hand in palette colors -
// CSS border-radius would anti-alias the curve into in-between colors
// (docs/art-guide.md), stepped pixels keep it clean.
//
// Usage: deno -A tools/draw_bubble.ts
import { Palette } from "../util/palette.ts"
import { encodePng } from "./png.ts"

// 14x14, sliced 4px (corners 4x4, edges and the fill stretch).
// K the 2px line, w the paper (light gray), . clear (the world
// shows at the corners)
const FRAME = [
  "..KKKKKKKKKK..",
  ".KKKKKKKKKKKK.",
  "KKKwwwwwwwwKKK",
  "KKwwwwwwwwwwKK",
  "KKwwwwwwwwwwKK",
  "KKwwwwwwwwwwKK",
  "KKwwwwwwwwwwKK",
  "KKwwwwwwwwwwKK",
  "KKwwwwwwwwwwKK",
  "KKwwwwwwwwwwKK",
  "KKwwwwwwwwwwKK",
  "KKKwwwwwwwwKKK",
  ".KKKKKKKKKKKK.",
  "..KKKKKKKKKK..",
]

const INK: Record<string, string> = {
  K: Palette.black,
  w: Palette.gray1,
}
// The tail: a symmetric pixel triangle with 2px edges to match the
// frame, drawn down-pointing (the upward bubble); the downward bubble
// flips it with scaleY(-1), which moves pixels without blending any
const TAIL = [
  "KwwwwwwwwwK",
  "KKwwwwwwwKK",
  ".KKwwwwwKK.",
  "..KKwwwKK..",
  "...KKwKK...",
  "....KKK....",
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
  await draw(FRAME, 14, 14),
)
await Deno.writeFile(
  new URL("../static/ui/bubble_tail.png", import.meta.url),
  await draw(TAIL, 11, 6),
)
console.log("drew the bubble frame and tail")
