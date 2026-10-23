// The missing ring (ideas/goal-types.md, 欠けた輪): a ring of stones on
// the open land of the WILDS with one place empty, the gap (`ring-slot`),
// round its heart (`ring-heart`); a stone lies near. Bring a stone or a
// boulder to rest in the gap and the ring is whole: the stone settles
// into it, the heart wakes and the reward appears beside the ring, once.
// tools/rings.ts makes the rings and tools/generate_wilds.ts places them.
//
// A whole ring is kept with the collected item ids ("ring.<id>"), and so
// is the stone that went into it (it doesn't come back with the place,
// see goneActorKey) and the reward once taken ("ring.<id>.reward"):
// they last in the save (written as soon as the ring is whole).
import { CELL_SIZE } from "../util/constants.ts"
import { DIRS } from "../util/dir.ts"
import { Palette } from "../util/palette.ts"
import { saveProgress } from "../util/save.ts"
import * as signal from "../util/signals.ts"
import { goneActorKey } from "./actor.ts"
import { linePattern0 } from "./effect.ts"
import { Item } from "./item.ts"
import type { Prop } from "./prop.ts"
import type { IActor, IField } from "./types.ts"

/**
 * The reward of a whole ring, the same for every ring (an item type of
 * the catalog). A placeholder: what it should be is not decided yet
 * (ideas/goal-types.md: the same every time, and meaningful)
 */
export const RING_REWARD = "gem"

/** The collected-id key of a whole ring */
export const ringKey = (id: string) => `ring.${id}`
/** The collected-id key (and the item id) of a ring's reward */
export const ringRewardKey = (id: string) => `ring.${id}.reward`

/** What fills a gap: the things that are pushed about */
const FILLERS = new Set(["stone", "boulder"])

type SlotData = {
  id?: string
  /** What the ring is made of: "stone" (default) or "boulder" */
  kind?: string
  /** Where the reward appears (world cell) */
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
    if (field.time % 30 === 0) layReward(field, data)
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
  signal.playSound("powerUp")
  signal.message.update({ text: "THE RING IS WHOLE" })
  for (
    const effect of linePattern0(DIRS, prop.i, prop.j, 1, 0.7, 3, Palette.white)
  ) {
    field.effects.add(effect)
  }
  layReward(field, data)
}

/** The reward by the ring, unless it was taken (once only) */
function layReward(field: IField, data: SlotData) {
  if (!data.id || !data.reward) return
  const key = ringRewardKey(data.id)
  if (Item.isCollected(key)) return
  const [i, j] = data.reward
  if (field.peekItems(i, j).some((item) => item.id === key)) return
  if (!field.spawnItem(RING_REWARD, i, j, key)) return
  for (const effect of linePattern0(DIRS, i, j, 1, 0.7, 2, Palette.white)) {
    field.effects.add(effect)
  }
}

/** The heart wakes when the ring is whole */
export function stepRingHeart(prop: Prop, _field: IField) {
  const id = (prop.data as { id?: string } | undefined)?.id
  prop.showStage(id && isWhole(id) ? 1 : 0)
}
