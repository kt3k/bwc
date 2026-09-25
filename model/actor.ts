import {
  DIRS,
  DOWN,
  LEFT,
  nextGrid,
  opposite,
  RIGHT,
  turnLeft,
  turnRight,
  UP,
} from "../util/dir.ts"
import * as signal from "../util/signals.ts"
import { CELL_SIZE } from "../util/constants.ts"
import { seed } from "../util/random.ts"
import type {
  Action,
  Dir,
  IActor,
  IField,
  IFollower,
  IItem,
  LoadOptions,
  Move,
  PushedEvent,
} from "./types.ts"
import { ActorDefinition } from "./catalog.ts"
import { ActionQueue, type ActorAction } from "./action-queue.ts"
import { ActorSpawn } from "./field-block.ts"
import { linePattern0 } from "./effect.ts"
import { MoveBounce, MoveGo, MoveJump } from "./move.ts"

const fallbackImagePhase0 = await fetch(
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAADdJREFUOE9jZMAE/9GEGNH4KPLokiC1Q9AAkpzMwMCA4m0QZxgYgJ4SSPLSaDqAJAqSAm3wJSQApTMgCUQZ7FoAAAAASUVORK5CYII=",
).then((res) => res.blob()).then((blob) => createImageBitmap(blob))

const fallbackImagePhase1 = await fetch(
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAD5JREFUOE9jZGBg+M+AChjR+HjlQYqHgQFoXibNS+gBBjKMpDAZHAaQ5GQGBgYUV4+mA7QAgaYokgJ14NMBAK1TIAlUJpxYAAAAAElFTkSuQmCC",
).then((res) => res.blob()).then((blob) => createImageBitmap(blob))

const transparentImage = await fetch(
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAE0lEQVR4nGNgGAWjYBSMAgYwAAAEEAABsax5zAAAAABJRU5ErkJggg==",
).then((res) => res.blob()).then((blob) => createImageBitmap(blob))

type ActorAppearance =
  | "up0"
  | "up1"
  | "down0"
  | "down1"
  | "left0"
  | "left1"
  | "right0"
  | "right1"

type ActorAssets = {
  [K in ActorAppearance]: ImageBitmap
}

export type MoveEndType = "inertial"
export type IdleType = "random-rotate" | "random-walk" | "wander"

export function spawnActor(
  id: string,
  i: number,
  j: number,
  def: ActorDefinition,
  { dir = "down", speed = 1 }: { dir?: Dir; speed?: 1 | 2 | 4 | 8 | 16 } = {},
): Actor {
  let moveEnd: MoveEndDelegate | null = null
  let idle: IdleDelegate | null = null
  let pushed: ActorPushedDelegate | null = null
  // The crow's idle and pushed behaviors share the carrying state
  let crow: CrowDelegate | null = null
  switch (def.moveEnd) {
    case "inertial":
      moveEnd = new MoveEndDelegateInertial()
      break
    case "patrol":
      moveEnd = new MoveEndDelegatePatrol()
      break
  }
  switch (def.idle) {
    case "random-rotate":
      idle = new IdleDelegateRandomRotate()
      break
    case "random-walk":
      idle = new IdleDelegateRandomWalk()
      break
    case "wander":
      idle = new IdleDelegateWander()
      break
    case "chase":
      idle = new IdleDelegateChase()
      break
    case "ghost":
      idle = new IdleDelegateGhost()
      break
    case "patrol":
      idle = new IdleDelegatePatrol()
      break
    case "mirror":
      idle = new IdleDelegateMirror()
      break
    case "flee":
      idle = new IdleDelegateFlee()
      break
    case "crow":
      idle = crow ??= new CrowDelegate()
      break
  }
  switch (def.pushed) {
    case "roll":
      pushed = new ActorPushedDelegateRoll()
      break
    case "unstoppable":
      pushed = new ActorPushedDelegateUnstoppable()
      break
    case "startle":
      pushed = new ActorPushedDelegateStartle()
      break
    case "crow":
      pushed = crow ??= new CrowDelegate()
      break
  }
  return new Actor(i, j, def, id, dir, speed, moveEnd, idle, pushed)
}

/**
 * The actor class
 */
export class Actor implements IActor {
  /** The current direction of the actor */
  #dir: Dir
  /** The column of the world coordinates */
  #i: number
  /** The row of the world coordinates */
  #j: number
  /** The id of the actor */
  #id: string
  /** The speed of the move */
  #speed: 1 | 2 | 4 | 8 | 16
  /** The counter of the idle state */
  #idleCounter = 0
  /** The key of the physical grid, which is used for collision detection */
  #physicalGridKey: string
  /** The prefix of assets */
  #def: ActorDefinition
  /** The images necessary to render this actor */
  #assets?: ActorAssets
  /** The timer for speed up actions */
  #speedUpTimer: ReturnType<typeof setTimeout> | undefined
  /** The callback when speed up times out */
  #speedUpCb?: () => void
  /** The move of the actor */
  #move: Move | null = null
  /** The last move dir */
  #lastMoveDir: Dir | null = null
  /** MoveEnd delegate */
  #moveEnd: MoveEndDelegate | null
  /** Idle delegate */
  #idle: IdleDelegate | null
  /** Pushed delegate. Overrides the default knockback behavior */
  #pushed: ActorPushedDelegate | null
  /** buff labels */
  buff: Record<string, unknown> = { __proto__: null }
  /** The follower */
  #follower: IFollower | null = null

  /** The queue of actions to be performed */
  #actionQueue: ActionQueue<Actor, ActorAction> = new ActionQueue(
    (field, action) => {
      switch (action.type) {
        case "speed": {
          clearTimeout(this.#speedUpTimer)
          this.#speedUpCb?.()
          this.#speedUpCb = undefined
          switch (action.change) {
            case "2x":
              this.speed = 2
              break
            case "4x":
              this.speed = 4
              break
            case "reset":
              this.speed = 1
              break
            default:
              action.change satisfies never
          }
          return "next"
        }
        case "speed-timeout": {
          this.#speedUpTimer = setTimeout(() => {
            this.enqueueActions(
              { type: "speed", change: "reset" },
              { type: "jump" },
            )
            this.#speedUpCb?.()
          }, action.timeout)
          this.#speedUpCb?.()
          this.#speedUpCb = action.cb
          return "next"
        }
        case "turn": {
          const dir = action.dir
          switch (dir) {
            case "north":
              this.setDir("up")
              break
            case "south":
              this.setDir("down")
              break
            case "west":
              this.setDir("left")
              break
            case "east":
              this.setDir("right")
              break
            case "left":
              this.setDir(turnLeft(this.dir))
              break
            case "right":
              this.setDir(turnRight(this.dir))
              break
            case "back":
              this.setDir(opposite(this.dir))
              break
            default:
              dir satisfies never
          }
          return "next"
        }
        case "go-random": {
          const { choice } = seed(`${this.i}.${this.j}`)
          const dir = choice(DIRS)
          this.setDir(dir)
          this.#move = new MoveGo(this.#speed, dir)
          return "end"
        }
        case "go":
        case "slide": {
          this.tryMove(action.type, action.dir, field, action.cb, action.speed)
          return "end"
        }
        case "jump": {
          this.jump(action.cb)
          return "end"
        }
        case "add-buff": {
          this.buff[action.buff] = "value" in action ? action.value : true
          return "next"
        }
        case "remove-buff": {
          delete this.buff[action.buff]
          return "next"
        }
        default: {
          action satisfies never
          throw new Error("Unreachable")
        }
      }
    },
  )

  static fromSpawn(spawn: ActorSpawn): Actor {
    return spawnActor(spawn.id, spawn.i, spawn.j, spawn.def, {
      dir: spawn.dir,
      speed: spawn.speed,
    })
  }

  constructor(
    i: number,
    j: number,
    def: ActorDefinition,
    id: string,
    dir: Dir = DOWN,
    speed: 1 | 2 | 4 | 8 | 16 = 1,
    moveEnd: MoveEndDelegate | null = null,
    idle: IdleDelegate | null = null,
    pushed: ActorPushedDelegate | null = null,
  ) {
    this.#i = i
    this.#j = j
    this.#speed = speed
    this.#id = id
    this.#def = def
    this.#physicalGridKey = this.#calcPhysicalGridKey()
    this.#dir = dir
    this.#moveEnd = moveEnd
    this.#idle = idle
    this.#pushed = pushed
  }

  fastTravel(i: number, j: number) {
    this.#i = i
    this.#j = j
    this.#dir = DOWN
    this.#physicalGridKey = this.#calcPhysicalGridKey()
    this.#move = null
    this.#idleCounter = 0
  }

  tryMove(
    type: "go" | "slide",
    dir: Dir,
    field: IField,
    cb?: (move: Move) => void,
    speedOverride?: 1 | 2 | 4 | 8 | 16,
  ) {
    const speed = speedOverride ?? this.#speed
    if (type === "go") this.setDir(dir)
    if (this.canGo(dir, field)) {
      if (type === "slide") {
        // Wind streaks trailing behind the sliding actor
        for (
          const effect of linePattern0(
            [opposite(dir)],
            this.#i,
            this.#j,
            1.3,
            0.4,
            2,
            "#cceaff",
          )
        ) {
          field.effects.add(effect)
        }
      }
      this.#move = new MoveGo(speed, dir)
      if (this.#follower && this.#lastMoveDir) {
        this.#follower.follow(this.#i, this.#j, this.#lastMoveDir, speed)
      }

      // actor position moves to the next grid immediately (the animation catches it up in 16 frames)
      const [nextI, nextJ] = this.nextGrid(dir)
      this.#i = nextI
      this.#j = nextJ
      this.#physicalGridKey = this.#calcPhysicalGridKey()
    } else {
      const [i, j] = this.nextGrid(dir)
      const ev = { type: "pushed", dir, peakAt: 7, pusher: this } as const
      let actorPushed = false
      for (const actor of field.actors.get(i, j)) {
        actorPushed = true
        actor.onPushed(ev, field)
      }
      field.props.get(i, j)?.onPushed(ev, field)
      this.#move = new MoveBounce(
        dir,
        actorPushed,
        speed,
      )
      if (this.#id === "main") {
        signal.playSound("hitHurt")
      }
    }
    this.#move.cb = cb
    this.#idleCounter = 0
  }

  /**
   * Moves the actor to the next cell ignoring the collision.
   * Used by wall-passing actors like ghosts.
   */
  forceMove(dir: Dir) {
    this.setDir(dir)
    this.#move = new MoveGo(this.#speed, dir)
    if (this.#follower && this.#lastMoveDir) {
      this.#follower.follow(this.#i, this.#j, this.#lastMoveDir, this.#speed)
    }
    const [nextI, nextJ] = this.nextGrid(dir)
    this.#i = nextI
    this.#j = nextJ
    this.#physicalGridKey = this.#calcPhysicalGridKey()
    this.#idleCounter = 0
  }

  jump(cb?: (move: Move) => void) {
    this.#move = new MoveJump()
    this.#move.cb = cb
    this.#idleCounter = 0
    if (this.#id === "main") {
      signal.playSound("jump")
    }
  }

  setDir(state: Dir) {
    this.#dir = state
  }

  /** Returns the grid coordinates of the 1 cell front of the actor. */
  frontGrid(): [i: number, j: number] {
    return this.nextGrid(this.#dir)
  }

  /** Returns the next grid coordinates of the 1 cell next of the actor to the given direction */
  nextGrid(dir: Dir, distance = 1): [i: number, j: number] {
    return nextGrid(this.#i, this.#j, dir, distance)
  }

  /** Returns true if the actor can go to the given direction */
  canGo(
    dir: Dir,
    field: IField,
  ): boolean {
    const [i, j] = this.nextGrid(dir)
    return field.canEnter(i, j)
  }

  enqueueActions(...actions: Action[]) {
    this.#actionQueue.enqueue(...actions)
  }

  unshiftActions(...actions: Action[]) {
    this.#actionQueue.unshift(...actions)
  }

  clearActionQueue() {
    this.#actionQueue.clear()
  }

  isActionQueueEmpty(): boolean {
    return this.#actionQueue.isEmpty()
  }

  step(field: IField) {
    if (this.#move === null) {
      const state = this.#actionQueue.process(this, field)
      if (state === "idle") {
        this.#idle?.onIdle(this, field)
      }
    }

    if (this.#move) {
      this.#move.step()
      if (this.#move.finished) {
        const move = this.#move
        move.cb?.(move)
        this.#moveEnd?.onMoveEnd(this, field, move)
        if (move.type === "move") {
          this.#lastMoveDir = move.dir
        }
        this.#move = null
        const conveyor = field.conveyorDir(this.#i, this.#j)
        if (conveyor && this.canGo(conveyor, field)) {
          // The conveyor cell forces the actor to slide to its
          // direction (at 4x speed), whichever way the actor came from
          this.unshiftActions({ type: "slide", dir: conveyor, speed: 4 })
        } else if (
          move.type === "move" && field.isSlippery(this.#i, this.#j) &&
          this.canGo(move.dir, field)
        ) {
          // The actor keeps sliding on the slippery cell at 4x speed,
          // ignoring the inputs and the queued actions
          this.unshiftActions({ type: "slide", dir: move.dir, speed: 4 })
        }
      }
    } else {
      this.#idleCounter += 1
    }
  }

  image(): ImageBitmap {
    if (this.buff.invisible) {
      return transparentImage
    }
    if (this.#move) {
      return this.getImage(this.#dir, this.#move.halfPassed ? 1 : 0)
    } else if (this.#idleCounter % 128 < 64) {
      // idle state
      return this.getImage(this.#dir, 0)
    } else {
      // active state
      return this.getImage(this.#dir, 1)
    }
  }

  get id(): string {
    return this.#id
  }

  get dir(): Dir {
    return this.#dir
  }

  /**
   * Gets the x of the world coordinates.
   *
   * This defines where the actor is drawn.
   */
  get x(): number {
    return this.#i * CELL_SIZE + (this.#move?.x ?? 0)
  }

  /**
   * Gets the center x of the world coordinates.
   *
   * This is used for setting the center of ViewScope.
   * We ignore the effect of jump and bounce to prevent screen shake.
   */
  get centerX(): number {
    if (
      this.#move && (this.#move.type === "jump" || this.#move.type === "bounce")
    ) {
      // We don't use #d in jump and bounce state to prevent screen shake
      return this.#i * CELL_SIZE + CELL_SIZE / 2
    }

    return this.x + CELL_SIZE / 2
  }

  /**
   * Gets the y of the world coordinates
   *
   * This defines where the actor is drawn.
   */
  get y(): number {
    return this.#j * CELL_SIZE + (this.#move?.y ?? 0)
  }

  /**
   * Gets the center y of the world coordinates.
   *
   * This is used for setting the center of ViewScope.
   * We ignore the effect of jump and bounce to prevent screen shake.
   */
  get centerY(): number {
    if (
      this.#move && (this.#move.type === "jump" || this.#move.type === "bounce")
    ) {
      // We don't use #d in jump and bounce state to prevent screen shake
      return this.#j * CELL_SIZE + CELL_SIZE / 2
    }

    return this.y + CELL_SIZE / 2
  }

  get h(): number {
    return CELL_SIZE
  }

  get w(): number {
    return CELL_SIZE
  }

  set speed(value: 1 | 2 | 4 | 8 | 16) {
    this.#speed = value
  }

  /** Loads the assets and store ImageBitmaps in #assets. */
  async loadAssets(options: LoadOptions) {
    const loadImage = options.loadImage
    if (!loadImage) {
      throw new Error("Cannot load assets as loadImage not specified")
    }
    const [up0, up1, down0, down1, left0, left1, right0, right1] = await Promise
      .all([
        `${this.#def.href}up0.png`,
        `${this.#def.href}up1.png`,
        `${this.#def.href}down0.png`,
        `${this.#def.href}down1.png`,
        `${this.#def.href}left0.png`,
        `${this.#def.href}left1.png`,
        `${this.#def.href}right0.png`,
        `${this.#def.href}right1.png`,
      ].map(loadImage))
    this.#assets = {
      up0,
      up1,
      down0,
      down1,
      left0,
      left1,
      right0,
      right1,
    }
  }

  getImage(dir: Dir, phase: 0 | 1): ImageBitmap {
    if (!this.#assets) {
      if (phase === 0) {
        return fallbackImagePhase0
      } else {
        return fallbackImagePhase1
      }
    }
    return this.#assets[`${dir}${phase}`]
  }

  get assetsReady(): boolean {
    return !!this.#assets
  }

  #calcPhysicalGridKey(): string {
    return `${this.#i}.${this.#j}`
  }

  get physicalGridKey(): string {
    return this.#physicalGridKey
  }

  get i(): number {
    return this.#i
  }
  get j(): number {
    return this.#j
  }

  onPushed(event: PushedEvent, field: IField): void {
    if (this.#pushed) {
      this.#pushed.onPushed(event, this, field)
      return
    }
    let i = this.i, j = this.j
    switch (event.dir) {
      case "up":
        j++
        break
      case "down":
        j--
        break
      case "left":
        i++
        break
      case "right":
        i--
        break
    }
    for (
      const effect of linePattern0([event.dir], i, j, 1, 0.3, 3, "white")
    ) {
      field.effects.add(effect)
    }

    if (this.#move) {
      this.unshiftActions({ type: "slide", dir: event.dir })
    } else {
      this.enqueueActions({ type: "wait", until: field.time + event.peakAt })
      this.enqueueActions({ type: "slide", dir: event.dir })
    }
  }

  setFollower(follower: IFollower) {
    if (this.#follower) {
      this.#follower.setFollower(follower)
    } else {
      this.#follower = follower
    }
  }

  get follower(): IFollower | null {
    return this.#follower
  }

  get isUnstoppable(): boolean {
    return this.#pushed instanceof ActorPushedDelegateUnstoppable
  }

  unsetFollower() {
    if (this.#follower) {
      this.#follower.unfollow()
      this.#follower = null
    }
  }
}

export interface MoveEndDelegate {
  onMoveEnd(actor: Actor, field: IField, move: Move): void
}

export class MoveEndDelegateInertial implements MoveEndDelegate {
  onMoveEnd(actor: Actor, _field: IField, move: Move): void {
    if (!actor.isActionQueueEmpty()) {
      return
    }

    switch (move.type) {
      case "move": {
        actor.enqueueActions({ type: "go", dir: move.dir })
        break
      }
      case "bounce": {
        if (!move.pushedActors) {
          // The actor was bounced to the wall.
          // In that case, the actor go back to the opposite direction
          actor.enqueueActions({ type: "go", dir: opposite(move.dir) })
        }
      }
    }
  }
}

/**
 * Keeps walking, and turns back on any bump, whether it hit a wall, a
 * button or an actor. Unlike the inertial move end it never plows
 * through whoever it knocked, so a patrol can't pin the player.
 */
export class MoveEndDelegatePatrol implements MoveEndDelegate {
  onMoveEnd(actor: Actor, _field: IField, move: Move): void {
    if (!actor.isActionQueueEmpty()) {
      return
    }
    if (move.type === "move") {
      actor.enqueueActions({ type: "go", dir: move.dir })
    } else if (move.type === "bounce") {
      actor.enqueueActions({ type: "go", dir: opposite(move.dir) })
    }
  }
}

export interface IdleDelegate {
  onIdle(actor: Actor, field: IField): void
}

export interface ActorPushedDelegate {
  onPushed(event: PushedEvent, actor: Actor, field: IField): void
}

/**
 * Rolls straight to the pushed direction until blocked, crushing the
 * NPCs in the way (they drop a coin).
 */
export class ActorPushedDelegateRoll implements ActorPushedDelegate {
  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    if (actor.buff.rolling) {
      return
    }
    actor.buff.rolling = true
    const dir = event.dir
    const step = () => {
      const [ni, nj] = actor.nextGrid(dir)
      for (const other of field.actors.get(ni, nj)) {
        if (other === actor || other.id === "main" || other.isUnstoppable) {
          // Never crushes the player or a patrol: the boulder stops in
          // front of them instead (the bounce below ends the roll)
          continue
        }
        // Crushes the NPC in the way, which drops a coin (and lets go of
        // whatever it carried, e.g. a crow's loot)
        other.unsetFollower()
        field.actors.remove(other)
        field.spawnItem("coin", ni, nj)
        signal.playSound("explosion")
        for (
          const effect of linePattern0(DIRS, ni, nj, 1, 0.7, 3, "#4a4d4a")
        ) {
          field.effects.add(effect)
        }
      }
      if (field.isWater(ni, nj)) {
        // The boulder sinks into the water and becomes a bridge
        field.updateCell(ni, nj, "0")
        field.actors.remove(actor)
        signal.playSound("explosion")
        for (
          const effect of linePattern0(DIRS, ni, nj, 1, 0.7, 3, "#002e55")
        ) {
          field.effects.add(effect)
        }
        delete actor.buff.rolling
        return
      }
      if (!field.canEnterStatic(ni, nj)) {
        // Blocked by terrain or a prop. Stops rolling. The prop in the
        // way gets pressed by the boulder (buttons, crates)
        delete actor.buff.rolling
        field.props.get(ni, nj)?.onPushed(
          { type: "pushed", dir, peakAt: 0, pusher: actor },
          field,
        )
        return
      }
      actor.enqueueActions({
        type: "slide",
        dir,
        cb: (move) => {
          if (move.type === "move") {
            step()
          } else {
            // Bounced (e.g. into the player). Stops rolling.
            delete actor.buff.rolling
          }
        },
      })
    }
    step()
  }
}

/**
 * Walks straight ahead whenever idle. Combined with the patrol move
 * end, the actor bounces back and forth between the obstacles, pressing
 * any button at the ends of its lane.
 */
export class IdleDelegatePatrol implements IdleDelegate {
  onIdle(actor: Actor, field: IField): void {
    actor.tryMove("go", actor.dir, field)
  }
}

/** Ignores pushes: the actor can't be shoved off its course, nor crushed */
export class ActorPushedDelegateUnstoppable implements ActorPushedDelegate {
  onPushed(_event: PushedEvent, _actor: Actor, _field: IField): void {}
}

export class IdleDelegateRandomWalk implements IdleDelegate {
  onIdle(actor: Actor, field: IField): void {
    const dirs = DIRS.filter((d) => {
      const [i, j] = actor.nextGrid(d)
      return field.canEnterStatic(i, j)
    })
    if (dirs.length === 0) {
      return
    }
    const { choice } = seed(
      field.time.toString() + actor.i.toString() + actor.j.toString(),
    )
    actor.tryMove("go", choice(dirs), field)
    return
  }
}

export class IdleDelegateWander implements IdleDelegate {
  #counter = 32
  onIdle(actor: Actor, field: IField): void {
    this.#counter -= 1
    if (this.#counter <= 0) {
      const { randomInt, choice } = seed(field.time.toString())
      this.#counter = randomInt(8) + 4
      // If the actor can keep going in the current direction,
      // it will keep going with 96% probability.
      if (
        actor.canGo(actor.dir, field) &&
        Math.random() < 0.96
      ) {
        actor.tryMove("go", actor.dir, field)
        return
      }
      if (randomInt(2) === 0) {
        actor.jump()
      }
      const nextCandidate = DIRS.filter((d) => actor.canGo(d, field))
      if (nextCandidate.length === 0) {
        actor.enqueueActions({
          type: "turn",
          dir: choice(["left", "right"]),
        })
        return
      }
      actor.tryMove("go", choice(nextCandidate), field)
    }
  }
}

/**
 * Chases the main character when it comes within the given range
 * (manhattan distance). On contact, it steals an apple from the player
 * with a cooldown.
 */
export class IdleDelegateChase implements IdleDelegate {
  /** The chase range in manhattan distance */
  #range: number
  /** The steal cooldown in frames */
  #cooldown: number
  #stealDisabledUntil = 0

  constructor(range = 6, cooldown = 180) {
    this.#range = range
    this.#cooldown = cooldown
  }

  onIdle(actor: Actor, field: IField): void {
    const me = field.me
    if (!me || me.id === actor.id) {
      return
    }
    const di = me.i - actor.i
    const dj = me.j - actor.j
    const dist = Math.abs(di) + Math.abs(dj)
    // At night the chaser sees twice as far
    const range = signal.nightDarkness.get() > 0.3
      ? this.#range * 2
      : this.#range
    if (dist === 0 || dist > range) {
      // Out of range. Waits on the spot.
      return
    }

    // Prefer the axis with the larger distance to the player
    const dirI: Dir | null = di !== 0 ? (di > 0 ? RIGHT : LEFT) : null
    const dirJ: Dir | null = dj !== 0 ? (dj > 0 ? DOWN : UP) : null
    const candidates =
      (Math.abs(di) >= Math.abs(dj) ? [dirI, dirJ] : [dirJ, dirI]).filter((
        d,
      ): d is Dir => d !== null)

    for (const dir of candidates) {
      const [ni, nj] = actor.nextGrid(dir)
      const isContact = ni === me.i && nj === me.j
      if (!isContact && !field.canEnterStatic(ni, nj)) {
        continue
      }
      // Bouncing into the player knocks it back via the onPushed path
      actor.tryMove("go", dir, field)
      if (isContact && field.time >= this.#stealDisabledUntil) {
        this.#stealDisabledUntil = field.time + this.#cooldown
        const count = signal.appleCount.get()
        if (count > 0) {
          signal.appleCount.update(count - 1)
          signal.playSound("hitHurt")
          for (
            const effect of linePattern0(DIRS, me.i, me.j, 1, 0.7, 3, "#983600")
          ) {
            field.effects.add(effect)
          }
        }
      }
      return
    }
  }
}

/**
 * A night-only wall-passing enemy. Active while it is dark: slowly
 * drifts toward the player through walls, avoiding lantern light, and
 * steals a coin on contact. Invisible and dormant during the day.
 */
export class IdleDelegateGhost implements IdleDelegate {
  /** The activation range in manhattan distance */
  #range: number
  /** Frames between the drift steps (the ghost is slow) */
  #pace: number
  #cooldown = 0
  #stealDisabledUntil = 0

  constructor(range = 14, pace = 24) {
    this.#range = range
    this.#pace = pace
  }

  onIdle(actor: Actor, field: IField): void {
    if (signal.nightDarkness.get() <= 0.3) {
      // Daytime: dormant and invisible
      actor.buff.invisible = true
      return
    }
    delete actor.buff.invisible
    if (--this.#cooldown > 0) {
      return
    }
    this.#cooldown = this.#pace

    const me = field.me
    if (!me || me.id === actor.id) {
      return
    }
    const di = me.i - actor.i
    const dj = me.j - actor.j
    const dist = Math.abs(di) + Math.abs(dj)
    if (dist === 0 || dist > this.#range) {
      return
    }
    const dirI: Dir | null = di !== 0 ? (di > 0 ? RIGHT : LEFT) : null
    const dirJ: Dir | null = dj !== 0 ? (dj > 0 ? DOWN : UP) : null
    const candidates =
      (Math.abs(di) >= Math.abs(dj) ? [dirI, dirJ] : [dirJ, dirI]).filter((
        d,
      ): d is Dir => d !== null)

    for (const dir of candidates) {
      const [ni, nj] = actor.nextGrid(dir)
      if (ni === me.i && nj === me.j) {
        // Contact: steals a coin with a cooldown
        if (field.time >= this.#stealDisabledUntil) {
          this.#stealDisabledUntil = field.time + 300
          const count = signal.coinCount.get()
          if (count > 0) {
            signal.coinCount.update(count - 1)
            signal.playSound("hitHurt")
            for (
              const effect of linePattern0(
                DIRS,
                me.i,
                me.j,
                1,
                0.7,
                3,
                "#5a0019",
              )
            ) {
              field.effects.add(effect)
            }
          }
        }
        return
      }
      // The ghost fears the light
      if (this.#nearLight(field, ni, nj)) {
        continue
      }
      // Never overlaps other actors, but passes through walls
      if (field.actors.get(ni, nj).length > 0) {
        continue
      }
      actor.forceMove(dir)
      return
    }
  }

  #nearLight(field: IField, i: number, j: number): boolean {
    for (const prop of field.props.iter()) {
      if (!prop.isLightSource) {
        continue
      }
      if (Math.abs(prop.i - i) + Math.abs(prop.j - j) <= 4) {
        return true
      }
    }
    return false
  }
}

export class IdleDelegateRandomRotate implements IdleDelegate {
  #config: {
    delay: number
    counter: number
    turnRight: boolean
  } | null = null

  onIdle(actor: Actor, _field: IField): void {
    if (!this.#config) {
      // init
      const { randomInt } = seed(actor.id)
      const delay = 43 + randomInt(8)
      this.#config = {
        delay,
        counter: delay,
        turnRight: randomInt(2) === 0,
      }
    }
    if (--this.#config.counter > 0) {
      return
    }

    this.#config.counter = this.#config.delay
    if (this.#config.turnRight) {
      actor.setDir(turnRight(actor.dir))
    } else {
      actor.setDir(turnLeft(actor.dir))
    }
  }
}

/**
 * Returns the directions that bring (0, 0) closer to (di, dj), the axis
 * with the larger distance first.
 */
function dirsToward(di: number, dj: number): Dir[] {
  const dirI: Dir | null = di !== 0 ? (di > 0 ? RIGHT : LEFT) : null
  const dirJ: Dir | null = dj !== 0 ? (dj > 0 ? DOWN : UP) : null
  return (Math.abs(di) >= Math.abs(dj) ? [dirI, dirJ] : [dirJ, dirI]).filter((
    d,
  ): d is Dir => d !== null)
}

/** The mirrored direction of the player's move: left and right swapped */
function mirrorDir(dir: Dir): Dir {
  return dir === LEFT ? RIGHT : dir === RIGHT ? LEFT : dir
}

/**
 * The mirror child. Replays every step of the player with left and right
 * swapped (up and down stay). A step into a wall bumps it instead, which
 * presses the button there, so the player can shift the pair out of
 * sync by walking the mirror into a pillar.
 */
export class IdleDelegateMirror implements IdleDelegate {
  /** The reaction range in manhattan distance */
  #range: number
  /** The player's position the mirror has replayed up to */
  #seen: [number, number] | null = null

  constructor(range = 16) {
    this.#range = range
  }

  onIdle(actor: Actor, field: IField): void {
    const me = field.me
    if (!me || me.id === actor.id) {
      return
    }
    const seen = this.#seen
    if (!seen) {
      this.#seen = [me.i, me.j]
      return
    }
    const di = me.i - seen[0]
    const dj = me.j - seen[1]
    if (di === 0 && dj === 0) {
      return
    }
    const dist = Math.abs(me.i - actor.i) + Math.abs(me.j - actor.j)
    if (Math.abs(di) + Math.abs(dj) > 4 || dist > this.#range) {
      // Warped or out of sight: re-syncs without moving
      this.#seen = [me.i, me.j]
      return
    }
    // Replays one step of the backlog (the player may be faster)
    let dir: Dir
    if (di !== 0) {
      dir = di > 0 ? RIGHT : LEFT
      seen[0] += Math.sign(di)
    } else {
      dir = dj > 0 ? DOWN : UP
      seen[1] += Math.sign(dj)
    }
    actor.tryMove("go", mirrorDir(dir), field)
  }
}

/**
 * The sheep. Runs away from the player who comes within the range
 * (twice as far at night), taking any step that widens the distance.
 * Cornered, it trembles on the spot. Out of range it grazes, turning
 * now and then. The player herds it with the approach angle, as the
 * sheep can't be pushed (see ActorPushedDelegateStartle).
 */
export class IdleDelegateFlee implements IdleDelegate {
  /** The flight distance in manhattan distance */
  #range: number
  #trembleUntil = 0

  constructor(range = 3) {
    this.#range = range
  }

  onIdle(actor: Actor, field: IField): void {
    const me = field.me
    if (!me || me.id === actor.id) {
      return
    }
    const di = actor.i - me.i
    const dj = actor.j - me.j
    const dist = Math.abs(di) + Math.abs(dj)
    const range = signal.nightDarkness.get() > 0.3
      ? this.#range * 2
      : this.#range
    if (dist > range) {
      // Grazing
      const { randomInt, choice } = seed(`${actor.id}.${field.time}`)
      if (randomInt(120) === 0) {
        actor.setDir(choice(DIRS))
      }
      return
    }
    // Straight away first, then sideways: any step off both axes of the
    // player widens the manhattan distance
    const away = dirsToward(di, dj)
    const { choice } = seed(`${actor.id}.${field.time}`)
    for (const dir of away) {
      const [ni, nj] = actor.nextGrid(dir)
      if (field.canEnter(ni, nj)) {
        actor.tryMove("go", dir, field)
        return
      }
    }
    // Blocked ahead: a random free sidestep that still widens the distance
    const sideways = DIRS.filter((d) => {
      const [ni, nj] = nextGrid(actor.i, actor.j, d)
      return !away.includes(d) && field.canEnter(ni, nj) &&
        Math.abs(ni - me.i) + Math.abs(nj - me.j) > dist
    })
    if (sideways.length > 0) {
      actor.tryMove("go", choice(sideways), field)
      return
    }
    // Cornered: faces the player and trembles
    actor.setDir(dirsToward(-di, -dj)[0] ?? actor.dir)
    if (field.time >= this.#trembleUntil) {
      this.#trembleUntil = field.time + 40
      actor.jump()
    }
  }
}

/** Jumps in surprise instead of being knocked back */
export class ActorPushedDelegateStartle implements ActorPushedDelegate {
  onPushed(_event: PushedEvent, actor: Actor, _field: IField): void {
    if (actor.isActionQueueEmpty()) {
      actor.enqueueActions({ type: "jump" })
    }
  }
}

/** The items the crow is after */
const SHINY = new Set(["coin", "key"])

/**
 * The crow. Once the player comes near, it flies (over water too) to
 * the nearest shiny item (coin, key) within the range, picks it up and carries it back to its nest, the
 * cell it spawned on. The items piled around the nest are its hoard and
 * are left alone. Bumping the crow on land makes it drop what it
 * carries; it then ignores that item for a while.
 */
export class CrowDelegate implements IdleDelegate, ActorPushedDelegate {
  /** The search range in manhattan distance */
  #range: number
  /** The crow only goes stealing while the player is this close to its nest */
  #wake: number
  #nest: [number, number] | null = null
  /** The id of the carried item */
  #carrying: string | null = null
  /** Item ids to leave alone, until the given time */
  #ignored = new Map<string, number>()
  #restUntil = 0

  constructor(range = 7, wake = 8) {
    this.#range = range
    this.#wake = wake
  }

  get nest(): [number, number] | null {
    return this.#nest
  }

  get carrying(): string | null {
    return this.#carrying
  }

  onIdle(actor: Actor, field: IField): void {
    const nest = this.#nest ??= [actor.i, actor.j]
    if (field.time < this.#restUntil) {
      return
    }
    if (this.#carrying && !actor.follower) {
      // The carried item is gone (e.g. deactivated)
      this.#carrying = null
    }
    if (this.#carrying) {
      if (actor.i === nest[0] && actor.j === nest[1]) {
        // Home: leaves the loot by the nest
        this.#drop(actor, field)
        this.#restUntil = field.time + 90
        return
      }
      this.#flyToward(actor, field, nest[0], nest[1])
      return
    }
    const me = field.me
    // Measured from the nest, so the crow doesn't doze off mid-flight
    const awake = me &&
      Math.abs(me.i - nest[0]) + Math.abs(me.j - nest[1]) <= this.#wake
    const item = awake ? this.#findShiny(actor, field) : null
    if (!item) {
      // Nothing to steal. Rests a while before looking again
      this.#restUntil = field.time + 20
      if (actor.i !== nest[0] || actor.j !== nest[1]) {
        this.#restUntil = 0
        this.#flyToward(actor, field, nest[0], nest[1])
      }
      return
    }
    if (item.i === actor.i && item.j === actor.j) {
      actor.setFollower(item)
      item.startFollowing()
      this.#carrying = item.id
      signal.playSound("jump")
      for (
        const effect of linePattern0(
          DIRS,
          actor.i,
          actor.j,
          1,
          0.7,
          2,
          "#d49d29",
        )
      ) {
        field.effects.add(effect)
      }
      return
    }
    this.#flyToward(actor, field, item.i, item.j)
  }

  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    if (!this.#carrying || field.isWater(actor.i, actor.j)) {
      // Holds tight over the water
      if (actor.isActionQueueEmpty()) {
        actor.enqueueActions({ type: "jump" })
      }
      return
    }
    this.#ignored.set(this.#carrying, field.time + 240)
    this.#drop(actor, field)
    signal.playSound("hitHurt")
    for (
      const effect of linePattern0(DIRS, actor.i, actor.j, 1, 0.7, 3, "#1f008a")
    ) {
      field.effects.add(effect)
    }
    // Knocked back, leaving the loot behind
    actor.enqueueActions({ type: "wait", until: field.time + event.peakAt })
    actor.enqueueActions({ type: "slide", dir: event.dir })
    this.#restUntil = field.time + 60
  }

  #drop(actor: Actor, field: IField) {
    const item = actor.follower
    actor.unsetFollower()
    this.#carrying = null
    if (!item) {
      return
    }
    const di = actor.i - item.i
    const dj = actor.j - item.j
    if (
      Math.abs(di) + Math.abs(dj) === 1 && field.isWater(item.i, item.j) &&
      !field.isWater(actor.i, actor.j)
    ) {
      // Never drops into the water: the item lands on the shore
      item.enqueueActions({ type: "go", dir: dirsToward(di, dj)[0] })
    }
  }

  #findShiny(actor: Actor, field: IField): IItem | null {
    const nest = this.#nest!
    let best: IItem | null = null
    let bestDist = Infinity
    const r = this.#range
    for (let dj = -r; dj <= r; dj++) {
      const w = r - Math.abs(dj)
      for (let di = -w; di <= w; di++) {
        const i = actor.i + di
        const j = actor.j + dj
        if (Math.abs(i - nest[0]) + Math.abs(j - nest[1]) <= 2) {
          // The hoard
          continue
        }
        const item = field.peekItem(i, j)
        if (!item || item.isFollowing || !SHINY.has(item.def.collect)) {
          continue
        }
        if ((this.#ignored.get(item.id) ?? 0) > field.time) {
          continue
        }
        const dist = Math.abs(di) + Math.abs(dj)
        if (dist < bestDist) {
          best = item
          bestDist = dist
        }
      }
    }
    return best
  }

  /** Flies one cell toward the target, over land or water */
  #flyToward(actor: Actor, field: IField, ti: number, tj: number) {
    const toward = dirsToward(ti - actor.i, tj - actor.j)
    const around = DIRS.filter((d) =>
      !toward.includes(d) && !toward.includes(opposite(d))
    )
    for (const dir of [...toward, ...around]) {
      const [ni, nj] = actor.nextGrid(dir)
      if (field.canEnter(ni, nj)) {
        actor.tryMove("go", dir, field)
        return
      }
      if (
        field.isWater(ni, nj) && field.actors.get(ni, nj).length === 0 &&
        !field.props.get(ni, nj)
      ) {
        actor.forceMove(dir)
        return
      }
    }
    // Stuck. Waits a bit
    this.#restUntil = field.time + 30
  }
}
