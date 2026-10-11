import type { Context } from "@kt3k/cell"
import * as signal from "../../util/signals.ts"
import { CELL_SIZE } from "../../util/constants.ts"

/** How long a bubble stays up, by how much there is to read */
const duration = (text: string) => Math.min(7000, 2200 + text.length * 50)

/**
 * The speech bubble over a sign: when one is read, its words pop out
 * of the sign itself. The bubble sits over the entity canvas, so no
 * actor or prop ever draws across it; it follows the view (the
 * centerPixel signal) to stay put over its sign while the map scrolls.
 */
export function SpeechBubble({ el, subscribe }: Context) {
  let timer: ReturnType<typeof setTimeout> | undefined
  /** The world pixel the tail points at (the top of the sign cell) */
  let at: { x: number; y: number } | null = null
  const text = el.querySelector(".speech-text")!
  const e = el as HTMLElement

  const place = (center: { x: number; y: number }) => {
    if (!at) {
      return
    }
    const screen = e.parentElement!
    e.style.left = `${at.x - center.x + screen.offsetWidth / 2}px`
    e.style.top = `${at.y - center.y + screen.offsetHeight / 2}px`
  }

  subscribe(signal.centerPixel, place)
  subscribe(signal.speech, (speech) => {
    if (!speech) {
      return
    }
    text.textContent = speech.text
    // read from above, the bubble opens downward, away from the reader
    el.classList.toggle("below", speech.below === true)
    at = {
      x: speech.i * CELL_SIZE + CELL_SIZE / 2,
      y: speech.below
        ? (speech.j + 1) * CELL_SIZE + 2
        : speech.j * CELL_SIZE - 2,
    }
    place(signal.centerPixel.get())
    el.classList.remove("hidden")
    clearTimeout(timer)
    timer = setTimeout(() => {
      el.classList.add("hidden")
    }, duration(speech.text))
  })
}
