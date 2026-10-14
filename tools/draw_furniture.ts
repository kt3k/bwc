// Draws the furniture that the FF5 tilesets could not give us (or not
// readable in the grays, docs/art-guide.md): the long cloth-covered
// dining table (two cells, an end each, matching the round table's
// white cloth), a wooden chair with a backrest, the toilet, and the
// bathroom and household pieces - bathtub, shower, washbasin, mirror,
// towel rail, wardrobe, hearth, rug, broom and window.
//
// Usage: deno -A tools/draw_furniture.ts
import { picture, write } from "./draw_waystones.ts"

// the long table's left end: cloth over the edge, a leg at the left.
// The right end is its mirror, so the two join seamlessly
const TABLE_L = [
  "................",
  "................",
  "................",
  "...KKKKKKKKKKKKK",
  "..KWWWWWWWWWWWWW",
  ".KWW2WW2WW2WW2WW",
  ".KW2WW2WW2WW2WW2",
  ".KWWWWWWWWWWWWWW",
  ".KWWWWWWWWWWWWWW",
  ".K22222222222222",
  ".KWWWWWWWWWWWWWW",
  ".KW2WWW2WWW2WWW2",
  "..KKKKKKKKKKKKKK",
  "...K33K.........",
  "...K33K.........",
  "....KK..........",
]

const CHAIR = [
  "................",
  "................",
  "................",
  "....KKKKKKKK....",
  "...K11111111K...",
  "...K12222221K...",
  "...KKKKKKKKKK...",
  "...K11111111K...",
  "...K22222222K...",
  "...KKKKKKKKKK...",
  "...K3K....K3K...",
  "...K3K....K3K...",
  "....K......K....",
  "................",
  "................",
  "................",
]

// the toilet, after the 16px top-down ones in the pixel-art bathroom
// packs (Maru's, gatoamarelo's, bitglow's) and ドット絵世界's: two
// stacked blobs - the tank nearly as wide as the bowl, a white lid
// over a dark seam, a flush button, a narrow neck, then the oval bowl
// with its white seat ring around the dark inside, and a short foot
const TOILET = [
  "...KKKKKKKKKK...",
  "..KWWWWWWWWW2K..",
  ".KW4444444442K..",
  ".KW2222222222K..",
  ".KW2222222242K..",
  ".KW2222222222K..",
  "..KKKKK22KKKKK..",
  "...KKKWWWWKKK...",
  "..KWWWWWWWWW2K..",
  ".KWW2KKKKKK2W2K.",
  ".KW2K444444K22K.",
  ".KW2K44W444K22K.",
  ".KWW2KKKKKK2W2K.",
  "..KWWWWWWWW22K..",
  "...KKK2222KKK...",
  ".....KKKKKK.....",
]

// the bathroom and the household, after the 16px bathroom packs and
// the RPG interiors: white porcelain and gray enamel, black outlines

// the bathtub's left half: rim, the water inside with its glints, a
// foot. The right half is its mirror
const BATHTUB_L = [
  "................",
  "................",
  "...KKKKKKKKKKKKK",
  "..KWWWWWWWWWWWWW",
  ".KWWKKKKKKKKKKKK",
  ".KWK222222222222",
  ".KWK2W2222222222",
  ".KWK222222222222",
  ".KWK2222W2222222",
  ".KWK222222222222",
  ".KWWKKKKKKKKKKKK",
  "..KWWWWWWWWWWWWW",
  "...KKKKKKKKKKKKK",
  "....K3K.........",
  "....KKK.........",
  "................",
]

// the shower: the head on its pole, water falling, the tray below
const SHOWER = [
  "................",
  "....KKKKKKKKK...",
  "...K3333333KK3K.",
  "...KKKKKKKKK3K..",
  "....2.2.2..K3K..",
  ".....2.2.2.K3K..",
  "....2.2.2..K3K..",
  ".....2.2.2.K3K..",
  "....2.2.2..K3K..",
  "...........K3K..",
  "...........K3K..",
  "..KKKKKKKKKKKKK.",
  ".K222222222222K.",
  ".K222222422222K.",
  ".KKKKKKKKKKKKKK.",
  "................",
]

// the washbasin: the tap, the bowl with its drain, the pedestal
const SINK = [
  "................",
  "......KKK.......",
  "......K3KK......",
  "......K33K......",
  "...KKKKKKKKKK...",
  "..KWWWWWWWWWWK..",
  ".KW2222222222WK.",
  ".KW222224222W2K.",
  "..KW22222222WK..",
  "...KKWWWWWWKK...",
  "....KWW22WK.....",
  "....KWW22WK.....",
  "....KWW22WK.....",
  "....KWW22WK.....",
  "...KKKKKKKKK....",
  "................",
]

// the mirror, hung on the wall: an oval glass in a frame, a glint
const MIRROR = [
  "................",
  ".....KKKKKK.....",
  "....K333333K....",
  "...K31WWW113K...",
  "..K31WW111113K..",
  "..K3W11111113K..",
  "..K31111111W3K..",
  "..K3111111WW3K..",
  "...K31111W13K...",
  "....K333333K....",
  ".....KKKKKK.....",
  "................",
  "................",
  "................",
  "................",
  "................",
]

// the towel rail with its towel over it
const TOWEL_RACK = [
  "................",
  "...KKKKKKKKKK...",
  "..K3333333333K..",
  "..K3KWWWWWWK3K..",
  "..K3KW2222WK3K..",
  "..K3KWWWWWWK3K..",
  "..K3KW2222WK3K..",
  "..K3KWWWWWWK3K..",
  "..K3KWWWWWWK3K..",
  "..K3KKKKKKKK3K..",
  "..K3K......K3K..",
  "..K3K......K3K..",
  ".KK3KK....KK3KK.",
  ".KKKKK....KKKKK.",
  "................",
  "................",
]

// the wardrobe: a tall cabinet, two doors and their knobs
const WARDROBE = [
  "..KKKKKKKKKKKK..",
  ".K222222222222K.",
  ".KKKKKKKKKKKKKK.",
  ".KW2222K222223K.",
  ".KW2222K222223K.",
  ".KW2222K222223K.",
  ".KW222KKK22223K.",
  ".KW2222K222223K.",
  ".KW2222K222223K.",
  ".KW2222K222223K.",
  ".KW2222K222223K.",
  ".KW2222K222223K.",
  ".KW2222K222223K.",
  ".KKKKKKKKKKKKKK.",
  "..KK........KK..",
  "................",
]

// the hearth: a stone fireplace, the fire burning on its logs
const HEARTH = [
  "..KKKKKKKKKKKK..",
  ".K333333333333K.",
  ".KKKKKKKKKKKKKK.",
  ".K33KKKKKKKK33K.",
  ".K3KKKKKKKKKK3K.",
  ".K3KKKKWKKKKK3K.",
  ".K3KKKWWKWKKK3K.",
  ".K3KKK2W2W2KK3K.",
  ".K3KKK2WWW2KK3K.",
  ".K3KK22W2W22K3K.",
  ".K3KK2222222K3K.",
  ".K3K44444444K3K.",
  ".K3KKKKKKKKKK3K.",
  ".KKKKKKKKKKKKKK.",
  "K22222222222222K",
  "KKKKKKKKKKKKKKKK",
]

// the rug on the floor (walked over): an oval with a woven border
const RUG = [
  "................",
  "................",
  "................",
  "....KKKKKKKK....",
  "..KK22222222KK..",
  ".K222333333222K.",
  ".K232222222232K.",
  ".K232233332232K.",
  ".K232233332232K.",
  ".K232222222232K.",
  ".K222333333222K.",
  "..KK22222222KK..",
  "....KKKKKKKK....",
  "................",
  "................",
  "................",
]

// the broom leaning in a corner
const BROOM = [
  "................",
  "..........KK....",
  ".........K3K....",
  "........K3K.....",
  ".......K3K......",
  "......K3K.......",
  ".....K3K........",
  "....K3K.........",
  "...K3K..........",
  "..KK3KK.........",
  ".K22222K........",
  ".K222222K.......",
  "K22222222K......",
  "K22222222K......",
  "KKKKKKKKKK......",
  "................",
]

// the window in the house wall: four panes, the sky white in them
const WINDOW = [
  "................",
  "..KKKKKKKKKKKK..",
  ".K333333333333K.",
  ".K3KKKKKKKKKK3K.",
  ".K3KWWW1KWWW13K.",
  ".K3KWWW1KW1113K.",
  ".K3KW1111K1113K.",
  ".K3KKKKKKKKKK3K.",
  ".K3KWWW1KWWW13K.",
  ".K3KW1111K1113K.",
  ".K3K1111K11113K.",
  ".K3KKKKKKKKKK3K.",
  ".K333333333333K.",
  "..KKKKKKKKKKKK..",
  "................",
  "................",
]

/** Mirrors a picture left-right */
const mirror = (rows: string[]) =>
  rows.map((row) => [...row].reverse().join(""))

if (import.meta.main) {
  await write("prop/table_l.png", picture(TABLE_L))
  await write("prop/table_r.png", picture(mirror(TABLE_L)))
  await write("prop/chair.png", picture(CHAIR))
  await write("prop/toilet.png", picture(TOILET))
  await write("prop/bathtub_l.png", picture(BATHTUB_L))
  await write("prop/bathtub_r.png", picture(mirror(BATHTUB_L)))
  await write("prop/shower.png", picture(SHOWER))
  await write("prop/sink.png", picture(SINK))
  await write("prop/mirror.png", picture(MIRROR))
  await write("prop/towel_rack.png", picture(TOWEL_RACK))
  await write("prop/wardrobe.png", picture(WARDROBE))
  await write("prop/hearth.png", picture(HEARTH))
  await write("prop/rug.png", picture(RUG))
  await write("prop/broom.png", picture(BROOM))
  await write("prop/window.png", picture(WINDOW))
}
