import type { Context } from "@kt3k/cell"
import * as signal from "../../util/signals.ts"
import { CELL_SIZE } from "../../util/constants.ts"

/** How long a bubble stays up, by how much there is to read */
const duration = (text: string) => Math.min(7000, 2200 + text.length * 50)

/**
 * The speech bubble over a sign: when one is read, its words pop out
 * of the sign itself. The bubble lives inside the field element, in
 * world pixels, so it scrolls with the ground it stands on.
 */
export function SpeechBubble({ el, subscribe }: Context) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const text = el.querySelector(".speech-text")!

  subscribe(signal.speech, (speech) => {
    if (!speech) {
      return
    }
    text.textContent = speech.text
    const e = el as HTMLElement
    e.style.left = `${speech.i * CELL_SIZE + CELL_SIZE / 2}px`
    e.style.top = `${speech.j * CELL_SIZE - 2}px`
    el.classList.remove("hidden")
    clearTimeout(timer)
    timer = setTimeout(() => {
      el.classList.add("hidden")
    }, duration(speech.text))
  })
}
