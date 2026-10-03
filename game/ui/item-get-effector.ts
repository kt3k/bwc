import type { Context } from "@kt3k/cell"
import { loadImage } from "../../util/load.ts"
import * as signal from "../../util/signals.ts"

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
  watch(signal.seedCount, "./item/seed.png", "88px")
  watch(signal.keyCount, "./item/key.png", "114px")
}

async function moveImage(
  el: HTMLElement,
  src: string,
  endTop: string,
): Promise<void> {
  const bmp = await loadImage(import.meta.resolve(src))
  const canvas = Object.assign(document.createElement("canvas"), {
    width: bmp.width,
    height: bmp.height,
    className: "absolute",
  })
  Object.assign(canvas.style, {
    right: "47%",
    top: "48%",
    // Moves only; fading would blend colors outside the palette
    transition: "right 0.3s ease, top 0.3s ease",
  })
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
      }),
    30,
  )
}
