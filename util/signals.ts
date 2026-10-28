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
// The chosen tool, or null (space does the usual: dig, jump)
export const tool = new Signal<Tool | null>(null)
/** What space does right now, shown beside the tool buttons */
export type SpaceAction = "jump" | "dig" | Tool
export const spaceAction = new Signal<SpaceAction>("jump")
/** A letter being carried (model/errand.ts): where to, from, what it pays */
export type Letter = { to: string; from: string; reward: number }
// The letter the player carries, or null
export const letter = new Signal<Letter | null>(null)
/** A crate of goods being carried (model/trade.ts) */
export type Cargo = { good: string; from: string; paid: number }
// The crate the player carries, or null
export const cargo = new Signal<Cargo | null>(null)
// The window shards the player holds (their item types: "shard-sea"...)
export const shards = new Signal<string[]>([])
/** A place of the island talked of (model/rumor.ts): its name and cell */
export type Place = { topic: string; i: number; j: number }
// The place of the last rumor heard, which the leaves drift toward
// (model/leaf-wind.ts), or null once there
export const rumorPlace = new Signal<Place | null>(null)
/**
 * An unreadable letter held (model/glyph.ts): its id (who gave it, e.g.
 * "ring.<id>.reward") and its sign (0 to GLYPH_COUNT - 1)
 */
export type Glyph = { id: string; glyph: number }
// The unreadable letters the player holds, in the order taken
export const glyphs = new Signal<Glyph[]>([])
// How many letters the player delivered
export const deliveries = new Signal(0)
// The player's walking speed, chosen with the speed buttons (pixels per frame)
export const playerSpeed = new Signal<1 | 2 | 4>(2)
// The message to show in the toast ui. Wrapped in an object so that
// the same text shown twice still triggers the subscribers.
export const message = new Signal<{ text: string } | null>(null)
// What a sign or a person says and where they stand (world cell):
// shown as a speech bubble over the speaker - or under them (below:
// true) when the reader stands above, so the bubble never covers the
// reader. A moving speaker passes `follow` - their drawn spot in
// world pixels, read every frame, so the bubble glides along with the
// walk animation instead of jumping cell by cell. Wrapped in an
// object so that reading the same sign twice still triggers the
// subscribers.
export const speech = new Signal<
  {
    i: number
    j: number
    text: string
    below?: boolean
    follow?: () => { x: number; y: number }
  } | null
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
/**
 * The blocks loaded around the player, looked up by a world cell; a new
 * one each time more are loaded (the minimap draws the land around the
 * player from them)
 */
export const fieldBlocks = new Signal<
  { blockAt(i: number, j: number): FieldBlock | undefined } | null
>(null)
