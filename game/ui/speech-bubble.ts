import type { Context } from "@kt3k/cell"
import * as signal from "../../util/signals.ts"
import { CELL_SIZE } from "../../util/constants.ts"

/** How long a bubble stays up, by how much there is to read */
const duration = (text: string) => Math.min(7000, 2200 + text.length * 50)

/** The tail sprite's size, the straight side's column in it, and how
 * far the fin hangs past the bubble's box */
const TAIL_W = 22
const TAIL_SIDE = 6
const TAIL_DROP = 12
/** Measured off the RS3 shot: the fin's straight side stands at the
 * speaker's near edge, not under their middle - half a cell over */
const TAIL_SHIFT = CELL_SIZE / 2

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
  const tail = el.querySelector<HTMLElement>(".speech-tail")!
  const e = el as HTMLElement

  const hide = () => {
    clearTimeout(timer)
    el.classList.add("hidden")
    at = null
  }

  const place = (center: { x: number; y: number }) => {
    if (!at) {
      return
    }
    const screen = e.parentElement!
    // a sign a screenful away is done talking (walked off, or the
    // view jumped through a portal and left it behind)
    if (
      Math.abs(at.x - center.x) > screen.offsetWidth ||
      Math.abs(at.y - center.y) > screen.offsetHeight
    ) {
      hide()
      return
    }
    const x = Math.round(at.x - center.x + screen.offsetWidth / 2)
    const y = Math.round(at.y - center.y + screen.offsetHeight / 2)
    // as in RS3: the window itself hangs centered (kept on screen),
    // and only the fin slides along its edge to stand over the sign
    const left = Math.max(
      2,
      Math.min(
        screen.offsetWidth - e.offsetWidth - 2,
        x - Math.round(e.offsetWidth / 2),
      ),
    )
    e.style.left = `${left}px`
    e.style.top = `${below ? y + TAIL_DROP : y - e.offsetHeight - TAIL_DROP}px`
    // the fin's straight side at the sign's near edge, its body
    // leaning away (measured so in RS3), held off the rounded corners
    const side = below ? TAIL_W - TAIL_SIDE : TAIL_SIDE
    const aim = below ? x - TAIL_SHIFT : x + TAIL_SHIFT
    tail.style.left = `${
      Math.max(6, Math.min(e.offsetWidth - TAIL_W - 6, aim - left - side))
    }px`
  }
  const replace = () => place(signal.centerPixel.get())

  subscribe(signal.centerPixel, place)
  // a teleport swaps the ground out from under whatever was talking
  subscribe(signal.isGameLoading, (loading) => {
    if (loading) {
      hide()
    }
  })
  // the pixel font can land after a bubble was measured: measure again
  document.fonts?.ready.then(replace)
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
    // visible before measuring: display none has no size. Placed
    // again a frame later, once the text has truly settled
    el.classList.remove("hidden")
    replace()
    requestAnimationFrame(replace)
    clearTimeout(timer)
    timer = setTimeout(() => {
      el.classList.add("hidden")
    }, duration(speech.text))
  })
}
