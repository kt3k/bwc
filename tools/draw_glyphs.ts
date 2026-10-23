// Draws the unreadable letters (model/glyph.ts): small clay tablets, each
// with one strange sign cut into it, after the scripts nobody can read
// (the Voynich manuscript, Linear A). The signs are not any real
// script's: a few strokes each, hooks, loops, gallows and combs, so that
// they look like writing and say nothing. Each sign is at most 6x8 and
// sits in the middle of the tablet.
//
// The tablet is clay lit from the top left (orange1 / orange2 / orange3),
// the top right corner chipped off, the cuts in orange4. The item rules
// (docs/art-guide.md) are applied here: the black outline and the gray2
// ring outside it (tools/item_ring.ts).
//
// Writes static/item/glyph-<n>.png for each sign, and adds the items to
// the catalog. Then run `deno -A tools/item_colors.ts`.
//
// Usage: deno -A tools/draw_glyphs.ts [preview.png]
import { Palette, type PaletteColor } from "../util/palette.ts"
import { GLYPH_COUNT, glyphType } from "../model/glyph.ts"
import { addItemRing, blackenOutline } from "./item_ring.ts"
import { encodePng } from "./png.ts"

const N = 16

const INK: Record<string, PaletteColor | null> = {
  ".": null,
  K: Palette.black,
  L: Palette.orange1,
  B: Palette.orange2,
  S: Palette.orange3,
}

/** The tablet: chipped at the top right, the cuts go in the B area */
const TABLET = [
  "................",
  "..KKKKKKKKKK....",
  "..KLLLLLLLLKK...",
  "..KLBBBBBBBBSK..",
  "..KLBBBBBBBBSK..",
  "..KLBBBBBBBBSK..",
  "..KLBBBBBBBBSK..",
  "..KLBBBBBBBBSK..",
  "..KLBBBBBBBBSK..",
  "..KLBBBBBBBBSK..",
  "..KLBBBBBBBBSK..",
  "..KLBBBBBBBBSK..",
  "..KLBBBBBBBBSK..",
  "..KSSSSSSSSSSK..",
  "..KKKKKKKKKKKK..",
  "................",
]
/** The face of the tablet the sign is centered in (x, y, w, h) */
const FACE = { x: 4, y: 3, w: 8, h: 10 }

/** The signs, `#` a cut. At most 6 wide and 8 high */
export const GLYPHS: string[][] = [
  // a trident on a foot
  ["#.#.#", "#.#.#", "#.#.#", ".###.", "..#..", "..#..", "..#..", ".###."],
  // an eye
  ["..##..", ".#..#.", "#.##.#", "#.##.#", ".#..#.", "..##.."],
  // a ladder
  ["#...#", "#####", "#...#", "#####", "#...#", "#####", "#...#", "#...#"],
  // a hook with a loop (the Voynich 9)
  [".###.", "#...#", "#...#", ".####", "....#", "....#", "...#.", ".##.."],
  // two loops and a tail
  [
    ".##...",
    "#..#..",
    ".##...",
    "#..#..",
    "#..#..",
    ".###..",
    "...##.",
    "....##",
  ],
  // a square spiral
  ["#####.", "#...#.", "#.#.#.", "#.#.#.", "#.###.", "#.....", "######"],
  // an arrow with a crossbar
  ["..#..", ".###.", "#.#.#", "..#..", "#####", "..#..", "..#..", "..#.."],
  // a rake
  ["#####", "#.#.#", "#.#.#", "#....", "#....", "#....", "##..."],
  // a vessel with handles
  ["#....#", ".#..#.", ".####.", "#....#", "#....#", "#....#", ".####."],
  // a lightning stroke
  ["....#", "...#.", "..#..", ".####", "...#.", "..#..", ".#...", "#...."],
  // a crossed box with a tail
  [
    "######",
    "##...#",
    "#.#..#",
    "#..#.#",
    "#...##",
    "######",
    "..#...",
    ".##...",
  ],
  // a wheel
  [".####.", "#..#.#", "#..#.#", "######", "#..#.#", "#..#.#", ".####."],
  // an hourglass
  ["######", ".#..#.", "..##..", "..##..", ".#..#.", "######"],
  // a backward hook over dots
  ["####..", "...#..", ".###.#", ".#....", ".####.", "......", "#.#.#."],
  // two chevrons
  ["#....#", ".#..#.", "..##..", "......", "#....#", ".#..#.", "..##.."],
  // a gallows (the Voynich k)
  [".#...#", ".#..#.", ".####.", "##..##", ".#..#.", ".####."],
  // a moon struck through
  ["..###", ".#...", "#....", "#.###", "#....", ".#...", "..###"],
  // three dots over a post
  ["#.#.#", ".....", "#####", "..#..", "..#..", ".#.#.", "#...#"],
  // a gate
  ["..#..", ".#.#.", "#...#", "#####", "#.#.#", "#.#.#", "#.#.#"],
  // a fork down
  ["..#..", "..#..", "..#..", "#####", "#.#.#", "#.#.#", "#...#"],
  // a six-armed star
  ["#...#", ".#.#.", "..#..", "#####", "..#..", ".#.#.", "#...#"],
  // a post with hooks
  ["..#..", "#.#.#", "#.#.#", ".###.", "..#..", ".###.", "#...#"],
  // a boat with a mast
  ["...#..", "..##..", ".#.#..", "...#..", "#..#.#", ".####."],
  // two rings on a stalk
  [".##...", "#..#..", ".##...", "...#..", "...##.", "..#..#", "...##."],
]

/** The sprite of the n-th sign (RGBA, the item rules applied) */
export function glyphSprite(n: number): Uint8Array {
  const sign = GLYPHS[n]
  const w = Math.max(...sign.map((row) => row.length))
  const h = sign.length
  if (w > 6 || h > 8) throw new Error(`glyph ${n} is ${w}x${h}`)
  const x0 = FACE.x + Math.floor((FACE.w - w) / 2)
  const y0 = FACE.y + Math.floor((FACE.h - h) / 2)
  const px = TABLET.flatMap((row) => [...row].map((c) => INK[c]))
  sign.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === "#") px[(y0 + y) * N + x0 + x] = Palette.orange4
    })
  )
  const rgba = new Uint8Array(N * N * 4)
  px.forEach((c, k) => {
    if (!c) return
    rgba.set(
      [...[1, 3, 5].map((s) => parseInt(c.slice(s, s + 2), 16)), 255],
      k * 4,
    )
  })
  return blackenOutline(N, N, addItemRing(N, N, rgba))
}

if (import.meta.main) {
  if (GLYPHS.length !== GLYPH_COUNT) {
    throw new Error(`${GLYPHS.length} glyphs, GLYPH_COUNT is ${GLYPH_COUNT}`)
  }
  const root = new URL("../static/", import.meta.url)
  for (let n = 0; n < GLYPH_COUNT; n++) {
    const path = `item/${glyphType(n)}.png`
    await Deno.writeFile(
      new URL(path, root),
      await encodePng(N, N, glyphSprite(n)),
    )
    console.log(path)
  }
  // the catalog: one item per sign, picked up as a "glyph"
  const catalogPath = new URL("catalog/base.json", root)
  const catalog = JSON.parse(await Deno.readTextFile(catalogPath))
  for (let n = 0; n < GLYPH_COUNT; n++) {
    const type = glyphType(n)
    catalog.items[type] = {
      collect: "glyph",
      src: `../item/${type}.png`,
      ...(catalog.items[type]?.color
        ? { color: catalog.items[type].color }
        : {}),
    }
  }
  await Deno.writeTextFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n")
  // a preview sheet of all the signs, 4x, on white (for a look)
  const out = Deno.args[0]
  if (out) {
    const S = 4, COLS = 8, ROWS = Math.ceil(GLYPH_COUNT / COLS)
    const W = COLS * 18 * S, H = ROWS * 18 * S
    const sheet = new Uint8Array(W * H * 4).fill(255)
    for (let n = 0; n < GLYPH_COUNT; n++) {
      const rgba = glyphSprite(n)
      const ox = (n % COLS) * 18 + 1, oy = Math.floor(n / COLS) * 18 + 1
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const k = (y * N + x) * 4
          if (!rgba[k + 3]) continue
          for (let dy = 0; dy < S; dy++) {
            for (let dx = 0; dx < S; dx++) {
              const p = ((oy + y) * S + dy) * W + (ox + x) * S + dx
              sheet.set(rgba.subarray(k, k + 4), p * 4)
            }
          }
        }
      }
    }
    await Deno.writeFile(out, await encodePng(W, H, sheet))
    console.log(out)
  }
}
