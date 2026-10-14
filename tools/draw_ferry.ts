// Draws the sprites of the ferries (model/ferry.ts): the boat moored at a
// landing (and the empty water left when it is out), and the rowboat the
// player rides in, kimi's head over the hull, the oars at two strokes,
// for each of the four directions. All in the grays (docs/art-guide.md).
//
// Usage: deno -A tools/draw_ferry.ts
import type { PaletteColor } from "../util/palette.ts"
import { picture, write } from "./draw_waystones.ts"
import { decodePng } from "./png.ts"

const root = new URL("../static/", import.meta.url).pathname

// the boat at its landing, from above: the hull and two thwarts
const MOORED = picture([
  "................",
  "................",
  "................",
  "................",
  "...KKKKKKKKKK...",
  ".KK3333333333KK.",
  "K33222K2222K233K",
  "K32222K2222K223K",
  "K33222K2222K233K",
  ".KK3333333333KK.",
  "...KKKKKKKKKK...",
  "................",
  "................",
  "................",
  "................",
  "................",
])

// the boat is out: rings on the water where it lay
const GONE = picture([
  "................",
  "................",
  "................",
  "................",
  "................",
  "....WW....WW....",
  "................",
  "..W..........W..",
  "................",
  "....WW....WW....",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
])

// the hull seen from the side, the bow to the right (rows 9 to 15)
const SIDE = [
  "...............K",
  "KKKKKKKKKKKKKKKK",
  "K3333333333333K.",
  ".K33333333333K..",
  "..KKKKKKKKKKK...",
  "................",
  "................",
]
// the oar of each stroke: [x, y] of its white pixels
const SIDE_OARS = [
  [[3, 13], [2, 14], [3, 14]],
  [[6, 13], [6, 14], [7, 14]],
]

// the hull seen from the bow or the stern (rows 9 to 15)
const END = [
  "................",
  "KKKKKKKKKKKKKKKK",
  "K22222222222222K",
  ".K333333333333K.",
  "..KKKKKKKKKKKK..",
  "................",
  "................",
]
const END_OARS = [
  [[0, 12], [0, 13], [15, 12], [15, 13]],
  [[1, 13], [1, 14], [14, 13], [14, 14]],
]

const flip = (rows: string[]) => rows.map((r) => [...r].reverse().join(""))

/** kimi's frame of the direction, as palette colors */
async function kimi(name: string): Promise<(PaletteColor | null)[]> {
  const { rgba } = await decodePng(
    await Deno.readFile(`${root}actor/kimi/${name}.png`),
  )
  const hex = (n: number) => n.toString(16).padStart(2, "0")
  return [...Array(256).keys()].map((k) =>
    rgba[k * 4 + 3] === 0
      ? null
      : `#${hex(rgba[k * 4])}${hex(rgba[k * 4 + 1])}${
        hex(rgba[k * 4 + 2])
      }` as PaletteColor
  )
}

/** kimi's head (one row down) in the hull, with the oar of the stroke */
async function rower(
  dir: string,
  phase: 0 | 1,
  hull: string[],
  oars: number[][][],
  mirror: boolean,
) {
  const head = await kimi(`${dir}0`)
  const body = picture([...Array(9).fill("................"), ...hull])
  const px: (PaletteColor | null)[] = Array(256).fill(null)
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 16; x++) px[(y + 1) * 16 + x] = head[y * 16 + x]
  }
  body.forEach((c, k) => {
    if (c) px[k] = c
  })
  const white = picture(Array(16).fill("WWWWWWWWWWWWWWWW"))[0]
  for (const [x, y] of oars[phase]) {
    px[y * 16 + (mirror ? 15 - x : x)] = white
  }
  await write(`actor/rowboat/${dir}${phase}.png`, px)
}

await write("prop/ferry.png", MOORED)
await write("prop/ferry_out.png", GONE)
await Deno.mkdir(`${root}actor/rowboat`, { recursive: true })
for (const phase of [0, 1] as const) {
  await rower("right", phase, SIDE, SIDE_OARS, false)
  await rower("left", phase, flip(SIDE), SIDE_OARS, true)
  await rower("down", phase, END, END_OARS, false)
  await rower("up", phase, END, END_OARS, false)
}
