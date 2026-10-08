// Bait: items lying on the ground that draw an animal to them (an apple
// for the chaser, a fish for the cat). The player puts them down with
// the tool (model/tool.ts); the animal walks over and eats it.
import { DIRS } from "../util/dir.ts"
import { Palette } from "../util/palette.ts"
import * as signal from "../util/signals.ts"
import type { Actor } from "./actor.ts"
import { linePattern0 } from "./effect.ts"
import { findPath, manhattan } from "./steering.ts"
import type { IField, IItem } from "./types.ts"

/**
 * The nearest lying (not following) item of the collect type within the
 * manhattan range of (i, j)
 */
export function findBait(
  field: IField,
  i: number,
  j: number,
  collect: string,
  range: number,
): IItem | null {
  let best: IItem | null = null
  let bestDist = Infinity
  for (let dj = -range; dj <= range; dj++) {
    const w = range - Math.abs(dj)
    for (let di = -w; di <= w; di++) {
      for (const item of field.peekItems(i + di, j + dj)) {
        if (item.isFollowing || item.def.collect !== collect) continue
        const dist = Math.abs(di) + Math.abs(dj)
        if (dist < bestDist) {
          best = item
          bestDist = dist
        }
      }
    }
  }
  return best
}

/**
 * Takes one step on the way to the bait (around the walls). Returns
 * false if there is no way to it.
 */
export function stepToBait(actor: Actor, field: IField, bait: IItem): boolean {
  const path = findPath(
    actor.i,
    actor.j,
    (i, j) => i === bait.i && j === bait.j,
    (i, j) => field.canEnter(i, j),
    200,
  )
  if (!path || path.length === 0) return false
  actor.tryMove("go", path[0], field)
  return true
}

/** The animal eats the bait it stands on: gone, with a munch */
export function eatBait(
  actor: Actor,
  field: IField,
  bait: IItem,
  text: string,
): void {
  field.collectItem(bait.i, bait.j, bait.id)
  actor.enqueueActions({ type: "jump" })
  signal.playSound("pickupCoin")
  for (
    const effect of linePattern0(
      DIRS,
      actor.i,
      actor.j,
      1,
      0.7,
      2,
      bait.def.color ?? Palette.white,
    )
  ) {
    field.effects.add(effect)
  }
  const me = field.me
  if (me && manhattan(me.i, me.j, actor.i, actor.j) <= 12) {
    signal.message.update({ text })
  }
}
