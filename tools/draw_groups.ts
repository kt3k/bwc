// Draws the sprites of the puzzles run by finite groups (model/
// group-lever.ts, ideas/groups.md), all in the grays (docs/art-guide.md):
//
// - the standing stones (`group-stone`), one per carved pattern, told
//   apart by shape: a ring, a cross, bars, a spiral, a triangle, a
//   diamond;
// - the Moai (`group-moai`), the gaze statue's head (tools/draw_gazes.ts)
//   with a ring in its right ear: the ring shows which way round it is,
//   so its 8 poses (4 facings, each plain or mirrored) all look apart.
//   From the front its right ear is on the left of the picture, from the
//   back on the right; from the side only the near ear shows: looking
//   right that is its right ear (the ring), looking left its left (none)
//   until it is mirrored;
// - the levers (`group-lever`): a handle on a base, leaning left or right
//   (it flips at each pull), the base carved with what it does: swap
//   (two arrows), turn (a round arrow), mirror (two halves facing out);
//   and the flat one in the ground, rolled over by a boulder;
// - the mural (`group-mural`): dark plaques of the target, each with a
//   pattern of the stones or a pose of the Moai seen from above (its
//   nose the way it faces, the ring in its right ear), and the plaque
//   with a "?" to knock on (lit once the odd one out is found).
//
// - the door (`group-door`): a stone slab carved with a ring, shut; then
//   sunk into the ground, only its top showing, open.
//
// The bell reuses the goal bell (tools/draw_bells.ts).
//
// Usage: deno -A tools/draw_groups.ts
import { BACK, FRONT, SIDE, write } from "./draw_gazes.ts"

const blank = (w: number, h: number) =>
  Array.from({ length: h }, () => Array(w).fill("."))
const rowsOf = (g: string[][]) => g.map((r) => r.join(""))
const gridOf = (rows: readonly string[]) => rows.map((r) => [...r])
const mirror = (rows: string[]) => rows.map((r) => [...r].reverse().join(""))
/** Turns a square picture a quarter clockwise */
const turn = (rows: string[]) =>
  rows.map((_, y) => rows.map((_, x) => rows[rows.length - 1 - x][y]).join(""))
/** Paints the picture onto the grid at (x, y) (its "." left as is) */
function paint(g: string[][], x: number, y: number, rows: readonly string[]) {
  rows.forEach((row, dy) =>
    [...row].forEach((ink, dx) => {
      if (ink !== ".") g[y + dy][x + dx] = ink
    })
  )
}

// ---------------------------------------------------------------------
// the patterns (6x6), carved into the stones and shown on the mural

export const PATTERNS: readonly (readonly string[])[] = [
  // a ring
  [".XXXX.", "XX..XX", "X....X", "X....X", "XX..XX", ".XXXX."],
  // a cross
  ["..XX..", "..XX..", "XXXXXX", "XXXXXX", "..XX..", "..XX.."],
  // bars
  ["XXXXXX", "......", "XXXXXX", "......", "XXXXXX", "......"],
  // a spiral
  ["XXXXXX", "X....X", "X.XX.X", "X.X..X", "X.XXXX", "X....."],
  // a triangle
  ["..XX..", "..XX..", ".X..X.", ".X..X.", "X....X", "XXXXXX"],
  // a diamond
  ["..XX..", ".XXXX.", "XXXXXX", "XXXXXX", ".XXXX.", "..XX.."],
]

/** The standing stone carved with the pattern */
function stone(pattern: readonly string[]): string[] {
  const g = blank(16, 16)
  for (let y = 0; y <= 14; y++) {
    // the rounded top
    const inset = y === 0 ? 2 : y === 1 ? 1 : 0
    const x0 = 3 + inset, x1 = 12 - inset
    for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === 0 || y === 14
      g[y][x] = edge
        ? "K"
        : x === x0 + 1 || y === 1
        ? "W"
        : x === x1 - 1 || y === 13
        ? "3"
        : "2"
    }
  }
  for (let x = 3; x <= 12; x++) g[15][x] = "4"
  paint(g, 5, 5, pattern.map((r) => r.replace(/X/g, "K")))
  return rowsOf(g)
}

// ---------------------------------------------------------------------
// the Moai, the ring in its right ear

/** Puts the ring (3x3) with its top left at (x, y) */
function ring(rows: readonly string[], x: number, y: number): string[] {
  const g = gridOf(rows)
  paint(g, x, y, ["KWK", "W4W", "KWK"])
  return rowsOf(g)
}
/** The eyes and the back's ring dark (the statue never lights up here) */
const dark = (rows: readonly string[]) =>
  rows.map((r) => r.replace(/[er]/g, "K"))

const front = dark(FRONT), back = dark(BACK), side = dark(SIDE)
/** By stage: up, right, down, left, each plain then mirrored */
export const MOAI: readonly (readonly [string, string[]])[] = [
  // from the back its right ear is on the right of the picture
  ["moai_up", ring(back, 13, 9)],
  ["moai_up_m", ring(back, 0, 9)],
  // looking right the near ear is its right ear
  ["moai_right", ring(side, 4, 7)],
  ["moai_right_m", side],
  // from the front its right ear is on the left of the picture
  ["moai_down", ring(front, 0, 9)],
  ["moai_down_m", ring(front, 13, 9)],
  // looking left the near ear is its left ear
  ["moai_left", mirror(side)],
  ["moai_left_m", mirror(ring(side, 4, 7))],
]

// ---------------------------------------------------------------------
// the levers

/** What the base is carved with (10x4) */
const LOOKS: readonly (readonly [string, readonly string[]])[] = [
  ["swap", [".W........", "WWWWWWWW..", "..WWWWWWWW", "........W."]],
  ["turn", ["...WWWW.W.", "..W....WW.", "..W...WWW.", "...WWWW..."]],
  ["mirror", ["..W.WW.W..", ".WW.WW.WW.", ".WW.WW.WW.", "..W.WW.W.."]],
]

/** A lever with the carving, its handle leaning left (or right) */
function lever(carving: readonly string[], right: boolean): string[] {
  const g = blank(16, 16)
  // the handle: from the pivot up to the knob
  const handle = blank(16, 16)
  for (let y = 3; y <= 9; y++) {
    const x = Math.round(8 - (9 - y) * 0.6)
    handle[y][x] = "K"
    handle[y][x + 1] = "3"
  }
  paint(handle, 2, 0, [".KKK.", "KWWWK", "KWW2K", "KW22K", ".KKK."])
  paint(g, 0, 0, right ? mirror(rowsOf(handle)) : rowsOf(handle))
  // the base
  for (let y = 9; y <= 14; y++) {
    for (let x = 1; x <= 14; x++) {
      const edge = x === 1 || x === 14 || y === 9 || y === 14
      g[y][x] = edge ? "K" : y === 10 ? "2" : "4"
    }
  }
  for (let x = 1; x <= 14; x++) g[15][x] = "4"
  paint(g, 3, 10, carving)
  return rowsOf(g)
}

/** The flat lever in the ground: its slider at the left (or right) */
function flat(right: boolean): string[] {
  const g = blank(16, 16)
  for (let y = 4; y <= 12; y++) {
    for (let x = 1; x <= 14; x++) {
      const edge = x === 1 || x === 14 || y === 4 || y === 12
      g[y][x] = edge ? "K" : y === 5 ? "2" : "3"
    }
  }
  for (let x = 3; x <= 12; x++) g[8][x] = "K"
  // the arrows of the roll, either side of the slider's groove
  paint(g, 4, 6, ["W.W.W.W.", "........"])
  paint(g, 4, 10, ["W.W.W.W."])
  paint(g, right ? 10 : 3, 7, ["KKK", "KWK", "KKK"])
  return rowsOf(g)
}

// ---------------------------------------------------------------------
// the mural

/** A dark plaque with the picture (12x12 at most) in its middle */
function plaque(picture: readonly string[], fill = "4"): string[] {
  const g = blank(16, 16)
  for (let y = 0; y <= 14; y++) {
    for (let x = 1; x <= 14; x++) {
      const edge = x === 1 || x === 14 || y === 0 || y === 14
      g[y][x] = edge ? "K" : y === 1 ? "3" : fill
    }
  }
  for (let x = 1; x <= 14; x++) g[15][x] = "4"
  const w = picture[0].length, h = picture.length
  paint(g, 2 + Math.floor((12 - w) / 2), 1 + Math.ceil((13 - h) / 2), picture)
  return rowsOf(g)
}

/** The Moai's head seen from above (12x12), looking up: the nose at the
 * top, the ring in its right ear (on the right) */
function headFromAbove(): string[] {
  const g = blank(12, 12)
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const d = Math.hypot(x - 5.5, y - 7)
      if (d <= 4.6) g[y][x] = d > 3.5 ? "W" : "2"
    }
  }
  paint(g, 5, 0, ["WW", "WW", "WW"])
  paint(g, 4, 2, ["WWWW"])
  // the ears: the left plain, the right with its ring
  paint(g, 0, 6, ["W", "W"])
  paint(g, 9, 5, ["WWW", "WKW", "WWW"])
  return rowsOf(g)
}

/** The head from above in a pose: up, right, down, left; then mirrored */
function headPose(stage: number): string[] {
  let rows = headFromAbove()
  if (stage % 2 === 1) rows = mirror(rows)
  for (let k = 0; k < Math.floor(stage / 2); k++) rows = turn(rows)
  return rows
}

/** The door: the slab standing, or sunk with only its top showing */
function door(open: boolean): string[] {
  const g = blank(16, 16)
  const top = open ? 12 : 0
  for (let y = top; y <= 15; y++) {
    for (let x = 0; x <= 15; x++) {
      const edge = x === 0 || x === 15 || y === top || y === 15
      g[y][x] = edge
        ? "K"
        : y === top + 1
        ? "W"
        : x === 1
        ? "2"
        : x === 14 || y === 14
        ? "4"
        : "3"
    }
  }
  if (!open) {
    // the seams of the stone and the carved ring
    for (let y = 2; y <= 13; y++) g[y][7] = y >= 5 && y <= 10 ? g[y][7] : "4"
    paint(g, 4, 5, [
      ".KKKKKK.",
      "KK2222KK",
      "K2....2K",
      "K2....2K",
      "KK2222KK",
      ".KKKKKK.",
    ])
  }
  return rowsOf(g)
}

const QUESTION = [
  ".WWWW.",
  "WW..WW",
  "....WW",
  "...WW.",
  "..WW..",
  "......",
  "..WW..",
]

if (import.meta.main) {
  for (const [n, p] of PATTERNS.entries()) {
    await write(`prop/group_stone_${n}.png`, stone(p))
    await write(
      `prop/group_mural_${n}.png`,
      plaque(p.map((r) => r.replace(/X/g, "W"))),
    )
  }
  for (const [name, rows] of MOAI) await write(`prop/group_${name}.png`, rows)
  for (let stage = 0; stage < 8; stage++) {
    await write(`prop/group_mural_pose_${stage}.png`, plaque(headPose(stage)))
  }
  await write("prop/group_mural_plaque.png", plaque(QUESTION))
  await write(
    "prop/group_mural_plaque_lit.png",
    plaque(QUESTION.map((r) => r.replace(/W/g, "K")), "W"),
  )
  for (const [name, carving] of LOOKS) {
    await write(`prop/group_lever_${name}_0.png`, lever(carving, false))
    await write(`prop/group_lever_${name}_1.png`, lever(carving, true))
  }
  await write("prop/group_door.png", door(false))
  await write("prop/group_door_open.png", door(true))
  await write("prop/group_lever_flat_0.png", flat(false))
  await write("prop/group_lever_flat_1.png", flat(true))
}
