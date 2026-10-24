// The pair (ideas/goal-types.md, 対をそろえる): two plinths side by side
// on the open land of the WILDS, one holding a stone or a boulder (the
// twin, `pair-twin`), the other empty (`pair-plinth`). Bring the same
// kind to rest on the empty one and the pair is whole: the thing settles
// on it, both light up and the reward appears a little way off, once
// (where: rewardCell, model/glyph.ts, from the cell by the pair the map
// gives). The other kind on it does nothing but lie there ("NOT A
// PAIR"); a thing of it always lies near, the easier one to bring.
// tools/pairs.ts makes the pairs and tools/generate_wilds.ts places them.
//
// The reward is an unreadable letter (model/glyph.ts), each pair its
// own: the letter's id is "pair.<id>.reward". A whole pair is kept with
// the collected item ids ("pair.<id>"), and so is the thing that went on
// the plinth (it doesn't come back with the place, see goneActorKey) and
// the letter once taken: they last in the save (written as soon as the
// pair is whole).
import { CELL_SIZE } from "../util/constants.ts"
import { saveProgress } from "../util/save.ts"
import * as signal from "../util/signals.ts"
import { goneActorKey } from "./actor.ts"
import { celebrateGoal } from "./celebrate.ts"
import { glyphOf, glyphType, layGlyph, rewardCell } from "./glyph.ts"
import { Item } from "./item.ts"
import type { Prop } from "./prop.ts"
import type { IActor, IField } from "./types.ts"

/** The collected-id key of a whole pair */
export const pairKey = (id: string) => `pair.${id}`
/** true if the collected id records a whole pair (not its reward) */
export const isPairKey = (key: string) =>
  key.startsWith("pair.") && !key.endsWith(".reward")
/**
 * The collected-id key (and the item id) of a pair's reward: the id of
 * its unreadable letter
 */
export const pairRewardKey = (id: string) => `pair.${id}.reward`
/** The item type of a pair's reward: its unreadable letter */
export const pairRewardType = (id: string) =>
  glyphType(glyphOf(pairRewardKey(id)))

/** What a twin holds and a plinth takes */
export type PairKind = "stone" | "boulder"

type PlinthData = {
  id?: string
  /** The kind it takes: what its twin holds */
  want?: PairKind
  /**
   * The cell by the pair the reward is reached from (world cell); it
   * comes up a little way off (rewardCell)
   */
  reward?: [number, number]
}
type TwinData = { id?: string; holds?: PairKind }

/** true if the pair of the id is whole */
export const isWhole = (id: string) => Item.isCollected(pairKey(id))

/** At rest in its cell (not passing through it, nor still moving in) */
const atRest = (actor: IActor) =>
  actor.x === actor.i * CELL_SIZE && actor.y === actor.j * CELL_SIZE

/** The thing of the other kind last told it isn't a pair, per plinth */
const told = new WeakMap<Prop, IActor>()

/**
 * The empty plinth: it waits for a thing of its twin's kind to come to
 * rest on it. A whole pair shows it holding one, lit (and solid), and
 * its reward lies by it until taken
 */
export function stepPairPlinth(prop: Prop, field: IField) {
  const data = (prop.data ?? {}) as PlinthData
  const { id, want } = data
  if (!id || !want) return
  if (isWhole(id)) {
    if (prop.canEnter) prop.setOpen(false, false)
    prop.showStage(want === "boulder" ? 2 : 1)
    if (field.time % 30 === 0) layReward(field, prop, data)
    return
  }
  prop.showStage(0)
  for (const actor of field.actors.get(prop.i, prop.j)) {
    if (!atRest(actor)) continue
    if (actor.type === want) {
      pairUp(prop, field, actor, data)
      return
    }
    if (
      (actor.type === "stone" || actor.type === "boulder") &&
      told.get(prop) !== actor
    ) {
      told.set(prop, actor)
      signal.message.update({ text: "NOT A PAIR" })
    }
  }
}

/** The thing settles on the plinth: the pair is whole */
function pairUp(prop: Prop, field: IField, actor: IActor, data: PlinthData) {
  const id = data.id!
  Item.collect(pairKey(id))
  Item.collect(goneActorKey(actor.id))
  saveProgress()
  field.actors.remove(actor)
  prop.setOpen(false, false)
  prop.showStage(data.want === "boulder" ? 2 : 1)
  // the hit stop, the lines, and the letter coming up (model/celebrate.ts)
  const rewardId = pairRewardKey(id)
  const at = data.reward &&
    (rewardCell(field, prop.i, prop.j, data.reward, rewardId) ?? data.reward)
  celebrateGoal(
    field,
    prop.i,
    prop.j,
    "A PAIR",
    at && { i: at[0], j: at[1], id: rewardId },
  )
}

/**
 * The reward by the pair, laid again (its place loaded again) unless it
 * was taken: it just lies there
 */
function layReward(field: IField, prop: Prop, data: PlinthData) {
  if (!data.id || !data.reward) return
  const id = pairRewardKey(data.id)
  const at = rewardCell(field, prop.i, prop.j, data.reward, id)
  if (at) layGlyph(field, at[0], at[1], id)
}

/** The twin: what it holds, lit once the pair is whole */
export function stepPairTwin(prop: Prop, _field: IField) {
  const { id, holds } = (prop.data ?? {}) as TwinData
  const lit = !!id && isWhole(id)
  prop.showStage((holds === "boulder" ? 1 : 0) + (lit ? 2 : 0))
}
