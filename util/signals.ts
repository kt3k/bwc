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
// The current count of keys
export const keyCount = new Signal(0)
/** What the player puts down with space: bait for the animals */
export type Tool = "apple" | "fish"
// The chosen tool, or null (space does the usual: dig, fish, jump)
export const tool = new Signal<Tool | null>(null)
/** A letter being carried (model/errand.ts): where to, from, what it pays */
export type Letter = { to: string; from: string; reward: number }
// The letter the player carries, or null
export const letter = new Signal<Letter | null>(null)
/** A crate of goods being carried (model/trade.ts) */
export type Cargo = { good: string; from: string; paid: number }
// The crate the player carries, or null
export const cargo = new Signal<Cargo | null>(null)
// How many letters the player delivered
export const deliveries = new Signal(0)
// The player's walking speed, chosen with the speed buttons (pixels per frame)
export const playerSpeed = new Signal<1 | 2 | 4>(2)
// The message to show in the toast ui. Wrapped in an object so that
// the same text shown twice still triggers the subscribers.
export const message = new Signal<{ text: string } | null>(null)
// What a sign says and where it stands (world cell): shown as a speech
// bubble over the sign - or under it (below: true) when the reader
// pushed it from above, so the bubble never covers them. Wrapped in an
// object so that reading the same sign twice still triggers the
// subscribers.
export const speech = new Signal<
  { i: number; j: number; text: string; below?: boolean } | null
>(null)

/** The name of a jsfxr sound preset */
export type SoundName =
  | "pickupCoin"
  | "jump"
  | "hitHurt"
  | "explosion"
  | "powerUp"
  | "blipSelect"
  /** A clear tone; give it a note (semitones above C5) */
  | "bell"
// The sound effect to play. Wrapped in an object so that the same
// sound played twice still triggers the subscribers.
export const sound = new Signal<{ name: SoundName; note?: number } | null>(
  null,
)

/**
 * Requests playing the sound effect of the given name. `note` sets the
 * pitch of a "bell" in semitones above C5 (0 = C5, 12 = C6)
 */
export function playSound(name: SoundName, note?: number) {
  sound.update({ name, note })
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
