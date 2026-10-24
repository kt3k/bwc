// Draws the unreadable letters (model/glyph.ts): small slabs of black
// stone like the Rosetta Stone, each with one strange sign carved into
// it, after the scripts nobody can read (the Voynich manuscript, Linear
// A). The signs are not any real script's: a few strokes each, hooks,
// loops, gallows and combs, so that they look like writing and say
// nothing.
//
// The slab is plain black, 10x10 with its four corners chipped, and the
// sign is carved in pale gray (gray1). Every sign is 6x6: an even size in
// the even face, so each sits right in the middle with 2 pixels all
// round. The item rules (docs/art-guide.md) hold as they are: the slab's
// edge is black (its outline) and the gray2 ring outside it
// (tools/item_ring.ts) shows the black slab on the ground; with the ring
// the letter is a 12x12 square. Black is its main color (the pickup
// lines).
//
// Writes static/item/glyph-<n>.png for each sign, and adds the items to
// the catalog. Then run `deno -A tools/item_colors.ts`.
//
// Usage: deno -A tools/draw_glyphs.ts [preview.png]
import { Palette } from "../util/palette.ts"
import { GLYPH_COUNT, glyphType } from "../model/glyph.ts"
import { addItemRing } from "./item_ring.ts"
import { encodePng } from "./png.ts"

const N = 16

/** The carved sign */
const CARVE = Palette.gray1
/** The stone */
const STONE = Palette.black

/** The slab: 10x10, its corners chipped */
const TABLET = [
  "................",
  "................",
  "................",
  "....BBBBBBBB....",
  "...BBBBBBBBBB...",
  "...BBBBBBBBBB...",
  "...BBBBBBBBBB...",
  "...BBBBBBBBBB...",
  "...BBBBBBBBBB...",
  "...BBBBBBBBBB...",
  "...BBBBBBBBBB...",
  "...BBBBBBBBBB...",
  "...BBBBBBBBBB...",
  "....BBBBBBBB....",
  "................",
  "................",
]
/** The face of the slab the sign is centered in (x, y, w, h) */
const FACE = { x: 3, y: 3, w: 10, h: 10 }
/** The size of every sign */
export const SIGN = 6

/** The signs, `#` a cut. Each is 6x6, using its full width and height */
export const GLYPHS: string[][] = [
  // a trident on a foot
  ["#.##.#", "#.##.#", ".####.", "..##..", "..##..", ".####."],
  // an eye
  ["..##..", ".#..#.", "#.##.#", "#.##.#", ".#..#.", "..##.."],
  // a ladder
  ["#....#", "######", "#....#", "######", "#....#", "#....#"],
  // a hook with a loop (the Voynich 9)
  [".####.", "#....#", ".#####", ".....#", "....#.", ".###.."],
  // two loops and a tail
  [".##...", "#..#..", ".##...", "#..#..", ".###..", "....##"],
  // a square spiral
  ["######", "#....#", "#.##.#", "#.#..#", "#.####", "#....."],
  // an arrow with a crossbar
  ["..##..", ".####.", "#.##.#", "######", "..##..", "..##.."],
  // a figure with arms
  ["#....#", "######", "..##..", "..##..", ".#..#.", "#....#"],
  // a vessel with handles
  ["#....#", ".#..#.", ".####.", "#....#", "#....#", ".####."],
  // a lightning stroke
  ["....##", "...##.", "..####", "####..", ".##...", "##...."],
  // a crossed box with a tail
  ["######", "##..##", "#.##.#", "##..##", "######", "..##.."],
  // a wheel
  [".####.", "#.##.#", "######", "######", "#.##.#", ".####."],
  // an hourglass
  ["######", ".#..#.", "..##..", "..##..", ".#..#.", "######"],
  // a sun
  ["#.##.#", ".####.", "##..##", "##..##", ".####.", "#.##.#"],
  // two chevrons
  ["#....#", ".#..#.", "..##..", "#....#", ".#..#.", "..##.."],
  // a gallows (the Voynich k)
  [".#...#", ".#..#.", ".####.", "##..##", ".#..#.", ".####."],
  // a moon struck through
  ["..####", ".#....", "#.####", "#.....", ".#....", "..####"],
  // three dots over a post
  ["#.##.#", "......", "######", "..##..", ".#..#.", "#....#"],
  // a gate
  ["..##..", ".#..#.", "######", "#.##.#", "#.##.#", "#.##.#"],
  // a fork down
  ["..##..", "..##..", "######", "#.##.#", "#.##.#", "#....#"],
  // a six-armed star
  ["#....#", ".#..#.", "######", "######", ".#..#.", "#....#"],
  // a post with hooks
  ["#.##.#", "#.##.#", ".####.", "..##..", ".####.", "#....#"],
  // a boat with a sail
  ["..##..", ".###..", "#.##..", "..##..", "######", ".####."],
  // two rings
  [".####.", "#....#", ".####.", ".####.", "#....#", ".####."],
]

/** The sprite of the n-th sign (RGBA, the item rules applied) */
export function glyphSprite(n: number): Uint8Array {
  const sign = GLYPHS[n]
  if (sign.length !== SIGN || sign.some((row) => row.length !== SIGN)) {
    throw new Error(`glyph ${n} is not ${SIGN}x${SIGN}`)
  }
  const x0 = FACE.x + (FACE.w - SIGN) / 2
  const y0 = FACE.y + (FACE.h - SIGN) / 2
  const rgba = new Uint8Array(N * N * 4)
  const paint = (x: number, y: number, c: string) =>
    rgba.set(
      [...[1, 3, 5].map((s) => parseInt(c.slice(s, s + 2), 16)), 255],
      (y * N + x) * 4,
    )
  TABLET.forEach((row, y) =>
    [...row].forEach((c, x) => c === "B" && paint(x, y, STONE))
  )
  sign.forEach((row, y) =>
    [...row].forEach((c, x) => c === "#" && paint(x0 + x, y0 + y, CARVE))
  )
  return addItemRing(N, N, rgba)
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
  // a preview sheet of all the signs, 6x, on gray (for a look)
  const out = Deno.args[0]
  if (out) {
    const S = 6, COLS = 8, ROWS = Math.ceil(GLYPH_COUNT / COLS)
    const W = COLS * 18 * S, H = ROWS * 18 * S
    const sheet = new Uint8Array(W * H * 4)
    for (let k = 0; k < W * H; k++) sheet.set([0x6a, 0x6d, 0x6a, 255], k * 4)
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
