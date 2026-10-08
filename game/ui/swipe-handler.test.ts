import "./dom-polyfill.ts"
import { assert, assertFalse } from "@std/assert"
import { isUiTarget } from "./swipe-handler.ts"

Deno.test("a tap on a page control isn't a tap on the game", () => {
  const speed = document.createElement("div")
  speed.className = "js-speed-buttons"
  const button = document.createElement("button")
  const label = document.createElement("span")
  button.append(label)
  speed.append(button)
  const screen = document.createElement("div")
  screen.className = "js-game-screen"
  document.body.append(speed, screen)
  assert(isUiTarget(button))
  assert(isUiTarget(label))
  assertFalse(isUiTarget(screen))
  assertFalse(isUiTarget(null))
})
