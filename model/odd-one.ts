// The odd one out (ideas/goal-types.md, 1 つだけ違う): out on the open
// land of the WILDS, a small and plainly regular arrangement of the same
// thing (a row of tulips, a ring of toadstools, a flock of stone birds,
// ...) where one of them is not quite like the others: it leans the
// other way, it is upside down, it has a crack, one stone too many. No
// new rule: the trick is to notice. Bump into the odd one and it falls
// in line with the others (the cracked stone splits open), and the
// reward appears a little way off, once (where: rewardCell,
// model/glyph.ts, from the cell by it the map gives). Bumping the others is bumping any
// solid thing: nothing more.
//
// tools/odd_ones.ts makes the arrangements, tools/generate_wilds.ts
// places them and tools/draw_odd_ones.ts draws them. Each family is two
// props: `alike-<family>` (the many, plain props) and `unlike-<family>`
// (the odd one: its growth stages are as found at first, then fallen in
// line once found).
//
// The reward is an unreadable letter (model/glyph.ts), each odd one its
// own: the letter's id is "odd.<id>.reward". A found one is kept with the
// collected item ids ("odd.<id>") and lasts in the save (written as soon
// as it is found), and so does the letter once taken.
import { saveProgress } from "../util/save.ts"
import { celebrateGoal } from "./celebrate.ts"
import { glyphOf, glyphType, layGlyph, rewardCell } from "./glyph.ts"
import { Item } from "./item.ts"
import type { Prop, PushedDelegate } from "./prop.ts"
import type { IField, PushedEvent } from "./types.ts"
import {
  alikeType,
  ODD_FAMILIES,
  type OddFamily,
  unlikeType,
} from "./odd-families.ts"

export { alikeType, ODD_FAMILIES, type OddFamily, unlikeType }

/** The collected-id key of a found odd one */
export const oddKey = (id: string) => `odd.${id}`
/** true if the collected id records a found odd one (not its reward) */
export const isOddKey = (key: string) =>
  key.startsWith("odd.") && !key.endsWith(".reward")
/**
 * The collected-id key (and the item id) of an odd one's reward: the id
 * of its unreadable letter
 */
export const oddRewardKey = (id: string) => `odd.${id}.reward`
/** The item type of an odd one's reward: its unreadable letter */
export const oddRewardType = (id: string) =>
  glyphType(glyphOf(oddRewardKey(id)))

type OddData = {
  id?: string
  /**
   * The cell by the odd one the reward is reached from (world cell); it
   * comes up a little way off (rewardCell)
   */
  reward?: [number, number]
}
const dataOf = (prop: Prop) => (prop.data ?? {}) as OddData

/** true if the odd one of the id has been found */
export const isFound = (id: string) => Item.isCollected(oddKey(id))

/**
 * The reward by the odd one, laid again (its place loaded again) unless
 * it was taken: it just lies there
 */
function layReward(field: IField, prop: Prop, data: OddData) {
  if (!data.id || !data.reward) return
  const id = oddRewardKey(data.id)
  const at = rewardCell(field, prop.i, prop.j, data.reward, id)
  if (at) layGlyph(field, at[0], at[1], id)
}

/**
 * The odd one, bumped into by the player: found. It falls in line with
 * the others and the reward appears, once
 */
export class UnlikePushed implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (event.pusher?.id !== "main") return
    const data = dataOf(prop)
    if (!data.id || isFound(data.id)) return
    Item.collect(oddKey(data.id))
    saveProgress()
    prop.showStage(1)
    // the hit stop, the lines, and the letter coming up (model/celebrate.ts)
    const id = oddRewardKey(data.id)
    const at = data.reward &&
      (rewardCell(field, prop.i, prop.j, data.reward, id) ?? data.reward)
    celebrateGoal(
      field,
      prop.i,
      prop.j,
      "ONE OF A KIND",
      at && { i: at[0], j: at[1], id },
    )
  }
}

/**
 * The odd one: as found once found (and its reward by it until taken),
 * odd until then
 */
export function stepUnlike(prop: Prop, field: IField) {
  const data = dataOf(prop)
  if (!data.id) return
  if (isFound(data.id)) {
    prop.showStage(1)
    if (field.time % 30 === 0) layReward(field, prop, data)
    return
  }
  prop.showStage(0)
}
