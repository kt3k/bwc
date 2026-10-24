// Draws the sprites of the statue's gaze (model/gaze.ts, tools/gazes.ts):
// a stone head on a plinth, seen from the front (looking down), from the
// back (looking up) and from the side (looking left or right), its eyes
// dark, then lit white once it has seen; and the sun-stone it looks at, a
// disc carved with a sun, lit once seen. All in the grays
// (docs/art-guide.md), as the other goals are.
//
// Usage: deno -A tools/draw_gazes.ts
import { Palette, type PaletteColor } from "../util/palette.ts"
import { picture, write } from "./draw_waystones.ts"

// the head, 6 cells across inside its outline ("e": an eye, in the dark
// band of the brow: shut, then lit white)
const FRONT = [
  "W22223",
  "W22223",
  "W22223",
  "KeKKeK",
  "W22223",
  "W2K223",
  "W2K233",
  "W22233",
  "W44443",
  "W22333",
  "W22333",
]
const BACK = [
  "W22223",
  "W22223",
  "W22223",
  "W22233",
  "W22223",
  "W22233",
  "W22233",
  "W22233",
  "W22233",
  "W22333",
  "W22333",
]
// looking right: the brow, one eye near the face, the nose on the edge
const SIDE = [
  "W22223",
  "W22223",
  "W22223",
  "W2KKeK",
  "W22223",
  "W2222K",
  "W2222K",
  "W22233",
  "W22444",
  "W22333",
  "W22333",
]

function head(inner: string[], lit: boolean, glow = false): string[] {
  const eye = lit ? "W" : "K"
  return [
    "................",
    glow && lit ? "....KWWWWWWK...." : "....KKKKKKKK....",
    ...inner.map((row) => "....K" + row.replace(/e/g, eye) + "K...."),
    "....KKKKKKKK....",
    "..K3333333333K..",
    "..KKKKKKKKKKKK..",
  ]
}
const mirror = (rows: string[]) => rows.map((r) => [...r].reverse().join(""))

/** The sun-stone: a disc on a stub, a sun carved in it; lit, it shines */
function sun(lit: boolean): (PaletteColor | null)[] {
  const px: (PaletteColor | null)[] = Array(16 * 16).fill(null)
  const inDisc = (x: number, y: number) =>
    Math.hypot(x + 0.5 - 8, y + 0.5 - 7) <= 6.2
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (y >= 13 && x >= 5 && x <= 10) {
        // the stub
        px[y * 16 + x] = y === 15 || x === 5 || x === 10
          ? Palette.black
          : Palette.gray3
        continue
      }
      if (!inDisc(x, y)) continue
      const dx = x + 0.5 - 8, dy = y + 0.5 - 7
      const d = Math.hypot(dx, dy)
      let c: PaletteColor = dx + dy > 3 ? Palette.gray3 : Palette.gray2
      // the sun: a disc and four rays
      const ray = Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6
      if (d < 2.2 || (ray && d > 3.4 && d < 5.4)) {
        c = lit ? Palette.white : Palette.gray4
      }
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) =>
        !inDisc(x + ox, y + oy)
      )
      if (edge) c = Palette.black
      px[y * 16 + x] = c
    }
  }
  return px
}

if (import.meta.main) {
  for (const lit of [false, true]) {
    const sfx = lit ? "_lit" : ""
    await write(`prop/gaze_up${sfx}.png`, picture(head(BACK, lit, true)))
    await write(`prop/gaze_down${sfx}.png`, picture(head(FRONT, lit)))
    await write(`prop/gaze_left${sfx}.png`, picture(mirror(head(SIDE, lit))))
    await write(`prop/gaze_right${sfx}.png`, picture(head(SIDE, lit)))
    await write(`prop/gaze_sun${sfx}.png`, sun(lit))
  }
}
