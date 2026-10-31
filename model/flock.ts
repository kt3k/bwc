// The birds over a goal (docs/playtest-2026-10-25.md): a few birds, high
// up, wheel in a wide slow circle over every goal not yet done, so that
// their round comes onto the screen before the goal does. No mark and no
// arrow: you see birds circling over something, and go and look. Once
// the goal is done they fly off, out of the screen, each straight away
// from the goal, faster and faster, with quicker beats of the wings.
//
// They are drawn as black birds with flapping wings, near a cell across
// (boxes of the palette's black), an effect the goal's own prop keeps
// (circleBirds, called from its step while the goal isn't done): one
// flock per prop, gone when it has flown off (the goal done) or at once
// when the prop is gone from the field (its place unloaded).
import { CELL_SIZE } from "../util/constants.ts"
import { Palette, type PaletteColor } from "../util/palette.ts"
import type { IColorBox, IEffectGroup, IField, IProp } from "./types.ts"

/** How far out the birds wheel (cells, from the middle of the goal) */
export const FLOCK_RADIUS = 9
/** How many birds wheel over a goal */
export const FLOCK_SIZE = 3
/** Frames for a full round */
export const FLOCK_ROUND = 900
/** Frames for a beat of the wings */
const FLAP = 12
/** Frames for a beat of the wings as they fly off */
const FLAP_AWAY = 5
/** Frames the birds take to fly off out of the screen (the goal done) */
export const FLY_AWAY_FRAMES = 90
/** How fast they fly off (px/frame at first), and how it grows a frame */
const AWAY_SPEED = 1.5
const AWAY_ACCEL = 0.05

/** A bird's two shapes (wings up, wings level), 7 by 4 dots */
const WINGS: readonly string[][] = [
  ["#.....#", ".#...#.", "..#.#..", "...#..."],
  [".......", "###.###", "...#...", "......."],
]
/** The pixels to a dot (a bird is 14 by 8 pixels, near a cell across) */
const DOT = 2

class Box implements IColorBox {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly w: number,
    readonly h: number,
    readonly color: PaletteColor,
  ) {}
}

/** The flock over one goal */
export class Flock implements IEffectGroup {
  readonly look = "a small black bird flying"
  #time = 0
  #gone = false
  /** The frame the goal was done (they fly off from it); null: wheeling */
  #leftAt: number | null = null
  constructor(
    readonly prop: IProp,
    /** true once the goal is done */
    readonly done: () => boolean,
    /** Where in its round the flock starts (0 to 1) */
    readonly phase = 0,
  ) {}

  /** true while flying off (the goal done) */
  get leaving(): boolean {
    return this.#leftAt !== null
  }

  /** Where the k-th bird is now (pixels), and its wings */
  bird(k: number): { x: number; y: number; flap: number } {
    const cx = (this.prop.i + 0.5) * CELL_SIZE
    const cy = (this.prop.j + 0.5) * CELL_SIZE
    // where in the round: flying off, it keeps the way it was at
    const round = this.#leftAt ?? this.#time
    // each a little apart in the round, and a little in or out
    const t = (round / FLOCK_ROUND + this.phase + k / (FLOCK_SIZE * 3)) *
      Math.PI * 2
    const e = this.#leftAt === null ? 0 : this.#time - this.#leftAt
    // flying off: straight out from the goal, faster and faster
    const away = AWAY_SPEED * e + AWAY_ACCEL * e * e
    const r = (FLOCK_RADIUS + (k - 1) * 0.8) * CELL_SIZE + away
    const flap = this.#leftAt === null ? FLAP : FLAP_AWAY
    return {
      x: Math.round(cx + Math.cos(t) * r),
      y: Math.round(cy + Math.sin(t) * r * 0.8),
      flap: Math.floor((this.#time + k * 5) / flap) % 2,
    }
  }

  step(field: IField): void {
    this.#time++
    // the place unloaded: gone at once
    if (field.props.get(this.prop.i, this.prop.j) !== this.prop) {
      this.#gone = true
      return
    }
    // the goal done: they fly off, and are gone when out of the screen
    if (this.#leftAt === null && this.done()) this.#leftAt = this.#time
    if (this.#leftAt !== null && this.#time - this.#leftAt >= FLY_AWAY_FRAMES) {
      this.#gone = true
    }
  }

  get finished(): boolean {
    return this.#gone
  }

  *boxes(): Iterable<IColorBox> {
    for (let k = 0; k < FLOCK_SIZE; k++) {
      const { x, y, flap } = this.bird(k)
      const rows = WINGS[flap]
      for (let dy = 0; dy < rows.length; dy++) {
        for (let dx = 0; dx < rows[dy].length; dx++) {
          if (rows[dy][dx] === "#") {
            yield new Box(
              x + (dx - 3) * DOT,
              y + (dy - 2) * DOT,
              DOT,
              DOT,
              Palette.black,
            )
          }
        }
      }
    }
  }
}

/** The flocks wheeling now, by their goal's prop */
const flocks = new WeakMap<IProp, Flock>()

/**
 * Keeps a flock wheeling over the goal of the prop while it isn't done
 * (call it from the prop's step, while the goal isn't done)
 */
export function circleBirds(prop: IProp, field: IField, done: () => boolean) {
  const flock = flocks.get(prop)
  if (flock && !flock.finished) return
  // each flock starts somewhere else in its round
  const phase = ((prop.i * 7 + prop.j * 13) % 100) / 100
  const next = new Flock(prop, done, phase)
  flocks.set(prop, next)
  field.effects.add(next)
}
