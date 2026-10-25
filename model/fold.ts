// The stray sheep (ideas/goal-types.md, 囲いに戻す): a small fold on the
// open land of the WILDS, its fence round it (the H fence) and a gate in
// its one gateway (`fold-gate`), empty; a sheep grazing a few cells off.
// Herd it in (it runs from the player within 3 cells, model/actor.ts)
// and the gate swings shut on it: the reward appears a little way off,
// once (where: rewardCell, model/glyph.ts, from the cell by the gate the
// map gives). No new rule. tools/folds.ts makes the folds and
// tools/generate_wilds.ts places them.
//
// The reward is an unreadable letter (model/glyph.ts), each fold its
// own: the letter's id is "fold.<id>.reward". A full fold is kept with
// the collected item ids ("fold.<id>"), and so is the stray (it doesn't
// come back to graze outside with the place, see goneActorKey): in its
// place, the fold has a sheep of its own in it when its place is loaded
// again. They last in the save (written as soon as the gate shuts).
import { saveProgress } from "../util/save.ts"
import { goneActorKey } from "./actor.ts"
import { celebrateGoal } from "./celebrate.ts"
import { glyphOf, glyphType, layGlyph, rewardCell } from "./glyph.ts"
import { Item } from "./item.ts"
import type { Prop } from "./prop.ts"
import type { IActor, IField } from "./types.ts"

/** The collected-id key of a full fold */
export const foldKey = (id: string) => `fold.${id}`
/** true if the collected id records a full fold (not its reward) */
export const isFoldKey = (key: string) =>
  key.startsWith("fold.") && !key.endsWith(".reward")
/**
 * The collected-id key (and the item id) of a fold's reward: the id of
 * its unreadable letter
 */
export const foldRewardKey = (id: string) => `fold.${id}.reward`
/** The item type of a fold's reward: its unreadable letter */
export const foldRewardType = (id: string) =>
  glyphType(glyphOf(foldRewardKey(id)))

/** What goes in a fold */
export const FLOCK = "sheep"

type FoldData = {
  id?: string
  /** The inside of the fold (world cells, inclusive) */
  i0?: number
  j0?: number
  i1?: number
  j1?: number
  /**
   * The cell by the gate the reward is reached from (world cell); it
   * comes up a little way off (rewardCell)
   */
  reward?: [number, number]
}

/** true if the fold of the id is full */
export const isFull = (id: string) => Item.isCollected(foldKey(id))

/** The sheep inside the fold, if any */
function sheepIn(field: IField, data: FoldData): IActor | null {
  for (const a of field.actors.iter()) {
    if (
      a.type === FLOCK && a.i >= data.i0! && a.i <= data.i1! &&
      a.j >= data.j0! && a.j <= data.j1!
    ) return a
  }
  return null
}

/** The folds that have had their own sheep put back in, this load */
const restocked = new WeakSet<Prop>()

/**
 * The gate: open till a sheep is inside the fold, then it shuts (when
 * no one stands in the gateway) and stays shut, a sheep inside and the
 * reward by it until taken
 */
export function stepFoldGate(prop: Prop, field: IField) {
  const data = (prop.data ?? {}) as FoldData
  const { id } = data
  if (!id || data.i0 === undefined) return
  const occupied = field.actors.get(prop.i, prop.j).length > 0
  if (isFull(id)) {
    if (!occupied) {
      prop.setOpen(false, false)
      prop.showStage(1)
    }
    if (field.time % 30 !== 0) return
    if (!restocked.has(prop)) {
      // loaded again: the fold's own sheep, in its place
      restocked.add(prop)
      if (!sheepIn(field, data)) {
        field.spawnActor(FLOCK, data.i0, data.j0!, "down")
      }
    }
    layReward(field, prop, data)
    return
  }
  prop.showStage(0)
  if (field.time % 10 !== 0) return
  const sheep = sheepIn(field, data)
  if (!sheep) return
  restocked.add(prop)
  Item.collect(foldKey(id))
  Item.collect(goneActorKey(sheep.id))
  saveProgress()
  if (!occupied) {
    prop.setOpen(false, false)
    prop.showStage(1)
  }
  // the hit stop, the lines, and the letter coming up (model/celebrate.ts)
  const rewardId = foldRewardKey(id)
  const at = data.reward &&
    (rewardCell(field, prop.i, prop.j, data.reward, rewardId) ?? data.reward)
  celebrateGoal(
    field,
    prop.i,
    prop.j,
    "THE SHEEP IS HOME",
    at && { i: at[0], j: at[1], id: rewardId },
  )
}

/**
 * The reward by the fold, laid again (its place loaded again) unless it
 * was taken: it just lies there
 */
function layReward(field: IField, prop: Prop, data: FoldData) {
  if (!data.id || !data.reward) return
  const id = foldRewardKey(data.id)
  const at = rewardCell(field, prop.i, prop.j, data.reward, id)
  if (at) layGlyph(field, at[0], at[1], id)
}
