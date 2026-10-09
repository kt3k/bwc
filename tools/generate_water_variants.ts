// Draws the rare variant sprites of the water cell (static/cell/
// water_*.png): things the sea shows once in a while - a rock awash, a
// fish under the surface, sun glitter, seaweed tips. Each keeps the
// base wave texture of water.png and overlays one sight, in palette
// colors only (deno task check-palette holds it to that).
//
// Usage: deno -A tools/generate_water_variants.ts
import { encodePng } from "./png.ts"
import { Palette } from "../util/palette.ts"

/** The letters of the art below */
const INK: Record<string, string> = {
  a: Palette.blue3, // the water
  b: Palette.blue2, // a wave stroke
  c: Palette.blue4, // a wave trough / a shadow in the water
  d: Palette.blue1, // foam and glints
  w: Palette.white,
  e: Palette.green4, // dark leaf (as the lily pad)
  f: Palette.green3, // leaf
  g: Palette.green2, // light leaf
  G: Palette.gray3, // wet rock
  H: Palette.gray2, // the rock's dry top
  K: Palette.gray4, // the rock's shaded side
}

// The base wave texture (water.png), overlaid below
const BASE = [
  "aaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aabbaaaaaabbaaaa",
  "abaabccccbaabaaa",
  "aaaaaaccccaaaaaa",
  "aaaaaaaaaaaaaaaa",
  "aaaaaabbaaaaaaaa",
  "aaaaabaabccaaaaa",
  "aaaaaaaacccaaaaa",
  "abbaaaaaaaaadaaa",
  "baabcaaaaabbaaaa",
  "aaaaccaaabaabcaa",
  "aaaaaaaaaaaaacca",
  "aaaaaaabbaaaaaaa",
  "aaaaaabaabccaaaa",
  "aadaaaaaaaccaaaa",
]

/** Overlays rows onto the base; spaces keep the base pixel */
const over = (rows: string[]) =>
  BASE.map((base, y) =>
    [...base].map((ch, x) => {
      const o = rows[y]?.[x]
      return o && o !== " " ? o : ch
    }).join("")
  )

const SPRITES: Record<string, string[]> = {
  // a rock awash: a gray top above the surface, foam licking its foot
  "water_rock.png": over([
    "",
    "",
    "",
    "",
    "",
    "      dd        ",
    "     dGHd       ",
    "    dGHHHd      ",
    "   dGHHHHGd     ",
    "   dGHHHGKd     ",
    "   dGHGKKd      ",
    "    dKKKd       ",
    "     ddd        ",
    "",
    "",
    "",
  ]),
  // a fish just under the surface: the water calms around its dark
  // back, the fin tip and a ripple break the surface
  "water_fish.png": over([
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "      b a b     ",
    "aaaaaaaadaaaaaaa",
    "aaacaacccccaaaaa",
    "aaaccccccccccaaa",
    "aaacaacccccaaaaa",
    "aaaaaaaaaaaaaaaa",
    "",
  ]),
  // sun glitter: little crosses of light where the waves catch it
  "water_sparkle.png": over([
    "",
    "   d            ",
    "  dwd       d   ",
    "   d       dwd  ",
    "            d   ",
    "",
    "",
    "  d             ",
    " dwd            ",
    "  d        d    ",
    "          dwd   ",
    "           d    ",
    "",
    "     d          ",
    "    dwd         ",
    "     d          ",
  ]),
  // seaweed: tips of a kelp bed waving through the surface
  "water_weed.png": over([
    "",
    "",
    "",
    "          g     ",
    "     g    f     ",
    "     f   ef     ",
    "    ef   ef     ",
    "    ef    f     ",
    "     f    fe    ",
    "     fe   fe    ",
    "      f  g      ",
    "   g  f  f      ",
    "   f ef ef      ",
    "   fe f ef      ",
    "   fe f f       ",
    "    f e f       ",
  ]),
}

for (const [name, rows] of Object.entries(SPRITES)) {
  const rgba = new Uint8Array(16 * 16 * 4)
  rows.forEach((row, y) => {
    ;[...row].forEach((ch, x) => {
      const hex = INK[ch]
      if (!hex) throw new Error(`${name}: unknown ink '${ch}'`)
      const p = (y * 16 + x) * 4
      rgba[p] = parseInt(hex.slice(1, 3), 16)
      rgba[p + 1] = parseInt(hex.slice(3, 5), 16)
      rgba[p + 2] = parseInt(hex.slice(5, 7), 16)
      rgba[p + 3] = 255
    })
  })
  const png = await encodePng(16, 16, rgba)
  const url = new URL(`../static/cell/${name}`, import.meta.url)
  await Deno.writeFile(url, png)
  console.log(`wrote ${name}`)
}
