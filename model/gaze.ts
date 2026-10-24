// The statue's gaze (ideas/goal-types.md, 視線を通す): a stone head on
// the open land of the WILDS (`gaze-statue`) looking straight ahead at a
// sun-stone a few cells off (`gaze-sun`), the line between cluttered.
// One rule more: the statue sees straight ahead, and anything solid in
// the line blocks it: a tree, a rock, an upright bush, a stone, a
// boulder, a creature (water and the ground don't; the player doesn't).
// Clear the line and the statue sees the sun-stone: its eyes and the
// stone light up and the reward appears a little way off, once (where:
// rewardCell, model/glyph.ts, from the cell by the statue the map
// gives). tools/gazes.ts makes the statues and tools/generate_wilds.ts
// places them.
//
// The statue counts the line clear only after it has seen it blocked
// (the map's actors come in after its props: at first everything looks
// clear).
//
// The reward is an unreadable letter (model/glyph.ts), each statue its
// own: the letter's id is "gaze.<id>.reward". A statue that has seen is
// kept with the collected item ids ("gaze.<id>") and lasts in the save
// (written as soon as it sees), and so does the letter once taken.
import { nextGrid } from "../util/dir.ts"
import { saveProgress } from "../util/save.ts"
import { celebrateGoal } from "./celebrate.ts"
import { glyphOf, glyphType, layGlyph, rewardCell } from "./glyph.ts"
import { Item } from "./item.ts"
import type { Prop } from "./prop.ts"
import type { Dir, IField } from "./types.ts"

/** The collected-id key of a statue that has seen */
export const gazeKey = (id: string) => `gaze.${id}`
/** true if the collected id records a statue that has seen */
export const isGazeKey = (key: string) =>
  key.startsWith("gaze.") && !key.endsWith(".reward")
/**
 * The collected-id key (and the item id) of a statue's reward: the id of
 * its unreadable letter
 */
export const gazeRewardKey = (id: string) => `gaze.${id}.reward`
/** The item type of a statue's reward: its unreadable letter */
export const gazeRewardType = (id: string) =>
  glyphType(glyphOf(gazeRewardKey(id)))

type StatueData = {
  id?: string
  /** Where it looks */
  dir?: Dir
  /** The sun-stone's cell (world cell) */
  to?: [number, number]
  /**
   * The cell by the statue the reward is reached from (world cell); it
   * comes up a little way off (rewardCell)
   */
  reward?: [number, number]
}

/** The growth stage of a statue looking `dir` (then +4 once it has seen) */
const STAGE: Record<Dir, number> = { up: 0, down: 1, left: 2, right: 3 }

/** true if the statue of the id has seen its sun-stone */
export const hasSeen = (id: string) => Item.isCollected(gazeKey(id))

/** The statues that have seen their line blocked */
const blockedOnce = new WeakSet<Prop>()

/**
 * true if nothing solid stands in the line from (i, j) looking `dir`, up
 * to the sun-stone at `to` (not counted)
 */
export function lineClear(
  field: IField,
  i: number,
  j: number,
  dir: Dir,
  to: [number, number],
): boolean {
  for (let n = 0; n < 32; n++) {
    ;[i, j] = nextGrid(i, j, dir)
    if (i === to[0] && j === to[1]) return true
    if (field.isCellLoaded && !field.isCellLoaded(i, j)) return false
    if (field.actors.get(i, j).some((a) => a.id !== "main")) return false
    if (field.isWater(i, j)) continue
    if (!field.canEnterStatic(i, j)) return false
  }
  return false
}

/**
 * The statue: looking down its line every few frames; the first time
 * it sees the sun-stone (having seen the line blocked before), the goal
 * is done. Once it has seen, its eyes are lit and its reward lies by it
 * until taken
 */
export function stepGazeStatue(prop: Prop, field: IField) {
  const data = (prop.data ?? {}) as StatueData
  const { id, dir, to } = data
  if (!id || !dir || !to) return
  if (hasSeen(id)) {
    prop.showStage(STAGE[dir] + 4)
    if (field.time % 30 === 0) layReward(field, prop, data)
    return
  }
  prop.showStage(STAGE[dir])
  if (field.time % 4 !== 0) return
  if (!lineClear(field, prop.i, prop.j, dir, to)) {
    blockedOnce.add(prop)
    return
  }
  if (!blockedOnce.has(prop)) return
  Item.collect(gazeKey(id))
  saveProgress()
  prop.showStage(STAGE[dir] + 4)
  // the hit stop, the lines, and the letter coming up (model/celebrate.ts)
  const rewardId = gazeRewardKey(id)
  const at = data.reward &&
    (rewardCell(field, prop.i, prop.j, data.reward, rewardId) ?? data.reward)
  celebrateGoal(
    field,
    prop.i,
    prop.j,
    "THE STATUE SEES",
    at && { i: at[0], j: at[1], id: rewardId },
  )
}

/**
 * The reward by the statue, laid again (its place loaded again) unless
 * it was taken: it just lies there
 */
function layReward(field: IField, prop: Prop, data: StatueData) {
  if (!data.id || !data.reward) return
  const id = gazeRewardKey(data.id)
  const at = rewardCell(field, prop.i, prop.j, data.reward, id)
  if (at) layGlyph(field, at[0], at[1], id)
}

/** The sun-stone: lit once its statue has seen it */
export function stepGazeSun(prop: Prop, _field: IField) {
  const id = (prop.data as { id?: string } | undefined)?.id
  prop.showStage(id && hasSeen(id) ? 1 : 0)
}
