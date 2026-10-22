// Draws the bush of the WILDS (a low round shrub on the forest floor)
// and the bush pushed flat (its stalks lying on the floor, a way
// through). See docs/playtest-2026-10-21.md, plan 2: a bush in the way
// is not a detour, push it over.
//
// Usage: deno -A tools/draw_bush.ts
import type { PaletteColor } from "../util/palette.ts"
import { picture, write } from "./draw_waystones.ts"
import { decodePng } from "./png.ts"

const root = new URL("../static/", import.meta.url).pathname
type Px = PaletteColor | null

const BUSH = [
  "................",
  "................",
  "................",
  ".....KKKKKK.....",
  "...KK2K2KKKKK...",
  "..K2KKK2K2KK2K..",
  ".KK2K2KKKK2KKKK.",
  ".K2KKK2K2KKK2KK.",
  "KK2K2KKK2K2KKK2K",
  "K2KKKK2KKKK2K2KK",
  "KKK2K2KK2K2KKKKK",
  ".KKKKKKKKKKKKKK.",
  "..444444444444..",
  "................",
  "................",
  "................",
]
const FLAT = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "....2.......2...",
  ".....2....2.....",
  "..K...22...2..K.",
  "..2.....2...22..",
  "...22....2......",
  ".....2...K...2..",
  "..K.......22....",
  "................",
  "................",
  "................",
]

const { rgba } = await decodePng(await Deno.readFile(`${root}cell/forest.png`))
const hex = (n: number) => n.toString(16).padStart(2, "0")
const floor: Px[] = [...Array(256).keys()].map((k) =>
  `#${hex(rgba[k * 4])}${hex(rgba[k * 4 + 1])}${
    hex(rgba[k * 4 + 2])
  }` as PaletteColor
)
const over = (rows: string[]) => {
  const px = picture(rows)
  return floor.map((c, k) => px[k] ?? c)
}
await write("cell/bush.png", over(BUSH))
await write("cell/bush_flat.png", over(FLAT))
