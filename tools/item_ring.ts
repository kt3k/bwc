// The item ring rule (docs/art-guide.md): every item sprite is wrapped in
// a 1px ring of gray2 just outside its dark outline, like the apple, so
// items stand out on any floor. The ring is the set of opaque pixels
// that touch the outside (the transparent area connected to the sprite's
// border, or the border itself) in 8 directions. Right inside the ring is
// the outline, in black only. An item has no see-through holes: a hole
// (like the key's bow) is filled black.
//
// `deno task check-palette` checks the rule. This script fixes the given
// item sprites: it adds the ring on the transparent pixels around them
// and paints the outline (the pixels right inside the ring, in 4
// directions) and any holes black:
//
// Usage: deno -A tools/item_ring.ts static/item/<name>.png ...
import { Palette } from "../util/palette.ts"
import { decodePng, encodePng } from "./png.ts"

/** Not real items (the placeholder for a missing sprite) */
export const RING_EXEMPT = new Set(["static/item/not-found.png"])

const rgbOf = (hex: string) =>
  [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16))
const ringRgb = rgbOf(Palette.gray2)
const outlineRgb = rgbOf(Palette.black)

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [
  -1,
  -1,
]]

/** Transparent pixels reached from the border without crossing opaque */
function outside(w: number, h: number, rgba: Uint8Array): Uint8Array {
  const out = new Uint8Array(w * h)
  const queue: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1
      if (border && rgba[p * 4 + 3] === 0) {
        out[p] = 1
        queue.push(p)
      }
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const p = queue[q]
    const x = p % w, y = (p / w) | 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const np = ny * w + nx
      if (!out[np] && rgba[np * 4 + 3] === 0) {
        out[np] = 1
        queue.push(np)
      }
    }
  }
  return out
}

/** Whether the pixel at (x, y) touches the outside in 8 directions */
function touchesOutside(
  w: number,
  h: number,
  out: Uint8Array,
  x: number,
  y: number,
): boolean {
  return D8.some(([dx, dy]) => {
    const nx = x + dx, ny = y + dy
    return nx < 0 || ny < 0 || nx >= w || ny >= h || out[ny * w + nx] === 1
  })
}

const isColor = (rgba: Uint8Array, p: number, rgb: number[]) =>
  rgba[p * 4 + 3] !== 0 && rgb.every((v, k) => rgba[p * 4 + k] === v)
const isRing = (rgba: Uint8Array, p: number) => isColor(rgba, p, ringRgb)

/** The ring: the opaque pixels touching the outside */
function ringOf(w: number, h: number, rgba: Uint8Array): Uint8Array {
  const out = outside(w, h, rgba)
  const ring = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (rgba[p * 4 + 3] !== 0 && touchesOutside(w, h, out, x, y)) ring[p] = 1
    }
  }
  return ring
}

/** The outline: the pixels right inside the ring (4 directions) */
function outlineOf(w: number, h: number, rgba: Uint8Array, ring: Uint8Array) {
  const outline: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (rgba[p * 4 + 3] === 0 || ring[p]) continue
      // a ring pixel tucked into a notch (the fish's tail) may stay gray2
      if (isRing(rgba, p)) continue
      if (
        D4.some(([dx, dy]) => {
          const nx = x + dx, ny = y + dy
          return nx >= 0 && ny >= 0 && nx < w && ny < h && ring[ny * w + nx]
        })
      ) outline.push(p)
    }
  }
  return outline
}

/** Transparent pixels enclosed by the item (not reached from outside) */
function holesOf(w: number, h: number, rgba: Uint8Array): number[] {
  const out = outside(w, h, rgba)
  const holes: number[] = []
  for (let p = 0; p < w * h; p++) {
    if (rgba[p * 4 + 3] === 0 && !out[p]) holes.push(p)
  }
  return holes
}

/** The pixels breaking the rule, as "x,y (part)" (empty when it holds) */
export function itemRingErrors(
  w: number,
  h: number,
  rgba: Uint8Array,
): string[] {
  const ring = ringOf(w, h, rgba)
  const errors: string[] = []
  for (let p = 0; p < w * h; p++) {
    if (ring[p] && !isRing(rgba, p)) {
      errors.push(`${p % w},${(p / w) | 0} (ring)`)
    }
  }
  for (const p of outlineOf(w, h, rgba, ring)) {
    if (!isColor(rgba, p, outlineRgb)) {
      errors.push(`${p % w},${(p / w) | 0} (outline)`)
    }
  }
  for (const p of holesOf(w, h, rgba)) {
    errors.push(`${p % w},${(p / w) | 0} (hole)`)
  }
  return errors
}

/** Paints the ring on the outside pixels around the sprite */
export function addItemRing(w: number, h: number, rgba: Uint8Array) {
  const out = outside(w, h, rgba)
  const result = rgba.slice()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (!out[p]) continue
      const nextToItem = D8.some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy
        return nx >= 0 && ny >= 0 && nx < w && ny < h &&
          rgba[(ny * w + nx) * 4 + 3] !== 0 && !isRing(rgba, ny * w + nx)
      })
      if (nextToItem) result.set([...ringRgb, 255], p * 4)
    }
  }
  return result
}

/** Paints the outline (the pixels right inside the ring) and holes black */
export function blackenOutline(w: number, h: number, rgba: Uint8Array) {
  const result = rgba.slice()
  for (const p of holesOf(w, h, rgba)) {
    result.set([...outlineRgb, 255], p * 4)
  }
  for (const p of outlineOf(w, h, rgba, ringOf(w, h, rgba))) {
    result.set([...outlineRgb, 255], p * 4)
  }
  return result
}

if (import.meta.main) {
  for (const path of Deno.args) {
    const { w, h, rgba } = await decodePng(await Deno.readFile(path))
    if (itemRingErrors(w, h, rgba).length === 0) {
      console.log(`${path}: already follows the rule`)
      continue
    }
    const ringed = itemRingErrors(w, h, rgba).some((e) => e.endsWith("(ring)"))
      ? addItemRing(w, h, rgba)
      : rgba
    const fixed = blackenOutline(w, h, ringed)
    const left = itemRingErrors(w, h, fixed)
    if (left.length > 0) {
      console.error(`${path}: can't fix ${left.join(" ")}`)
      Deno.exit(1)
    }
    await Deno.writeFile(path, await encodePng(w, h, fixed))
    console.log(`${path}: fixed (the ring, a black outline, no holes)`)
  }
}
