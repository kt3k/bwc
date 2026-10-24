// The goals done (ideas/goal-types.md): what the island keeps count of
// as the player solves its goals (Odradek turns up in one more corner
// for each, model/odradek.ts).
//
// Every goal kind records a goal done with the collected item ids, under
// a key of its own, as soon as it is done (a whole ring: "ring.<id>",
// model/ring.ts; an odd one out found: "odd.<id>", model/odd-one.ts; a
// bell rung: "bell.<id>", model/bell.ts; a whole pair: "pair.<id>",
// model/pair.ts; a clear dais: "clear.<id>", model/clear.ts; a statue
// that has seen: "gaze.<id>", model/gaze.ts),
// so the count lasts in the save. A new kind of goal adds the test of
// its key to DONE_KEYS and is counted too.
//
// The count is of the goals done, not of the letters picked up (the
// reward, model/glyph.ts): a goal counts the moment it is done, whether
// or not its letter was taken yet.
import { Item } from "./item.ts"
import { isRingKey } from "./ring.ts"
import { isOddKey } from "./odd-one.ts"
import { isBellKey } from "./bell.ts"
import { isPairKey } from "./pair.ts"
import { isClearKey } from "./clear.ts"
import { isGazeKey } from "./gaze.ts"

/** The tests of the keys the goal kinds record a goal done with */
export const DONE_KEYS: readonly ((key: string) => boolean)[] = [
  isRingKey,
  isOddKey,
  isBellKey,
  isPairKey,
  isClearKey,
  isGazeKey,
]

/** true if the collected id records a goal done */
export const isGoalKey = (key: string) => DONE_KEYS.some((test) => test(key))

/** How many goals have been done so far */
export function goalsDone(): number {
  return Item.countCollected(isGoalKey)
}
