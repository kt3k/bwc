// The patrol's way (ideas/goal-types.md, 巡回の道を変える): a patrol on
// the open land of the WILDS walks to and fro on a straight lane, turning
// back at whatever it bumps into (model/actor.ts, the patrol), and further
// along the same line stands a stone lantern, the beacon (`patrol-beacon`),
// that only the patrol can light, by bumping into it on its round. Water
// and bushes cut the lane short of it: fill the water, flatten the bushes,
// and the patrol walks on and lights it; the reward appears a little way
// off, once (where: rewardCell, model/glyph.ts, from the cell by the
// beacon the map gives). Anyone else bumping into it gets nothing but a
// word. tools/patrols.ts makes the lanes and tools/generate_wilds.ts
// places them.
//
// The reward is an unreadable letter (model/glyph.ts), each beacon its
// own: the letter's id is "beacon.<id>.reward". A lit beacon is kept with
// the collected item ids ("beacon.<id>") and lasts in the save (written
// as soon as it is lit), and so does the letter once taken.
import { saveProgress } from "../util/save.ts"
import * as signal from "../util/signals.ts"
import { celebrateGoal } from "./celebrate.ts"
import { glyphOf, glyphType, layGlyph, rewardCell } from "./glyph.ts"
import { Item } from "./item.ts"
import type { Prop, PushedDelegate } from "./prop.ts"
import type { IField, PushedEvent } from "./types.ts"

/** The collected-id key of a lit beacon */
export const beaconKey = (id: string) => `beacon.${id}`
/** true if the collected id records a lit beacon (not its reward) */
export const isBeaconKey = (key: string) =>
  key.startsWith("beacon.") && !key.endsWith(".reward")
/**
 * The collected-id key (and the item id) of a beacon's reward: the id of
 * its unreadable letter
 */
export const beaconRewardKey = (id: string) => `beacon.${id}.reward`
/** The item type of a beacon's reward: its unreadable letter */
export const beaconRewardType = (id: string) =>
  glyphType(glyphOf(beaconRewardKey(id)))

/** The actor type that lights the beacons */
export const LIGHTER = "patrol"

type BeaconData = {
  id?: string
  /**
   * The cell by the beacon the reward is reached from (world cell); it
   * comes up a little way off (rewardCell)
   */
  reward?: [number, number]
}
const dataOf = (prop: Prop) => (prop.data ?? {}) as BeaconData

/** true if the beacon of the id is lit */
export const isLit = (id: string) => Item.isCollected(beaconKey(id))

/** The beacon: lit by the patrol bumping into it, once */
export class BeaconPushed implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    const data = dataOf(prop)
    if (!data.id || isLit(data.id)) return
    if (event.pusher?.type !== LIGHTER) {
      if (event.pusher?.id === "main") {
        signal.message.update({ text: "ONLY THE WATCH CAN LIGHT IT" })
      }
      return
    }
    Item.collect(beaconKey(data.id))
    saveProgress()
    prop.showStage(1)
    // the hit stop, the lines, and the letter coming up (model/celebrate.ts)
    const id = beaconRewardKey(data.id)
    const at = data.reward &&
      (rewardCell(field, prop.i, prop.j, data.reward, id) ?? data.reward)
    celebrateGoal(
      field,
      prop.i,
      prop.j,
      "THE WATCH LIGHTS THE BEACON",
      at && { i: at[0], j: at[1], id },
    )
  }
}

/**
 * The reward by the beacon, laid again (its place loaded again) unless
 * it was taken: it just lies there
 */
function layReward(field: IField, prop: Prop, data: BeaconData) {
  if (!data.id || !data.reward) return
  const id = beaconRewardKey(data.id)
  const at = rewardCell(field, prop.i, prop.j, data.reward, id)
  if (at) layGlyph(field, at[0], at[1], id)
}

/** The beacon: lit once lit (and its reward by it until taken) */
export function stepBeacon(prop: Prop, field: IField) {
  const data = dataOf(prop)
  if (!data.id) return
  if (isLit(data.id)) {
    prop.showStage(1)
    if (field.time % 30 === 0) layReward(field, prop, data)
    return
  }
  prop.showStage(0)
}
