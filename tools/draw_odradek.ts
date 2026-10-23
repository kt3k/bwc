// Draws Odradek (model/odradek.ts), after Kafka's "Die Sorge des
// Hausvaters" (1919): a flat star-shaped spool of thread, old broken
// bits of thread knotted in; a small wooden crossbar sticks out of the
// middle of the star and a rod is joined to it at a right angle, so with
// the rod and one point of the star it stands upright as on two legs.
//
// Facing down (and up, from behind) the star is seen flat: five points,
// the lower left one a leg, the wound thread round its hub, loose ends
// trailing off two points; the crossbar comes out toward you (its end a
// dark knob) and the rod drops from it to the ground. Facing left (and
// right, mirrored) the star is seen edge on, a thin upright spool, and
// the crossbar sticks out sideways, the rod down from its end. In the
// grays only (docs/art-guide.md). The two frames of the walk swap which
// leg is forward: the star tips a little and the rod swings.
//
// Usage: deno -A tools/draw_odradek.ts
import { Palette, type PaletteColor } from "../util/palette.ts"
import { write } from "./draw_waystones.ts"

const N = 16
type Px = PaletteColor | null

/** The ground row: the lowest pixels of the legs, in every frame */
const GROUND = 14

class Sprite {
  px: Px[] = Array(N * N).fill(null)
  get(x: number, y: number): Px {
    if (x < 0 || y < 0 || x >= N || y >= N) return null
    return this.px[y * N + x]
  }
  set(x: number, y: number, c: Px) {
    if (x < 0 || y < 0 || x >= N || y >= N) return
    this.px[y * N + x] = c
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
  }
  /** A black outline round everything drawn (4-neighbours) */
  outline() {
    const copy = [...this.px]
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (copy[y * N + x]) continue
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = x + dx, ny = y + dy
          return nx >= 0 && ny >= 0 && nx < N && ny < N &&
            copy[ny * N + nx] !== null && copy[ny * N + nx] !== Palette.black
        })
        if (near) this.px[y * N + x] = Palette.black
      }
    }
  }
  mirror(): Sprite {
    const s = new Sprite()
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) s.set(N - 1 - x, y, this.get(x, y))
    }
    return s
  }
}

/** true inside the five-pointed star round (cx, cy), turned by `turn` */
function inStar(
  x: number,
  y: number,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  turn: number,
): boolean {
  const pts: [number, number][] = []
  for (let k = 0; k < 10; k++) {
    const a = turn + k * Math.PI / 5
    const r = k % 2 === 0 ? outer : inner
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  let inside = false
  for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
    const [xa, ya] = pts[a], [xb, yb] = pts[b]
    if (
      (ya > y) !== (yb > y) && x < (xb - xa) * (y - ya) / (yb - ya) + xa
    ) inside = !inside
  }
  return inside
}

/**
 * The star seen flat, standing on its lower point and on the rod.
 * `step` 0 or 1: the walk's two frames. `back`: seen from behind (the
 * crossbar's knob hidden, the thread darker)
 */
function flat(step: number, back: boolean): Sprite {
  const s = new Sprite()
  const cx = 7.5, cy = 7.5
  // a point nearly straight down is the star's leg (the rod is the
  // other, off to the right); the walk tips the star back and forth
  const turn = (100 + (step === 0 ? 0 : -8)) * Math.PI / 180
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = x + 0.5, py = y + 0.5
      if (!inStar(px, py, cx, cy, 6.4, 2.8, turn)) continue
      const r = Math.hypot(px - cx, py - cy)
      // the hub: thread wound round, in bands
      if (r < 2.9) {
        const band = (y + (step === 0 ? 0 : 1)) % 2 === 0
        s.set(
          x,
          y,
          back
            ? (band ? Palette.gray2 : Palette.gray3)
            : band
            ? Palette.white
            : Palette.gray2,
        )
        continue
      }
      // the points: lit from the top left, darker to the bottom right
      const lit = (px - cx) + (py - cy) < -1
      s.set(
        x,
        y,
        lit ? Palette.gray1 : Palette.gray2,
      )
    }
  }
  // the lower point reaches the ground, as the rod does
  let low = 0
  for (let k = 0; k < N * N; k++) if (s.px[k]) low = Math.floor(k / N)
  const tip = [...Array(N).keys()].find((x) => s.get(x, low))!
  for (let y = low + 1; y < GROUND; y++) s.set(tip, y, Palette.gray2)
  // the old broken threads knotted in: tufts off two points
  const tuft: Px = back ? Palette.gray2 : Palette.white
  if (step === 0) {
    s.set(4, 1, tuft)
    s.set(3, 0, Palette.gray3)
    s.set(12, 2, Palette.gray3)
    s.set(13, 1, tuft)
  } else {
    s.set(3, 2, tuft)
    s.set(2, 1, Palette.gray3)
    s.set(11, 2, Palette.gray3)
    s.set(12, 1, tuft)
  }
  // the rod, from the middle down to the ground (it swings with the walk)
  const foot = step === 0 ? 11 : 10
  s.line(9, 10, foot, GROUND - 1, Palette.gray4)
  // the crossbar's end, coming out of the middle toward you
  if (!back) {
    s.set(7, 7, Palette.gray4)
    s.set(8, 7, Palette.gray3)
    s.set(7, 8, Palette.gray3)
  }
  s.outline()
  return s
}

/**
 * The star seen edge on, facing left: a thin upright spool; the crossbar
 * out to the left from its middle and the rod down from the bar's end
 */
function edge(step: number): Sprite {
  const s = new Sprite()
  // the spool: three pixels wide, its points as notches up and down
  const x0 = 8
  for (let y = 1; y <= GROUND - 1; y++) {
    const hub = y >= 5 && y <= 9
    const w = hub ? 3 : 2
    for (let x = x0; x < x0 + w; x++) {
      const band = (y + step) % 2 === 0
      s.set(
        x,
        y,
        hub
          ? (band ? Palette.white : Palette.gray2)
          : x === x0
          ? Palette.gray1
          : Palette.gray2,
      )
    }
  }
  // the star's points stick out a little at the top and the bottom
  s.set(x0 - 1, 2, Palette.gray2)
  s.set(x0 + 2, 11, Palette.gray3)
  // the loose threads
  s.set(x0 + 3, step === 0 ? 3 : 4, Palette.white)
  s.set(x0 + 4, step === 0 ? 2 : 3, Palette.gray3)
  // the crossbar, out of the middle toward the way it goes
  s.line(x0 - 1, 7, x0 - 4, 7, Palette.gray3)
  // the rod down from its end: the second leg, swinging with the walk
  const top = x0 - 4
  const foot = step === 0 ? top - 1 : top + 1
  s.line(top, 8, foot, GROUND - 1, Palette.gray4)
  // the star stands on its lower point
  s.set(x0, GROUND - 1, Palette.gray2)
  s.outline()
  return s
}

const root = new URL("../static/actor/odradek/", import.meta.url)
await Deno.mkdir(root, { recursive: true })
for (const step of [0, 1]) {
  await write(`actor/odradek/down${step}.png`, flat(step, false).px)
  await write(`actor/odradek/up${step}.png`, flat(step, true).mirror().px)
  const left = edge(step)
  await write(`actor/odradek/left${step}.png`, left.px)
  await write(`actor/odradek/right${step}.png`, left.mirror().px)
}
