// Instincts (docs/playtest-2026-10-21.md, plan 1): each animal of the
// WILDS likes one kind of thing and fears one. That is the whole rule:
//
// - it goes for what it likes (a thing on the ground, or another animal)
// - it runs from what it fears
//
// and the animals set each other going: an apple draws the rabbits out,
// the rabbits draw the fox from its den, the fox scatters the sheep, the
// bees drive off the fox and the cat. What it is doing shows over its
// head: "!" when it is after something, a drop of sweat when it is afraid,
// a heart when it is pleased.
import { Palette, type PaletteColor } from "../util/palette.ts"
import { CELL_SIZE } from "../util/constants.ts"
import { seed } from "../util/random.ts"
import type { Actor } from "./actor.ts"
import { findBait } from "./bait.ts"
import { manhattan, stepAway, stepToward } from "./steering.ts"
import type {
  IActor,
  IColorBox,
  IField,
  IFinishable,
  IStepper,
} from "./types.ts"

/** What each animal likes: an item it eats, or an animal it hunts */
export const LIKES: Record<string, { item?: string; actor?: string }> = {
  rabbit: { item: "apple" },
  chaser: { item: "apple" },
  fox: { item: "fish", actor: "rabbit" },
  cat: { item: "fish", actor: "chick" },
}

/** What each animal fears (another animal) */
export const FEARS: Record<string, string> = {
  rabbit: "fox",
  sheep: "fox",
  chick: "cat",
  crow: "cat",
  fox: "bee",
  cat: "bee",
  chaser: "bee",
}

/** How near a feared animal sends it running */
export const FEAR_RANGE = 4
/** How far it sees what it likes */
export const LIKE_RANGE = 6

// ---------------------------------------------------------------------
// the marks over the head

type MarkKind = "notice" | "fear" | "love"

/** The marks as rows of pixels (5 wide), and their color */
const MARKS: Record<MarkKind, { rows: string[]; color: PaletteColor }> = {
  notice: {
    rows: ["..#..", "..#..", "..#..", ".....", "..#.."],
    color: Palette.white,
  },
  fear: { rows: ["..#..", ".###.", ".###.", "..#.."], color: Palette.blue1 },
  love: { rows: [".#.#.", "#####", ".###.", "..#.."], color: Palette.pink2 },
}

/** One pixel of a mark, over the head for a while, blinking out at the end */
class EffectMarkPixel implements IColorBox, IFinishable, IStepper {
  #frame = 0
  readonly w = 1
  readonly h = 1
  constructor(
    readonly x: number,
    readonly y: number,
    readonly color: PaletteColor,
    readonly life = 90,
  ) {}
  step(_field: IField): void {
    this.#frame++
  }
  get visible(): boolean {
    return this.#frame < this.life - 12 || (this.#frame >> 2) % 2 === 0
  }
  get finished(): boolean {
    return this.#frame >= this.life
  }
}

/** Shows the mark over the head of whoever stands at (i, j) */
export function mark(field: IField, kind: MarkKind, i: number, j: number) {
  const { rows, color } = MARKS[kind]
  const x0 = i * CELL_SIZE + 10
  const y0 = j * CELL_SIZE - rows.length - 1
  rows.forEach((row, y) => {
    ;[...row].forEach((c, x) => {
      if (c === "#") {
        field.effects.add(new EffectMarkPixel(x0 + x, y0 + y, color))
      }
    })
  })
}

/** Marks the actor, but not again within `gap` frames for the same kind */
export function markOnce(
  actor: Actor,
  field: IField,
  kind: MarkKind,
  gap = 120,
) {
  const key = `mark.${kind}`
  const last = (actor.buff[key] as number | undefined) ?? -Infinity
  if (field.time - last < gap) return
  actor.buff[key] = field.time
  mark(field, kind, actor.i, actor.j)
}

// ---------------------------------------------------------------------
// the instinct

/** The nearest actor of the type within the manhattan range */
export function nearestOf(
  field: IField,
  type: string,
  i: number,
  j: number,
  range: number,
): IActor | null {
  let best: IActor | null = null
  let bestDist = Infinity
  for (const a of field.actors.iter()) {
    if (a.type !== type) continue
    const d = manhattan(a.i, a.j, i, j)
    if (d <= range && d < bestDist) {
      best = a
      bestDist = d
    }
  }
  return best
}

/** true while the animal sleeps (a cat or fox after a fish) */
const asleep = (actor: Actor, field: IField) =>
  ((actor.buff.asleepUntil as number | undefined) ?? 0) > field.time

/** The feared animal near the actor, if any */
export function feared(actor: Actor, field: IField): IActor | null {
  const fear = FEARS[actor.type]
  return fear ? nearestOf(field, fear, actor.i, actor.j, FEAR_RANGE) : null
}

/**
 * Runs before the animal's own idle: fear first (it runs), then a hunted
 * animal in sight (it gives chase). Returns true when it acted; the
 * animal's own ways (eating what is put down, grazing, the rest) go on
 * otherwise. The rabbit's fear is its own (down a hole: model/den.ts).
 */
export function instinct(actor: Actor, field: IField): boolean {
  if (actor.id === "main" || asleep(actor, field)) return false
  const next = (actor.buff.instinctAt as number | undefined) ?? 0
  if (field.time < next) return true
  const { choice } = seed(`${actor.id}.${field.time}.instinct`)
  const threat = actor.type === "rabbit" ? null : feared(actor, field)
  if (threat) {
    markOnce(actor, field, "fear")
    actor.buff.instinctAt = field.time + 8
    stepAway(actor, field, threat.i, threat.j, choice, 2)
    return true
  }
  const like = LIKES[actor.type]
  if (like?.item && findBait(field, actor.i, actor.j, like.item, LIKE_RANGE)) {
    // its own way of going for it; the mark says it saw it
    markOnce(actor, field, "notice")
    return false
  }
  if (like?.actor) {
    const prey = nearestOf(field, like.actor, actor.i, actor.j, LIKE_RANGE)
    if (prey) {
      markOnce(actor, field, "notice")
      actor.buff.instinctAt = field.time + 14
      stepToward(actor, field, prey.i, prey.j)
      return true
    }
  }
  return false
}
