// A goal done (model/goal.ts), the moment of it, the same for every kind
// of goal: the world holds still a moment (the hit stop, input held
// too), the view shakes, and a burst goes off round the goal; the sound
// and the message come as the hit stop lets go. The reward letter comes
// up out of the ground beside it, slowly (model/goal-fx.ts has the
// effects and their timings).
import { hitStop, shake } from "../util/juice.ts"
import * as signal from "../util/signals.ts"
import { GOAL_HIT_STOP, GOAL_SHAKE, GoalBurst } from "./goal-fx.ts"
import { revealGlyph } from "./glyph.ts"
import type { IField } from "./types.ts"

/** The reward of a goal: the letter of the id, laid at (i, j) */
export type GoalReward = { i: number; j: number; id: string }

/**
 * Celebrates the goal done at the cell (i, j) with the message `text`,
 * and reveals its reward letter (unless it was already taken). Every
 * kind of goal calls this the moment it is done
 */
export function celebrateGoal(
  field: IField,
  i: number,
  j: number,
  text: string,
  reward?: GoalReward,
): void {
  hitStop(GOAL_HIT_STOP)
  shake(GOAL_HIT_STOP + GOAL_SHAKE)
  field.effects.add(
    new GoalBurst(i, j, field.time, () => {
      signal.playSound("powerUp")
      signal.message.update({ text })
    }),
  )
  if (reward) revealGlyph(field, reward.i, reward.j, reward.id)
}
