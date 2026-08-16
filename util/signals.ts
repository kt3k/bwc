import { GroupSignal, Signal } from "@kt3k/cell"
import { CELL_SIZE } from "./constants.ts"
import { FieldBlock } from "../model/field-block.ts"

// The current frame per second (fps)
export const fps = new Signal(0)
// The v value
export const v = new Signal(0)
// The current number of actors
export const actorsCount = new Signal(0)
// The current number of active items
export const itemsCount = new Signal(0)
// The current number of active props
export const propsCount = new Signal(0)
// The current count of apples
export const appleCount = new Signal(0)
// The current count of green apples
export const greenAppleCount = new Signal(0)
// The current count of coins
export const coinCount = new Signal(0)
// The current count of seeds
export const seedCount = new Signal(0)
// The current count of keys
export const keyCount = new Signal(0)
// The darkness of the night (0 = day, 0.75 = midnight)
export const nightDarkness = new Signal(0)
// The message to show in the toast ui. Wrapped in an object so that
// the same text shown twice still triggers the subscribers.
export const message = new Signal<{ text: string } | null>(null)

/** The name of a jsfxr sound preset */
export type SoundName =
  | "pickupCoin"
  | "jump"
  | "hitHurt"
  | "explosion"
  | "powerUp"
// The sound effect to play. Wrapped in an object so that the same
// sound played twice still triggers the subscribers.
export const sound = new Signal<{ name: SoundName } | null>(null)

/** Requests playing the sound effect of the given name */
export function playSound(name: SoundName) {
  sound.update({ name })
}
// The current loading state
export const isGameLoading = new Signal(true)
// The center pixel coordinate
export const centerPixel = new GroupSignal({ x: 0, y: 0 })
// The center grid coordinate
export const centerGrid = centerPixel.map(({ x, y }) => ({
  i: Math.floor(x / CELL_SIZE),
  j: Math.floor(y / CELL_SIZE),
}))

export const centerGrid10 = centerGrid.map(({ i, j }) => ({
  i: Math.floor(i / 10) * 10,
  j: Math.floor(j / 10) * 10,
}))

export const currentBlock = new Signal<FieldBlock | null>(null)
