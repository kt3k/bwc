// The trade (ideas/wilds-roaming-todo.md, 2): each town of the WILDS has
// a trade stall selling what the town makes (fish in SOUTHPORT, iron in
// STONEGATE...) cheaply. One crate can be carried at a time; any other
// town buys it, and pays the more the farther the crate came from its
// home. So the goods want carrying far.
//
// Each stall knows its good, what a crate costs, and what it pays for
// every other good (worked out by tools/generate_wilds.ts from the
// distances between the towns).
import { DIRS } from "../util/dir.ts"
import { Palette } from "../util/palette.ts"
import * as signal from "../util/signals.ts"
import { linePattern0 } from "./effect.ts"
import type { Prop, PushedDelegate } from "./prop.ts"
import type { IField, PushedEvent } from "./types.ts"

type StallData = {
  town?: string
  good?: string
  cost?: number
  /** What this stall pays for a crate of each other good */
  prices?: Record<string, number>
}

/** The goods this stall pays best for, for its patter: "FURS 40, IRON 33" */
export function bestBuys(prices: Record<string, number>, n = 2): string {
  return Object.entries(prices).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([good, price]) => `${good} ${price}`).join(", ")
}

export class TradeStallPushed implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (event.pusher?.id !== "main") return
    const { town, good, cost = 0, prices = {} } = (prop.data ?? {}) as StallData
    if (!town || !good) return
    const say = (text: string) =>
      signal.speech.update({
        i: prop.i,
        j: prop.j,
        text: `TRADER: ${text}`,
        below: event.dir === "down",
      })
    const burst = () => {
      for (
        const effect of linePattern0(
          DIRS,
          prop.i,
          prop.j,
          1,
          0.7,
          3,
          Palette.yellow3,
        )
      ) {
        field.effects.add(effect)
      }
    }
    const cargo = signal.cargo.get()
    if (cargo) {
      if (cargo.good === good) {
        say(`${good}? WE HAVE PLENTY HERE. TAKE IT FARTHER`)
        return
      }
      const price = prices[cargo.good] ?? 1
      signal.coinCount.update(signal.coinCount.get() + price)
      signal.cargo.update(null)
      signal.playSound("pickupCoin")
      burst()
      say(
        `${cargo.good} FROM ${cargo.from}! ${price} COINS (YOU PAID ${cargo.paid}). OURS IS ${good}, ${cost} A CRATE`,
      )
      return
    }
    const coins = signal.coinCount.get()
    if (coins < cost) {
      say(
        `${good}, ${cost} COINS A CRATE. WE PAY WELL FOR ${bestBuys(prices)}`,
      )
      return
    }
    signal.coinCount.update(coins - cost)
    signal.cargo.update({ good, from: town, paid: cost })
    signal.playSound("blipSelect")
    burst()
    say(
      `A CRATE OF ${good}, ${cost} COINS. THE FARTHER YOU SELL IT, THE MORE IT FETCHES. WE PAY WELL FOR ${
        bestBuys(prices)
      }`,
    )
  }
}
