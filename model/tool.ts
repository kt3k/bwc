// The tool: the item the player chose to put down with space. Each one
// sets something else to work (docs/item-tools.md):
//
// - apple: draws the chaser to it, which eats it
// - fish: draws the cat to it, which eats it and falls asleep there
// - seed: plants a sapling, which blocks the cell
import { Palette, type PaletteColor } from "../util/palette.ts"
import * as signal from "../util/signals.ts"
import type { Tool } from "../util/signals.ts"
import type { Actor } from "./actor.ts"
import { linePattern0 } from "./effect.ts"
import { Item } from "./item.ts"
import type { IField } from "./types.ts"

export const TOOLS: Tool[] = ["apple", "fish", "seed"]

/** The tool after `tool` (none after the last, then the first again) */
export function nextTool(tool: Tool | null): Tool | null {
  if (tool === null) return TOOLS[0]
  return TOOLS[TOOLS.indexOf(tool) + 1] ?? null
}

/** Chooses the tool (and says which, with how many are at hand) */
export function chooseTool(tool: Tool | null): void {
  signal.tool.update(tool)
  if (tool === null) {
    signal.message.update({ text: "PUT: NOTHING" })
    return
  }
  const count = tool === "apple"
    ? `${signal.appleCount.get()}`
    : tool === "seed"
    ? `${signal.seedCount.get()}`
    : null
  signal.message.update({
    text: `PUT: ${tool.toUpperCase()}${count ? ` (${count})` : ""}`,
  })
}

/** The fish following the actor, if any */
function followingFish(actor: Actor): Item | null {
  const follower = actor.follower
  return follower instanceof Item && follower.def.collect === "fish"
    ? follower
    : null
}

function putEffect(
  field: IField,
  actor: Actor,
  i: number,
  j: number,
  color: PaletteColor,
) {
  for (const effect of linePattern0([actor.dir], i, j, 1, 0.7, 2, color)) {
    field.effects.add(effect)
  }
}

/**
 * Plants a sapling at the front cell if the player has seeds and the
 * cell is a free ground. Returns true if planted.
 */
export function tryPlantSeed(actor: Actor, field: IField): boolean {
  if (signal.seedCount.get() <= 0) {
    return false
  }
  const [fi, fj] = actor.frontGrid()
  if (!field.canEnter(fi, fj) || field.peekItem(fi, fj)) {
    return false
  }
  const prop = field.spawnProp("sapling", fi, fj)
  if (!prop) {
    return false
  }
  signal.seedCount.update(signal.seedCount.get() - 1)
  signal.playSound("powerUp")
  putEffect(field, actor, fi, fj, Palette.yellow3)
  return true
}

/**
 * Puts the chosen tool down on the front cell. Returns false if no tool
 * is chosen or the front is water (space does the usual then); true
 * otherwise, put or not (a message tells why not).
 */
export function putTool(actor: Actor, field: IField): boolean {
  const tool = signal.tool.get()
  if (tool === null) return false
  const say = (text: string) => signal.message.update({ text })
  const [fi, fj] = actor.frontGrid()
  // nothing goes on the water: space fishes there as usual
  if (field.isWater(fi, fj)) return false
  if (tool === "seed") {
    if (signal.seedCount.get() <= 0) say("NO SEEDS")
    else if (!tryPlantSeed(actor, field)) say("CAN'T PLANT THERE")
    return true
  }
  const fish = followingFish(actor)
  if (tool === "apple" && signal.appleCount.get() <= 0) {
    say("NO APPLES")
    return true
  }
  if (tool === "fish" && !fish) {
    say("NO FISH. FISH IN THE WATER")
    return true
  }
  if (
    !field.canEnter(fi, fj) || field.peekItems(fi, fj).length > 0
  ) {
    say("NO ROOM THERE")
    return true
  }
  if (tool === "fish") {
    // the fish lets go of the player and lies in front instead
    actor.unsetFollower()
    field.collectItem(fish!.i, fish!.j, fish!.id)
  }
  const item = field.spawnItem(tool, fi, fj)
  if (!item) return true
  if (tool === "apple") signal.appleCount.update(signal.appleCount.get() - 1)
  signal.playSound("blipSelect")
  putEffect(field, actor, fi, fj, item.def.color ?? Palette.white)
  return true
}
