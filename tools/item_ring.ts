// The item ring rule (docs/art-guide.md): every item sprite is wrapped in
// a 1px ring of gray2 just outside its dark outline, like the apple, so
// items stand out on any floor. The ring is the set of opaque pixels
// that touch the outside (the transparent area connected to the sprite's
// border, or the border itself) in 8 directions; holes inside the item
// (the key's bow) stay transparent.
//
// `deno task check-palette` checks the rule. This script adds the ring
// to the given item sprites (on the transparent pixels around them):
//
// Usage: deno -A tools/item_ring.ts static/item/<name>.png ...
import { Palette } from "../util/palette.ts"
import { decodePng, encodePng } from "./png.ts"

/** Not real items (the placeholder for a missing sprite) */
export const RING_EXEMPT = new Set(["static/item/not-found.png"])

const RING = Palette.gray2
const ringRgb = [1, 3, 5].map((k) => parseInt(RING.slice(k, k + 2), 16))

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

const isRing = (rgba: Uint8Array, p: number) =>
  rgba[p * 4 + 3] !== 0 &&
  ringRgb.every((v, k) => rgba[p * 4 + k] === v)

/** The pixels breaking the rule, as "x,y" (empty when it holds) */
export function itemRingErrors(
  w: number,
  h: number,
  rgba: Uint8Array,
): string[] {
  const out = outside(w, h, rgba)
  const errors: string[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (rgba[p * 4 + 3] === 0) continue
      if (touchesOutside(w, h, out, x, y) && !isRing(rgba, p)) {
        errors.push(`${x},${y}`)
      }
    }
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

if (import.meta.main) {
  for (const path of Deno.args) {
    const { w, h, rgba } = await decodePng(await Deno.readFile(path))
    if (itemRingErrors(w, h, rgba).length === 0) {
      console.log(`${path}: already ringed`)
      continue
    }
    const ringed = addItemRing(w, h, rgba)
    const left = itemRingErrors(w, h, ringed)
    if (left.length > 0) {
      console.error(`${path}: no room for the ring at ${left.join(" ")}`)
      Deno.exit(1)
    }
    await Deno.writeFile(path, await encodePng(w, h, ringed))
    console.log(`${path}: ringed`)
  }
}
