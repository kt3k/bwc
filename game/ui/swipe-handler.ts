import type { Context } from "@kt3k/cell"

import { getDir, getDistance } from "../../util/touch.ts"
import { clearInput, Input, inputQueue } from "./input.ts"

const TOUCH_SENSITIVITY_THRESHOLD = 25

/**
 * true if the touch was on a control of the page (the speed buttons, the
 * exit button, the minimap): a tap there isn't a tap on the game, so it
 * mustn't make the player jump
 */
export function isUiTarget(target: EventTarget | null): boolean {
  return typeof (target as Element | null)?.closest === "function" &&
    !!(target as Element).closest(
      "button, a, .js-speed-buttons, .js-exit-button, .js-minimap",
    )
}

export function SwipeHandler({ on }: Context) {
  let prevTouch: Touch | undefined
  on("touchstart", (e) => {
    prevTouch = e.touches[0]
  })
  // passive false is necessary to prevent scrolling in iOS Safari
  on("touchmove", { passive: false }, (e) => {
    e.preventDefault()
    const touch = e.changedTouches[0]
    if (prevTouch) {
      const dist = getDistance(touch, prevTouch)
      if (dist < TOUCH_SENSITIVITY_THRESHOLD) {
        return
      }
      clearInput()
      const dir = getDir(touch, prevTouch)
      Input[dir] = true
    }
    prevTouch = touch
  })
  on("touchend", (e) => {
    if (isUiTarget(e.target)) {
      prevTouch = undefined
      return
    }
    if (Input.up || Input.down || Input.left || Input.right) {
      clearInput()
    } else {
      inputQueue.push("touchendempty")
    }
  })
}
