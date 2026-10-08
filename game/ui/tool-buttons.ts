import type { Context } from "@kt3k/cell"
import * as signals from "../../util/signals.ts"
import { Palette } from "../../util/palette.ts"
import { chooseTool } from "../../model/tool.ts"

/**
 * The tool buttons below the game screen: what space puts down (none, an
 * apple, a fish, a seed). The X key cycles them too. The chosen one is
 * lit.
 */
export function ToolButtons({ queryAll, subscribe }: Context) {
  const buttons = queryAll<HTMLButtonElement>("button[data-tool]")
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const tool = button.dataset.tool
      chooseTool(
        tool === "apple" || tool === "fish" || tool === "seed" ? tool : null,
      )
      // keeps the arrow keys for walking, not for the focused button
      button.blur()
    })
  }
  subscribe(signals.tool, (tool) => {
    for (const button of buttons) {
      const on = (button.dataset.tool || null) === tool
      button.style.backgroundColor = on ? Palette.gray3 : Palette.black
      button.style.borderColor = on ? Palette.white : Palette.gray3
    }
  })
}
