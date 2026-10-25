// Draws the sprites of the statue's gaze (model/gaze.ts, tools/gazes.ts):
// a moai, only its great stone head, sunk to the chin in the ground
// like the 🗿 (no neck, no body), seen from the front (looking down),
// from the back (looking up) and from the side (looking left or right),
// its eyes dark under the heavy brow, then lit white once it has seen;
// and what it looks at, the rest of the king (Shelley's "Ozymandias",
// 1818: "two vast and trunkless legs of stone" in the desert, the
// shattered visage half sunk near them): the two legs broken off above
// the knee standing on their pedestal, its inscription worn faint, then
// shining white once seen. All in the grays (docs/art-guide.md), as the
// other goals are.
//
// Both are taller than a cell (16x17 and 16x24): they stand on their
// cell, centered, and rise over the cell above (Prop.x / Prop.y).
//
// Usage: deno -A tools/draw_gazes.ts
import { Palette, type PaletteColor } from "../util/palette.ts"
import { encodePng } from "./png.ts"

const root = new URL("../static/", import.meta.url).pathname

/** The statue's size: a cell wide, a pixel taller (its shadow) */
export const STATUE_W = 16
export const STATUE_H = 17
/** The legs' size: a cell wide, half a cell taller */
export const LEGS_W = 16
export const LEGS_H = 24

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

// The moai from the front, sunk to the chin, the light from the upper
// left: the flat top of the head, the heavy brow over the eyes ("e": an
// eye, dark, then lit white), the long nose, the pouting upper lip over
// the mouth, the chin on the ground; the long ears either side; its
// shadow on the ground under the chin
const FRONT = [
  "...KKKKKKKKKK...",
  "..KW222222223K..",
  "..KW222222223K..",
  "..KWWWWWWWWW3K..",
  ".KK4444444444KK.",
  "K2K4ee4444ee4K3K",
  "K2KW224W32223K3K",
  "K2KW222W32223K3K",
  "K2KW22WW33223K3K",
  "K2KW224K4K223K3K",
  "K2KW222222223K3K",
  "K2KW2WWWWWW33K3K",
  "K2KW2KKKKKK33K3K",
  "K2KWWW2222333K3K",
  ".KK3WWWWWWW33KK.",
  "..KKKKKKKKKKKK..",
  "..444444444444..",
]
// from the back: the back of the head and the ears, a ring carved on
// it ("r": dark, then lit white), the nape over the ground
const BACK = [
  "...KKKKKKKKKK...",
  "..KW222222223K..",
  "..KW222222223K..",
  "..KW222222223K..",
  ".KKW222222223KK.",
  "K2KW222222223K3K",
  "K2KW222222223K3K",
  "K2KW222rr2223K3K",
  "K2KW22r22r233K3K",
  "K2KW22r22r233K3K",
  "K2KW222rr2233K3K",
  "K2KW222222233K3K",
  "K2KW222222333K3K",
  "K2KW222223333K3K",
  ".KK4444444444KK.",
  "..KKKKKKKKKKKK..",
  "..444444444444..",
]
// looking right: the flat back of the head, the long ear, the brow
// standing out over the eye sunk under it, the long nose jutting out,
// the pouting upper lip, the mouth pressed in, the chin out on the
// ground; its shadow
const SIDE = [
  "..KKKKKKKKK.....",
  ".KW22222222K....",
  ".KW222222222K...",
  ".KW22222222WWK..",
  ".KW2222222WWW2K.",
  ".KW24432244444K.",
  ".KW243222KeeW3K.",
  ".KW24322224W23K.",
  ".KW243222224W23K",
  ".KW243222224W23K",
  ".KW243222224444K",
  ".KW244422KKKKKK.",
  ".KW2222222WWW3K.",
  ".KW2222222KKKK..",
  ".KW2222222WW3K..",
  "..KKKKKKKKKKKK..",
  "..444444444444..",
]

function statue(rows: string[], lit: boolean): string[] {
  const out = rows.map((r) => r.replace(/[er]/g, lit ? "W" : "K"))
  // from the back the eyes don't show: the ring shines, and the top of
  // the head
  if (lit && rows === BACK) out[0] = out[0].replace(/K/g, "W")
  if (out.length !== STATUE_H || out.some((r) => r.length !== STATUE_W)) {
    throw new Error("the statue's size")
  }
  return out
}
const mirror = (rows: string[]) => rows.map((r) => [...r].reverse().join(""))

// The two vast and trunkless legs of stone, striding to the right as
// the kings' statues do, broken off above the knee: the jagged break
// (white on top), the knee, the calf, the ankle, the foot; the front
// leg over the back one
const LEG = [
  "..K.KK...",
  ".KWKWWK..",
  ".KWWW3K..",
  ".KW443K..",
  ".KW2223K.",
  ".KW2233K.",
  "KW2223K..",
  "KW2223K..",
  "KW2233K..",
  ".KW233K..",
  "..KW23K..",
  "..KW23K..",
  "..KW223K.",
  ".KW22223K",
  ".KW22233K",
  ".K444444K",
]
// the pedestal under them: its top, its face with two lines of the
// inscription ("i": worn faint, then shining white); its shadow
const PEDESTAL = [
  "KKKKKKKKKKKKKKKK",
  "KWWWWWWWWWWWWW3K",
  "K44444444444444K",
  "K2ii2ii2i2iii23K",
  "K22222222222223K",
  "K2i2iii2ii2i223K",
  "KKKKKKKKKKKKKKKK",
  "4444444444444444",
]
/** Where the back leg and the front leg stand (their left) */
const LEG_AT = [0, 7]

/** The legs: the inscription worn faint, or shining white once seen */
function legs(seen: boolean): string[] {
  const g = LEG.map(() => [..."".padEnd(LEGS_W, ".")])
  for (const x of LEG_AT) {
    LEG.forEach((row, y) =>
      [...row].forEach((ink, dx) => {
        if (ink !== ".") g[y][x + dx] = ink
      })
    )
  }
  const out = [...g.map((r) => r.join("")), ...PEDESTAL]
    .map((r) => r.replace(/i/g, seen ? "W" : "3"))
  if (out.length !== LEGS_H || out.some((r) => r.length !== LEGS_W)) {
    throw new Error("the legs' size")
  }
  return out
}

if (import.meta.main) {
  for (const lit of [false, true]) {
    const sfx = lit ? "_lit" : ""
    await write(`prop/gaze_up${sfx}.png`, statue(BACK, lit))
    await write(`prop/gaze_down${sfx}.png`, statue(FRONT, lit))
    await write(`prop/gaze_left${sfx}.png`, mirror(statue(SIDE, lit)))
    await write(`prop/gaze_right${sfx}.png`, statue(SIDE, lit))
    await write(`prop/gaze_sun${sfx}.png`, legs(lit))
  }
}
