// Draws the sprites of the dais to clear (model/clear.ts,
// tools/clears.ts): a square slab of carved stone set in the ground, a
// ring and a cross cut in it; once clear, the carving shines white. All
// in the grays (docs/art-guide.md), as the other goals are. What sits on
// it is the stone or the boulder itself (an actor).
//
// Usage: deno -A tools/draw_clears.ts
import { picture, write } from "./draw_waystones.ts"

// "c": the carving (dark at first, white once clear)
const DAIS = [
  "................",
  ".KKKKKKKKKKKKKK.",
  ".KWWWWWWWWWWW3K.",
  ".KW2222cc22223K.",
  ".KW22cc22cc223K.",
  ".KW2c222222c23K.",
  ".KW2c22cc22c23K.",
  ".KWc22cccc22c3K.",
  ".KWc22cccc22c3K.",
  ".KW2c22cc22c23K.",
  ".KW2c222222c23K.",
  ".KW22cc22cc223K.",
  ".KW2222cc22223K.",
  ".K333333333333K.",
  ".KKKKKKKKKKKKKK.",
  "................",
]

const carved = (lit: boolean) =>
  DAIS.map((row) => row.replace(/c/g, lit ? "W" : "4"))

if (import.meta.main) {
  await write("prop/clear_dais.png", picture(carved(false)))
  await write("prop/clear_dais_lit.png", picture(carved(true)))
}
