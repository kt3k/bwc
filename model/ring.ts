// The missing ring (ideas/goal-types.md, 欠けた輪): a ring of stones on
// the open land of the WILDS with one place empty, the gap (`ring-slot`),
// round its heart (`ring-heart`); a stone lies near. Bring a stone or a
// boulder to rest in the gap and the ring is whole: the stone settles
// into it, the heart wakes and the reward appears a little way off the
// ring, once (where: rewardCell, model/glyph.ts, from the cell by the
// ring the map gives).
// tools/rings.ts makes the rings and tools/generate_wilds.ts places them.
//
// The reward is an unreadable letter (model/glyph.ts), each ring its own:
// the letter's id is "ring.<id>.reward" and its sign is drawn from it.
//
// A whole ring is kept with the collected item ids ("ring.<id>"), and so
// is the stone that went into it (it doesn't come back with the place,
// see goneActorKey) and the letter once taken ("ring.<id>.reward"):
// they last in the save (written as soon as the ring is whole).
import { CELL_SIZE } from "../util/constants.ts"
import { saveProgress } from "../util/save.ts"
import { goneActorKey } from "./actor.ts"
import { celebrateGoal } from "./celebrate.ts"
import { glyphOf, glyphType, layGlyph, rewardCell } from "./glyph.ts"
import { Item } from "./item.ts"
import type { Prop } from "./prop.ts"
import type { IActor, IField } from "./types.ts"

/** The collected-id key of a whole ring */
export const ringKey = (id: string) => `ring.${id}`
/** true if the collected id records a whole ring (not its reward) */
export const isRingKey = (key: string) =>
  key.startsWith("ring.") && !key.endsWith(".reward")
/**
 * The collected-id key (and the item id) of a ring's reward: the id of
 * its unreadable letter
 */
export const ringRewardKey = (id: string) => `ring.${id}.reward`
/** The item type of a ring's reward: its unreadable letter */
export const ringRewardType = (id: string) =>
  glyphType(glyphOf(ringRewardKey(id)))

/** What fills a gap: the things that are pushed about */
const FILLERS = new Set(["stone", "boulder"])

type SlotData = {
  id?: string
  /** What the ring is made of: "stone" (default) or "boulder" */
  kind?: string
  /**
   * The cell by the ring the reward is reached from (world cell); it
   * comes up a little way off (rewardCell)
   */
  reward?: [number, number]
}
const dataOf = (prop: Prop) => (prop.data ?? {}) as SlotData

/** The growth stage of the gap once filled (a stone, or a boulder) */
const filledStage = (data: SlotData) => data.kind === "boulder" ? 2 : 1

/** At rest in its cell (not passing through it, nor still moving in) */
const atRest = (actor: IActor) =>
  actor.x === actor.i * CELL_SIZE && actor.y === actor.j * CELL_SIZE

/** true if the ring of the id is whole */
export const isWhole = (id: string) => Item.isCollected(ringKey(id))

/**
 * The gap: it waits for a stone or a boulder to come to rest in it. A
 * whole ring shows the gap filled (and solid), and its reward lies by it
 * until taken
 */
export function stepRingSlot(prop: Prop, field: IField) {
  const data = dataOf(prop)
  const { id } = data
  if (!id) return
  if (isWhole(id)) {
    if (prop.canEnter) prop.setOpen(false, false)
    prop.showStage(filledStage(data))
    if (field.time % 30 === 0) layReward(field, prop, data)
    return
  }
  prop.showStage(0)
  for (const actor of field.actors.get(prop.i, prop.j)) {
    if (FILLERS.has(actor.type) && atRest(actor)) {
      fill(prop, field, actor)
      return
    }
  }
}

/** The stone settles into the gap: the ring is whole */
function fill(prop: Prop, field: IField, actor: IActor) {
  const data = dataOf(prop)
  const id = data.id!
  Item.collect(ringKey(id))
  Item.collect(goneActorKey(actor.id))
  saveProgress()
  field.actors.remove(actor)
  prop.setOpen(false, false)
  prop.showStage(filledStage(data))
  // the hit stop, the lines, and the letter coming up (model/celebrate.ts)
  const rewardId = ringRewardKey(id)
  const at = data.reward &&
    (rewardCell(field, prop.i, prop.j, data.reward, rewardId) ?? data.reward)
  celebrateGoal(
    field,
    prop.i,
    prop.j,
    "THE RING IS WHOLE",
    at && { i: at[0], j: at[1], id: rewardId },
  )
}

/**
 * The reward by the ring, laid again (its place loaded again) unless it
 * was taken: it just lies there
 */
function layReward(field: IField, prop: Prop, data: SlotData) {
  if (!data.id || !data.reward) return
  const id = ringRewardKey(data.id)
  const at = rewardCell(field, prop.i, prop.j, data.reward, id)
  if (at) layGlyph(field, at[0], at[1], id)
}

/** The heart wakes when the ring is whole */
export function stepRingHeart(prop: Prop, _field: IField) {
  const id = (prop.data as { id?: string } | undefined)?.id
  prop.showStage(id && isWhole(id) ? 1 : 0)
}
