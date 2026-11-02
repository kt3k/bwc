// The Cayley rooms at work (model/cayley.ts, ideas/groups.md): a gate
// per element of a group, exactly one open, and a lever per generator.
// Two parts, each cell with as few states as can be:
//
// - `cayley-gate`: open or shut, nothing else. It is open while the room's
//   element is its own, so exactly one gate of a room is open (the start:
//   e's). Behind it a one-cell alcove. The gate of the room's target has
//   an id: the first time it opens, the goal is done (kept in the save),
//   and its letter comes up in its alcove. A gate never shuts on someone
//   standing in it or in its alcove (it waits, as a wall does).
// - `cayley-lever`: bumped, it moves the opening from the gate of g to the
//   gate of g·x, its generator x (its data is just that: the room knows
//   its table). Its handle flips at each pull (the group levers' look).
//
// The rooms' elements live in memory only (a reload starts at e); a goal
// done is kept with the collected item ids ("cayley.<id>", its letter
// "cayley.<id>.reward") and lasts in the save.
import { DIRS } from "../util/dir.ts"
import { Palette } from "../util/palette.ts"
import { saveProgress } from "../util/save.ts"
import * as signal from "../util/signals.ts"
import { celebrateGoal } from "./celebrate.ts"
import { groupByKey, openGateOf, pullCayley } from "./cayley.ts"
import { linePattern0 } from "./effect.ts"
import { layGlyph } from "./glyph.ts"
import { Item } from "./item.ts"
import type { Prop, PushedDelegate } from "./prop.ts"
import type { IField, PushedEvent } from "./types.ts"

// ---------------------------------------------------------------------
// goals

/** The collected-id key of a Cayley room solved */
export const cayleyKey = (id: string) => `cayley.${id}`
/** true if the collected id records a Cayley room solved (not its letter) */
export const isCayleyKey = (key: string) =>
  key.startsWith("cayley.") && !key.endsWith(".reward")
/** The collected-id key (and the item id) of its letter */
export const cayleyRewardKey = (id: string) => `cayley.${id}.reward`
/** true if the Cayley room of the id is solved */
export const isCayleySolved = (id: string) => Item.isCollected(cayleyKey(id))

/** The message when the target's gate opens */
export const CAYLEY_TEXT = "THE GATE OPENS ON THE LETTER"

// ---------------------------------------------------------------------
// the lever

type LeverData = {
  room?: string
  /** The group's key ("8.3") */
  group?: string
  /** The generator: the element it multiplies by, on the right */
  by?: number
  /** Its look: 1 turn, 2 flip (the group lever's carvings) */
  look?: number
}

/** How many times each lever was pulled (its handle shows the parity) */
const pulls = new WeakMap<Prop, number>()

function showLever(prop: Prop) {
  const { look } = (prop.data ?? {}) as LeverData
  prop.showStage((look ?? 1) * 2 + (pulls.get(prop) ?? 0) % 2)
}

/** Pulls the lever: the opening moves along its generator */
export function pullCayleyLever(prop: Prop, field: IField) {
  const { room, group, by } = (prop.data ?? {}) as LeverData
  const g = typeof group === "string" ? groupByKey(group) : undefined
  if (typeof room !== "string" || !g || typeof by !== "number") return
  pullCayley(room, g, by)
  pulls.set(prop, (pulls.get(prop) ?? 0) + 1)
  showLever(prop)
  signal.playSound("blipSelect")
  for (
    const effect of linePattern0(DIRS, prop.i, prop.j, 1, 0.7, 2, Palette.white)
  ) {
    field.effects.add(effect)
  }
}

/** The lever: anyone's bump pulls it */
export class CayleyLeverPushed implements PushedDelegate {
  onPushed(_event: PushedEvent, prop: Prop, field: IField): void {
    pullCayleyLever(prop, field)
  }
}

export function stepCayleyLever(prop: Prop) {
  showLever(prop)
}

// ---------------------------------------------------------------------
// the gate

type GateData = {
  room?: string
  /** Its element */
  el?: number
  /** The alcove behind it */
  alcove?: [number, number]
  /** The target's gate: the goal's id */
  id?: string
  /** Its mark: 0 none, 1 e (the start), 2 the target */
  mark?: number
}

/** true if someone stands in the cell */
const someoneAt = (field: IField, i: number, j: number) =>
  field.actors.get(i, j).length > 0

/**
 * The gate: open while its room's element is its own. Shown by stage:
 * (mark) * 2 + (open ? 1 : 0)
 */
export function stepCayleyGate(prop: Prop, field: IField) {
  const { room, el, alcove, id, mark } = (prop.data ?? {}) as GateData
  if (typeof room !== "string" || typeof el !== "number") return
  let open = openGateOf(room) === el
  // never shuts on someone in it or in its alcove: it waits
  if (
    !open && prop.isOpen &&
    (someoneAt(field, prop.i, prop.j) ||
      (alcove && someoneAt(field, alcove[0], alcove[1])))
  ) open = true
  if (open !== prop.isOpen) prop.setOpen(open, false)
  prop.showStage((mark ?? 0) * 2 + (open ? 1 : 0))
  if (!id || !alcove) return
  if (isCayleySolved(id)) {
    // its letter, laid again (until taken)
    if (field.time % 30 === 0) {
      layGlyph(field, alcove[0], alcove[1], cayleyRewardKey(id))
    }
    return
  }
  if (openGateOf(room) !== el) return
  Item.collect(cayleyKey(id))
  saveProgress()
  celebrateGoal(field, prop.i, prop.j, CAYLEY_TEXT, {
    i: alcove[0],
    j: alcove[1],
    id: cayleyRewardKey(id),
  })
}
