import type { Context } from "@kt3k/cell"
import * as signals from "../../util/signals.ts"

/** The picture of each thing space does */
const PICTURES: Record<signals.SpaceAction, string> = {
  jump: "./ui/space_jump.png",
  dig: "./ui/space_dig.png",
  apple: "./item/apple.png",
  fish: "./item/fish.png",
}

/**
 * Beside the tool buttons: a picture of what space (a tap on touch
 * screens) does right now: jump, dig, or put down the chosen tool
 */
export function SpaceHint({ query, subscribe }: Context) {
  const img = query<HTMLImageElement>("img")!
  subscribe(signals.spaceAction, (action) => {
    img.src = PICTURES[action]
    img.alt = action.toUpperCase()
  })
}
