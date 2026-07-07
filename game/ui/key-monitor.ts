import type { Context } from "@kt3k/cell"
import { Input, inputQueue } from "./input.ts"

const KEY_UP = new Set(["ArrowUp", "w", "k"])
const KEY_DOWN = new Set(["ArrowDown", "s", "j"])
const KEY_LEFT = new Set(["ArrowLeft", "a", "h"])
const KEY_RIGHT = new Set(["ArrowRight", "d", "l"])

let spaceQueued = false

/** The component which monitors the user input.
 *
 * Mount <body> tag.
 */
export function KeyMonitor({ on }: Context) {
  on("keydown", (e) => {
    // Normalize letter keys so movement works with CapsLock/Shift
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (e.metaKey || e.ctrlKey) {
      return
    } else if (KEY_UP.has(key)) {
      e.preventDefault()
      Input.up = true
    } else if (KEY_DOWN.has(key)) {
      e.preventDefault()
      Input.down = true
    } else if (KEY_LEFT.has(key)) {
      e.preventDefault()
      Input.left = true
    } else if (KEY_RIGHT.has(key)) {
      e.preventDefault()
      Input.right = true
    } else if (key === " ") {
      e.preventDefault()
      if (!spaceQueued) {
        spaceQueued = true
        inputQueue.push("space")
      }
    }
  })
  on("keyup", (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (KEY_UP.has(key)) {
      Input.up = false
    } else if (KEY_DOWN.has(key)) {
      Input.down = false
    } else if (KEY_LEFT.has(key)) {
      Input.left = false
    } else if (KEY_RIGHT.has(key)) {
      Input.right = false
    } else if (key === " ") {
      spaceQueued = false
    }
  })
}
