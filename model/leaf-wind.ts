// The leaf wind (docs/research-open-world-tedium.md, idea E-1, after the
// guiding wind of Ghost of Tsushima). The one-line rule:
//
//   leaves now and then drift toward the last place you heard of.
//
// When one of the folk tells of a place (model/rumor.ts), that place is
// remembered (one at a time, the last one; it lasts in the save) and for
// a few seconds leaves drift across the ground around the player toward
// it. Walking on, a few leaves drift that way again now and then; the
// nearer the place, the more often. Once there, the place is forgotten
// and the leaves stop. No arrows, no marks on the map.
import { Palette, type PaletteColor } from "../util/palette.ts"
import { CELL_SIZE } from "../util/constants.ts"
import * as signal from "../util/signals.ts"
import type { IColorBox, IField, IFinishable, IStepper } from "./types.ts"
import { HEARD_OF } from "./rumor.ts"

/** The leaves' colors: they show on the gray floors */
export const LEAF_COLORS: readonly PaletteColor[] = [
  Palette.lime2,
  Palette.brown2,
  Palette.lime3,
]

/** Within this many cells of the place, you are there */
export const ARRIVE_RADIUS = 10
/** The drift right after the rumor: frames long (4 s) */
export const BURST_FRAMES = 240
/** ... one leaf every this many frames (24 leaves in all) */
export const BURST_EVERY = 10
/** The leaves in one gust while walking */
export const GUST_LEAVES = 5
/** Frames between gusts at NEAR cells or nearer (8 s) */
export const GUST_EVERY_NEAR = 480
/** Frames between gusts at FAR cells or farther (30 s) */
export const GUST_EVERY_FAR = 1800
/** The distances (cells) where the gusts are the most and least often */
export const NEAR = 60
export const FAR = 1200
/** A gust waits until you have walked this many cells since the last */
export const GUST_WALK = 6
/** How long a leaf drifts (frames) and how fast (pixels per frame) */
export const LEAF_LIFE = 100
export const LEAF_SPEED = 1.6

/** The unit vector from (i, j) toward (ti, tj); [0, 0] if on it */
export function driftDir(
  i: number,
  j: number,
  ti: number,
  tj: number,
): [number, number] {
  const d = Math.hypot(ti - i, tj - j)
  if (d === 0) return [0, 0]
  return [(ti - i) / d, (tj - j) / d]
}

/** Frames between gusts at `d` cells from the place: the nearer, the more often */
export function gustEvery(d: number): number {
  const t = Math.min(Math.max((d - NEAR) / (FAR - NEAR), 0), 1)
  return Math.round(GUST_EVERY_NEAR + (GUST_EVERY_FAR - GUST_EVERY_NEAR) * t)
}

/** true if (i, j) is at the place */
export function arrived(
  i: number,
  j: number,
  place: { i: number; j: number },
): boolean {
  return Math.hypot(place.i - i, place.j - j) <= ARRIVE_RADIUS
}

/**
 * A leaf drifting over the ground: one or two pixels, tumbling (a 2x1,
 * then a 1x2) and swaying a pixel or two from side to side as it goes
 * the way of the wind, then gone at once (no fading).
 */
export class EffectLeaf implements IColorBox, IFinishable, IStepper {
  readonly ground = true
  #frame = 0
  #delay: number
  constructor(
    readonly x0: number,
    readonly y0: number,
    readonly vx: number,
    readonly vy: number,
    readonly color: PaletteColor,
    readonly life = LEAF_LIFE,
    delay = 0,
    readonly phase = 0,
  ) {
    this.#delay = delay
  }
  step(_field: IField): void {
    if (this.#delay > 0) this.#delay--
    else this.#frame++
  }
  get visible(): boolean {
    return this.#delay <= 0
  }
  /** The sway across the way, in pixels */
  get #sway(): number {
    return Math.round(Math.sin((this.#frame + this.phase) / 9) * 2)
  }
  get x(): number {
    const v = Math.hypot(this.vx, this.vy) || 1
    return Math.round(
      this.x0 + this.vx * this.#frame - (this.vy / v) * this.#sway,
    )
  }
  get y(): number {
    const v = Math.hypot(this.vx, this.vy) || 1
    return Math.round(
      this.y0 + this.vy * this.#frame + (this.vx / v) * this.#sway,
    )
  }
  get w(): number {
    return ((this.#frame + this.phase) >> 3) % 2 === 0 ? 2 : 1
  }
  get h(): number {
    return 3 - this.w
  }
  get finished(): boolean {
    return this.#frame >= this.life
  }
}

/**
 * Leaves around the pixel (cx, cy) drifting toward (dx, dy) (a unit
 * vector): they start upwind of it, spread across the way, so they
 * pass by. `rand` is a 0..1 random source, so tests can repeat it.
 */
export function leafGust(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  count: number,
  rand: () => number = Math.random,
  spreadFrames = 40,
): EffectLeaf[] {
  const upwind = CELL_SIZE * 5
  const across = CELL_SIZE * 10
  const along = CELL_SIZE * 4
  return Array.from({ length: count }, (_, n) => {
    const a = (rand() - 0.5) * across
    const b = (rand() - 0.5) * along - upwind
    const speed = LEAF_SPEED + rand() * 0.8
    return new EffectLeaf(
      Math.round(cx + dx * b - dy * a),
      Math.round(cy + dy * b + dx * a),
      dx * speed,
      dy * speed,
      LEAF_COLORS[n % LEAF_COLORS.length],
      LEAF_LIFE,
      Math.floor(rand() * spreadFrames),
      Math.floor(rand() * 16),
    )
  })
}

/**
 * The wind: hears of places (from the folk), and blows leaves toward
 * the last one as the player walks. Stepped once a frame by the game.
 */
export class LeafWind {
  #burstUntil = -1
  #nextGust: number | null = null
  #lastGust: [number, number] | null = null
  #rand: () => number
  constructor(rand: () => number = Math.random) {
    this.#rand = rand
  }

  /** Hears of a place: remembers it, and a drift of leaves goes there */
  hear(place: signal.Place, field: IField): void {
    signal.rumorPlace.update({ topic: place.topic, i: place.i, j: place.j })
    this.#burstUntil = field.time + BURST_FRAMES
    this.#nextGust = null
    this.#lastGust = [field.me.i, field.me.j]
  }

  step(field: IField): void {
    const place = signal.rumorPlace.get()
    if (!place) return
    const me = field.me
    if (arrived(me.i, me.j, place)) {
      signal.rumorPlace.update(null)
      this.#burstUntil = -1
      this.#nextGust = null
      return
    }
    const d = Math.hypot(place.i - me.i, place.j - me.j)
    // another land altogether: the wind does not reach so far
    if (d >= HEARD_OF) return
    const t = field.time
    const [dx, dy] = driftDir(me.i, me.j, place.i, place.j)
    const cx = me.i * CELL_SIZE + CELL_SIZE / 2
    const cy = me.j * CELL_SIZE + CELL_SIZE / 2
    if (t < this.#burstUntil) {
      if ((this.#burstUntil - t) % BURST_EVERY === 0) {
        this.#blow(field, leafGust(cx, cy, dx, dy, 1, this.#rand, 0))
      }
      return
    }
    if (this.#nextGust === null || this.#lastGust === null) {
      this.#nextGust = t + gustEvery(d)
      this.#lastGust ??= [me.i, me.j]
      return
    }
    if (t < this.#nextGust) return
    // only while walking: standing still, the wind waits
    const [li, lj] = this.#lastGust
    if (Math.abs(me.i - li) + Math.abs(me.j - lj) < GUST_WALK) return
    this.#blow(field, leafGust(cx, cy, dx, dy, GUST_LEAVES, this.#rand))
    this.#nextGust = t + gustEvery(d)
    this.#lastGust = [me.i, me.j]
  }

  #blow(field: IField, leaves: EffectLeaf[]) {
    for (const leaf of leaves) field.effects.add(leaf)
  }
}

/** The wind of the game */
export const leafWind = new LeafWind()
