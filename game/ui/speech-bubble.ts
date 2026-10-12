import type { Context } from "@kt3k/cell"
import * as signal from "../../util/signals.ts"
import { CELL_SIZE } from "../../util/constants.ts"

/** How long a bubble stays up, by how much there is to read */
const duration = (text: string) => Math.min(7000, 2200 + text.length * 50)

/**
 * The speech bubble over a sign: when one is read, its words pop out
 * of the sign itself (downward when read from above). The bubble sits
 * over the entity canvas, so no actor or prop ever draws across it;
 * it follows the view (the centerPixel signal) to stay put over its
 * sign while the map scrolls.
 *
 * Everything lands on whole pixels: the anchor is rounded, and the
 * bubble is centered by its measured size instead of translate(-50%),
 * whose half pixel on an odd width would blur the 1px line and the
 * pixel font.
 */
export function SpeechBubble({ el, subscribe }: Context) {
  let timer: ReturnType<typeof setTimeout> | undefined
  /** The world pixel the tail points at, and which way the bubble
   * opens (read from above, it opens downward, away from the reader) */
  let at: { x: number; y: number } | null = null
  let below = false
  const text = el.querySelector(".speech-text")!
  const e = el as HTMLElement

  const place = (center: { x: number; y: number }) => {
    if (!at) {
      return
    }
    const screen = e.parentElement!
    const x = Math.round(at.x - center.x + screen.offsetWidth / 2)
    const y = Math.round(at.y - center.y + screen.offsetHeight / 2)
    e.style.left = `${x - Math.round(e.offsetWidth / 2)}px`
    e.style.top = `${below ? y : y - e.offsetHeight}px`
  }

  subscribe(signal.centerPixel, place)
  subscribe(signal.speech, (speech) => {
    if (!speech) {
      return
    }
    text.textContent = speech.text
    below = speech.below === true
    el.classList.toggle("below", below)
    at = {
      x: speech.i * CELL_SIZE + CELL_SIZE / 2,
      y: below ? (speech.j + 1) * CELL_SIZE + 2 : speech.j * CELL_SIZE - 2,
    }
    // visible before measuring: display none has no size
    el.classList.remove("hidden")
    place(signal.centerPixel.get())
    clearTimeout(timer)
    timer = setTimeout(() => {
      el.classList.add("hidden")
    }, duration(speech.text))
  })
}
