import { DOWN, LEFT, RIGHT, UP } from "../util/dir.ts"
import { Input, inputQueue } from "./ui/input.ts"
import {
  Actor,
  type IdleDelegate,
  type MoveEndDelegate,
} from "../model/actor.ts"
import { opposite } from "../util/dir.ts"
import type { Dir, IField, Move } from "../model/types.ts"
import { linePattern0 } from "../model/effect.ts"
import * as signal from "../util/signals.ts"

/**
 * Plants a sapling at the front cell if the player has seeds and the
 * cell is a free ground. Returns true if planted.
 */
function tryPlantSeed(actor: Actor, field: IField): boolean {
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
  for (
    const effect of linePattern0([actor.dir], fi, fj, 1, 0.7, 2, "#5e6400")
  ) {
    field.effects.add(effect)
  }
  return true
}

const mushroomEffect = function (
  actor: Actor,
  dir: Dir,
) {
  return linePattern0(
    [dir],
    actor.i,
    actor.j,
    1,
    0.5,
    2,
    "#AA0000",
  )
}

export class IdleMainActor implements IdleDelegate {
  /** The field time when the ongoing fishing resolves, if fishing */
  #fishingUntil: number | null = null

  onIdle(actor: Actor, field: IField): void {
    let dir: Dir | null = null
    if (Input.up) {
      dir = UP
    } else if (Input.down) {
      dir = DOWN
    } else if (Input.left) {
      dir = LEFT
    } else if (Input.right) {
      dir = RIGHT
    }

    if (dir !== null) {
      // Moving cancels the ongoing fishing
      this.#fishingUntil = null
      actor.tryMove("go", dir, field)
      if (actor.buff.mushroom) {
        for (const effect of mushroomEffect(actor, opposite(dir))) {
          field.effects.add(effect)
        }
      }
      return
    }

    if (this.#fishingUntil !== null) {
      if (inputQueue[0] === "space" || inputQueue[0] === "touchendempty") {
        // Space cancels the ongoing fishing
        inputQueue.shift()
        this.#fishingUntil = null
        return
      }
      if (field.time >= this.#fishingUntil) {
        this.#fishingUntil = null
        this.#resolveFishing(actor, field)
      }
      return
    }

    const queueHead = inputQueue[0]

    if (
      queueHead === "space" ||
      queueHead === "touchendempty"
    ) {
      inputQueue.shift()
      if (tryPlantSeed(actor, field)) {
        return
      }
      const [fi, fj] = actor.frontGrid()
      if (field.isWater(fi, fj)) {
        // Starts fishing: resolves after 1 to 3 seconds
        this.#fishingUntil = field.time + 60 + Math.floor(Math.random() * 120)
        return
      }
      actor.jump()
      actor.unsetFollower()
    }
  }

  #resolveFishing(actor: Actor, field: IField): void {
    const [fi, fj] = actor.frontGrid()
    const roll = Math.random()
    if (roll < 0.4) {
      // Caught a fish, which becomes a follower
      const fish = field.spawnItem("fish", actor.i, actor.j)
      if (fish) {
        fish.onCollect(actor, field)
        signal.playSound("powerUp")
        signal.message.update({ text: "CAUGHT A FISH!" })
      }
    } else if (roll < 0.7) {
      signal.coinCount.update(signal.coinCount.get() + 1)
      signal.playSound("pickupCoin")
      signal.message.update({ text: "FOUND A COIN" })
    } else {
      signal.message.update({ text: "NO LUCK..." })
    }
    for (
      const effect of linePattern0([actor.dir], fi, fj, 1, 0.7, 3, "#006e8a")
    ) {
      field.effects.add(effect)
    }
  }
}

export class MoveEndMainActor implements MoveEndDelegate {
  onMoveEnd(actor: Actor, field: IField, move: Move): void {
    field.peekItem(actor.i, actor.j)?.onCollect(actor, field)

    // Only an actual cell-entering move triggers onEnter. Jumps and
    // bounces end on the same cell, and firing onEnter for them
    // re-triggers the prop the actor is standing on (e.g. a spring
    // would enqueue jumps forever)
    if (move.type === "move") {
      field.props.get(actor.i, actor.j)?.onEnter(actor, field)
    }
  }
}
