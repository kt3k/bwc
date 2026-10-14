// Draws the small things found inside houses (docs/art-guide.md):
// items keep their colors, with the black outline and the gray2 outer
// pixels put on by tools/item_ring.ts afterwards.
//
// - book: a closed blue book, its pages showing at the bottom edge
// - candle: a lit candle on its dish, the flame in the gold ramp
//
// Usage: deno -A tools/draw_interior_items.ts   (then item-ring both)
import { Palette, type PaletteColor } from "../util/palette.ts"
import { encodePng } from "./png.ts"

const N = 16
const INK: Record<string, PaletteColor | null> = {
  ".": null,
  K: Palette.black,
  W: Palette.white,
  g: Palette.gray2,
  G: Palette.gray3,
  B: Palette.blue3,
  b: Palette.blue2,
  p: Palette.pink2,
  "1": Palette.brown1,
  "2": Palette.brown2,
}

const BOOK = [
  "................",
  "................",
  "................",
  "...KKKKKKKKK....",
  "..KbbbbbbbbbK...",
  "..KbBBBBBBBpK...",
  "..KbBBBBBBBpK...",
  "..KbBBBBBBBBK...",
  "..KbBBBBBBBBK...",
  "..KbBBBBBBBBK...",
  "..KWWWWWWWWWK...",
  "..KgWWWWWWWWK...",
  "...KKKKKKKKK....",
  "................",
  "................",
  "................",
]

const CANDLE = [
  "................",
  "................",
  ".......K........",
  "......K2K.......",
  ".....K211K......",
  ".....K2112K.....",
  "......K21K......",
  ".......KK.......",
  "......KWgK......",
  "......KWgK......",
  "......KWgK......",
  "......KWgK......",
  ".....KKWgKK.....",
  "....KGGGGGGK....",
  ".....KKKKKK.....",
  "................",
]

async function write(path: string, rows: string[]) {
  const rgba = new Uint8Array(N * N * 4)
  rows.forEach((row, y) => {
    ;[...row].forEach((ch, x) => {
      const c = INK[ch]
      if (c === undefined) throw new Error(`unknown ink ${ch}`)
      if (c === null) return
      rgba.set(
        [...[1, 3, 5].map((s) => parseInt(c.slice(s, s + 2), 16)), 255],
        (y * N + x) * 4,
      )
    })
  })
  await Deno.writeFile(path, await encodePng(N, N, rgba))
  console.log(path)
}

if (import.meta.main) {
  const out = new URL("../static/item/", import.meta.url).pathname
  await write(`${out}book.png`, BOOK)
  await write(`${out}candle.png`, CANDLE)
}
