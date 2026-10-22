// Draws the pictures of what space does (game/ui/space-hint.ts): a jump
// (an arrow up off the ground) and a dig (a shovel in the earth). Put
// shows the chosen tool's own item picture.
//
// Usage: deno -A tools/draw_space_hint.ts
import { picture, write } from "./draw_waystones.ts"

await write(
  "ui/space_jump.png",
  picture([
    "................",
    ".......WW.......",
    "......WWWW......",
    ".....WWWWWW.....",
    "....WWWWWWWW....",
    "......WWWW......",
    "......WWWW......",
    "......WWWW......",
    "......WWWW......",
    "................",
    "................",
    ".....1....1.....",
    "....1......1....",
    "................",
    "3333333333333333",
    "................",
  ]),
)
await write(
  "ui/space_dig.png",
  picture([
    "..........WWW...",
    "..........W.W...",
    "...........W....",
    "..........1W....",
    ".........1W.....",
    "........1W......",
    ".......1W.......",
    "......1W........",
    "....WWW.........",
    "...WWWWW........",
    "...WWWWW........",
    "....WWW.........",
    "..3..3...3..3...",
    ".3.3.33.3.3.33..",
    "3333333333333333",
    "................",
  ]),
)
