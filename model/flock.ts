// The birds over a goal (docs/playtest-2026-10-25.md): a few birds, high
// up, wheel in a wide slow circle over every goal not yet done, so that
// their round comes onto the screen before the goal does. No mark and no
// arrow: you see birds circling over something, and go and look. Once
// the goal is done they are gone.
//
// They are drawn as black birds with flapping wings, near a cell across
// (boxes of the palette's black), an effect the goal's own prop keeps
// (circleBirds, called from its step while the goal isn't done): one
// flock per prop, gone when the goal is done or the prop is gone from the
// field (its place unloaded).
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
  #time = 0
  #gone = false
  constructor(
    readonly prop: IProp,
    /** true once the goal is done */
    readonly done: () => boolean,
    /** Where in its round the flock starts (0 to 1) */
    readonly phase = 0,
  ) {}

  /** Where the k-th bird is now (pixels), and its wings */
  bird(k: number): { x: number; y: number; flap: number } {
    const cx = (this.prop.i + 0.5) * CELL_SIZE
    const cy = (this.prop.j + 0.5) * CELL_SIZE
    // each a little apart in the round, and a little in or out
    const t = (this.#time / FLOCK_ROUND + this.phase + k / (FLOCK_SIZE * 3)) *
      Math.PI * 2
    const r = (FLOCK_RADIUS + (k - 1) * 0.8) * CELL_SIZE
    return {
      x: Math.round(cx + Math.cos(t) * r),
      y: Math.round(cy + Math.sin(t) * r * 0.8),
      flap: Math.floor((this.#time + k * 5) / FLAP) % 2,
    }
  }

  step(field: IField): void {
    this.#time++
    if (
      this.done() || field.props.get(this.prop.i, this.prop.j) !== this.prop
    ) {
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
