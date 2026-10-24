// Draws the sprites of the bell out of reach (model/bell.ts,
// tools/bells.ts): a bell hung in a frame of two posts and a beam, still,
// swung left and right (the clapper the other way) and still once rung
// (its lit side white). All in the grays (docs/art-guide.md), as the
// other goals are.
//
// Usage: deno -A tools/draw_bells.ts
import { picture, write } from "./draw_waystones.ts"

// the frame: a beam on two posts (the rows of the bell go between them)
const BEAM = [
  "................",
  "KKKKKKKKKKKKKKKK",
  "K22222222222233K",
  "KKKKKKKKKKKKKKKK",
]
const POST_L = "K3K", POST_R = "K3K"
const FOOT = "KKK..........KKK"

// the bell, 10 cells wide (between the posts), from the hanger down to
// the clapper; lit from the left
const BELL = [
  "....KK....",
  "...KKKK...",
  "..KW222K..",
  "..KW223K..",
  "..KW223K..",
  ".KW22233K.",
  ".KW22233K.",
  ".KKKKKKKK.",
  "....KK....",
  "..........",
]

/**
 * The bell swung to a side (-1 left, 1 right): its body moves that way
 * under the hanger, and the clapper lags behind in the middle
 */
function swung(side: -1 | 1): string[] {
  const shift = (row: string, by: number) =>
    by > 0
      ? (".".repeat(by) + row).slice(0, row.length)
      : (row + ".".repeat(-by)).slice(-by)
  return BELL.map((row, y) => shift(row, y >= 2 && y <= 7 ? side : 0))
}

/** The bell once rung: its lit side white */
const rung = (rows: string[]) => rows.map((row) => row.replace(/2/, "W"))

function sprite(bell: string[]): string[] {
  return [
    ...BEAM,
    ...bell.map((row) => POST_L + row + POST_R),
    FOOT,
    "................",
  ]
}

if (import.meta.main) {
  await write("prop/goal_bell.png", picture(sprite(BELL)))
  await write("prop/goal_bell_left.png", picture(sprite(swung(-1))))
  await write("prop/goal_bell_right.png", picture(sprite(swung(1))))
  await write("prop/goal_bell_rung.png", picture(sprite(rung(BELL))))
}
