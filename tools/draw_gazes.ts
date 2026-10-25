// Draws the sprites of the statue's gaze (model/gaze.ts, tools/gazes.ts):
// a moai, a long stone head on a narrow body standing on a low platform
// (an ahu), seen from the front (looking down), from the back (looking
// up) and from the side (looking left or right), its eyes dark in the
// deep sockets under the heavy brow, then lit white once it has seen;
// and the wisteria trellis it looks at, a small pergola with clusters of
// flowers hanging from it, in full white bloom once seen. All in the
// grays (docs/art-guide.md), as the other goals are.
//
// Both are taller than a cell (16x24 and 16x20): they stand on their
// cell, centered, and rise over the cell above (Prop.x / Prop.y).
//
// Usage: deno -A tools/draw_gazes.ts
import { Palette, type PaletteColor } from "../util/palette.ts"
import { encodePng } from "./png.ts"

const root = new URL("../static/", import.meta.url).pathname

/** The statue's size: a cell wide, half a cell more tall */
export const STATUE_W = 16
export const STATUE_H = 24
/** The trellis's size: a cell wide, a little taller */
export const TRELLIS_W = 16
export const TRELLIS_H = 20

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

// The moai from the front: the long head, the brow over the deep
// sockets ("e": an eye, dark, then lit white), the long nose, the long
// upper lip, the pursed mouth, the jutting chin; the long ears either
// side; the narrow body, the hands meeting over the belly; the ahu
const FRONT = [
  "....KKKKKKKK....",
  "...KW2222223K...",
  "...KW2222223K...",
  "..KKWWWWWWW3KK..",
  ".K2K44423444K3K.",
  ".K2K4ee23ee4K3K.",
  ".K4K24423443K4K.",
  ".K4KW22W3223K4K.",
  ".K4KW22W3223K4K.",
  ".K2KW2423423K3K.",
  ".K2KW2244233K3K.",
  "..KKW2222233KK..",
  "...KW2222233K...",
  "...KW24KK433K...",
  "...KW2WWW233K...",
  "...K44222244K...",
  "...KK444444KK...",
  "....KW22223K....",
  "....K422224K....",
  "....KW42243K....",
  "....KW44443K....",
  ".KKKKKKKKKKKKKK.",
  ".K222422242223K.",
  ".KKKKKKKKKKKKKK.",
]
// from the back: the back of the head and the ears, the body with the
// girdle carved round it
const BACK = [
  "....KKKKKKKK....",
  "...KW2222223K...",
  "...KW2222223K...",
  "..KKW2222223KK..",
  ".K2KW2222223K3K.",
  ".K2KW2222223K3K.",
  ".K4KW2222223K4K.",
  ".K4KW2222233K4K.",
  ".K4KW2222233K4K.",
  ".K2KW2222233K3K.",
  ".K2KW2222233K3K.",
  "..KKW2222233KK..",
  "...KW2222233K...",
  "...KW2222233K...",
  "...KW2222333K...",
  "...K42222334K...",
  "...KK444444KK...",
  "....KW22223K....",
  "....KW22223K....",
  "....K444444K....",
  "....KW2W223K....",
  ".KKKKKKKKKKKKKK.",
  ".K222422242223K.",
  ".KKKKKKKKKKKKKK.",
]
// looking right: the flat back of the head, the long ear, the brow
// standing out over the eye, the long straight nose, the upper lip, the
// mouth pursed in, the chin out
const SIDE = [
  "....KKKKKKKK....",
  "...KW2222222K...",
  "...KW2222222K...",
  "...KW2222222WK..",
  "...KW244224eKK..",
  "...KW2432222K...",
  "...KW24322222K..",
  "...KW24322222K..",
  "...KW243222223K.",
  "...KW243222223K.",
  "...KW24322244KK.",
  "...KW2442223K...",
  "...KW22222223K..",
  "...KW222222KK...",
  "...KW22222223K..",
  "...KW2222234KK..",
  "...KK2224444K...",
  "....KW222223K...",
  "....KW243223K...",
  "....KW244443K...",
  "....KW222233K...",
  ".KKKKKKKKKKKKKK.",
  ".K222422242223K.",
  ".KKKKKKKKKKKKKK.",
]

function statue(rows: string[], lit: boolean, glow = false): string[] {
  const out = rows.map((r) => r.replace(/e/g, lit ? "W" : "K"))
  // from the back the eyes don't show: the top of the head shines
  if (glow && lit) out[0] = out[0].replace(/K/g, "W")
  if (out.length !== STATUE_H || out[0].length !== STATUE_W) {
    throw new Error("the statue's size")
  }
  return out
}
const mirror = (rows: string[]) => rows.map((r) => [...r].reverse().join(""))

// The wisteria trellis, seen from the front and a little above: the
// leaves over its roof, the rafters showing through ("l": a leaf that
// flowers white in bloom), the front beam, the two posts. The flowers
// hang from the front beam (trellis())
const TRELLIS = [
  "..KKK..KKK..KK..",
  ".K4l4KK434KK4l4K",
  "K44234l4234l234K",
  "K34244432443244K",
  "K44244442444244K",
  "KKKKKKKKKKKKKKKK",
  "KW2222222222223K",
  "K44444444444444K",
  "KKKKKKKKKKKKKKKK",
  "K3K..........K3K",
  "K3K..........K3K",
  "K3K..........K3K",
  "K3K..........K3K",
  "K3K..........K3K",
  "K3K..........K3K",
  "K3K..........K3K",
  "K3K..........K3K",
  "K3K..........K3K",
  "K4K..........K4K",
  "KKK..........KKK",
]
/**
 * The flower clusters hanging from the front beam: where each starts
 * (its left), in bud (short, dark) and in bloom (long, white), each a
 * cone of flowers narrowing to its tip
 */
const CLUSTERS: { x: number; bud: string[]; bloom: string[] }[] = [
  { x: 3, bud: ["43", "3."], bloom: ["WW", "W3", "WW", "3W", ".W", ".2"] },
  {
    x: 6,
    bud: ["34", "43", ".3"],
    bloom: ["WW", "3W", "WW", "W3", "WW", "3W", "W.", "W.", "2."],
  },
  {
    x: 9,
    bud: ["43", "34"],
    bloom: ["WW", "W3", "WW", "3W", "WW", ".W", ".2"],
  },
  { x: 12, bud: ["3"], bloom: ["W", "3", "W", "2"] },
]

/** The trellis: in bud (dark gray clusters), or in full white bloom */
function trellis(bloom: boolean): string[] {
  const g = TRELLIS.map((r) => [...r.replace(/l/g, bloom ? "W" : "3")])
  for (const c of CLUSTERS) {
    ;(bloom ? c.bloom : c.bud).forEach((row, k) =>
      [...row].forEach((ink, dx) => {
        if (ink !== ".") g[9 + k][c.x + dx] = ink
      })
    )
  }
  const out = g.map((r) => r.join(""))
  if (out.length !== TRELLIS_H || out[0].length !== TRELLIS_W) {
    throw new Error("the trellis's size")
  }
  return out
}

if (import.meta.main) {
  for (const lit of [false, true]) {
    const sfx = lit ? "_lit" : ""
    await write(`prop/gaze_up${sfx}.png`, statue(BACK, lit, true))
    await write(`prop/gaze_down${sfx}.png`, statue(FRONT, lit))
    await write(`prop/gaze_left${sfx}.png`, mirror(statue(SIDE, lit)))
    await write(`prop/gaze_right${sfx}.png`, statue(SIDE, lit))
    await write(`prop/gaze_sun${sfx}.png`, trellis(lit))
  }
}
