import type { Context } from "@kt3k/cell"
import { loadImage } from "../../util/load.ts"
import * as signal from "../../util/signals.ts"
import { GLYPH_FLY_MS, GLYPH_SHOW_MS, glyphSrc } from "./glyph-counter.ts"

export function ItemGetEffector({ el, subscribe }: Context) {
  // An icon flies to the counter for each item got, so a stack picked up
  // at once sends a little volley (up to 5 icons, one after another)
  const watch = (
    counter: typeof signal.appleCount,
    src: string,
    endTop: string,
  ) => {
    let prev = counter.get()
    subscribe(counter, (count) => {
      const increase = count - prev
      prev = count
      for (let n = 0; n < Math.min(increase, 5); n++) {
        setTimeout(() => moveImage(el, src, endTop), n * 70)
      }
    })
  }
  watch(signal.appleCount, "./item/apple.png", "10px")
  watch(signal.greenAppleCount, "./item/green-apple.png", "36px")
  watch(signal.coinCount, "./item/coin.png", "62px")
  watch(signal.keyCount, "./item/key.png", "114px")

  // An unreadable letter is held up big over the player for a moment,
  // so its sign can be seen, then it flies to its counter
  let held = signal.glyphs.get().length
  subscribe(signal.glyphs, (glyphs) => {
    const added = glyphs.slice(held)
    held = glyphs.length
    for (const [n, g] of added.slice(0, 5).entries()) {
      setTimeout(
        () => moveImage(el, glyphSrc(g.glyph), "78px", GLYPH_SHOW_MS),
        n * 70,
      )
    }
  })
}

/**
 * An icon flies from the middle of the screen to its counter. Given
 * `holdMs`, it first shows there at twice the size for that long
 */
async function moveImage(
  el: HTMLElement,
  src: string,
  endTop: string,
  holdMs = 0,
): Promise<void> {
  const bmp = await loadImage(import.meta.resolve(src))
  const canvas = Object.assign(document.createElement("canvas"), {
    width: bmp.width,
    height: bmp.height,
    className: "absolute",
  })
  const fly = holdMs > 0 ? GLYPH_FLY_MS / 1000 : 0.3
  Object.assign(canvas.style, {
    right: "47%",
    top: "48%",
    // Moves (and shrinks) only; fading would blend colors outside the
    // palette. Scaled whole pixels stay crisp (image-rendering)
    transition: `right ${fly}s ease, top ${fly}s ease, width ${fly}s ease, ` +
      `height ${fly}s ease`,
  })
  if (holdMs > 0) {
    Object.assign(canvas.style, {
      width: `${bmp.width * 2}px`,
      height: `${bmp.height * 2}px`,
      // lifted above the player
      top: "38%",
      right: "calc(50% - 16px)",
    })
  }
  canvas.getContext("2d")!.drawImage(bmp, 0, 0)
  el.appendChild(canvas)
  canvas.addEventListener("transitionend", () => {
    el.removeChild(canvas)
  }, { once: true })
  setTimeout(
    () =>
      Object.assign(canvas.style, {
        right: "58px",
        top: endTop,
        width: `${bmp.width}px`,
        height: `${bmp.height}px`,
      }),
    30 + holdMs,
  )
}
