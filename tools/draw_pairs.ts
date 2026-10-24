// Draws the sprites of the pair (model/pair.ts, tools/pairs.ts): a low
// square plinth, empty, or holding a standing stone or a boulder; lit
// (its top white) once the pair is whole. The twin and the filled plinth
// share the pictures. All in the grays (docs/art-guide.md), as the other
// goals are.
//
// Usage: deno -A tools/draw_pairs.ts
import { picture, write } from "./draw_waystones.ts"

// the plinth, under what it holds (rows 8 to 14)
const PLINTH = [
  "..KKKKKKKKKKKK..",
  "..K2222222223K..",
  "..KKKKKKKKKKKK..",
  "...K22222223K...",
  "...K22222233K...",
  "...K22222333K...",
  "..KKKKKKKKKKKK..",
]
/** Lit: the top shines white */
const lit = (rows: string[]) =>
  rows.map((row, y) => y === 1 ? row.replace(/2/g, "W") : row)

// a small standing stone, upright and flat-sided (rows 1 to 7)
const STONE = [
  "......KKKK......",
  ".....KW223K.....",
  ".....KW223K.....",
  ".....KW243K.....",
  ".....KW223K.....",
  ".....K2233K.....",
  ".....K2333K.....",
]
// a small boulder, round (rows 1 to 7)
const BOULDER = [
  "......KKKK......",
  "....KKW222KK....",
  "...KW2222223K...",
  "...KW2222233K...",
  "...K22222333K...",
  "...K22223333K...",
  "....KKKKKKKK....",
]
const EMPTY = Array(7).fill("................")

function sprite(top: string[], on: boolean): string[] {
  return [
    "................",
    ...top,
    ...(on ? lit(PLINTH) : PLINTH),
    "................",
  ]
}

if (import.meta.main) {
  await write("prop/pair_plinth.png", picture(sprite(EMPTY, false)))
  await write("prop/pair_stone.png", picture(sprite(STONE, false)))
  await write("prop/pair_boulder.png", picture(sprite(BOULDER, false)))
  await write("prop/pair_stone_lit.png", picture(sprite(STONE, true)))
  await write("prop/pair_boulder_lit.png", picture(sprite(BOULDER, true)))
}
