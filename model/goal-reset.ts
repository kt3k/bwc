// The reset of a goals debug map (tools/generate_goals_map.ts): the goals
// are kept in the save and never come back (model/goal.ts), which makes
// trying them again impossible. The `goal-reset` prop undoes the goals of
// one map only, and everything they left in the save:
//
// - the goals done and their letters: the collected ids "ring.<id>",
//   "odd.<id>", "bell.<id>", "pair.<id>", "clear.<id>", "gaze.<id>",
//   "beacon.<id>", "fold.<id>", "group.<id>", "chain.<id>" (and its links given,
//   "chain.<id>.link<k>") and "<...>.reward" whose goal id starts with the map's
//   prefix (the GOALS map names its goals "goals-...", the WILDS name
//   theirs by their cell, "<x>.<y>", so they never match), and the
//   letters held among them (signal.glyphs);
// - what the goals took from the map: the stones gone into a gap, onto
//   a plinth or off a dais, the sheep gone into a fold, the first thing
//   of a chain given
//   ("gone.actor.<i>.<j>...") and anything broken, opened or picked up
//   ("gone.<type>.<i>.<j>", "<i>.<j>.<type>") in the map's bounds.
//
// Then the page is loaded again at `to`, so the block comes back as it
// was drawn (the stones in their places, the water and the bushes too).
import { saveProgress } from "../util/save.ts"
import * as signal from "../util/signals.ts"
import { Item } from "./item.ts"
import type { Prop, PushedDelegate } from "./prop.ts"
import type { IField, PushedEvent } from "./types.ts"

export type GoalResetData = {
  /** The goal ids of the map start with this ("goals-") */
  prefix: string
  /** The map's bounds (world cells, inclusive): i0, j0, i1, j1 */
  box: [number, number, number, number]
  /** Where the player is put when the page is loaded again */
  to: [number, number]
}

/**
 * The goal kinds whose ids a reset matches (model/ring.ts, odd-one.ts,
 * bell.ts, pair.ts, clear.ts, gaze.ts, beacon.ts, fold.ts, chain.ts,
 * group-lever.ts)
 */
const GOAL_KINDS = [
  "ring",
  "odd",
  "bell",
  "pair",
  "clear",
  "gaze",
  "beacon",
  "fold",
  "chain",
  "group",
]

/** The cell a spawn-like collected id names, if any */
function cellOf(id: string): [number, number] | null {
  const m = /^gone\.actor\.(-?\d+)\.(-?\d+)\./.exec(id) ??
    /^gone\.[^.]+\.(-?\d+)\.(-?\d+)$/.exec(id) ??
    /^(-?\d+)\.(-?\d+)\.[^.]+$/.exec(id)
  return m ? [Number(m[1]), Number(m[2])] : null
}

/** true if the collected id is a goal (or its letter) of the map */
export function isMapGoalKey(id: string, prefix: string): boolean {
  return GOAL_KINDS.some((kind) => id.startsWith(`${kind}.${prefix}`))
}

/** true if the collected id belongs to the map (see the top) */
export function belongsToMap(
  id: string,
  { prefix, box }: Pick<GoalResetData, "prefix" | "box">,
): boolean {
  if (isMapGoalKey(id, prefix)) return true
  const cell = cellOf(id)
  if (!cell) return false
  const [i, j] = cell
  return i >= box[0] && i <= box[2] && j >= box[1] && j <= box[3]
}

/**
 * Forgets the goals of the map, their letters and what they took from
 * it, and writes the save. Returns how many collected ids were forgotten
 */
export function resetGoals(
  data: Pick<GoalResetData, "prefix" | "box">,
): number {
  const n = Item.forgetCollected((id) => belongsToMap(id, data))
  const glyphs = signal.glyphs.get()
  const kept = glyphs.filter((g) => !isMapGoalKey(g.id, data.prefix))
  if (kept.length !== glyphs.length) signal.glyphs.update(kept)
  saveProgress()
  return n
}

/** The `goal-reset` prop: bumped, it undoes the map's goals and reloads */
export class PushedDelegateResetGoals implements PushedDelegate {
  #triggered = false

  onPushed(event: PushedEvent, prop: Prop, _field: IField): void {
    if (this.#triggered || event.pusher?.id !== "main") return
    const data = prop.data as GoalResetData | undefined
    if (!data?.prefix || !data.box || !data.to) return
    this.#triggered = true
    resetGoals(data)
    signal.message.update({ text: "THE GOALS OF THIS MAP ARE UNDONE" })
    setTimeout(() => {
      location.hash = `#${data.to[0]},${data.to[1]}`
      location.reload()
    }, 500)
  }
}
