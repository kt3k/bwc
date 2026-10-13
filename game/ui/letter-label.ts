import type { Context } from "@kt3k/cell"
import * as signal from "../../util/signals.ts"

/**
 * Shows what is being carried, small over the place label: the letter
 * (model/errand.ts) and the crate of goods (model/trade.ts), one line
 * each: "LETTER TO OAKMERE", "FISH FROM SOUTHPORT". Hidden when nothing
 * is carried.
 */
export function LetterLabel({ el, query, subscribe }: Context) {
  const text = query(".js-letter-text") ?? el
  const update = () => {
    const lines: string[] = []
    const letter = signal.letter.get()
    const cargo = signal.cargo.get()
    if (letter) lines.push(`LETTER TO ${letter.to}`)
    if (cargo) lines.push(`${cargo.good} FROM ${cargo.from}`)
    if (lines.length === 0) {
      el.classList.add("hidden")
      return
    }
    text.textContent = lines.join(" / ")
    el.classList.remove("hidden")
  }
  subscribe(signal.letter, update)
  subscribe(signal.cargo, update)
}
