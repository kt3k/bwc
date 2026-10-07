// Draws the sprites of the oddities (model/oddities.ts, ideas/breakables.md):
// the breakable props, the non-human actors, the things that come out of
// them (items) and the two cells they lay. Props, actors and cells are in
// the grays (docs/art-guide.md); items may use any palette color and get
// the gray2 ring (run `deno task item-ring` on them afterwards, which this
// script does).
//
// Shapes are drawn with a few primitives (ellipses, rects, lines) and
// small ASCII pictures, then outlined in black.
//
// Usage: deno -A tools/draw_oddities.ts
import { Palette, type PaletteColor } from "../util/palette.ts"
import { decodePng, encodePng } from "./png.ts"

const root = new URL("../static/", import.meta.url).pathname

type Px = PaletteColor | null

/** A small canvas of palette colors (null = transparent) */
class Sprite {
  px: Px[]
  constructor(readonly w = 16, readonly h = 16) {
    this.px = Array(w * h).fill(null)
  }
  get(x: number, y: number): Px {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null
    return this.px[y * this.w + x]
  }
  set(x: number, y: number, c: Px): this {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this
    this.px[y * this.w + x] = c
    return this
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: Px) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) this.set(x, y, c)
    }
    return this
  }
  /** Ellipse centered at (cx, cy) (half pixels allowed) */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Px) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
        if (dx * dx + dy * dy <= 1) this.set(x, y, c)
      }
    }
    return this
  }
  line(x0: number, y0: number, x1: number, y1: number, c: Px) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
    for (let k = 0; k <= n; k++) {
      this.set(
        Math.round(x0 + (x1 - x0) * k / n),
        Math.round(y0 + (y1 - y0) * k / n),
        c,
      )
    }
    return this
  }
  /** Replaces one color with another where `where` holds */
  recolor(
    from: Px,
    to: Px,
    where: (x: number, y: number) => boolean = () => true,
  ) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) === from && where(x, y)) this.set(x, y, to)
      }
    }
    return this
  }
  /** Shades the right and bottom rim of the shape */
  shade(base: Px, dark: Px) {
    const copy = [...this.px]
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (copy[y * this.w + x] !== base) continue
        const r = x + 1 < this.w ? copy[y * this.w + x + 1] : null
        const b = y + 1 < this.h ? copy[(y + 1) * this.w + x] : null
        if (r === null || b === null) this.set(x, y, dark)
      }
    }
    return this
  }
  /** Draws an ASCII picture at (x0, y0); '.' or ' ' is left alone */
  ascii(x0: number, y0: number, rows: string[], map: Record<string, Px>) {
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === "." || ch === " ") return
        if (!(ch in map)) throw new Error(`unknown pixel ${ch}`)
        this.set(x0 + x, y0 + y, map[ch])
      })
    )
    return this
  }
  /** A black outline around the shape (on the transparent pixels) */
  outline(c: Px = Palette.black) {
    const copy = [...this.px]
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (copy[y * this.w + x] !== null) continue
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = x + dx, ny = y + dy
          return nx >= 0 && ny >= 0 && nx < this.w && ny < this.h &&
            copy[ny * this.w + nx] !== null && copy[ny * this.w + nx] !== c
        })
        if (near) this.set(x, y, c)
      }
    }
    return this
  }
  mirror(): Sprite {
    const s = new Sprite(this.w, this.h)
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) s.set(this.w - 1 - x, y, this.get(x, y))
    }
    return s
  }
  shift(dx: number, dy: number): Sprite {
    const s = new Sprite(this.w, this.h)
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) s.set(x + dx, y + dy, this.get(x, y))
    }
    return s
  }
  clone(): Sprite {
    const s = new Sprite(this.w, this.h)
    s.px = [...this.px]
    return s
  }
  async save(path: string) {
    const rgba = new Uint8Array(this.w * this.h * 4)
    this.px.forEach((c, k) => {
      if (!c) return
      rgba.set([1, 3, 5].map((o) => parseInt(c.slice(o, o + 2), 16)), k * 4)
      rgba[k * 4 + 3] = 255
    })
    await Deno.mkdir(path.replace(/\/[^/]*$/, ""), { recursive: true })
    await Deno.writeFile(path, await encodePng(this.w, this.h, rgba))
  }
}

const { white: W, gray1: G1, gray2: L, gray3: M, gray4: D, black: K } = Palette
const GRAY: Record<string, Px> = { W, l: G1, L, M, D, K, "#": K }

const prop = (name: string, s: Sprite) => s.save(`${root}prop/${name}.png`)
const cell = (name: string, s: Sprite) => s.save(`${root}cell/${name}.png`)
const items: string[] = []
const item = async (name: string, s: Sprite) => {
  const path = `${root}item/${name}.png`
  await s.save(path)
  items.push(path)
}
/** Saves the 8 frames of an actor; missing views reuse the down view */
async function actor(
  name: string,
  frames: {
    down: [Sprite, Sprite]
    right?: [Sprite, Sprite]
    up?: [Sprite, Sprite]
  },
) {
  const right = frames.right ?? frames.down
  const left: [Sprite, Sprite] = frames.right
    ? [right[0].mirror(), right[1].mirror()]
    : frames.down
  const up = frames.up ?? frames.down
  const views = { down: frames.down, up, left, right }
  for (const [view, [f0, f1]] of Object.entries(views)) {
    await f0.save(`${root}actor/${name}/${view}0.png`)
    await f1.save(`${root}actor/${name}/${view}1.png`)
  }
}
/** The second frame: the same, bobbing a pixel */
const bob = (s: Sprite): [Sprite, Sprite] => [s, s.shift(0, 1)]

// ---------------------------------------------------------------------
// props

// the nesting jars, from big (4) to tiny (0), standing on the bottom
for (let k = 0; k <= 4; k++) {
  const s = new Sprite()
  const rx = 2 + k * 1.15, ry = 1.8 + k * 1.15
  const bottom = 15
  const cy = bottom - ry - 0.5
  s.ellipse(8, cy, rx, ry, L)
  // a face painted on the belly, and a band of the lid
  const neck = Math.max(1, Math.round(rx * 0.5))
  s.rect(8 - neck, Math.floor(cy - ry - 1), 7 + neck, Math.floor(cy - ry), M)
  s.shade(L, M)
  if (k >= 2) {
    s.ellipse(8, cy + 0.5, rx * 0.55, ry * 0.5, W)
    s.set(7, Math.round(cy), K)
    s.set(8, Math.round(cy), K)
    s.recolor(L, D, (_x, y) => y === Math.round(cy - ry * 0.45))
  } else {
    s.set(7, Math.round(cy), K)
  }
  s.set(Math.round(8 - rx * 0.5), Math.round(cy - ry * 0.4), W)
  s.outline()
  await prop(`nest_jar_${k}`, s)
}

// the packed box: a crate bulging, its lid lifting off what's inside
{
  const s = new Sprite()
  s.rect(2, 5, 13, 14, L).rect(1, 6, 14, 13, L)
  for (const y of [8, 11]) s.rect(2, y, 13, y, M)
  for (const x of [4, 11]) s.rect(x, 6, x, 13, M)
  s.rect(2, 14, 13, 14, M)
  // the lid, askew
  s.line(1, 4, 14, 2, D).line(1, 3, 14, 1, D)
  // things peeking out
  s.ascii(3, 3, ["..W.L..M.W"], GRAY).ascii(4, 4, ["LMW.DW.LM"], GRAY)
  s.set(3, 6, K).set(12, 6, K).set(3, 13, K).set(12, 13, K)
  s.outline()
  await prop("packed_box", s)
}

// an eggshell, filling the cell so the shells stand as a wall
{
  const s = new Sprite()
  s.ellipse(8, 8.5, 6.5, 7.5, W)
  s.shade(W, L)
  s.recolor(W, G1, (x, y) => x > 10 && y > 6)
  s.set(5, 4, L).set(4, 6, L)
  s.outline()
  await prop("egg_wall", s)
}

// the bell stone: a smooth standing stone with a note carved in it
{
  const s = new Sprite()
  s.ellipse(8, 9, 6.5, 6.5, L).rect(2, 12, 13, 15, L)
  s.shade(L, M)
  s.ascii(6, 5, [
    "..KK",
    "..K.K",
    "..K",
    "KKK",
    "KKK",
  ], GRAY)
  s.set(4, 6, W).set(4, 7, W)
  s.outline()
  await prop("bell_stone", s)
}

// the balloon rock swelling: 16, 20 then 24 pixels, standing on its base
for (const [k, size] of [[0, 16], [1, 20], [2, 24]]) {
  const s = new Sprite(size, size)
  const r = size / 2 - 1.5
  s.ellipse(size / 2, size / 2 + 0.5, r, r - 0.5 + k * 0.5, L)
  s.shade(L, M)
  // spots stretch as it swells
  const spots = [[0.3, 0.35], [0.62, 0.3], [0.45, 0.62], [0.7, 0.68]]
  for (const [fx, fy] of spots) {
    s.rect(
      Math.round(size * fx),
      Math.round(size * fy),
      Math.round(size * fx) + k,
      Math.round(size * fy),
      M,
    )
  }
  s.set(Math.round(size * 0.28), Math.round(size * 0.22), W)
  s.set(Math.round(size * 0.28) + 1, Math.round(size * 0.22), W)
  if (k === 2) {
    // stretched thin: cracks
    s.line(5, 6, 8, 9, K).line(17, 15, 19, 18, K)
  }
  s.outline()
  await prop(`balloon_rock_${k}`, s)
}

// the tower of drawers, its drawers opening from the top one
for (let k = 0; k <= 3; k++) {
  const s = new Sprite()
  s.rect(3, 1, 12, 15, M)
  s.rect(2, 1, 13, 1, D)
  for (const [n, y] of [[0, 3], [1, 7], [2, 11]] as const) {
    if (n < k) {
      // pulled out and empty
      s.rect(3, y, 12, y + 2, K).rect(2, y + 2, 13, y + 3, L)
    } else {
      s.rect(4, y, 11, y + 2, L)
      s.set(7, y + 1, K).set(8, y + 1, K)
    }
  }
  s.outline()
  await prop(`drawer_tower_${k}`, s)
}
{
  const s = new Sprite()
  s.rect(4, 7, 11, 15, M)
  s.rect(5, 9, 10, 10, L).rect(5, 12, 10, 13, L)
  s.set(7, 9, K).set(8, 12, K)
  s.outline()
  await prop("mini_drawers", s)
}

// the crescent moon, fallen on the ground
{
  const s = new Sprite()
  s.ellipse(8, 8.5, 6.5, 6.5, W)
  s.ellipse(11, 7, 5.5, 5.5, null)
  s.shade(W, G1)
  s.recolor(W, L, (x, y) => x < 4 && y > 9)
  s.set(5, 6, L).set(4, 8, L)
  s.rect(3, 15, 9, 15, D)
  s.outline()
  await prop("moon_shell", s)
}

// a window standing alone in the field, a landscape behind its glass
{
  const s = new Sprite()
  s.rect(2, 1, 13, 12, M)
  s.rect(3, 2, 12, 11, G1)
  // hills and a sun beyond the glass
  for (let x = 3; x <= 12; x++) {
    const hill = 8 + Math.round(Math.sin((x - 3) / 2.2) * 1.5)
    s.rect(x, hill, x, 11, L)
  }
  s.rect(9, 3, 10, 4, W)
  // the frame's cross
  s.rect(7, 2, 7, 11, M).rect(3, 6, 12, 6, M)
  // legs
  s.rect(3, 13, 3, 15, D).rect(12, 13, 12, 15, D)
  s.outline()
  await prop("lone_window", s)
}

// the grandfather clock
{
  const s = new Sprite()
  s.rect(4, 1, 11, 15, M).rect(3, 15, 12, 15, D)
  s.ellipse(8, 5, 3.5, 3.5, W)
  s.line(8, 5, 8, 3, K).line(8, 5, 10, 5, K)
  s.rect(6, 9, 9, 13, D).line(7, 9, 7, 12, L).rect(6, 12, 8, 13, L)
  s.outline()
  await prop("clock", s)
}

// the piñata tree: three paper animals hang off it, one fewer each stage
for (let k = 0; k <= 3; k++) {
  const s = new Sprite()
  s.rect(7, 8, 8, 15, D)
  s.ellipse(8, 4.5, 7, 4.5, L)
  s.shade(L, M)
  const hang = [[3, 10], [11, 12], [13, 9]]
  hang.forEach(([x, y], n) => {
    if (n < k) return
    s.line(x, 7, x, y - 1, K)
    s.rect(x - 1, y, x + 1, y + 1, W).set(x + 1, y + 2, W).set(x - 1, y + 2, W)
  })
  s.outline()
  await prop(`pinata_tree_${k}`, s)
}
{
  // a paper donkey
  const s = new Sprite()
  s.ascii(2, 3, [
    "..........WW",
    "..........WWW",
    ".WWWWWWWWWWW",
    "WLWLWLWLWLW",
    ".WWWWWWWWW",
    ".WLWLWLWLW",
    ".WWWWWWWWW",
    ".W.W...W.W",
    ".W.W...W.W",
    ".L.L...L.L",
  ], { W, L })
  s.set(12, 4, K)
  s.outline()
  await prop("pinata", s.shift(0, 3))
}

// the toothpaste rock: a big tube lying down, then squeezed flat
for (let k = 0; k <= 1; k++) {
  const s = new Sprite()
  if (k === 0) {
    s.ellipse(7, 10, 6.5, 4.5, W).rect(12, 8, 14, 12, M)
    s.rect(3, 9, 9, 9, L).rect(3, 11, 9, 11, L)
  } else {
    s.rect(1, 12, 11, 14, W).rect(12, 11, 14, 14, M)
    s.rect(2, 13, 9, 13, L)
  }
  s.shade(W, G1)
  s.outline()
  await prop(`paste_tube_${k}`, s)
}

// the statue of yourself: the player's look in stone
{
  const { w, rgba } = await decodePng(
    await Deno.readFile(`${root}actor/kimi/down0.png`),
  )
  const s = new Sprite()
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const p = (y * w + x) * 4
      if (rgba[p + 3] === 0) continue
      const lum = rgba[p] + rgba[p + 1] + rgba[p + 2]
      s.set(x, y, lum === 0 ? K : lum > 600 ? L : lum > 400 ? M : D)
    }
  }
  s.rect(2, 15, 13, 15, D).rect(3, 14, 12, 14, M)
  await prop("self_statue", s)
}

// the snail's house: a tiny house
{
  const s = new Sprite()
  s.rect(4, 9, 11, 15, W)
  for (let k = 0; k < 5; k++) s.rect(3 + k, 8 - k, 12 - k, 8 - k, D)
  s.rect(7, 12, 8, 15, K).rect(5, 10, 5, 11, M).rect(10, 10, 10, 11, M)
  s.outline()
  await prop("snail_house", s)
}

// the mat by the door, for a pair of slippers
{
  const s = new Sprite()
  s.rect(1, 4, 14, 12, M)
  for (let y = 5; y <= 11; y += 2) s.rect(2, y, 13, y, D)
  s.rect(1, 4, 14, 4, L)
  s.outline()
  await prop("slipper_mat", s)
}

// ---------------------------------------------------------------------
// cells (walkable, in the grays)

{
  // the toothpaste, white with a gray stripe down the middle
  const s = new Sprite().rect(0, 0, 15, 15, W)
  s.rect(0, 6, 15, 9, G1).rect(0, 7, 15, 8, L)
  s.rect(0, 0, 15, 0, G1).rect(0, 15, 15, 15, G1)
  await cell("paste", s)
}
{
  // an unrolled snail shell: ridges across a pale band
  const s = new Sprite().rect(0, 0, 15, 15, G1)
  for (let x = 1; x < 16; x += 4) {
    s.rect(x, 1, x, 14, L).rect(x + 1, 1, x + 1, 14, M)
  }
  s.rect(0, 0, 15, 0, M).rect(0, 15, 15, 15, M)
  await cell("spiral", s)
}

// ---------------------------------------------------------------------
// actors (in the grays)

{
  // the spore blob
  const s = new Sprite()
  s.ellipse(8, 10, 6, 4.5, L).shade(L, M)
  s.set(5, 9, M).set(10, 11, M).set(9, 8, M).set(6, 12, M)
  s.set(6, 10, K).set(10, 10, K).set(4, 8, W)
  s.outline()
  const s1 = new Sprite()
  s1.ellipse(8, 10.5, 6.5, 4, L).shade(L, M)
  s1.set(5, 10, M).set(10, 12, M).set(9, 9, M).set(6, 12, M)
  s1.set(6, 11, K).set(10, 11, K).set(4, 9, W)
  s1.outline()
  await actor("spore", { down: [s, s1] })
}
{
  // the piggy bank: front, and side view
  const front = new Sprite()
  front.ellipse(8, 9, 6, 5, W).shade(W, G1)
  front.rect(4, 4, 5, 5, W).rect(10, 4, 11, 5, W)
  front.rect(6, 4, 9, 4, null).rect(7, 4, 8, 4, K)
  front.rect(6, 9, 9, 11, L).set(7, 10, M).set(8, 10, M)
  front.set(5, 8, K).set(10, 8, K)
  front.rect(4, 14, 5, 15, G1).rect(10, 14, 11, 15, G1)
  front.outline()
  const side = new Sprite()
  side.ellipse(7.5, 9, 6.5, 5, W).shade(W, G1)
  side.rect(13, 8, 14, 10, L).set(14, 9, M)
  side.rect(10, 4, 11, 5, W)
  side.rect(5, 4, 8, 4, K).set(11, 8, K)
  side.rect(3, 14, 4, 15, G1).rect(10, 14, 11, 15, G1)
  side.set(1, 7, L)
  side.outline()
  const side1 = side.clone().rect(3, 14, 4, 15, null).rect(4, 14, 5, 15, G1)
    .outline()
  await actor("piggy", { down: bob(front), right: [side, side1] })
}
{
  // the fin, cutting through the floor
  const fin = (k: number) => {
    const s = new Sprite()
    s.ascii(5, 4, [
      "...K",
      "..KMK",
      "..KMDK",
      ".KMMDDK",
      ".KMMMDDK",
      "KMMMMDDDK",
    ], GRAY)
    // ripples
    const off = k ? 1 : 0
    s.rect(1 + off, 11, 4 + off, 11, L).rect(11 - off, 11, 14 - off, 11, L)
    s.rect(3 - off, 13, 12 + off, 13, L)
    s.rect(4, 10, 13, 10, D)
    return s
  }
  await actor("fin", { down: [fin(0), fin(1)] })
}
{
  // the cloud
  const s = new Sprite()
  s.ellipse(5, 10, 4, 3.5, W).ellipse(9, 8, 5, 4.5, W).ellipse(
    12,
    10.5,
    3.5,
    3,
    W,
  )
  s.rect(3, 12, 13, 12, G1).rect(4, 13, 12, 13, L)
  s.recolor(W, G1, (_x, y) => y === 11)
  s.outline()
  await actor("cloud", { down: [s, s.shift(0, -1)] })
}
{
  // a pebble of the line, and its leader (with eyes)
  const pebble = (eyes: boolean) => {
    const s = new Sprite()
    s.ellipse(8, 11, 4.5, 3.5, M).shade(M, D)
    s.set(6, 9, L)
    if (eyes) s.set(7, 10, K).set(9, 10, K).set(7, 9, W).set(9, 9, W)
    s.outline()
    return s
  }
  await actor("pebble", { down: bob(pebble(false)) })
  const lead = pebble(true)
  const leadR = new Sprite()
  leadR.ellipse(8, 11, 4.5, 3.5, M).shade(M, D).set(6, 9, L)
  leadR.set(10, 10, K).set(10, 9, W)
  leadR.outline()
  await actor("pebble-leader", {
    down: bob(lead),
    right: bob(leadR),
    up: bob(pebble(false)),
  })
}
{
  // the shadow walking by itself
  const s = new Sprite()
  s.ellipse(8, 11, 6.5, 3.5, K).ellipse(8, 7, 3.5, 4.5, K)
  s.recolor(
    K,
    D,
    (x, y) => x > 3 && x < 12 && y > 4 && y < 13 && (x + y) % 2 === 0,
  )
  const s1 = new Sprite()
  s1.ellipse(8, 11.5, 7, 3, K).ellipse(8, 7.5, 3.5, 4, K)
  s1.recolor(
    K,
    D,
    (x, y) => x > 3 && x < 12 && y > 4 && y < 13 && (x + y) % 2 === 1,
  )
  await actor("shadow", { down: [s, s1] })
}
{
  // the book, flapping its covers
  const open = new Sprite()
  open.ascii(1, 5, [
    "MMM.......MMM",
    "MWWWW...WWWWM",
    "MWKKWW.WWKKWM",
    "MWWWWWMWWWWWM",
    "MWKKKWMWKKKWM",
    "MWWWWWMWWWWWM",
    "MMMMMMMMMMMMM",
  ], GRAY)
  open.outline()
  const shut = new Sprite()
  shut.ascii(2, 4, [
    "....MMM",
    "...MWWWMM",
    "..MWWWWWWM",
    ".MWWWKKWWWM",
    "MMMWWWWWWWM",
    "..MMMWWWWM",
    ".....MMMM",
  ], GRAY)
  shut.outline()
  await actor("book", { down: [open, shut] })
}
// the eggs: small, medium, large
for (
  const [name, rx, ry] of [["egg-s", 3, 4], ["egg-m", 4, 5], [
    "egg-l",
    5,
    6.5,
  ]] as const
) {
  const s = new Sprite()
  s.ellipse(8, 15 - ry, rx, ry, W).shade(W, G1)
  s.set(8 - Math.ceil(rx / 2), Math.round(15 - ry * 1.4), L)
  s.outline()
  await actor(name, { down: [s, s] })
}
{
  // the bird out of the egg, wings up and down
  const wings = (up: boolean) => {
    const s = new Sprite()
    s.ellipse(8, 9, 3.5, 3, W).shade(W, G1)
    if (up) {
      s.line(4, 8, 1, 4, L).line(12, 8, 15, 4, L).line(5, 8, 2, 5, L).line(
        11,
        8,
        14,
        5,
        L,
      )
    } else s.line(4, 9, 1, 12, L).line(12, 9, 15, 12, L)
    s.set(7, 8, K).set(9, 8, K).set(8, 10, M)
    s.outline()
    return s
  }
  await actor("bird", { down: [wings(true), wings(false)] })
}
{
  // the fluff ball: a dandelion clock
  const s = new Sprite()
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2
    s.line(
      8,
      9,
      Math.round(8 + Math.cos(t) * 5),
      Math.round(9 + Math.sin(t) * 5),
      G1,
    )
    s.set(Math.round(8 + Math.cos(t) * 6), Math.round(9 + Math.sin(t) * 6), W)
  }
  s.rect(7, 8, 8, 9, M)
  const s1 = new Sprite()
  for (let a = 0; a < 16; a++) {
    const t = ((a + 0.5) / 16) * Math.PI * 2
    s1.line(
      8,
      9,
      Math.round(8 + Math.cos(t) * 5),
      Math.round(9 + Math.sin(t) * 5),
      G1,
    )
    s1.set(Math.round(8 + Math.cos(t) * 6), Math.round(9 + Math.sin(t) * 6), W)
  }
  s1.rect(7, 8, 8, 9, M)
  await actor("fluff", { down: [s, s1] })
}
{
  // a pair of slippers: the left one and the right one
  const slipper = new Sprite()
  slipper.ellipse(8, 9, 4, 6, L).shade(L, M)
  slipper.rect(5, 4, 10, 7, W).rect(5, 7, 10, 7, G1)
  slipper.outline()
  const s1 = slipper.shift(0, -1)
  await actor("slipper", { down: [slipper, s1] })
  await actor("slipper-r", { down: [slipper.mirror(), s1.mirror()] })
}
{
  // the snail with a shell too big, and the slug it becomes
  const snail = (k: number) => {
    const s = new Sprite()
    s.rect(1, 12, 14, 14, G1).shade(G1, L)
    s.line(13 + k, 12, 14 + k, 9, G1).set(14 + k, 8, K)
    s.ellipse(7, 7.5, 6, 6, L).shade(L, M)
    s.ascii(3, 3, [
      "..KKKK",
      ".K....K",
      "K..KK..K",
      "K.K..K.K",
      "K.K.K..K",
      "K..K..K",
      ".K...K",
      "..KKK",
    ], GRAY)
    s.outline()
    return s
  }
  await actor("snail", {
    down: [snail(0), snail(1)].map((s) => s) as [Sprite, Sprite],
    right: [snail(0), snail(1)],
  })
  const slug = (k: number) => {
    const s = new Sprite()
    s.rect(3, 11, 12, 14, G1).rect(4, 10, 11, 10, G1).shade(G1, L)
    s.line(11 + k, 10, 13 + k, 7, G1).set(13 + k, 6, K)
    s.outline()
    return s
  }
  await actor("slug", { down: [slug(0), slug(1)], right: [slug(0), slug(1)] })
}
{
  // the block fish: square, with a tail
  const fish = (k: number) => {
    const s = new Sprite()
    s.rect(2, 3, 11, 12, L)
    for (let y = 3; y <= 12; y += 3) s.rect(2, y, 11, y, M)
    for (let x = 2; x <= 11; x += 3) s.rect(x, 3, x, 12, M)
    s.ascii(12, 5 + k, ["W.", "WW", "WW", "W."], GRAY)
    s.rect(3, 5, 4, 6, W).set(4, 6, K)
    s.outline()
    return s
  }
  const f = [fish(0), fish(1)] as [Sprite, Sprite]
  await actor("block-fish", { down: f, right: [f[0].mirror(), f[1].mirror()] })
}
{
  // the chick out of an eggshell
  const s = new Sprite()
  s.ellipse(8, 11, 4.5, 4, W).shade(W, G1)
  s.set(6, 10, K).set(9, 10, K).rect(7, 11, 8, 11, M)
  s.rect(6, 15, 6, 15, M).rect(9, 15, 9, 15, M)
  s.outline()
  await actor("chick", { down: bob(s) })
}
{
  // the echo: the player's look, pale and see-through (every other
  // pixel left out: no alpha blending)
  for (const view of ["up", "down", "left", "right"]) {
    for (const k of [0, 1]) {
      const { w, rgba } = await decodePng(
        await Deno.readFile(`${root}actor/kimi/${view}${k}.png`),
      )
      const s = new Sprite()
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const p = (y * w + x) * 4
          if (rgba[p + 3] === 0) continue
          const lum = rgba[p] + rgba[p + 1] + rgba[p + 2]
          if (lum === 0) {
            s.set(x, y, M)
          } else if ((x + y) % 2 === 0) {
            s.set(x, y, lum > 600 ? W : G1)
          }
        }
      }
      await s.save(`${root}actor/echo/${view}${k}.png`)
    }
  }
}

// ---------------------------------------------------------------------
// items (any palette color; the ring is added below)

const C = Palette
await item(
  "pebble",
  new Sprite().ellipse(8, 9, 4, 3, C.gray3).shade(C.gray3, C.gray4).set(
    6,
    8,
    C.gray2,
  ).outline(),
)
{
  const s = new Sprite().ellipse(8, 8, 4.5, 4.5, C.blue2).shade(
    C.blue2,
    C.blue3,
  )
  s.set(7, 7, K).set(9, 7, K).set(7, 9, K).set(9, 9, K).set(6, 6, C.blue1)
  await item("button", s.outline())
}
{
  const s = new Sprite().ellipse(8, 8, 4, 4, C.brown2)
  // the teeth
  s.rect(7, 2, 8, 3, C.brown2).rect(7, 12, 8, 13, C.brown2)
  s.rect(2, 7, 3, 8, C.brown2).rect(12, 7, 13, 8, C.brown2)
  s.rect(3, 3, 4, 4, C.brown2).rect(11, 3, 12, 4, C.brown2)
  s.rect(3, 11, 4, 12, C.brown2).rect(11, 11, 12, 12, C.brown2)
  s.shade(C.brown2, C.brown3)
  s.ellipse(8, 8, 1.5, 1.5, K).set(6, 5, C.brown1)
  await item("gear", s.outline())
}
{
  const s = new Sprite().ascii(2, 2, [
    ".....Y",
    ".....Y",
    "....YYY",
    "YYYYYYYYYYY",
    ".YYYYYYYYY",
    "..YYYYYYY",
    "..YYY.YYY",
    ".YYY...YYY",
    ".YY.....YY",
  ], { Y: C.yellow1 })
  s.recolor(C.yellow1, C.yellow2, (x, y) => x > 8 || y > 8)
  await item("star", s.outline())
}
// the window shards: triangles of somewhere else
const shard = (fill: (s: Sprite) => void) => {
  const s = new Sprite()
  for (let y = 3; y <= 13; y++) {
    const x0 = 3 + Math.floor((13 - y) / 3), x1 = 4 + Math.floor((y - 3) * 0.9)
    s.rect(x0, y, Math.min(x1, 13), y, C.white)
  }
  const mask = [...s.px]
  fill(s)
  s.px = s.px.map((c, k) => (mask[k] ? c : null))
  return s.outline()
}
await item(
  "shard-sea",
  shard((s) =>
    s.rect(0, 0, 15, 7, C.blue1).rect(0, 8, 15, 15, C.blue2).rect(
      0,
      10,
      15,
      10,
      C.white,
    ).rect(0, 13, 15, 13, C.blue3)
  ),
)
await item(
  "shard-snow",
  shard((s) =>
    s.rect(0, 0, 15, 9, C.blue1).rect(0, 10, 15, 15, C.white).set(6, 5, C.white)
      .set(9, 3, C.white).set(8, 7, C.white)
  ),
)
await item(
  "shard-town",
  shard((s) =>
    s.rect(0, 0, 15, 15, C.orange1).rect(4, 8, 7, 13, C.pink3).rect(
      8,
      6,
      12,
      13,
      C.orange3,
    ).set(5, 10, C.yellow1).set(10, 9, C.yellow1)
  ),
)
await item(
  "shard-sky",
  shard((s) =>
    s.rect(0, 0, 15, 15, C.cyan1).rect(5, 7, 10, 8, C.white).rect(
      6,
      6,
      8,
      6,
      C.white,
    )
  ),
)
{
  const s = new Sprite().ellipse(8, 8, 3.5, 3, C.pink2)
  s.ascii(2, 6, ["KP", "PPP", "KP"], { K: C.pink3, P: C.pink2 })
  s.ascii(11, 6, [".PK", "PPP", ".PK"], { K: C.pink3, P: C.pink2 })
  s.set(7, 7, C.white).set(9, 9, C.pink3)
  await item("candy", s.outline())
}
{
  const s = new Sprite().rect(7, 9, 8, 13, C.white)
  s.ellipse(8, 6.5, 4.5, 4.5, C.pink2)
  s.line(6, 5, 9, 8, C.white).line(5, 7, 7, 9, C.white).line(
    8,
    3,
    11,
    6,
    C.white,
  )
  s.set(6, 4, C.pink1)
  await item("big-candy", s.outline())
}
{
  const s = new Sprite().ascii(4, 2, [
    "WWWW",
    "RRRR",
    "WWWW",
    "RRRR",
    "WWWW",
    "RRRR",
    "WWWWW",
    "RRRRRRR",
    "WWWWWWWW",
    ".RRRRRRR",
  ], { W: C.white, R: C.pink3 })
  await item("sock", s.outline())
}
{
  const s = new Sprite().rect(2, 4, 13, 11, C.white)
  s.line(2, 4, 7, 8, K).line(13, 4, 8, 8, K).rect(7, 7, 8, 8, C.pink3)
  s.rect(2, 11, 13, 11, C.gray1)
  await item("envelope", s.outline())
}
{
  const s = new Sprite().ellipse(8, 7, 5, 5, C.cyan2)
  s.rect(2, 8, 13, 13, null)
  s.ellipse(8, 7, 3, 3, C.cyan1).rect(5, 8, 11, 13, null)
  s.rect(3, 7, 12, 7, C.cyan3)
  await item("scale", s.outline())
}
{
  const s = new Sprite().ascii(3, 2, [
    ".......WW",
    "......WWWW",
    ".....WWWWL",
    "....WWWWML",
    "...WWWWMWL",
    "..WWWWMWL",
    "..WWWMWWL",
    ".WWWMWWL",
    ".WWMWLL",
    ".WMLL",
    ".M",
    "M",
  ], { W: C.white, L: C.gray2, M: C.gray3 })
  await item("feather", s.outline())
}
{
  const s = new Sprite().ascii(4, 3, [
    "....Y",
    "...YWY",
    "..YWWWY",
    ".YWWWWWY",
    "YWWWWWWWY",
    ".YWWWWWY",
    "..YWWWY",
    "...YWY",
    "....Y",
  ], { Y: C.yellow1, W: C.white })
  await item("glim", s.outline())
}
// the letters of the books: a scrap of paper with a letter on it
const GLYPHS: Record<string, string[]> = {
  k: ["K..K", "K.K.", "KK..", "K.K.", "K..K"],
  e: ["KKKK", "K...", "KKK.", "K...", "KKKK"],
  y: ["K..K", "K..K", ".KK.", ".K..", ".K.."],
  g: [".KKK", "K...", "K.KK", "K..K", ".KKK"],
  m: ["K..K", "KKKK", "K..K", "K..K", "K..K"],
  c: [".KKK", "K...", "K...", "K...", ".KKK"],
  o: [".KK.", "K..K", "K..K", "K..K", ".KK."],
  i: ["KKK", ".K.", ".K.", ".K.", "KKK"],
  n: ["K..K", "KK.K", "K.KK", "K..K", "K..K"],
}
for (const [ch, glyph] of Object.entries(GLYPHS)) {
  const s = new Sprite().rect(3, 3, 12, 12, C.brown1)
  s.rect(3, 12, 12, 12, C.brown2).rect(12, 3, 12, 12, C.brown2)
  // the letter, doubled vertically
  glyph.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== "K") return
      s.set(5 + x + (glyph[0].length === 3 ? 1 : 0), 4 + y * 1.5 | 0, K)
      s.set(5 + x + (glyph[0].length === 3 ? 1 : 0), (4 + y * 1.5 | 0) + 1, K)
    })
  )
  await item(`letter-${ch}`, s.outline())
}

// the item ring rule
const ring = new Deno.Command(Deno.execPath(), {
  args: [
    "run",
    "-A",
    new URL("./item_ring.ts", import.meta.url).pathname,
    ...items,
  ],
}).outputSync()
if (!ring.success) {
  console.error(new TextDecoder().decode(ring.stderr))
  Deno.exit(1)
}
console.log(`drew the oddities (${items.length} items)`)
