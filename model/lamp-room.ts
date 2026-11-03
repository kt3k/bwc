// The lamp grids at work (model/lamp-grid.ts, ideas/groups.md): a
// permutation shown as its matrix of lamps. Two new parts, each with two
// states only:
//
// - `lamp-cell`: a floor lamp, lit or unlit. Its data is its room (the
//   GROUPS state it reads), its row (a thing) and its column (a place):
//   it is lit while that thing is at that place. When it changes, a few
//   lines go out of it, so a pull is seen where it happened.
// - `lamp-plaque`: a flat plaque of the target, lit or unlit by its data
//   (decoration: it never changes). The room's plaques are the target's
//   matrix, beside the lamps.
//
// The rest is the GROUPS' own: the levers are `group-lever` (their cycles
// are of the columns), the door is `group-door` (it opens the first time
// the lamps are the target, and its goal "group.<id>" counts and is kept
// in the save like the GROUPS' ones, its letter behind it; its message is
// LAMPS_TEXT, model/lamp-grid.ts).
import { DIRS } from "../util/dir.ts"
import { Palette } from "../util/palette.ts"
import { linePattern0 } from "./effect.ts"
import { arrangementOf } from "./group-lever.ts"
import { isLit } from "./lamp-grid.ts"
import type { Prop } from "./prop.ts"
import type { IField } from "./types.ts"

type LampData = { group?: string; row?: number; col?: number }

/** The stage each lamp showed last, to mark a change */
const shown = new WeakMap<Prop, number>()

/** The lamp: lit (stage 1) while its row's thing is at its column */
export function stepLampCell(prop: Prop, field: IField) {
  const { group, row, col } = (prop.data ?? {}) as LampData
  if (
    typeof group !== "string" || typeof row !== "number" ||
    typeof col !== "number"
  ) return
  const stage = isLit(arrangementOf(group), row, col) ? 1 : 0
  const last = shown.get(prop)
  shown.set(prop, stage)
  prop.showStage(stage)
  if (last === undefined || last === stage) return
  for (
    const effect of linePattern0(DIRS, prop.i, prop.j, 1, 0.5, 2, Palette.gray2)
  ) {
    field.effects.add(effect)
  }
}

/** The plaque of the target: lit (stage 1) or not, as its data says */
export function stepLampPlaque(prop: Prop) {
  const { lit } = (prop.data ?? {}) as { lit?: boolean }
  prop.showStage(lit ? 1 : 0)
}
