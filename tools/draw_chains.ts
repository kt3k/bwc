// Draws the sprites of the chain of trades (model/chain.ts,
// tools/chains.ts): the things wanted and given (a jar, a sack, a wheel,
// a cask: actors, the same in every direction), the traveller who wants
// one, sitting still in a hooded cloak, facing four ways, with a thought
// bubble over their head holding a small picture of what they want (the
// bubble is part of their picture, 16x29, standing on their cell and
// rising over the one above, as the moai does), and without the bubble
// once content; and the mat in front of them. All in the grays
// (docs/art-guide.md), as the other goals are.
//
// Usage: deno -A tools/draw_chains.ts
import { Palette, type PaletteColor } from "../util/palette.ts"
import { encodePng } from "./png.ts"

const root = new URL("../static/", import.meta.url).pathname

const INK: Record<string, PaletteColor | null> = {
  ".": null,
  K: Palette.black,
  "4": Palette.gray4,
  "3": Palette.gray3,
  "2": Palette.gray2,
  "1": Palette.gray1,
  W: Palette.white,
}

/** A picture from rows of ink characters, all as wide as the first */
function picture(rows: string[]): (PaletteColor | null)[] {
  const w = rows[0].length
  return rows.flatMap((row, y) => {
    if (row.length !== w) throw new Error(`row ${y} is ${row.length} wide`)
    return [...row].map((c) => {
      if (!(c in INK)) throw new Error(`unknown ink ${c}`)
      return INK[c]
    })
  })
}

async function write(path: string, rows: string[]) {
  const w = rows[0].length, h = rows.length
  const rgba = new Uint8Array(w * h * 4)
  picture(rows).forEach((c, k) => {
    if (!c) return
    rgba.set(
      [...[1, 3, 5].map((s) => parseInt(c.slice(s, s + 2), 16)), 255],
      k * 4,
    )
  })
  await Deno.writeFile(root + path, await encodePng(w, h, rgba))
  console.log(path)
}

const mirror = (rows: string[]) => rows.map((r) => [...r].reverse().join(""))

// ---------------------------------------------------------------------
// the things (16x16, the light from the upper left)

// a clay jar: the lip, the neck, the round belly with a band round it
const JAR = [
  "................",
  "................",
  ".....KKKKKK.....",
  ".....KW2223K....",
  "......KK3KK.....",
  "......K23K......",
  ".....KW2223K....",
  "....KW222223K...",
  "...KW22222233K..",
  "...K444444444K..",
  "...K222222233K..",
  "...K2222223333K.",
  "....K22223333K..",
  ".....KK3333KK...",
  "......KKKKKK....",
  "................",
]

// a sack of grain, tied at the top, its ears sticking up
const SACK = [
  "................",
  "................",
  ".....KK..KK.....",
  ".....K2KK23K....",
  "......K22KK.....",
  ".......K4K......",
  "......K2W3K.....",
  ".....KW22233K...",
  "....KW2222233K..",
  "...KW222222233K.",
  "...K2222222333K.",
  "...K2222223333K.",
  "...K2222233333K.",
  "....K22333333K..",
  ".....KKKKKKKK...",
  "................",
]

// a barrel lying on its side, ready to roll: the staves along it, two
// hoops round it, the head at the right end
const CASK = [
  "................",
  "................",
  "................",
  "................",
  "..KKKKKKKKKKKK..",
  ".KWWK1WW1KW1K2K.",
  "K2222K22K22K232K",
  "K2222K22K22K2W2K",
  "K4444K44K44K232K",
  "K2222K22K22K232K",
  "K3333K33K33K232K",
  ".K333K33K33KK3K.",
  "..KKKKKKKKKKKK..",
  "................",
  "................",
  "................",
]

// a cart wheel seen from its side: the rim, eight spokes, the hub (the
// ground shows through between the spokes)
const WHEEL = [
  "................",
  "....KKKKKKKK....",
  "..KKW2222223KK..",
  ".KW2K..44..K23K.",
  ".KWK4..44..4K3K.",
  "KW2K.4.44.4.K23K",
  "KWK...4KK4...K3K",
  "K2K4444KK4444K3K",
  "K2K4444KK4444K3K",
  "K2K...4KK4...K3K",
  "K22K.4.44.4.K33K",
  ".K2K4..44..4K3K.",
  ".K33K..44..K33K.",
  "..KK33333333KK..",
  "....KKKKKKKK....",
  "................",
]

// ---------------------------------------------------------------------
// the small pictures in the bubble (8x8)

const MINI: Record<string, string[]> = {
  jar: [
    "..KKKK..",
    "...KK...",
    "..K2WK..",
    ".KW222K.",
    "K444444K",
    "K222233K",
    ".K2333K.",
    "..KKKK..",
  ],
  sack: [
    ".K....K.",
    "..K..K..",
    "...KK...",
    "..K2WK..",
    ".KW2223K",
    "K222223K",
    "K222333K",
    ".KKKKKK.",
  ],
  wheel: [
    "..KKKK..",
    ".K4KK4K.",
    "K4.KK.4K",
    "KKKKKKKK",
    "KKKKKKKK",
    "K4.KK.4K",
    ".K4KK4K.",
    "..KKKK..",
  ],
  cask: [
    "........",
    ".KKKKKK.",
    "K2K22K3K",
    "K4K44K3K",
    "K2K22K3K",
    "K3K33K3K",
    ".KKKKKK.",
    "........",
  ],
}

/** The thought bubble (16x13) with the small picture of the thing in it */
function bubble(want: string): string[] {
  const rows = [
    "...KKKKKKKKKK...",
    "..K1111111111K..",
    ".K111111111111K.",
    ".K111111111111K.",
    ".K111111111111K.",
    ".K111111111111K.",
    ".K111111111111K.",
    ".K111111111111K.",
    ".K111111111111K.",
    "..K1111111111K..",
    "...KKKKKKKKKK...",
    "........K1K.....",
    ".........K......",
  ].map((r) => [...r])
  MINI[want].forEach((line, y) =>
    [...line].forEach((c, x) => {
      if (c !== ".") rows[1 + y][4 + x] = c
    })
  )
  return rows.map((r) => r.join(""))
}

// ---------------------------------------------------------------------
// the traveller, sitting cross-legged in a hooded cloak (16x16)

// from the front: the face in the hood (two dark eyes), the hands
// folded in the lap, the knees out to the sides
const FRONT = [
  "................",
  "......KKKK......",
  ".....K2223K.....",
  "....K2444433K...",
  "....K24111143K..",
  "....K24K11K43K..",
  "....K24111143K..",
  "...KK22444433KK.",
  "...K222222333K..",
  "..K22222223333K.",
  "..K2222WW13333K.",
  "..K22221113333K.",
  ".K4422222333344K",
  ".K4444KKKK4444K.",
  "..KKKK....KKKK..",
  "................",
]

// from behind: the hood and the cloak, a fold down the back
const BACK = [
  "................",
  "......KKKK......",
  ".....K2223K.....",
  "....K2222333K...",
  "....K2222333K...",
  "....K2222333K...",
  "....K2222333K...",
  "...KK22224333KK.",
  "...K222224333K..",
  "..K22222243333K.",
  "..K22222243333K.",
  "..K22222243333K.",
  ".K2222222433333K",
  ".K4444444444444K",
  "..KKKKKKKKKKKKK.",
  "................",
]

// from the side, facing right: the hood over the face, the nose out,
// the knees out in front
const SIDE = [
  "................",
  ".....KKKK.......",
  "....K22233K.....",
  "...K2222344K....",
  "...K22223411K...",
  "...K22223K111K..",
  "...K22223411K...",
  "...KK2223444K...",
  "...K222222333K..",
  "..K2222222113K..",
  "..K22222223333K.",
  "..K222222333333K",
  ".K2222223333333K",
  ".K4444444444444K",
  "..KKKKKKKKKKKKK.",
  "................",
]

const FIGURES: Record<string, string[]> = {
  up: BACK,
  down: FRONT,
  left: mirror(SIDE),
  right: SIDE,
}

// the mat in front of them: a woven rug lying flat, fringed at its ends
const MAT = [
  "................",
  "................",
  "................",
  "................",
  "..K.K.K.K.K.K...",
  "..KKKKKKKKKKKK..",
  ".K222222222222K.",
  ".K444444444444K.",
  ".K222222222222K.",
  ".K444444444444K.",
  ".K222222222222K.",
  "..KKKKKKKKKKKK..",
  "...K.K.K.K.K.K..",
  "................",
  "................",
  "................",
]

/** The goods, in the order of the stages (model/chain.ts GOODS) */
const GOODS = ["jar", "sack", "wheel", "cask"] as const

if (import.meta.main) {
  const things: Record<string, string[]> = {
    jar: JAR,
    sack: SACK,
    wheel: WHEEL,
    cask: CASK,
  }
  for (const goods of GOODS) {
    await Deno.mkdir(new URL(`../static/actor/${goods}/`, import.meta.url), {
      recursive: true,
    })
    for (const dir of ["up", "down", "left", "right"]) {
      for (const n of [0, 1]) {
        await write(`actor/${goods}/${dir}${n}.png`, things[goods])
      }
    }
  }
  for (const [dir, figure] of Object.entries(FIGURES)) {
    for (const goods of GOODS) {
      await write(`prop/chain_${dir}_${goods}.png`, [
        ...bubble(goods),
        ...figure,
      ])
    }
    await write(`prop/chain_${dir}.png`, figure)
  }
  await write("prop/chain_mat.png", MAT)
}
