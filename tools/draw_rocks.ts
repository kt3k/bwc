// Draws the rocks of the WILDS (T.ROCK, tools/generate_wilds.ts): a lone
// rock is a crag, a cone of broken planes, lit on the left and dark on the
// right; rocks side by side join into one outcrop, a flat top with a few
// crevices and a front face only where the ground below is open (a 3/4
// view, docs/art-guide.md). The pushable boulder is round and grey, so the
// rocks that don't move are angular and never round.
//
// The outcrop has a cell for each way it joins its neighbours, by the mask
// n=1, e=2, s=4, w=8 (rock_<mask>.png); the lone crag is rock_0.png. The
// generator writes each rock cell's character by its mask (ROCK_CELLS).
//
// Usage: deno -A tools/draw_rocks.ts
import { Palette, type PaletteColor } from "../util/palette.ts"
import { decodePng, encodePng } from "./png.ts"

const root = new URL("../static/cell/", import.meta.url).pathname
const N = 16

const COLORS: Record<string, PaletteColor> = {
  W: Palette.white,
  "1": Palette.gray1,
  "2": Palette.gray2,
  "3": Palette.gray3,
  "4": Palette.gray4,
  K: Palette.black,
}

const hex = (c: PaletteColor) =>
  [1, 3, 5].map((s) => parseInt(c.slice(s, s + 2), 16))

/** The lone rock: a crag */
const CRAG = [
  "......K.........",
  ".....K1K...K....",
  ".....KW3K.K1K...",
  "....KW23KKW13K..",
  "....KW234K2334K.",
  "...KW2234KW2344K",
  "...KW2334K22344K",
  "..KW22334K23344K",
  "..KW23344223444K",
  ".KW223344K23444K",
  ".KW2233444233444",
  "KW22334444333444",
  "K2233344443344K.",
  "K3333444444444K.",
  ".KKKKKKKKKKKKK..",
  "................",
]

/** A small seeded random (the same cells every run) */
function rand(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * A cell of the outcrop joined on the sides of the mask: its flat top,
 * and a front face where it doesn't join below. Open edges are lit
 * (white) on the top and the left, dark on the right and at the foot,
 * with black outside;
 * corners open on two sides are cut off. Variant 0 is plain, the others
 * have a crevice, lit on its left, and their own streaks down the face.
 */
export function outcrop(mask: number, variant = 0): string[] {
  const n = !!(mask & 1), e = !!(mask & 2), s = !!(mask & 4), w = !!(mask & 8)
  const rnd = rand(mask * 92821 + variant * 6151 + 7)
  const pick = (k: number) => Math.floor(rnd() * k)
  const px: string[][] = Array.from({ length: N }, () => Array(N).fill("2"))
  const face = s ? 0 : 7
  const topH = N - face
  // a few flecks
  for (let k = 0; k < 4; k++) {
    px[1 + pick(topH - 2)][1 + pick(N - 2)] = rnd() < 0.5 ? "1" : "3"
  }
  // a crevice, wandering down to the right, lit on its left
  if (variant > 0) {
    let x = 3 + pick(8), y = 2 + pick(Math.max(1, topH - 8))
    const len = 4 + pick(4)
    for (let k = 0; k < len; k++) {
      if (x > 0 && x < N - 1 && y > 0 && y < topH - 1) {
        px[y][x] = "4"
        if (px[y][x - 1] === "2") px[y][x - 1] = "W"
      }
      x += pick(3) === 0 ? 0 : 1
      y++
    }
  }
  // the face: streaks down it, each its own length, a lit one now and
  // then, the foot black
  const streaks: number[] = Array(N).fill(-1)
  for (let x = 1 + pick(3); x < N - 1; x += 3 + pick(3)) streaks[x] = pick(4)
  for (let y = topH; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const fy = y - topH
      let c = "3"
      if (streaks[x] >= 0 && fy >= 1 + streaks[x] % 2 && fy < face - 1) c = "4"
      if (streaks[x + 1] >= 0 && fy >= 2 && fy < face - 2 && x % 2 === 0) {
        c = "2"
      }
      if (fy === face - 1) c = "K"
      px[y][x] = c
    }
  }
  // the open edges: black outside, lit inside on the top and the left
  if (!s) { for (let x = 0; x < N; x++) px[topH - 1][x] = "1" }
  if (!n) {
    for (let x = 0; x < N; x++) {
      px[0][x] = "K"
      px[1][x] = "W"
    }
  }
  if (!w) {
    for (let y = 0; y < N; y++) {
      px[y][0] = "K"
      if (y > (n ? -1 : 0) && y < topH) px[y][1] = "W"
    }
  }
  if (!e) {
    for (let y = 0; y < N; y++) {
      px[y][N - 1] = "K"
      if (y > (n ? -1 : 0) && y < topH) px[y][N - 2] = "4"
    }
  }
  // corners open on two sides, cut off
  if (!n && !w) {
    px[0][0] = px[0][1] = px[1][0] = "."
    px[1][1] = "K"
  }
  if (!n && !e) {
    px[0][N - 1] = px[0][N - 2] = px[1][N - 1] = "."
    px[1][N - 2] = "K"
  }
  if (!s && !w) px[N - 1][0] = "."
  if (!s && !e) px[N - 1][N - 1] = "."
  return px.map((r) => r.join(""))
}

/** The outcrop cells drawn for each mask (the plain one and its variants) */
export const VARIANTS = 3

/** The rows painted over the ground (`.` lets the ground show) */
function paint(ground: Uint8Array, rows: readonly string[]): Uint8Array {
  const out = new Uint8Array(ground)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = COLORS[rows[y][x]]
      if (c) out.set([...hex(c), 255], (y * N + x) * 4)
    }
  }
  return out
}

if (import.meta.main) {
  const meadow = (await decodePng(await Deno.readFile(root + "floor5.png")))
    .rgba
  const names: string[] = []
  for (let mask = 0; mask < 16; mask++) {
    for (let v = 0; v < (mask === 0 ? 1 : VARIANTS); v++) {
      const rows = mask === 0 ? CRAG : outcrop(mask, v)
      const name = v === 0 ? `rock_${mask}.png` : `rock_${mask}_${v}.png`
      await Deno.writeFile(
        root + name,
        await encodePng(N, N, paint(meadow, rows)),
      )
      names.push(name)
    }
  }
  console.log(names.map((n) => "cell/" + n).join(" "))
}
