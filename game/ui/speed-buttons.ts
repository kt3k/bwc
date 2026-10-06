import type { Context } from "@kt3k/cell"
import * as signals from "../../util/signals.ts"
import { Palette } from "../../util/palette.ts"

/**
 * The speed buttons below the game screen: walk at 1, 2 or 4 pixels a
 * frame. The chosen one is lit (and saved with the progress).
 */
export function SpeedButtons({ queryAll, subscribe }: Context) {
  const buttons = queryAll<HTMLButtonElement>("button[data-speed]")
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const speed = Number(button.dataset.speed)
      if (speed === 1 || speed === 2 || speed === 4) {
        signals.playerSpeed.update(speed)
      }
      // keeps the arrow keys for walking, not for the focused button
      button.blur()
    })
  }
  subscribe(signals.playerSpeed, (speed) => {
    for (const button of buttons) {
      const on = Number(button.dataset.speed) === speed
      button.style.backgroundColor = on ? Palette.gray3 : Palette.black
      button.querySelector("span")!.className = `pixel-text ${
        on ? "ink-white" : "ink-mid"
      }`
    }
  })
}
