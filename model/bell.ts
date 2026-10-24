// The bell out of reach (ideas/goal-types.md, 鐘を鳴らす): a bell in a
// frame on the open land of the WILDS, where the player can't get to
// it: on an islet in a pond, in a hedge, behind rocks. One rule more:
// the bell rings when a thing bumps into it, a boulder rolled at it, a
// stone pushed or slid over the ice into it (and, some day, a sheep or a
// patrol). The player's own knock doesn't ring it: it is too heavy for a
// hand. Ring it and the reward appears a little way off, once (where:
// rewardCell, model/glyph.ts, from the cell by the bell the map gives).
// tools/bells.ts makes the bells and tools/generate_wilds.ts places
// them.
//
// The reward is an unreadable letter (model/glyph.ts), each bell its
// own: the letter's id is "bell.<id>.reward". A rung bell is kept with
// the collected item ids ("bell.<id>") and lasts in the save (written as
// soon as it rings), and so does the letter once taken. A rung bell
// rings again whenever something bumps into it, but only the first
// counts.
import { DIRS } from "../util/dir.ts"
import { Palette } from "../util/palette.ts"
import { saveProgress } from "../util/save.ts"
import * as signal from "../util/signals.ts"
import { celebrateGoal } from "./celebrate.ts"
import { linePattern0 } from "./effect.ts"
import { glyphOf, glyphType, layGlyph, rewardCell } from "./glyph.ts"
import { Item } from "./item.ts"
import type { Prop, PushedDelegate } from "./prop.ts"
import type { IField, PushedEvent } from "./types.ts"

/** The collected-id key of a rung bell */
export const bellKey = (id: string) => `bell.${id}`
/** true if the collected id records a rung bell (not its reward) */
export const isBellKey = (key: string) =>
  key.startsWith("bell.") && !key.endsWith(".reward")
/**
 * The collected-id key (and the item id) of a bell's reward: the id of
 * its unreadable letter
 */
export const bellRewardKey = (id: string) => `bell.${id}.reward`
/** The item type of a bell's reward: its unreadable letter */
export const bellRewardType = (id: string) =>
  glyphType(glyphOf(bellRewardKey(id)))

type BellData = {
  id?: string
  /**
   * The cell by the bell the reward is reached from (world cell); it
   * comes up a little way off (rewardCell)
   */
  reward?: [number, number]
}
const dataOf = (prop: Prop) => (prop.data ?? {}) as BellData

/** true if the bell of the id has been rung */
export const isRung = (id: string) => Item.isCollected(bellKey(id))

/** The growth stages: still, swung left, swung right, still once rung */
const STILL = 0, LEFT = 1, RIGHT = 2, RUNG = 3

/** How long a bell swings when it rings (frames) */
export const SWING_FRAMES = 48
/** How long each swing shows (frames) */
const SWING_STEP = 6

/** The frames of swinging left, per bell */
const swinging = new WeakMap<Prop, number>()

/** How near the player is to be for a bell to ring (cells) */
const HEARD = 16

/** true if the player is within HEARD cells of the bell */
function playerNear(field: IField, prop: Prop): boolean {
  for (const a of field.actors.iter()) {
    if (a.id !== "main") continue
    return Math.max(Math.abs(a.i - prop.i), Math.abs(a.j - prop.j)) <= HEARD
  }
  return false
}

/**
 * The bell: a thing bumping into it rings it (the first time, the goal
 * is done); the player's knock only thuds
 */
export class BellPushed implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    const data = dataOf(prop)
    const by = event.pusher
    if (!data.id || !by) return
    if (by.id === "main") {
      signal.playSound("hitHurt")
      signal.message.update({ text: "TOO HEAVY TO RING BY HAND" })
      return
    }
    // far from the player (a wild creature wandering into it, out of
    // sight), it is left be
    if (!playerNear(field, prop)) return
    swinging.set(prop, SWING_FRAMES)
    signal.playSound("bell", 0)
    for (
      const effect of linePattern0(
        DIRS,
        prop.i,
        prop.j,
        1,
        0.7,
        3,
        Palette.white,
      )
    ) {
      field.effects.add(effect)
    }
    if (isRung(data.id)) return
    Item.collect(bellKey(data.id))
    saveProgress()
    // the hit stop, the lines, and the letter coming up (model/celebrate.ts)
    const id = bellRewardKey(data.id)
    const at = data.reward &&
      (rewardCell(field, prop.i, prop.j, data.reward, id) ?? data.reward)
    celebrateGoal(
      field,
      prop.i,
      prop.j,
      "THE BELL RINGS",
      at && { i: at[0], j: at[1], id },
    )
  }
}

/**
 * The reward by the bell, laid again (its place loaded again) unless it
 * was taken: it just lies there
 */
function layReward(field: IField, prop: Prop, data: BellData) {
  if (!data.id || !data.reward) return
  const id = bellRewardKey(data.id)
  const at = rewardCell(field, prop.i, prop.j, data.reward, id)
  if (at) layGlyph(field, at[0], at[1], id)
}

/**
 * The bell: swinging a while after it rings, then still (lit once rung,
 * and its reward by it until taken)
 */
export function stepBell(prop: Prop, field: IField) {
  const data = dataOf(prop)
  if (!data.id) return
  const rung = isRung(data.id)
  const left = swinging.get(prop) ?? 0
  if (left > 0) {
    swinging.set(prop, left - 1)
    const n = Math.floor((SWING_FRAMES - left) / SWING_STEP)
    prop.showStage(
      [LEFT, rung ? RUNG : STILL, RIGHT, rung ? RUNG : STILL][n % 4],
    )
    return
  }
  prop.showStage(rung ? RUNG : STILL)
  if (rung && field.time % 30 === 0) layReward(field, prop, data)
}
