// The errands (ideas/wilds-roaming-todo.md, 1): each town of the WILDS
// has a post box with its postmaster's words. Bump it and you are handed
// a letter for another town; carry it there, bump that town's post box,
// and the letter pays out (more the farther it went) and the next one is
// handed over. One letter at a time; it lasts in the save.
//
// Each post box knows the towns it sends to and what each pays (worked
// out by tools/generate_wilds.ts from the distance).
import { DIRS } from "../util/dir.ts"
import { Palette } from "../util/palette.ts"
import * as signal from "../util/signals.ts"
import { linePattern0 } from "./effect.ts"
import type { Prop, PushedDelegate } from "./prop.ts"
import type { IField, PushedEvent } from "./types.ts"

type Route = { town: string; reward: number }
type PostData = { town?: string; routes?: Route[] }

/** The next letter this post sends: the routes in turn, by the count */
export function nextLetter(
  town: string,
  routes: Route[],
  deliveries: number,
): signal.Letter | null {
  if (routes.length === 0) return null
  let h = deliveries * 7
  for (const c of town) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const route = routes[h % routes.length]
  return { to: route.town, from: town, reward: route.reward }
}

export class PostBoxPushed implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (event.pusher?.id !== "main") return
    const { town, routes = [] } = (prop.data ?? {}) as PostData
    if (!town) return
    const say = (text: string) =>
      signal.speech.update({
        i: prop.i,
        j: prop.j,
        text,
        below: event.dir === "down",
      })
    const carried = signal.letter.get()
    if (carried && carried.to !== town) {
      say(`POSTMASTER: THAT LETTER IS FOR ${carried.to}, NOT ${town}`)
      return
    }
    let paid = ""
    if (carried) {
      // delivered
      signal.coinCount.update(signal.coinCount.get() + carried.reward)
      signal.deliveries.update(signal.deliveries.get() + 1)
      signal.letter.update(null)
      signal.playSound("pickupCoin")
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
      paid = `A LETTER FROM ${carried.from}! ${carried.reward} COINS. `
    }
    const next = nextLetter(town, routes, signal.deliveries.get())
    if (!next) {
      say(`POSTMASTER: ${paid}NO POST TODAY`)
      return
    }
    signal.letter.update(next)
    if (!carried) signal.playSound("blipSelect")
    say(
      `POSTMASTER: ${paid}TAKE THIS ONE TO ${next.to}. ${next.reward} COINS THERE`,
    )
  }
}
