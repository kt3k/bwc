// The moment a goal is done (model/celebrate.ts): at once (the world goes
// on, no hit stop, no white noise), the game's five white lines go out of the goal cell to every side. When
// they are gone, on the cell of the reward letter (model/glyph.ts) a
// little way off, a beat at a time: a small bolt of lightning strikes,
// three times over, a few gray leaves fall round it, and the letter comes
// up out of the ground a row at a time, hops and sparkles while the
// game's five lines go out of it, and only then can be picked up.
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
import { EffectLeaf } from "./leaf-wind.ts"
import type { IColorBox, IEffectGroup, IField } from "./types.ts"

// ---------------------------------------------------------------------
// timings

/**
 * The lines of a goal done: the game's five lines (linePattern0, as when
 * a thing is picked up: speed 1, p0 0.7, dist 3, a cell long), a little
 * longer, slower in the middle, going a little farther
 */
export const GOAL_LINES = {
  /** the speed of the outer lines (px/frame) */
  speed: 1,
  /** how much faster each line toward the middle goes (px/frame) */
  p0: 0.5,
  /** how far they go (linePattern0's dist: the tips go 16 * dist - length) */
  dist: 4,
  /** the length of a line (px) */
  length: 18,
} as const
/** The color of the lines (one wave of them) */
export const GOAL_LINE_COLOR: PaletteColor = Palette.white
/** Frames the lines last (the outer ones, ~1 s) */
export const GOAL_LINES_FRAMES = 16 * GOAL_LINES.dist / GOAL_LINES.speed
/** The sparks of the letter's reveal blink this many frames before they go */
const SPARK_BLINK = 8

/**
 * Frames after the goal done before the letter's reveal starts: the lines
 * till they are gone
 */
export const REVEAL_DELAY = GOAL_LINES_FRAMES
/** The pause before each beat of the reveal (the bolt, the leaves, the rise) */
export const REVEAL_BEAT = 32
/** Frames the bolt flickers on the cell, each strike */
export const BOLT_FRAMES = 8
/** How many times the bolt strikes, a beat after each */
export const BOLT_STRIKES = 3
/** Frames the scorch of the bolt stays on the cell (from the strike) */
export const SCORCH_FRAMES = 24
/** Frames the leaves fall (each lands, then is gone at once) */
export const LEAF_FALL_FRAMES = 36
/** How many leaves fall round the cell */
export const FALLING_LEAVES = 8
/** The falling leaves' colors: grays only */
export const FALLING_LEAF_COLORS: readonly PaletteColor[] = [
  Palette.gray3,
  Palette.gray4,
  Palette.black,
]
/** Frames per row of the letter rising out of the ground */
export const RISE_STEP = 3
/** Frames of the climax: the hop and the sparkles */
export const CLIMAX_FRAMES = 24
/**
 * The lines at the climax: the game's five lines (linePattern0), as when
 * an item is picked up, in the letter's color (its stone)
 */
export const CLIMAX_LINES = { speed: 1, p0: 0.7, dist: 3 } as const
export const CLIMAX_LINE_COLOR: PaletteColor = Palette.black
/** The strikes of the bolt: each a beat after the one before */
const BOLTS = Array.from(
  { length: BOLT_STRIKES },
  (_, k) =>
    [
      REVEAL_BEAT + k * (BOLT_FRAMES + REVEAL_BEAT),
      REVEAL_BEAT + k * (BOLT_FRAMES + REVEAL_BEAT) + BOLT_FRAMES,
    ] as const,
)
const LEAVES_AT = BOLTS[BOLTS.length - 1][1] + REVEAL_BEAT
const RISE_AT = LEAVES_AT + LEAF_FALL_FRAMES + REVEAL_BEAT
const CLIMAX_AT = RISE_AT + RISE_STEP * CELL_SIZE
/**
 * The reveal of the letter, frames from its start (the lines gone):
 * a beat, a small bolt of lightning strikes the cell, three times with a
 * beat after each; a few leaves fall round it; a beat, the letter rises
 * out of the ground a row at a time, and at the climax it hops and
 * sparkles while the five lines go out of it, then settles and can be
 * picked up
 */
export const REVEAL = {
  /** each strike of the bolt flickering on the cell */
  bolts: BOLTS,
  /** leaves fall round the cell */
  leaves: [LEAVES_AT, LEAVES_AT + LEAF_FALL_FRAMES],
  /** the letter rises a row every RISE_STEP frames */
  rise: [RISE_AT, CLIMAX_AT],
  /** the sparkle burst and the hop */
  climax: [CLIMAX_AT, CLIMAX_AT + CLIMAX_FRAMES],
} as const
/** Frames from the goal done to the letter pickable */
export const REVEAL_FRAMES = REVEAL_DELAY + REVEAL.climax[1]
/** The hop at the climax: the letter's offset every HOP_STEP frames */
const HOP = [-1, -2, -2, -1] as const
const HOP_STEP = 3
/** The bolt: how high above the cell it comes from, and where it strikes */
const BOLT_HEIGHT = 40
const BOLT_STRIKE = 12

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
 * is skipped (it is made during the field's step), so its first frame is
 * the one after the goal done
 */
abstract class Group implements IEffectGroup {
  #born: number
  /** Frames stepped since the goal was done */
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
 * The lines out of the goal done at the cell (i, j): right after it, the
 * game's five white lines (linePattern0) go out of the cell's four sides
 * (GOAL_LINES). `onRelease` is called as they go out (the sound and the
 * message go then)
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
  tick(field: Pick<IField, "time">) {
    if (this.f === 1) {
      this.#onRelease?.()
      const { speed, p0, dist, length } = GOAL_LINES
      this.#lines = linePattern0(
        DIRS,
        this.i,
        this.j,
        speed,
        p0,
        dist,
        GOAL_LINE_COLOR,
        length,
      )
    }
    for (const line of this.#lines) line.step(field as IField)
    this.#lines = this.#lines.filter((line) => !line.finished)
  }
  get finished(): boolean {
    return this.f >= 1 && this.#lines.length === 0
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
 * The pose of the letter `elapsed` frames after the goal was done
 * (counting the lines before the reveal starts)
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
 * A jagged bolt of lightning from BOLT_HEIGHT px above the point
 * (x, y) down to it: the pixels of its path, top to bottom, going down
 * a few pixels at a time with a jog of 1 to 3 pixels to a side between,
 * the last run straight down onto the point
 */
export function boltPath(
  x: number,
  y: number,
  rand: Rand,
): [number, number][] {
  const out: [number, number][] = []
  let px = x + Math.round(rand() * 6 - 3)
  let py = y - BOLT_HEIGHT
  let side = rand() < 0.5 ? -1 : 1
  while (py < y) {
    const run = Math.min(y - py, 3 + Math.floor(rand() * 3))
    for (let k = 0; k < run; k++) out.push([px, py++])
    if (py >= y) break
    // a jog to a side; near the end, back over the point
    const jog = y - py <= 6 ? x - px : side * (1 + Math.floor(rand() * 3))
    for (let k = 0; k < Math.abs(jog); k++) {
      px += Math.sign(jog)
      out.push([px, py - 1])
    }
    side = -side
  }
  out.push([x, y])
  return out
}

/**
 * The leaves falling round the pixel (cx, cy) (the middle of the
 * letter's cell): FALLING_LEAVES of the leaf wind's leaves (EffectLeaf,
 * tumbling and swaying from side to side) going straight down onto the
 * cells round it, one after another, each gone at once as it lands,
 * all within LEAF_FALL_FRAMES
 */
export function fallingLeaves(
  cx: number,
  cy: number,
  rand: Rand,
): EffectLeaf[] {
  return Array.from({ length: FALLING_LEAVES }, (_, n) => {
    // where it lands: round the cell, a way each in turn
    const a = (n / FALLING_LEAVES) * Math.PI * 2 + rand() * 0.5
    const r = CELL_SIZE * (0.9 + rand() * 0.6)
    const lx = Math.round(cx + Math.cos(a) * r)
    const ly = Math.round(cy + Math.sin(a) * r)
    const delay = Math.floor(rand() * 10)
    const life = LEAF_FALL_FRAMES - delay - Math.floor(rand() * 6)
    const vy = 0.5 + rand() * 0.3
    return new EffectLeaf(
      lx,
      Math.round(ly - vy * life),
      0,
      vy,
      FALLING_LEAF_COLORS[n % FALLING_LEAF_COLORS.length],
      life,
      delay,
      Math.floor(rand() * 16),
    )
  })
}

/** The sounds of the reveal */
export type RevealSounds = {
  /** as the bolt strikes (each strike) */
  bolt?: () => void
  /** at the climax */
  climax?: () => void
}

/**
 * The reveal of the letter laid at the cell (i, j), round it (the
 * letter itself rises by its pose, see revealPose and Item): after a
 * beat, a small bolt of lightning strikes the cell (it flickers in grays,
 * a flash where it hits, a scorch left a while), three times, a beat
 * after each; then a few gray leaves fall round the cell, swaying, each
 * gone at once as it lands; after a beat, the ground line shimmers while
 * the letter comes up out of it a row at a time (chips of earth kicked
 * aside), and at the climax the game's five lines go out of it, a ring of
 * sparkles goes out, a white frame flashes round it and stars twinkle at
 * its corners
 */
export class GlyphReveal extends Group {
  readonly i: number
  readonly j: number
  readonly x: number
  readonly y: number
  readonly cx: number
  readonly cy: number
  /** For each strike, the two shapes of the bolt it flickers between */
  #bolts: [number, number][][][]
  #lines: EffectLine0[] = []
  #leaves: EffectLeaf[]
  #sparks: Spark[] = []
  #chips: Spark[] = []
  #rand: Rand
  #sounds: RevealSounds
  constructor(
    i: number,
    j: number,
    born: number,
    sounds: RevealSounds = {},
    rand: Rand = Math.random,
  ) {
    super(born)
    this.i = i
    this.j = j
    this.x = i * CELL_SIZE
    this.y = j * CELL_SIZE
    this.cx = this.x + CELL_SIZE / 2
    this.cy = this.y + CELL_SIZE / 2
    this.#rand = rand
    this.#sounds = sounds
    const strike = this.y + BOLT_STRIKE
    this.#bolts = BOLTS.map(() => [
      boltPath(this.cx, strike, rand),
      boltPath(this.cx, strike, rand),
    ])
    this.#leaves = fallingLeaves(this.cx, this.cy, rand)
  }
  /** Frames since the reveal started (negative while it waits) */
  get t(): number {
    return this.f - REVEAL_DELAY
  }
  get floor(): number {
    return this.y + CELL_SIZE
  }
  /** The leaves still falling (none before their beat) */
  get leaves(): readonly EffectLeaf[] {
    return this.t >= REVEAL.leaves[0] ? this.#leaves : []
  }
  /** The latest strike, and frames since it started (u < 0: none yet) */
  get #strike(): { k: number; u: number } {
    const t = this.t
    for (let k = BOLTS.length - 1; k >= 0; k--) {
      if (t >= BOLTS[k][0]) return { k, u: t - BOLTS[k][0] }
    }
    return { k: 0, u: t - BOLTS[0][0] }
  }
  /** The bolt shown this frame and its color; null: none */
  get bolt(): { path: [number, number][]; color: PaletteColor } | null {
    const { k, u } = this.#strike
    if (u < 0 || u >= BOLT_FRAMES) return null
    // on 2, off 1, the other shape on 2, off 1, on 1, off 1
    const [a, b] = this.#bolts[k]
    if (u < 2) return { path: a, color: Palette.white }
    if (u === 3 || u === 4) return { path: b, color: Palette.gray1 }
    if (u === 6) return { path: a, color: Palette.white }
    return null
  }
  tick(field: Pick<IField, "time">) {
    const t = this.t
    if (BOLTS.some(([b0]) => t === b0)) this.#sounds.bolt?.()
    if (t > REVEAL.leaves[0]) {
      for (const leaf of this.#leaves) leaf.step(field as IField)
      this.#leaves = this.#leaves.filter((leaf) => !leaf.finished)
    }
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
      this.#sounds.climax?.()
      const { speed, p0, dist } = CLIMAX_LINES
      this.#lines = linePattern0(
        DIRS,
        this.i,
        this.j,
        speed,
        p0,
        dist,
        CLIMAX_LINE_COLOR,
      )
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
    for (const line of this.#lines) line.step(field as IField)
    this.#lines = this.#lines.filter((line) => !line.finished)
    for (const s of this.#sparks) s.step()
    for (const c of this.#chips) {
      c.vy += 0.15
      c.step()
    }
    this.#chips = this.#chips.filter((c) => !c.done)
  }
  /** Done when the climax is over and its lines are gone */
  get finished(): boolean {
    return this.t >= REVEAL.climax[1] && this.#lines.length === 0
  }
  *boxes(): Generator<IColorBox> {
    const t = this.t
    if (t < 0) return
    const { x, y, cx } = this
    const S = CELL_SIZE
    const pose = revealPose(t + REVEAL_DELAY)
    const [r0, r1] = REVEAL.rise
    // the scorch where the bolt struck, left a while
    const { u } = this.#strike
    const sy = y + BOLT_STRIKE
    if (u >= 0 && u < SCORCH_FRAMES) {
      yield box(cx - 2, sy, 5, 1, Palette.gray4)
      yield box(cx - 1, sy - 1, 3, 1, Palette.black)
      yield box(cx - 3, sy + 1, 1, 1, Palette.black)
      yield box(cx + 3, sy + 1, 1, 1, Palette.black)
    }
    // the bolt: a white (or gray1) core with a black edge all round
    const bolt = this.bolt
    if (bolt) {
      for (const [px, py] of bolt.path) {
        yield box(px - 1, py - 1, 3, 3, Palette.black)
      }
      for (const [px, py] of bolt.path) yield box(px, py, 1, 1, bolt.color)
    }
    // the flash where it hits, its first 2 frames
    if (u >= 0 && u < 2) {
      yield box(cx - 3, sy, 7, 2, Palette.white)
      yield box(cx - 5, sy + 1, 1, 1, Palette.gray4)
      yield box(cx + 5, sy + 1, 1, 1, Palette.gray4)
      yield box(cx - 4, sy - 2, 1, 1, Palette.gray4)
      yield box(cx + 4, sy - 2, 1, 1, Palette.gray4)
    }
    // the leaves falling round the cell
    for (const leaf of this.leaves) {
      if (leaf.visible) yield box(leaf.x, leaf.y, leaf.w, leaf.h, leaf.color)
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
      const v = t - k0
      if (v < 2 || (v >= 4 && v < 6)) {
        yield* frame(x, y + pose.dy, S, S, Palette.white)
      }
      if (v < 20) {
        const arm = (v >> 2) % 2 === 0 ? 1 : 2
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
    for (const line of this.#lines) {
      if (line.w > 0 && line.h > 0) {
        yield box(line.x, line.y, line.w, line.h, line.color)
      }
    }
    for (const s of this.#sparks) yield* s.boxes()
  }
}
