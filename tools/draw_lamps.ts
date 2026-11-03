// Draws the parts of the lamp grids (model/lamp-room.ts, ideas/groups.md),
// in the grays (docs/art-guide.md), two states each and nothing between:
//
// - the floor lamp (`lamp-cell`): a round glass globe on a short stand.
//   Unlit, the globe is dark (gray4, a gray3 gleam at its upper left);
//   lit, it is white (gray1 on its lower right) with a 1px gray2 ring of
//   glow round its outline. So a grid of them reads at a glance as a
//   matrix of lit and unlit dots.
// - the plaque of the target (`lamp-plaque`): a flat black board (its
//   corners cut) with a dot: a gray3 ring unlit, a white disc lit.
// - the numerals 4 and 5 on the ground (`4_white`, `5_white`), as the
//   other white letters, for the columns and the rooms' names.
//
// Usage: deno -A tools/draw_lamps.ts
import { write } from "./draw_gazes.ts"

const blank = () => Array.from({ length: 16 }, () => Array(16).fill("."))
const rowsOf = (g: string[][]) => g.map((r) => r.join(""))

/** The globe's center and radius */
const CX = 7.5, CY = 5.5, R = 5

function lamp(lit: boolean): string[] {
  const g = blank()
  const d = (x: number, y: number) => Math.hypot(x - CX, y - CY)
  const inside = (x: number, y: number) => d(x, y) <= R
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (!inside(x, y)) continue
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
        !inside(x + dx, y + dy)
      )
      if (edge) g[y][x] = "K"
      else if (lit) {
        // the light side up and left, gray1 down and right
        g[y][x] = (x - CX) + (y - CY) > 3.5 ? "1" : "W"
      } else {
        const gleam = Math.hypot(x - (CX - 2), y - (CY - 2)) <= 1.2
        g[y][x] = gleam ? "3" : "4"
      }
    }
  }
  if (lit) {
    // the glow: a gray2 ring just outside the outline
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (g[y][x] !== "." || y > 10) continue
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
          g[y + dy]?.[x + dx] === "K"
        )
        if (near) g[y][x] = "2"
      }
    }
  }
  // the stand: a neck, then a base on the ground
  const stand = [
    "......K23K......",
    "......K23K......",
    "....KKKKKKKK....",
    "....KW22223K....",
    "....KKKKKKKK....",
  ]
  stand.forEach((row, k) =>
    [...row].forEach((ink, x) => {
      if (ink !== ".") g[11 + k][x] = ink
    })
  )
  return rowsOf(g)
}

function plaque(lit: boolean): string[] {
  const g = blank()
  for (let y = 1; y <= 14; y++) {
    for (let x = 1; x <= 14; x++) {
      const corner = (x === 1 || x === 14) && (y === 1 || y === 14)
      if (!corner) g[y][x] = "K"
    }
  }
  // the inner rim, gray4
  for (let k = 3; k <= 12; k++) {
    g[3][k] =
      g[12][k] =
      g[k][3] =
      g[k][12] =
        "4"
  }
  for (let y = 4; y <= 11; y++) {
    for (let x = 4; x <= 11; x++) {
      const r = Math.hypot(x - 7.5, y - 7.5)
      if (lit && r <= 3.2) g[y][x] = "W"
      if (!lit && r <= 3.2 && r > 2.1) g[y][x] = "3"
    }
  }
  return rowsOf(g)
}

const FOUR = [
  "................",
  "................",
  "................",
  "........WW......",
  ".......WWW......",
  "......WWWW......",
  ".....WW.WW......",
  "....WW..WW......",
  "....WW..WW......",
  "....WWWWWWWW....",
  "....WWWWWWWW....",
  "........WW......",
  "........WW......",
  "................",
  "................",
  "................",
]

const FIVE = [
  "................",
  "................",
  "................",
  "....WWWWWWWW....",
  "....WWWWWWWW....",
  "....WW..........",
  "....WW..........",
  "....WWWWWWW.....",
  "....WWWWWWWW....",
  "..........WW....",
  "....WW....WW....",
  "....WWWWWWWW....",
  ".....WWWWWW.....",
  "................",
  "................",
  "................",
]

if (import.meta.main) {
  await write("prop/lamp_cell.png", lamp(false))
  await write("prop/lamp_cell_lit.png", lamp(true))
  await write("prop/lamp_plaque.png", plaque(false))
  await write("prop/lamp_plaque_lit.png", plaque(true))
  await write("prop/4_white.png", FOUR)
  await write("prop/5_white.png", FIVE)
}
