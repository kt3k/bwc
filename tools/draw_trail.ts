// Draws the cell of the trails off the roads (tools/generate_wilds.ts,
// docs/playtest-2026-10-25.md): the meadow's own ground with a flat
// stepping stone sunk in it, trodden, and a variant with two small ones.
// In the palette's grays (docs/art-guide.md); the stones are lit from the
// top left as the other stones are.
//
// Usage: deno -A tools/draw_trail.ts
import { Palette, type PaletteColor } from "../util/palette.ts"
import { decodePng, encodePng } from "./png.ts"

const root = new URL("../static/cell/", import.meta.url).pathname
const N = 16

const hex = (c: PaletteColor) =>
  [1, 3, 5].map((s) => parseInt(c.slice(s, s + 2), 16))

/** A flat stone (an ellipse) at (cx, cy), rx by ry, on the pixels */
function stone(
  rgba: Uint8Array,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
) {
  const inside = (x: number, y: number) =>
    ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!inside(x, y)) continue
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
      let c: PaletteColor = Palette.gray1
      if (dx + dy < -0.6) c = Palette.white
      // its edge: dark below and right (sunk in the ground), lit above
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) =>
        !inside(x + ox, y + oy)
      )
      if (edge) c = dx + dy > 0 ? Palette.gray4 : Palette.gray3
      rgba.set([...hex(c), 255], (y * N + x) * 4)
    }
  }
}

if (import.meta.main) {
  const meadow = await decodePng(await Deno.readFile(root + "floor5.png"))
  const one = new Uint8Array(meadow.rgba)
  stone(one, 8, 8.5, 5.2, 3.6)
  await Deno.writeFile(root + "trail.png", await encodePng(N, N, one))
  const two = new Uint8Array(meadow.rgba)
  stone(two, 5, 5, 3.4, 2.6)
  stone(two, 11, 11.5, 3.4, 2.6)
  await Deno.writeFile(root + "trail_pair.png", await encodePng(N, N, two))
  console.log("cell/trail.png cell/trail_pair.png")
}
