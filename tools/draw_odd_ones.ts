// Draws the sprites of the odd one out (model/odd-one.ts,
// tools/odd_ones.ts): for each family the thing as the many are
// (`alike_<family>.png`) and as the odd one is (`unlike_<family>.png`);
// the cracked standing stone also has its split, as found
// (`unlike_menhir_found.png`; the others, found, look as the many do).
// The odd one differs by one plain thing, readable at 16x16 by a careful
// look: mirrored, upside down, cracked, leaning, a stone more, an arrow
// turned. All in the grays (docs/art-guide.md).
//
// Usage: deno -A tools/draw_odd_ones.ts
import { Palette, type PaletteColor } from "../util/palette.ts"
import { picture, write } from "./draw_waystones.ts"

type Px = (PaletteColor | null)[]
const N = 16

/** Mirrored left to right */
export const mirror = (px: Px): Px =>
  px.map((_, k) => px[(k / N | 0) * N + (N - 1 - k % N)])

/** Upside down, the bottom row kept empty (the picture's rows 0..14) */
export const upsideDown = (px: Px): Px =>
  px.map((_, k) => {
    const y = k / N | 0, x = k % N
    return y === N - 1 ? null : px[(N - 2 - y) * N + x]
  })

// a tulip on a stem, its head leaning to the right, a leaf on the left
const TULIP = [
  "................",
  "................",
  "........K.K.K...",
  ".......KWKWK2K..",
  ".......KW1112K..",
  ".......KW1123K..",
  "........K123K...",
  ".........KKK....",
  "........K4K.....",
  "..KKK..K4K......",
  ".K224K.K4K......",
  ".K2234KK4K......",
  "..K2334K4K......",
  "...KK33K4K......",
  ".....KKKKK......",
  "................",
]

// a toadstool: a spotted cap on a short stem
const TOADSTOOL = [
  "................",
  "................",
  "................",
  "......KKKK......",
  "....KKW222KK....",
  "...KWW2222W3K...",
  "..KW22W22WW23K..",
  "..K2222222223K..",
  "..KKKKKKKKKKKK..",
  ".....K1123K.....",
  ".....K1123K.....",
  ".....K1223K.....",
  ".....K1223K.....",
  "....KK2233KK....",
  "....KKKKKKKK....",
  "................",
]

// a stone bird on a plinth, looking left (its beak, its eye), its tail
// up behind
const STONEBIRD = [
  "................",
  "................",
  "................",
  "................",
  "....KKKK........",
  "...KW222K.......",
  ".KKW2K22K.......",
  "K44K2222K...KK..",
  ".KKK22222KKK23K.",
  "...K122222222K..",
  "...K12222223K...",
  "...K22222333K...",
  "....K233333K....",
  ".....KK44KK.....",
  "....KKKKKKKK....",
  "................",
]

// a standing stone, tall and narrow
const MENHIR = [
  "................",
  "......KKKK......",
  ".....KW222K.....",
  ".....KW2223K....",
  "....KW22223K....",
  "....KW22223K....",
  "....K122223K....",
  "....K122233K....",
  "....K122233K....",
  "....K122233K....",
  "....K122233K....",
  "....K222333K....",
  "...KK223334KK...",
  "...K44444444K...",
  "....KKKKKKKK....",
  "................",
]

// the same, a crack running down from its top
const MENHIR_CRACKED = [
  "................",
  "......KKKK......",
  ".....KW2K2K.....",
  ".....KW2K23K....",
  "....KW22K23K....",
  "....KW2K223K....",
  "....K12K223K....",
  "....K122K33K....",
  "....K122K33K....",
  "....K12K233K....",
  "....K122233K....",
  "....K222333K....",
  "...KK223334KK...",
  "...K44444444K...",
  "....KKKKKKKK....",
  "................",
]

// split open along the crack: a dark cleft with something white deep in it
const MENHIR_SPLIT = [
  "................",
  "......K..K......",
  ".....KWK.K2K....",
  ".....KWK.K23K...",
  "....KW2K.K23K...",
  "....KW2K.K23K...",
  "....K12KWK23K...",
  "....K12K.K33K...",
  "....K12K.K33K...",
  "....K12KKK33K...",
  "....K122233K....",
  "....K222333K....",
  "...KK223334KK...",
  "...K44444444K...",
  "....KKKKKKKK....",
  "................",
]

// a post with a flat cap, upright
const POST = [
  "................",
  "................",
  "......KKKK......",
  ".....KWW22K.....",
  ".....KKKKKK.....",
  "......K123K.....",
  "......K123K.....",
  "......K124K.....",
  "......K123K.....",
  "......K123K.....",
  "......K124K.....",
  "......K123K.....",
  ".....KK233KK....",
  ".....K444444K...",
  "......KKKKKK....",
  "................",
]

/** The post leaning to the right: its upper rows shifted, more higher up */
const leaning = (px: Px): Px =>
  px.map((_, k) => {
    const y = k / N | 0, x = k % N
    const shift = y >= 11 ? 0 : Math.ceil((11 - y) / 3)
    return x - shift >= 0 ? px[y * N + x - shift] : null
  })

// a cairn of three stones, the smaller on the bigger
const CAIRN = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......KKKK......",
  ".....KW223K.....",
  ".....K2233K.....",
  "....KKKKKKKK....",
  "....KW22223K....",
  "....K222333K....",
  "...KKKKKKKKKK...",
  "..KW222222223K..",
  "..K2222233333K..",
  "...KKKKKKKKKK...",
  "................",
]

// the same with a fourth, a pebble on the top
const CAIRN_FOUR = [
  "................",
  "................",
  ".......KK.......",
  "......KW3K......",
  "......KKKK......",
  ".....KKKKKK.....",
  ".....KW223K.....",
  ".....K2233K.....",
  "....KKKKKKKK....",
  "....KW22223K....",
  "....K222333K....",
  "...KKKKKKKKKK...",
  "..KW222222223K..",
  "..K2222233333K..",
  "...KKKKKKKKKK...",
  "................",
]

// a low flat stone with an arrow carved in it, pointing up (north)
const SLAB = [
  "................",
  "................",
  "................",
  "....KKKKKKKK....",
  "...KWW222222K...",
  "..KW222222223K..",
  "..K2222222223K..",
  "..K2222222223K..",
  "..K2222222223K..",
  "..K2222222223K..",
  "..K2222222233K..",
  "..K2222222333K..",
  "...K33333333K...",
  "...K44444444K...",
  "....KKKKKKKK....",
  "................",
]
// the arrow (its cells about the stone's middle at (7.5, 7.5)), up
const ARROW: [number, number][] = [
  [0, -3],
  [-1, -2],
  [0, -2],
  [1, -2],
  [-2, -1],
  [0, -1],
  [2, -1],
  [0, 0],
  [0, 1],
  [0, 2],
]

/** The slab with its arrow, turned a quarter `turns` times clockwise */
function slab(turns: number): Px {
  const px = picture(SLAB)
  for (const [ax, ay] of ARROW) {
    let [dx, dy] = [ax, ay]
    for (let t = 0; t < turns; t++) [dx, dy] = [-dy, dx]
    const x = 7 + dx, y = 8 + dy
    px[y * N + x] = Palette.gray4
  }
  return px
}

/** Every family's pictures: alike, unlike and (if not alike) found */
export function pictures(): Record<
  string,
  { alike: Px; unlike: Px; found?: Px }
> {
  const tulip = picture(TULIP)
  const toadstool = picture(TOADSTOOL)
  const bird = picture(STONEBIRD)
  const post = picture(POST)
  return {
    tulip: { alike: tulip, unlike: mirror(tulip) },
    toadstool: { alike: toadstool, unlike: upsideDown(toadstool) },
    stonebird: { alike: bird, unlike: mirror(bird) },
    menhir: {
      alike: picture(MENHIR),
      unlike: picture(MENHIR_CRACKED),
      found: picture(MENHIR_SPLIT),
    },
    post: { alike: post, unlike: leaning(post) },
    cairn: { alike: picture(CAIRN), unlike: picture(CAIRN_FOUR) },
    arrowstone: { alike: slab(0), unlike: slab(1) },
  }
}

if (import.meta.main) {
  for (const [family, p] of Object.entries(pictures())) {
    await write(`prop/alike_${family}.png`, p.alike)
    await write(`prop/unlike_${family}.png`, p.unlike)
    if (p.found) await write(`prop/unlike_${family}_found.png`, p.found)
  }
}
