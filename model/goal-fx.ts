// The moment a goal is done (model/celebrate.ts): the world holds still
// a while (the hit stop) under white noise (game/draw-layer.ts), then the
// game's five lines go out of the goal cell to every side, long and slow,
// wave after wave, and the reward letter (model/glyph.ts) comes up out
// of the ground a little way off, slowly, before it can be picked up.
//
// Everything here keeps to the art rules (docs/art-guide.md): palette
// colors only, whole pixels, no alpha and no fades. Things that go away
// blink or thin out (every other pixel) and then vanish at once.
//
// The timings are all here, in frames (60 a second).
import { Palette, type PaletteColor } from "../util/palette.ts"
import { CELL_SIZE } from "../util/constants.ts"
import { DIRS } from "../util/dir.ts"
import { type EffectLine0, linePattern0 } from "./effect.ts"
import type { IColorBox, IEffectGroup, IField } from "./types.ts"

// ---------------------------------------------------------------------
// timings

/**
 * Frames the world holds still when a goal is done (~0.53 s); white
 * noise is drawn over the screen all the while
 */
export const GOAL_HIT_STOP = 32
/**
 * The lines of a goal done: the game's five lines (linePattern0, as when
 * a thing is picked up: speed 1, p0 0.7, dist 3, a cell long), longer,
 * slower in the middle, going farther and living longer
 */
export const GOAL_LINES = {
  /** the speed of the outer lines (px/frame) */
  speed: 1,
  /** how much faster each line toward the middle goes (px/frame) */
  p0: 0.5,
  /** how far they go (linePattern0's dist: the tips go 16 * dist - length) */
  dist: 6,
  /** the length of a line (px) */
  length: 2 * CELL_SIZE,
} as const
/** The waves of lines, one color each, GOAL_LINE_GAP frames apart */
export const GOAL_LINE_WAVES: readonly PaletteColor[] = [
  Palette.white,
  Palette.yellow1,
  Palette.brown2,
]
/** Frames between the waves of lines */
export const GOAL_LINE_GAP = 10
/** Frames the slowest (outer) line of a wave lives */
const LINE_LIFE = 16 * GOAL_LINES.dist / GOAL_LINES.speed
/** Frames the lines last after the hit stop lets go (~2 s) */
export const GOAL_LINES_FRAMES = (GOAL_LINE_WAVES.length - 1) * GOAL_LINE_GAP +
  LINE_LIFE
/** The sparks of the letter's reveal blink this many frames before they go */
const SPARK_BLINK = 8

/** Frames after the hit stop before the letter's reveal starts */
export const REVEAL_DELAY = 12
/**
 * The reveal of the letter, frames from its start: motes of light
 * gather to a point, a column of light goes up from it, the letter rises
 * out of the ground a row at a time, and at the climax it hops and
 * sparkles, then settles and can be picked up
 */
export const REVEAL = {
  /** motes gather into the cell from round about */
  converge: [0, 40],
  /** the column of light */
  beam: [36, 100],
  /** the letter rises a row every RISE_STEP frames */
  rise: [52, 100],
  /** the sparkle burst and the hop */
  climax: [100, 124],
} as const
/** Frames per row of the letter rising out of the ground */
export const RISE_STEP = 3
/** Frames from the goal done (after the hit stop) to the letter pickable */
export const REVEAL_FRAMES = REVEAL_DELAY + REVEAL.climax[1]
/** The hop at the climax: the letter's offset every HOP_STEP frames */
const HOP = [-1, -2, -2, -1] as const
const HOP_STEP = 3
/** How many motes gather, and from how far */
const MOTES = 12
const MOTE_RADIUS = [44, 58] as const
/** The column of light: its height, and how fast it goes up */
const BEAM_HEIGHT = 72
const BEAM_SPEED = 4

// ---------------------------------------------------------------------
// helpers

type Rand = () => number

const between = (rand: Rand, [a, b]: readonly [number, number]) =>
  a + rand() * (b - a)

/** A box of this frame */
const box = (
  x: number,
  y: number,
  w: number,
  h: number,
  color: PaletteColor,
): IColorBox => ({
  x: Math.round(x),
  y: Math.round(y),
  w,
  h,
  color,
})

/** A 1px frame round the box (outside it) */
function frame(
  x: number,
  y: number,
  w: number,
  h: number,
  color: PaletteColor,
): IColorBox[] {
  return [
    box(x - 1, y - 1, w + 2, 1, color),
    box(x - 1, y + h, w + 2, 1, color),
    box(x - 1, y, 1, h, color),
    box(x + w, y, 1, h, color),
  ]
}

/** A spark flying out: decelerates, blinks, vanishes */
class Spark {
  x: number
  y: number
  px: number
  py: number
  age = 0
  constructor(
    x: number,
    y: number,
    public vx: number,
    public vy: number,
    readonly life: number,
    readonly color: PaletteColor,
    readonly size: number,
    readonly drag: number,
  ) {
    this.x = this.px = x
    this.y = this.py = y
  }
  step() {
    this.px = this.x
    this.py = this.y
    this.x += this.vx
    this.y += this.vy
    this.vx *= this.drag
    this.vy *= this.drag
    this.age++
  }
  get done() {
    return this.age >= this.life
  }
  boxes(): IColorBox[] {
    if (this.done) return []
    const left = this.life - this.age
    // blinks before it goes: 2 frames on, 2 off
    if (left <= SPARK_BLINK && (left >> 1) % 2 === 1) return []
    const h = Math.floor(this.size / 2)
    const out = [
      // a 1px black shadow, so it reads on the pale floors
      box(this.x - h + 1, this.y - h + 1, this.size, this.size, Palette.black),
      box(this.x - h, this.y - h, this.size, this.size, this.color),
    ]
    // a 1px tail where it was, while it is fast
    if (Math.abs(this.vx) + Math.abs(this.vy) > 1) {
      out.push(
        box((this.x + this.px) / 2, (this.y + this.py) / 2, 1, 1, this.color),
      )
    }
    return out
  }
}

/** Sparks flying out of (cx, cy) in all directions */
function sparkRing(
  cx: number,
  cy: number,
  count: number,
  speed: readonly [number, number],
  life: readonly [number, number],
  colors: readonly PaletteColor[],
  drag: number,
  rand: Rand,
): Spark[] {
  return Array.from({ length: count }, (_, n) => {
    const a = (n / count) * Math.PI * 2 + rand() * 0.3
    const v = between(rand, speed)
    return new Spark(
      cx,
      cy,
      Math.cos(a) * v,
      Math.sin(a) * v,
      Math.round(between(rand, life)),
      colors[n % colors.length],
      n % 2 === 0 ? 2 : 1,
      drag,
    )
  })
}

/**
 * A group stepped from the field: the step in the frame it was made in
 * is skipped (it is made during the field's step, and the hit stop
 * begins after it), so its first frame is the one held still
 */
abstract class Group implements IEffectGroup {
  #born: number
  /** Frames stepped since the hit stop let go */
  f = 0
  constructor(born: number) {
    this.#born = born
  }
  step(field: Pick<IField, "time">): void {
    if (field.time === this.#born) return
    this.f++
    this.tick(field)
  }
  abstract tick(field: Pick<IField, "time">): void
  abstract boxes(): Iterable<IColorBox>
  abstract readonly finished: boolean
}

// ---------------------------------------------------------------------
// the lines

/**
 * The lines out of the goal done at the cell (i, j): nothing of its own
 * while the hit stop holds (the white noise is all), then, as it lets
 * go, the game's five lines (linePattern0) go out of the cell's four
 * sides, long and far (GOAL_LINES), in waves of the GOAL_LINE_WAVES
 * colors one after another. `onRelease` is called when the hit stop
 * lets go (the sound and the message go then)
 */
export class GoalLines extends Group {
  readonly i: number
  readonly j: number
  #lines: EffectLine0[] = []
  #onRelease?: () => void
  constructor(i: number, j: number, born: number, onRelease?: () => void) {
    super(born)
    this.i = i
    this.j = j
    this.#onRelease = onRelease
  }
  /** How many waves have gone out so far */
  get waves(): number {
    if (this.f < 1) return 0
    return Math.min(
      GOAL_LINE_WAVES.length,
      Math.floor((this.f - 1) / GOAL_LINE_GAP) + 1,
    )
  }
  tick(field: Pick<IField, "time">) {
    if (this.f === 1) this.#onRelease?.()
    const k = (this.f - 1) / GOAL_LINE_GAP
    if (Number.isInteger(k) && k >= 0 && k < GOAL_LINE_WAVES.length) {
      const { speed, p0, dist, length } = GOAL_LINES
      this.#lines.push(
        ...linePattern0(
          DIRS,
          this.i,
          this.j,
          speed,
          p0,
          dist,
          GOAL_LINE_WAVES[k],
          length,
        ),
      )
    }
    for (const line of this.#lines) line.step(field as IField)
    this.#lines = this.#lines.filter((line) => !line.finished)
  }
  get finished(): boolean {
    return this.waves === GOAL_LINE_WAVES.length && this.#lines.length === 0
  }
  *boxes(): Generator<IColorBox> {
    for (const line of this.#lines) {
      if (line.w > 0 && line.h > 0) {
        yield box(line.x, line.y, line.w, line.h, line.color)
      }
    }
  }
}

// ---------------------------------------------------------------------
// the letter's reveal

/** How the letter shows in the reveal: rows shown, and its hop */
export type RevealPose = {
  /** The top rows of the sprite shown (0: none yet, 16: all) */
  rows: number
  /** Its offset up or down (px), on top of rising out of the ground */
  dy: number
}

/**
 * The pose of the letter `elapsed` frames after the hit stop let go
 * (counting the delay before the reveal starts)
 */
export function revealPose(elapsed: number): RevealPose {
  const t = elapsed - REVEAL_DELAY
  const [r0, r1] = REVEAL.rise
  if (t < r0) return { rows: 0, dy: 0 }
  if (t < r1) {
    const rows = Math.min(CELL_SIZE, Math.floor((t - r0) / RISE_STEP) + 1)
    return { rows, dy: CELL_SIZE - rows }
  }
  const k = Math.floor((t - REVEAL.climax[0]) / HOP_STEP)
  return { rows: CELL_SIZE, dy: HOP[k] ?? 0 }
}

/**
 * The reveal of the letter laid at the cell (i, j), round it (the
 * letter itself rises by its pose, see revealPose and Item): motes of
 * light gather into a point on the cell, a column of light goes up from
 * it, the ground line shimmers while the letter comes up out of it a
 * row at a time (chips of earth kicked aside), and at the climax a ring
 * of sparkles goes out, a white frame flashes round it and stars twinkle
 * at its corners. `onClimax` is called at the climax (a bell)
 */
export class GlyphReveal extends Group {
  readonly x: number
  readonly y: number
  readonly cx: number
  readonly cy: number
  #motes: { a: number; r: number; color: PaletteColor; size: number }[]
  #sparks: Spark[] = []
  #chips: Spark[] = []
  #rand: Rand
  #onClimax?: () => void
  constructor(
    i: number,
    j: number,
    born: number,
    onClimax?: () => void,
    rand: Rand = Math.random,
  ) {
    super(born)
    this.x = i * CELL_SIZE
    this.y = j * CELL_SIZE
    this.cx = this.x + CELL_SIZE / 2
    this.cy = this.y + CELL_SIZE / 2
    this.#rand = rand
    this.#onClimax = onClimax
    const colors = [Palette.white, Palette.yellow1, Palette.cyan1]
    this.#motes = Array.from({ length: MOTES }, (_, n) => ({
      a: (n / MOTES) * Math.PI * 2 + rand() * 0.2,
      r: between(rand, MOTE_RADIUS),
      color: colors[n % colors.length],
      size: n % 2 === 0 ? 2 : 1,
    }))
  }
  /** Frames since the reveal started (negative while it waits) */
  get t(): number {
    return this.f - REVEAL_DELAY
  }
  get floor(): number {
    return this.y + CELL_SIZE
  }
  tick() {
    const t = this.t
    const [r0, r1] = REVEAL.rise
    // chips of earth kicked aside as it rises
    if (t >= r0 && t < r1 && (t - r0) % 6 === 0) {
      for (const side of [-1, 1]) {
        const x = side < 0 ? this.x + 1 : this.x + CELL_SIZE - 2
        this.#chips.push(
          new Spark(
            x,
            this.floor - 1,
            side * (0.6 + this.#rand() * 0.6),
            -0.8 - this.#rand() * 0.6,
            10,
            this.#rand() < 0.5 ? Palette.gray3 : Palette.gray4,
            1,
            0.92,
          ),
        )
      }
    }
    if (t === REVEAL.climax[0]) {
      this.#onClimax?.()
      this.#sparks = sparkRing(
        this.cx,
        this.cy,
        10,
        [2, 3],
        [14, 20],
        [Palette.white, Palette.yellow1],
        0.88,
        this.#rand,
      )
    }
    for (const s of this.#sparks) s.step()
    for (const c of this.#chips) {
      c.vy += 0.15
      c.step()
    }
    this.#chips = this.#chips.filter((c) => !c.done)
  }
  get finished(): boolean {
    return this.t >= REVEAL.climax[1]
  }
  *boxes(): Generator<IColorBox> {
    const t = this.t
    if (t < 0) return
    const { x, y, cx, cy } = this
    const S = CELL_SIZE
    // motes gathering (faster and faster), each with a 1px tail
    const [c0, c1] = REVEAL.converge
    if (t < c1) {
      const p = (t - c0) / (c1 - c0)
      const q = Math.max(0, (t - 1 - c0) / (c1 - c0))
      for (const m of this.#motes) {
        const d = m.r * (1 - p * p)
        const dp = m.r * (1 - q * q)
        const mx = cx + Math.cos(m.a) * d
        const my = cy + Math.sin(m.a) * d
        const mx0 = mx - m.size / 2
        const my0 = my - m.size / 2
        yield box(mx0 + 1, my0 + 1, m.size, m.size, Palette.black)
        yield box(mx0, my0, m.size, m.size, m.color)
        yield box(
          cx + Math.cos(m.a) * (d + dp) / 2,
          cy + Math.sin(m.a) * (d + dp) / 2,
          1,
          1,
          m.color,
        )
      }
      // the point they gather to: blinks, then grows in whole steps
      if (t >= 10 && t < 30 && (t >> 2) % 2 === 0) {
        yield box(cx - 1, cy - 1, 2, 2, Palette.white)
      } else if (t >= 30) {
        yield box(cx - 2, cy - 2, 4, 4, Palette.white)
      }
    }
    const pose = revealPose(t + REVEAL_DELAY)
    const [r0, r1] = REVEAL.rise
    // the flash where they meet
    if (t >= c1 && t < c1 + 4) {
      yield box(cx - 3, cy - 3, 6, 6, Palette.white)
    }
    // the column of light, from the top of the rising letter up
    const [b0, b1] = REVEAL.beam
    if (t >= b0 && t < b1) {
      const w = t < b0 + 4 ? 2 : t < b1 - 10 ? 6 : t < b1 - 5 ? 4 : 2
      const bottom = t < r0 ? cy : this.floor - pose.rows
      const top = Math.max(y + S - BEAM_HEIGHT, cy - BEAM_SPEED * (t - b0))
      const h = bottom - top
      if (h > 0) {
        // a black edge on both sides, so it stands out on pale floors
        if (h > 1) {
          yield box(cx - w / 2 - 2, top + 1, 1, h - 1, Palette.black)
          yield box(cx + w / 2 + 1, top + 1, 1, h - 1, Palette.black)
        }
        yield box(cx - w / 2, top, w, h, Palette.white)
        if (t % 2 === 0 && h > 2) {
          yield box(cx - w / 2 - 1, top + 2, 1, h - 2, Palette.yellow1)
          yield box(cx + w / 2, top + 2, 1, h - 2, Palette.yellow1)
        }
        // light motes going up the column
        for (let k = 0; k < 4; k++) {
          const my = bottom - ((t * 3 + k * 18) % Math.max(1, h))
          const mx = k % 2 === 0 ? cx - w / 2 - 3 : cx + w / 2 + 2
          if (my > top) yield box(mx, my, 1, 2, Palette.yellow1)
        }
        // its top twinkles
        if ((t >> 1) % 2 === 0) yield box(cx - 1, top - 3, 2, 2, Palette.white)
      }
    }
    // the ground line shimmers while it rises (every other pixel)
    if (t >= r0 - 8 && t < r1) {
      for (let k = (t % 2) + 1; k < S - 1; k += 2) {
        yield box(x + k, this.floor - 1, 1, 1, Palette.white)
      }
    }
    for (const c of this.#chips) yield* c.boxes()
    // the climax: a white frame flashes, stars twinkle at the corners
    const [k0] = REVEAL.climax
    if (t >= k0) {
      const u = t - k0
      if (u < 2 || (u >= 4 && u < 6)) {
        yield* frame(x, y + pose.dy, S, S, Palette.white)
      }
      if (u < 20) {
        const arm = (u >> 2) % 2 === 0 ? 1 : 2
        for (
          const [sx, sy] of [
            [x - 2, y - 2],
            [x + S + 1, y - 2],
            [x - 2, y + S + 1],
            [x + S + 1, y + S + 1],
          ]
        ) {
          yield box(sx - arm, sy, 2 * arm + 1, 1, Palette.white)
          yield box(sx, sy - arm, 1, 2 * arm + 1, Palette.white)
        }
      }
    }
    for (const s of this.#sparks) yield* s.boxes()
  }
}
