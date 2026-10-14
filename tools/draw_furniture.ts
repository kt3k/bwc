// Draws the furniture that the FF5 tilesets could not give us readable
// in the grays (docs/art-guide.md): the long cloth-covered dining
// table (two cells, an end each, matching the round table's white
// cloth), a wooden chair with a backrest, and the privy's wooden seat.
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

// the privy's wooden seat: a box bench with its round hole, a lid
// leaning on the backboard
const TOILET = [
  "................",
  "................",
  ".....KKKKKK.....",
  "....K111111K....",
  "...K11222211K...",
  "...K11222211K...",
  "..KKKKKKKKKKKK..",
  "..K2222222222K..",
  "..K222KKKK222K..",
  "..K22KKKKKK22K..",
  "..K222KKKK222K..",
  "..K2222222222K..",
  "..K2111111112K..",
  "..KKKKKKKKKKKK..",
  "...K3K....K3K...",
  "...KKK....KKK...",
]

/** Mirrors a picture left-right */
const mirror = (rows: string[]) =>
  rows.map((row) => [...row].reverse().join(""))

if (import.meta.main) {
  await write("prop/table_l.png", picture(TABLE_L))
  await write("prop/table_r.png", picture(mirror(TABLE_L)))
  await write("prop/chair.png", picture(CHAIR))
  await write("prop/toilet.png", picture(TOILET))
}
