// Draws the sprites of the ferries (model/ferry.ts): the boat moored at a
// landing, lying along the river (across or down) and the rings left on
// the water when it is out, and the rowboat the player rides in, kimi's
// head in the hull with the oars at two strokes, for each direction. The
// boats are larger than a cell (24 pixels long), drawn centered on it.
// All in the grays (docs/art-guide.md).
//
// Usage: deno -A tools/draw_ferry.ts
import { Palette, type PaletteColor } from "../util/palette.ts"
import { picture, write } from "./draw_waystones.ts"
import { decodePng, encodePng } from "./png.ts"

const root = new URL("../static/", import.meta.url).pathname
type Px = PaletteColor | null

/** A picture of w x h pixels to paint on */
class Canvas {
  px: Px[]
  constructor(readonly w: number, readonly h: number) {
    this.px = Array(w * h).fill(null)
  }
  set(x: number, y: number, c: Px) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h && c) {
      this.px[y * this.w + x] = c
    }
  }
  get(x: number, y: number): Px {
    return this.px[y * this.w + x]
  }
  /** Pastes a 16x16 picture (its rows from `from` to `to`) at (x, y) */
  paste(src: Px[], x: number, y: number, from = 0, to = 16) {
    for (let v = from; v < to; v++) {
      for (let u = 0; u < 16; u++) {
        this.set(x + u, y + v - from, src[v * 16 + u])
      }
    }
  }
  mirrored(): Canvas {
    const out = new Canvas(this.w, this.h)
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        out.set(this.w - 1 - x, y, this.get(x, y))
      }
    }
    return out
  }
  async write(path: string) {
    const rgba = new Uint8Array(this.w * this.h * 4)
    this.px.forEach((c, k) => {
      if (!c) return
      rgba.set(
        [...[1, 3, 5].map((s) => parseInt(c.slice(s, s + 2), 16)), 255],
        k * 4,
      )
    })
    await Deno.writeFile(root + path, await encodePng(this.w, this.h, rgba))
    console.log(path)
  }
}

/** The half breadth of a hull `len` long at `t` along it: pointed ends */
const breadth = (t: number, len: number, half: number) =>
  half - Math.max(0, 4 - Math.min(t, len - 1 - t))

/**
 * A hull from above, `len` long and 2 * half broad, along x (across) or
 * along y (down): the black outline, a pale rim inside it, the dark
 * bottom and two thwarts
 */
function hullFromAbove(
  c: Canvas,
  x0: number,
  y0: number,
  len: number,
  half: number,
  across: boolean,
) {
  const inHull = (t: number, s: number) => {
    if (t < 0 || t >= len) return false
    const b = breadth(t, len, half)
    return s >= half - b && s < half + b
  }
  const ring = (t: number, s: number, f: (t: number, s: number) => boolean) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dt, ds]) => f(t + dt, s + ds))
  const isEdge = (t: number, s: number) =>
    inHull(t, s) && ring(t, s, (a, b) => !inHull(a, b))
  const thwarts = [Math.floor(len / 3), len - 1 - Math.floor(len / 3)]
  for (let t = 0; t < len; t++) {
    for (let s = 0; s < 2 * half; s++) {
      if (!inHull(t, s)) continue
      const ink = isEdge(t, s)
        ? Palette.black
        : ring(t, s, isEdge)
        ? Palette.gray2
        : thwarts.includes(t)
        ? Palette.gray4
        : Palette.gray3
      if (across) c.set(x0 + t, y0 + s, ink)
      else c.set(x0 + s, y0 + t, ink)
    }
  }
}

/** The hull from the side, 24 long, the bow to the right (rows y0..) */
function hullFromSide(c: Canvas, y0: number) {
  const K = Palette.black
  // the bow post
  c.set(22, y0, K)
  c.set(23, y0, K)
  for (let x = 0; x < 23; x++) c.set(x, y0 + 1, K)
  c.set(23, y0 + 1, K)
  c.set(22, y0 + 1, Palette.gray2)
  const rows = [[0, 22], [1, 21], [2, 20]]
  rows.forEach(([a, b], n) => {
    const y = y0 + 2 + n
    c.set(a, y, K)
    c.set(b, y, K)
    for (let x = a + 1; x < b; x++) {
      c.set(x, y, n === 0 ? Palette.gray2 : Palette.gray3)
    }
  })
  for (let x = 3; x < 20; x++) c.set(x, y0 + 5, K)
}

/** kimi's frame, as palette colors */
async function kimi(name: string): Promise<Px[]> {
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

const W = Palette.white

// the rower going right or left: 24 x 20, the head over a side hull
async function sideways(dir: "right" | "left", phase: 0 | 1) {
  let hull = new Canvas(24, 20)
  hullFromSide(hull, 12)
  // the oar, dipping behind (0) or pulled forward (1)
  const oar = phase === 0
    ? [[8, 13], [7, 14], [6, 15], [5, 16], [4, 17], [5, 17]]
    : [[10, 13], [11, 14], [12, 15], [13, 16], [14, 17], [13, 17]]
  for (const [x, y] of oar) hull.set(x, y, W)
  if (dir === "left") hull = hull.mirrored()
  // the head first, the hull over it (its gunwale hides the chin)
  const c = new Canvas(24, 20)
  c.paste(await kimi(`${dir}0`), 4, 3, 0, 10)
  hull.px.forEach((ink, k) => {
    if (ink) c.px[k] = ink
  })
  await c.write(`actor/rowboat/${dir}${phase}.png`)
}

// the rower going down or up: 20 x 24, the hull from above, the head in
// its middle, the oars out to the sides
async function lengthwise(dir: "down" | "up", phase: 0 | 1) {
  const c = new Canvas(20, 24)
  hullFromAbove(c, 3, 0, 24, 7, false)
  const head = await kimi(`${dir}0`)
  c.paste(head, 2, 5, 0, 11)
  const oar = phase === 0 ? [[0, 9], [1, 10], [2, 11]] : [[0, 15], [1, 14], [
    2,
    13,
  ]]
  for (const [x, y] of oar) {
    c.set(x, y, W)
    c.set(19 - x, y, W)
  }
  await c.write(`actor/rowboat/${dir}${phase}.png`)
}

// the boat moored, empty: across the river (24 x 16) and down it (16 x 20)
{
  const across = new Canvas(24, 16)
  hullFromAbove(across, 0, 3, 24, 5, true)
  await across.write("prop/ferry.png")
  const down = new Canvas(16, 20)
  hullFromAbove(down, 3, 0, 20, 5, false)
  await down.write("prop/ferry_v.png")
}

// the boat is out: rings on the water where it lay
await write(
  "prop/ferry_out.png",
  picture([
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
  ]),
)
await Deno.mkdir(`${root}actor/rowboat`, { recursive: true })
for (const phase of [0, 1] as const) {
  await sideways("right", phase)
  await sideways("left", phase)
  await lengthwise("down", phase)
  await lengthwise("up", phase)
}
