// Draws the water cell (static/cell/water.png) and its lily variant. Water
// is the one terrain cell drawn in color (docs/art-guide.md): a deep blue
// with lighter wave crests, darker troughs under them and a glint here
// and there, all palette blues. The lily pad on it is green (palette
// greens), with a white flower.
//
// Usage: deno -A tools/draw_water.ts
import { Palette, type PaletteColor } from "../util/palette.ts"
import { encodePng } from "./png.ts"

const MAP: Record<string, PaletteColor> = {
  ".": Palette.blue3, // the water
  "~": Palette.blue2, // a wave crest
  _: Palette.blue4, // the trough under a crest
  "*": Palette.blue1, // a glint
  L: Palette.green3, // the lily pad
  l: Palette.green2, // its light side
  K: Palette.green4, // its notch and rim
  w: Palette.white, // the flower
}

// the waves never cross the edges, so the cells tile without seams
const WATER = [
  "................",
  "................",
  "..~~......~~....",
  ".~..~____~..~...",
  "......____......",
  "................",
  "......~~........",
  ".....~..~__.....",
  "........___.....",
  ".~~.........*...",
  "~..~_.....~~....",
  "....__...~..~_..",
  ".............__.",
  ".......~~.......",
  "......~..~__....",
  "..*.......__....",
]
const LILY = [
  "................",
  "................",
  "..~~......~~....",
  ".~..~____~..~...",
  "......____......",
  "................",
  "......~~........",
  ".....~..~KKKK...",
  "........KllllK..",
  ".~~....KlLwLLLK.",
  "~..~_..KLLLLLLK.",
  "....__.KLLLKLLK.",
  "........KLLKLK..",
  ".......~~KKK....",
  "......~..~__....",
  "..*.......__....",
]

async function save(name: string, rows: string[]) {
  const rgba = new Uint8Array(16 * 16 * 4)
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const hex = MAP[ch]
      rgba.set(
        [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)),
        (y * 16 + x) * 4,
      )
      rgba[(y * 16 + x) * 4 + 3] = 255
    })
  )
  await Deno.writeFile(
    new URL(`../static/cell/${name}.png`, import.meta.url),
    await encodePng(16, 16, rgba),
  )
}
await save("water", WATER)
await save("water_lily", LILY)
console.log("drew the water")
