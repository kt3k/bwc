// A goal done (model/goal.ts), the moment of it, the same for every kind
// of goal: at once (no pause, no white noise, no hit stop, no shake) the
// sound and the message come and the game's five white lines go out of
// the goal cell.
// When they are gone, a little way off, a small bolt of lightning
// strikes, a few leaves fall, and the reward letter comes up out of the
// ground (model/goal-fx.ts has the effects and their timings,
// model/glyph.ts the letter and where it comes up).
import * as signal from "../util/signals.ts"
import { GoalLines } from "./goal-fx.ts"
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
  field.effects.add(
    new GoalLines(i, j, field.time, () => {
      signal.playSound("powerUp")
      signal.message.update({ text })
    }),
  )
  if (reward) revealGlyph(field, reward.i, reward.j, reward.id)
}
