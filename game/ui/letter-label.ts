import type { Context } from "@kt3k/cell"
import * as signal from "../../util/signals.ts"

/**
 * Shows the letter being carried (model/errand.ts), small over the place
 * label: "LETTER TO OAKMERE". Hidden when no letter is carried.
 */
export function LetterLabel({ el, query, subscribe }: Context) {
  const text = query(".js-letter-text") ?? el
  subscribe(signal.letter, (letter) => {
    if (!letter) {
      el.classList.add("hidden")
      return
    }
    text.textContent = `LETTER TO ${letter.to}`
    el.classList.remove("hidden")
  })
}
