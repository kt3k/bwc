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

/**
 * A rowboat seen from above and a little to the south, after the boats of
 * minzinn's "Pixel Boats"
 * (https://minzinn.itch.io/pixel-boats-top-down-game-assets-32x32-64x64-pixel-art-free,
 * looked at, not copied): a pale gunwale all round, the far
 * inner side in shadow, the dark floor crossed by pale thwarts, a pointed
 * bow and a rounded stern, the near side of the hull showing below the
 * gunwale, and foam where it sits on the water.
 *
 * It is `len` long and 2 * half broad, laid across (along x) or down
 * (along y) from (x0, y0), its bow toward `bow`. Returns the rows of the
 * near side (drawn again over a rower).
 */
function rowboat(
  c: Canvas,
  x0: number,
  y0: number,
  len: number,
  half: number,
  bow: "right" | "left" | "up" | "down",
  foam = true,
): Set<number> {
  const across = bow === "right" || bow === "left"
  /** The half breadth at t (0 the stern, len - 1 the bow) */
  const breadth = (t: number) => {
    const d = len - 1 - t
    if (t === 0) return half - 2
    if (t === 1) return half - 1
    // the bow narrows over its last cells, two at a time
    return Math.min(half, 1 + Math.floor(d / 2))
  }
  const at = (t: number, s: number): [number, number] => {
    const u = bow === "right" || bow === "down" ? t : len - 1 - t
    return across ? [x0 + u, y0 + s] : [x0 + s, y0 + u]
  }
  const key = (x: number, y: number) => y * c.w + x
  const deck = new Map<number, [number, number]>() // pixel -> [t, s]
  for (let t = 0; t < len; t++) {
    const b = breadth(t)
    for (let s = half - b; s < half + b; s++) {
      const [x, y] = at(t, s)
      deck.set(key(x, y), [t, s])
    }
  }
  const inDeck = (x: number, y: number) => deck.has(key(x, y))
  // the near side: two rows under the lowest gunwale of each column
  const side = new Map<number, number>() // pixel -> row below the deck
  const bottom = new Map<number, number>()
  for (const k of deck.keys()) {
    const x = k % c.w, y = Math.floor(k / c.w)
    bottom.set(x, Math.max(bottom.get(x) ?? -1, y))
  }
  for (const [x, yb] of bottom) {
    side.set(key(x, yb + 1), 1)
    side.set(key(x, yb + 2), 2)
  }
  const hull = (x: number, y: number) => inDeck(x, y) || side.has(key(x, y))
  const near4 = (x: number, y: number, f: (x: number, y: number) => boolean) =>
    f(x + 1, y) || f(x - 1, y) || f(x, y + 1) || f(x, y - 1)
  const isRim = (x: number, y: number) =>
    inDeck(x, y) && near4(x, y, (a, b) => !inDeck(a, b))
  const thwarts = [Math.round(len * 0.3), Math.round(len * 0.6)]
  const nearRows = new Set<number>()
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (!hull(x, y)) {
        if (near4(x, y, hull)) c.set(x, y, Palette.black)
        continue
      }
      const k = key(x, y)
      if (side.has(k)) {
        c.set(x, y, side.get(k) === 1 ? Palette.gray3 : Palette.gray4)
        nearRows.add(y)
        continue
      }
      const [t] = deck.get(k)!
      if (isRim(x, y)) {
        c.set(x, y, Palette.gray1)
        if (!inDeck(x, y + 1)) nearRows.add(y)
      } else if (thwarts.includes(t)) c.set(x, y, Palette.gray2)
      else if (isRim(x, y - 1)) c.set(x, y, Palette.gray3)
      else if (deck.get(k)![1] === half && t % 4 !== 1) {
        // the seam of the bottom boards
        c.set(x, y, Palette.gray3)
      } else c.set(x, y, Palette.gray4)
    }
  }
  if (foam) {
    // foam at the stern and the bow, under the black of the keel
    for (const t of [0, 1, len - 2]) {
      const [x] = at(t, half)
      const y = (bottom.get(x) ?? 0) + 4
      if (y < c.h) c.set(x, y, Palette.white)
      if (t === 0 && y - 1 < c.h) {
        c.set(x + (bow === "left" ? 1 : -1), y - 1, Palette.white)
      }
    }
  }
  return nearRows
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

// the rower going right or left: 24 x 20, sitting amidships, the oars
// out over the sides, dipping behind (0) or pulled forward (1)
async function sideways(dir: "right" | "left", phase: 0 | 1) {
  const boat = new Canvas(24, 20)
  const near = rowboat(boat, 1, 8, 22, 4, dir, phase === 0)
  const flip = (x: number) => dir === "right" ? x : 23 - x
  const farOar = phase === 0 ? [[11, 7], [10, 6], [9, 5]] : [[12, 7], [13, 6], [
    14,
    5,
  ]]
  const nearOar = phase === 0
    ? [[11, 16], [10, 17], [9, 18], [8, 19]]
    : [[12, 16], [13, 17], [14, 18], [15, 19]]
  const c = new Canvas(24, 20)
  for (const [x, y] of farOar) c.set(flip(x), y, Palette.gray1)
  boat.px.forEach((ink, k) => {
    if (ink) c.px[k] = ink
  })
  c.paste(await kimi(`${dir}0`), 4, 2, 0, 13)
  // the near gunwale and side over the rower
  boat.px.forEach((ink, k) => {
    if (ink && near.has(Math.floor(k / 24))) c.px[k] = ink
  })
  for (const [x, y] of nearOar) c.set(flip(x), y, Palette.white)
  await c.write(`actor/rowboat/${dir}${phase}.png`)
}

// the rower going down or up: 20 x 24, the boat lengthwise, the head in
// its middle, the oars out to both sides
async function lengthwise(dir: "down" | "up", phase: 0 | 1) {
  const boat = new Canvas(20, 26)
  const near = rowboat(boat, 3, 0, 23, 7, dir, false)
  const c = new Canvas(20, 26)
  const oar = phase === 0 ? [[0, 9], [1, 10], [2, 11], [3, 12]] : [
    [0, 15],
    [1, 14],
    [2, 13],
    [3, 12],
  ]
  for (const [x, y] of oar) {
    c.set(x, y, Palette.white)
    c.set(19 - x, y, Palette.white)
  }
  boat.px.forEach((ink, k) => {
    if (ink) c.px[k] = ink
  })
  c.paste(await kimi(`${dir}0`), 2, 6, 0, 13)
  boat.px.forEach((ink, k) => {
    if (ink && near.has(Math.floor(k / 20)) && Math.floor(k / 20) >= 20) {
      c.px[k] = ink
    }
  })
  await c.write(`actor/rowboat/${dir}${phase}.png`)
}

// the boat moored, empty: across the river (24 x 16) and down it (12 x 22)
{
  const across = new Canvas(24, 16)
  rowboat(across, 1, 2, 22, 4, "right")
  await across.write("prop/ferry.png")
  const down = new Canvas(12, 22)
  rowboat(down, 2, 0, 17, 4, "up", false)
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
