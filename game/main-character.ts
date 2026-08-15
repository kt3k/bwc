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
    const effect of linePattern0([actor.dir], fi, fj, 1, 0.7, 2, "#3d5a20")
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
      actor.tryMove("go", dir, field)
      if (actor.buff.mushroom) {
        for (const effect of mushroomEffect(actor, opposite(dir))) {
          field.effects.add(effect)
        }
      }
      return
    }

    const queueHead = inputQueue[0]

    if (
      queueHead === "space" ||
      queueHead === "touchendempty"
    ) {
      inputQueue.shift()
      if (!tryPlantSeed(actor, field)) {
        actor.jump()
        actor.unsetFollower()
      }
    }
  }
}

export class MoveEndMainActor implements MoveEndDelegate {
  onMoveEnd(actor: Actor, field: IField, _move: Move): void {
    field.peekItem(actor.i, actor.j)?.onCollect(actor, field)

    field.props.get(actor.i, actor.j)?.onEnter(actor, field)
  }
}
