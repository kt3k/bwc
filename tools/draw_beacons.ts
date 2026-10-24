// Draws the sprites of the patrol's beacon (model/beacon.ts,
// tools/patrols.ts): a stone lantern, a roof over a box with a window,
// on a post and a foot; dark, then lit (its window white, the roof's
// edge too) once the patrol has lit it. All in the grays
// (docs/art-guide.md), as the other goals are.
//
// Usage: deno -A tools/draw_beacons.ts
import { picture, write } from "./draw_waystones.ts"

// "f": the window (dark, then white)
const LANTERN = [
  "......KKKK......",
  "....KKW222KK....",
  "..KKW2222223KK..",
  ".KKKKKKKKKKKKKK.",
  "...KW222223K....",
  "...KW2ffff3K....",
  "...KW2ffff3K....",
  "...KW2ffff3K....",
  "...KKKKKKKKK....",
  ".....KW23K......",
  ".....KW23K......",
  ".....KW23K......",
  "....KKKKKKK.....",
  "...KW222223K....",
  "...KKKKKKKKK....",
  "................",
]

const lantern = (lit: boolean) =>
  LANTERN.map((row) => row.replace(/f/g, lit ? "W" : "K"))

if (import.meta.main) {
  await write("prop/patrol_beacon.png", picture(lantern(false)))
  await write("prop/patrol_beacon_lit.png", picture(lantern(true)))
}
