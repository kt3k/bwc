// The dais to clear (ideas/goal-types.md, 空ける): a carved stone dais
// on the open land of the WILDS with a stone or a boulder sitting on it,
// in a nook where a push from the way in only jams it. Get it off and
// the dais is clear: its carving lights up and the reward appears a
// little way off, once (where: rewardCell, model/glyph.ts, from the cell
// by the dais the map gives). No new rule. tools/clears.ts makes the
// daises and tools/generate_wilds.ts places them.
//
// The dais (`clear-dais`) is walked and rolled over like the ground. It
// waits to see what sits on it (an actor other than the player, at rest
// on it: the map's spawns come in after the props), then for that to be
// gone (pushed off, rolled off, sunk, crushed).
//
// The reward is an unreadable letter (model/glyph.ts), each dais its
// own: the letter's id is "clear.<id>.reward". A clear dais is kept with
// the collected item ids ("clear.<id>"), and so is what sat on it (it
// doesn't come back to sit there again with the place, see goneActorKey)
// and the letter once taken: they last in the save (written as soon as
// the dais is clear).
import { CELL_SIZE } from "../util/constants.ts"
import { saveProgress } from "../util/save.ts"
import { goneActorKey } from "./actor.ts"
import { celebrateGoal } from "./celebrate.ts"
import { glyphOf, glyphType, layGlyph, rewardCell } from "./glyph.ts"
import { Item } from "./item.ts"
import { circleBirds } from "./flock.ts"
import type { Prop } from "./prop.ts"
import type { IActor, IField } from "./types.ts"

/** The collected-id key of a clear dais */
export const clearKey = (id: string) => `clear.${id}`
/** true if the collected id records a clear dais (not its reward) */
export const isClearKey = (key: string) =>
  key.startsWith("clear.") && !key.endsWith(".reward")
/**
 * The collected-id key (and the item id) of a dais' reward: the id of
 * its unreadable letter
 */
export const clearRewardKey = (id: string) => `clear.${id}.reward`
/** The item type of a dais' reward: its unreadable letter */
export const clearRewardType = (id: string) =>
  glyphType(glyphOf(clearRewardKey(id)))

type DaisData = {
  id?: string
  /**
   * The cell by the dais the reward is reached from (world cell); it
   * comes up a little way off (rewardCell)
   */
  reward?: [number, number]
}

/** true if the dais of the id is clear */
export const isClear = (id: string) => Item.isCollected(clearKey(id))

/** At rest in its cell (not passing through it, nor still moving in) */
const atRest = (actor: IActor) =>
  actor.x === actor.i * CELL_SIZE && actor.y === actor.j * CELL_SIZE

/** What was seen sitting on the dais, per dais */
const sitting = new WeakMap<Prop, IActor>()

/**
 * The dais: what sits on it is seen, and once it is gone the dais is
 * clear. A clear dais shows its carving lit, and its reward lies by it
 * until taken
 */
export function stepClearDais(prop: Prop, field: IField) {
  const data = (prop.data ?? {}) as DaisData
  const { id } = data
  if (!id) return
  if (isClear(id)) {
    prop.showStage(1)
    if (field.time % 30 === 0) layReward(field, prop, data)
    return
  }
  prop.showStage(0)
  // birds wheel over a dais not yet clear (model/flock.ts)
  circleBirds(prop, field, () => isClear(id))
  const here = field.actors.get(prop.i, prop.j).filter((a) => a.id !== "main")
  const seen = sitting.get(prop)
  if (!seen) {
    const sits = here.find(atRest)
    if (sits) sitting.set(prop, sits)
    return
  }
  if (here.includes(seen)) return
  clear(prop, field, seen, data)
}

/** What sat on the dais is gone: the dais is clear */
function clear(prop: Prop, field: IField, gone: IActor, data: DaisData) {
  const id = data.id!
  Item.collect(clearKey(id))
  Item.collect(goneActorKey(gone.id))
  saveProgress()
  prop.showStage(1)
  // the hit stop, the lines, and the letter coming up (model/celebrate.ts)
  const rewardId = clearRewardKey(id)
  const at = data.reward &&
    (rewardCell(field, prop.i, prop.j, data.reward, rewardId) ?? data.reward)
  celebrateGoal(
    field,
    prop.i,
    prop.j,
    "THE DAIS IS CLEAR",
    at && { i: at[0], j: at[1], id: rewardId },
  )
}

/**
 * The reward by the dais, laid again (its place loaded again) unless it
 * was taken: it just lies there
 */
function layReward(field: IField, prop: Prop, data: DaisData) {
  if (!data.id || !data.reward) return
  const id = clearRewardKey(data.id)
  const at = rewardCell(field, prop.i, prop.j, data.reward, id)
  if (at) layGlyph(field, at[0], at[1], id)
}
