// Per-cell decoration: everything that makes one 16x16 cell differ from
// its neighbours while staying deterministic. Every choice is seeded by
// the world grid coordinates, so a cell looks the same however often (or
// in whichever chunk) it is drawn.
//
// A cell definition can combine four mechanisms (see docs/art-guide.md):
//
// - `variants`: rare alternative images, picked by weight (percent)
// - `flip`: a random mirror ("h", "v", "hv") or quarter turn ("rot")
// - `noise`: small marks in a color, `color=count[:shape]`, gathered into
//   patches by a smooth low-frequency field instead of an even sprinkle
//   (`noisePatches: false` keeps the even sprinkle)
// - `casts`: a wall; its bottom 2 rows get a black checker where it faces
//   a non-wall cell below, so wall masses get a dark base edge

import type { CanvasWrapper } from "../util/canvas-wrapper.ts"
import { BLOCK_SIZE, CELL_SIZE } from "../util/constants.ts"
import { modulo } from "../util/math.ts"
import { seed } from "../util/random.ts"
import type { CellDefinition, CellFlip } from "./catalog.ts"

export type NoiseShape = "line" | "dot" | "vline" | "speck" | "diag" | "cross"

/** One entry of a parsed `noise` spec: `color=count[:shape]` */
export interface NoiseSpec {
  readonly color: string
  readonly count: number
  readonly shape: NoiseShape
}

const SHAPES: readonly string[] = [
  "line",
  "dot",
  "vline",
  "speck",
  "diag",
  "cross",
]

const noiseCache = new Map<string, NoiseSpec[]>()

/**
 * Parses a `noise` spec. The format is URL query like, one `color=count`
 * pair per mark kind, with an optional `:shape` suffix on the count
 * (default `line`). Example: `#b9bcb9=1&#4a4d4a=2:speck`.
 */
export function parseNoise(spec: string): NoiseSpec[] {
  const cached = noiseCache.get(spec)
  if (cached) return cached
  const out: NoiseSpec[] = []
  for (const [color, value] of new URLSearchParams(spec).entries()) {
    const [countStr, shapeStr] = value.split(":")
    const count = +countStr
    if (!(count > 0)) continue
    const shape = SHAPES.includes(shapeStr) ? shapeStr as NoiseShape : "line"
    out.push({ color, count, shape })
  }
  noiseCache.set(spec, out)
  return out
}

/** The size (in cells) of the patches the noise gathers into */
export const PATCH_PERIOD = 6

/** Integer hash of a lattice point to [0, 1) */
function hash01(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^
    0x9e3779b9
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * A smooth low-frequency field over the world grid in [0, 2] (average 1).
 * Multiplying the noise count by it makes marks cluster into worn patches
 * a few cells wide, with almost clean cells in between.
 */
export function patchFactor(
  i: number,
  j: number,
  period: number = PATCH_PERIOD,
): number {
  const u = i / period
  const v = j / period
  const i0 = Math.floor(u)
  const j0 = Math.floor(v)
  const fu = smooth(u - i0)
  const fv = smooth(v - j0)
  const a = hash01(i0, j0)
  const b = hash01(i0 + 1, j0)
  const c = hash01(i0, j0 + 1)
  const d = hash01(i0 + 1, j0 + 1)
  const top = a + (b - a) * fu
  const bottom = c + (d - c) * fu
  return 2 * (top + (bottom - top) * fv)
}

/**
 * Picks a variant index for the roll `r` in [0, 1), or -1 for the base
 * image. Weights are percents, so `{ "a.png": 5 }` shows `a.png` in about
 * one cell out of twenty.
 */
export function pickVariant(
  variants: readonly { readonly weight: number }[] | undefined,
  r: number,
): number {
  if (!variants) return -1
  // Accumulate in whole percents so 10 + 5 compares exactly against 15
  let acc = 0
  for (let k = 0; k < variants.length; k++) {
    acc += variants[k].weight
    if (r * 100 < acc) return k
  }
  return -1
}

/** The key of a variant image in a block's image map */
export function variantKey(name: string, k: number): string {
  return `${name}#${k}`
}

// Quarter turns as exact integer matrices [a, b, c, d] (no float drift)
const ROT: readonly [number, number, number, number][] = [
  [1, 0, 0, 1],
  [0, 1, -1, 0],
  [-1, 0, 0, -1],
  [0, -1, 1, 0],
]

/**
 * Picks the 2x2 transform matrix [a, b, c, d] for the cell image: a
 * mirror for "h" / "v" / "hv", a quarter turn for "rot", identity otherwise.
 */
export function pickTransform(
  flip: CellFlip | undefined,
  randomInt: (n: number) => number,
): [number, number, number, number] {
  let sx = 1
  let sy = 1
  let k = 0
  if (flip === "h" || flip === "hv") sx = randomInt(2) ? -1 : 1
  if (flip === "v" || flip === "hv") sy = randomInt(2) ? -1 : 1
  if (flip === "rot") k = randomInt(4)
  const [a, b, c, d] = ROT[k]
  return [a * sx, b * sx, c * sy, d * sy]
}

/**
 * The base edge of a casting cell where it faces a floor, as the black
 * pixels of its bottom rows: a checker, so the bottom row is black on the
 * even columns and the row above it on the odd columns.
 */
export function edgePixels(): [x: number, y: number][] {
  const out: [number, number][] = []
  for (let x = 0; x < CELL_SIZE; x++) {
    out.push([x, x % 2 === 0 ? CELL_SIZE - 1 : CELL_SIZE - 2])
  }
  return out
}

/** The color of the base edge */
const EDGE_COLOR = "#000000"

function drawMark(
  wrapper: CanvasWrapper,
  x: number,
  y: number,
  color: string,
  shape: NoiseShape,
  randomInt: (n: number) => number,
) {
  switch (shape) {
    case "line": {
      const w = randomInt(3) + 1
      wrapper.drawRect(
        x + randomInt(15 - w) + 1,
        y + randomInt(14) + 1,
        w,
        1,
        color,
      )
      break
    }
    case "dot":
      wrapper.drawRect(
        x + randomInt(14) + 1,
        y + randomInt(14) + 1,
        1,
        1,
        color,
      )
      break
    case "vline": {
      const h = randomInt(3) + 1
      wrapper.drawRect(
        x + randomInt(14) + 1,
        y + randomInt(15 - h) + 1,
        1,
        h,
        color,
      )
      break
    }
    case "speck": {
      // a 2x1 mark with one pixel hanging below: a pebble / a leaf
      const px = x + randomInt(13) + 1
      const py = y + randomInt(13) + 1
      wrapper.drawRect(px, py, 2, 1, color)
      wrapper.drawRect(px + randomInt(2), py + 1, 1, 1, color)
      break
    }
    case "diag": {
      // a 3 pixel diagonal, either direction: a crack / a scratch
      const px = x + randomInt(12) + 1
      const py = y + randomInt(12) + 1
      const dir = randomInt(2)
      for (let t = 0; t < 3; t++) {
        wrapper.drawRect(px + (dir ? t : 2 - t), py + t, 1, 1, color)
      }
      break
    }
    case "cross": {
      const px = x + randomInt(12) + 1
      const py = y + randomInt(12) + 1
      wrapper.drawRect(px, py + 1, 3, 1, color)
      wrapper.drawRect(px + 1, py, 1, 3, color)
      break
    }
  }
}

/**
 * Draws a cell at its place in the block canvas.
 *
 * @param i world grid column
 * @param j world grid row
 * @param imgMap the block's image map (base images and variants)
 * @param south the cell below, when known, for the base edge of walls
 */
export function drawCell(
  wrapper: CanvasWrapper,
  i: number,
  j: number,
  cell: CellDefinition,
  imgMap: Record<string, ImageBitmap>,
  south?: CellDefinition,
): void {
  const x = modulo(i, BLOCK_SIZE) * CELL_SIZE
  const y = modulo(j, BLOCK_SIZE) * CELL_SIZE
  const { rng, randomInt } = seed(`${i}.${j}`)
  const k = pickVariant(cell.variants, rng())
  const image = (k >= 0 ? imgMap[variantKey(cell.name, k)] : undefined) ??
    imgMap[cell.name]
  if (!image) return
  const ctx = wrapper.ctx
  const [a, b, c, d] = pickTransform(cell.flip, randomInt)
  ctx.save()
  ctx.setTransform(a, b, c, d, x + CELL_SIZE / 2, y + CELL_SIZE / 2)
  ctx.drawImage(image, -CELL_SIZE / 2, -CELL_SIZE / 2)
  ctx.restore()
  if (cell.noise) {
    const factor = cell.noisePatches === false ? 1 : patchFactor(i, j)
    for (const { color, count, shape } of parseNoise(cell.noise)) {
      const n = Math.floor(count * factor + rng())
      for (let m = 0; m < n; m++) {
        drawMark(wrapper, x, y, color, shape, randomInt)
      }
    }
  }
  if (cell.casts && south && !south.casts) {
    for (const [px, py] of edgePixels()) {
      wrapper.drawRect(x + px, y + py, 1, 1, EDGE_COLOR)
    }
  }
}
