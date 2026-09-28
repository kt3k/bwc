import type { Context } from "@kt3k/cell"
import * as signal from "../../util/signals.ts"

/**
 * Shows where the player is, small in a corner: "<block>-<room> <i>,<j>"
 * (e.g. "B1F-R3 40,107", coordinates local to the block). It makes it
 * easy to tell someone which room or cell you mean.
 */
export function PlaceLabel({ el, query, subscribe }: Context) {
  const text = query(".js-place-text") ?? el
  const update = () => {
    const block = signal.currentBlock.get()
    if (!block) {
      el.classList.add("hidden")
      return
    }
    const { i, j } = signal.centerGrid.get()
    text.textContent = block.placeLabel(i, j)
    el.classList.remove("hidden")
  }
  subscribe(signal.currentBlock, update)
  subscribe(signal.centerGrid, update)
}
