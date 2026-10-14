// The four panes (ideas/wilds-roaming-todo.md, 9): the lone windows of the
// WILDS shatter into pieces of four places - a snowy field, a faraway
// sea, a town at dusk, a cloudless sky - and those four places are the
// corners of the island: the snowfield in the north, the sunken ruins in
// the south, the cape in the east, the city's old drain in the west. At
// the end of each corner's trial stands an empty window frame. Bring it
// its piece and the pane is whole again: the place shows in it, and it
// gives. When all four are whole, the island gives once more.
//
// A whole pane is kept with the collected item ids ("pane.<id>").
import { DIRS } from "../util/dir.ts"
import { Palette } from "../util/palette.ts"
import * as signal from "../util/signals.ts"
import { shake } from "../util/juice.ts"
import { linePattern0 } from "./effect.ts"
import { Item } from "./item.ts"
import type { Prop, PushedDelegate } from "./prop.ts"
import type { IField, PushedEvent } from "./types.ts"

/** The four places, by the shard that shows each */
export const PANES: Record<string, string> = {
  "shard-snow": "A SNOWY FIELD",
  "shard-sea": "A FARAWAY SEA",
  "shard-town": "A TOWN AT DUSK",
  "shard-sky": "A CLOUDLESS SKY",
}
const paneKey = (shard: string) => `pane.${shard}`
/** The image stage of a whole pane: its place (the empty frame is 0) */
const stageOf = (shard: string) => 1 + Object.keys(PANES).indexOf(shard)

/** How many of the four panes are whole */
export function wholePanes(): number {
  return Object.keys(PANES).filter((s) => Item.isCollected(paneKey(s))).length
}

type PaneData = { shard?: string }

/** The pane shows its place once it is whole */
export function stepPane(prop: Prop, _field: IField) {
  const { shard } = (prop.data ?? {}) as PaneData
  prop.showStage(shard && Item.isCollected(paneKey(shard)) ? stageOf(shard) : 0)
}

export class PanePushed implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (event.pusher?.id !== "main") return
    const { shard } = (prop.data ?? {}) as PaneData
    if (!shard || !PANES[shard]) return
    const place = PANES[shard]
    const say = (text: string) =>
      signal.speech.update({
        i: prop.i,
        j: prop.j,
        text,
        below: event.dir === "down",
      })
    if (Item.isCollected(paneKey(shard))) {
      say(`THE PANE SHOWS ${place}`)
      return
    }
    const held = signal.shards.get()
    if (!held.includes(shard)) {
      say(`AN EMPTY WINDOW FRAME. IT LONGS FOR A PIECE OF ${place}`)
      return
    }
    // whole again
    signal.shards.update(held.filter((s) => s !== shard))
    Item.collect(paneKey(shard))
    prop.showStage(stageOf(shard))
    shake(3)
    signal.playSound("powerUp")
    for (
      const effect of linePattern0(
        DIRS,
        prop.i,
        prop.j,
        1.5,
        0.7,
        5,
        Palette.white,
      )
    ) {
      field.effects.add(effect)
    }
    const whole = wholePanes()
    signal.coinCount.update(signal.coinCount.get() + 25)
    if (whole === 4) {
      signal.coinCount.update(signal.coinCount.get() + 100)
      say(
        `THE PANE SHOWS ${place} AGAIN. ALL FOUR WINDOWS ARE WHOLE: THE ISLAND GIVES 125 COINS`,
      )
    } else {
      say(
        `THE PANE SHOWS ${place} AGAIN. 25 COINS. ${whole} OF FOUR WINDOWS ARE WHOLE`,
      )
    }
  }
}
