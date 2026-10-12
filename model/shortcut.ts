// The shortcuts (ideas/wilds-roaming-todo.md, 5): where two parts of the
// WILDS lie a few cells apart but a long walk around, a passage is cut
// through what lies between, and a latch gate stands in it. Its latch is
// on the far side (the side farther from the arrival on foot): from the
// near side it won't move; walk the long way round, lift the latch from
// the far side, and the gate stays open for good, a quick way back.
//
// An opened gate is kept with the collected item ids ("shortcut.<id>"),
// so it lasts in the save.
import { DIRS } from "../util/dir.ts"
import { Palette } from "../util/palette.ts"
import * as signal from "../util/signals.ts"
import { linePattern0 } from "./effect.ts"
import { Item } from "./item.ts"
import type { Prop, PushedDelegate } from "./prop.ts"
import type { IField, PushedEvent } from "./types.ts"

/** The collected-id key of the gate */
export const shortcutKey = (id: string) => `shortcut.${id}`

type GateData = { id?: string; dir?: string }
const dataOf = (prop: Prop) => (prop.data ?? {}) as GateData

/** Shows the gate open once it was opened (it stays so in the save) */
export function stepLatchGate(prop: Prop, _field: IField) {
  const { id } = dataOf(prop)
  if (!id || !Item.isCollected(shortcutKey(id)) || prop.isOpen) return
  prop.setOpen(true, false)
  prop.showStage(1)
}

/** Pushed from the far side, the latch lifts; from the near side, nothing */
export class LatchGatePushed implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (event.pusher?.id !== "main") return
    const { id, dir } = dataOf(prop)
    if (!id || Item.isCollected(shortcutKey(id))) return
    if (event.dir !== dir) {
      signal.playSound("hitHurt")
      signal.message.update({ text: "LATCHED FROM THE OTHER SIDE" })
      return
    }
    Item.collect(shortcutKey(id))
    prop.setOpen(true, false)
    prop.showStage(1)
    signal.playSound("powerUp")
    signal.message.update({ text: "THE LATCH LIFTS: A SHORTCUT BACK" })
    for (
      const effect of linePattern0(
        DIRS,
        prop.i,
        prop.j,
        1,
        0.7,
        3,
        Palette.white,
      )
    ) {
      field.effects.add(effect)
    }
  }
}
