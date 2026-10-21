import { DIRS, DOWN, LEFT, RIGHT, UP } from "../util/dir.ts"
import { Input, inputQueue } from "./ui/input.ts"
import {
  Actor,
  type IdleDelegate,
  type MoveEndDelegate,
} from "../model/actor.ts"
import { opposite } from "../util/dir.ts"
import type { Dir, IField, Move } from "../model/types.ts"
import { linePattern0 } from "../model/effect.ts"
import { collectAll, Item } from "../model/item.ts"
import * as signal from "../util/signals.ts"
import { Palette } from "../util/palette.ts"
import { recordTrail } from "../model/oddities.ts"
import { putTool } from "../model/tool.ts"

/**
 * Digs the diggable cell the actor stands on. Each spot yields its
 * treasure only once (tracked via the collected item ids, so it
 * persists in the save). Returns true if digging happened.
 */
function tryDig(actor: Actor, field: IField): boolean {
  if (!field.isDiggable(actor.i, actor.j)) {
    return false
  }
  const ids = [0, 1].map((n) => `dig.${actor.i}.${actor.j}.${n}`)
  if (ids.every((id) => Item.isCollected(id))) {
    // Already dug up
    return false
  }
  actor.jump()
  signal.playSound("explosion")
  for (
    const effect of linePattern0(
      DIRS,
      actor.i,
      actor.j,
      1,
      0.7,
      3,
      Palette.brown4,
    )
  ) {
    field.effects.add(effect)
  }
  const dirs = DIRS.filter((d) => {
    const [ni, nj] = actor.nextGrid(d)
    return field.canEnterStatic(ni, nj)
  })
  ids.forEach((id, n) => {
    if (Item.isCollected(id)) {
      return
    }
    const item = field.spawnItem("coin", actor.i, actor.j, id)
    if (item && dirs.length > 0) {
      item.enqueueActions({ type: "go", dir: dirs[n % dirs.length] })
    }
  })
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
    Palette.orange3,
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
      if (tryDig(actor, field)) {
        return
      }
      // the chosen tool goes down in front (docs/item-tools.md)
      if (putTool(actor, field)) {
        return
      }
      actor.jump()
      actor.unsetFollower()
    }
  }
}

export class MoveEndMainActor implements MoveEndDelegate {
  onMoveEnd(actor: Actor, field: IField, move: Move): void {
    // the trail the echo of the self statue walks
    if (move.type === "move") recordTrail(actor.i, actor.j, field.time)
    // everything on the cell at once (a stack shows "xN")
    collectAll(actor, field, field.peekItems(actor.i, actor.j))

    // Only an actual cell-entering move triggers onEnter. Jumps and
    // bounces end on the same cell, and firing onEnter for them
    // re-triggers the prop the actor is standing on (e.g. a spring
    // would enqueue jumps forever)
    if (move.type === "move") {
      field.props.get(actor.i, actor.j)?.onEnter(actor, field)
    }
  }
}
