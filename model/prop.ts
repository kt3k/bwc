import { CELL_SIZE } from "../util/constants.ts"
import { DIRS, nextGrid, opposite } from "../util/dir.ts"
import { clearSave, recordBestTime } from "../util/save.ts"
import * as signal from "../util/signals.ts"
import { linePattern0 } from "./effect.ts"
import { Item } from "./item.ts"
import type {
  Dir,
  IActor,
  IField,
  IProp,
  LoadOptions,
  PushedEvent,
} from "./types.ts"
import { PropSpawn } from "./field-block.ts"
import { PropDefinition } from "./catalog.ts"
import { ActionQueue, type PropAction } from "./action-queue.ts"

const fallbackImage = await fetch(
  // TODO(kt3k): Update
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAADRJREFUOE9jZKAQMFKon2FoGPAfzZsoribGC0PQALxORo92bGEwDAwgKXUTkw7wGjjwBgAAiwgIEW1Cnt4AAAAASUVORK5CYII=",
).then((res) => res.blob()).then((blob) => createImageBitmap(blob))

/**
 * The growth states of the growable props (e.g. trees), keyed by the
 * world coordinates. Kept in a module level map so that the states
 * survive the deactivation of the props.
 */
const growthStates = new Map<string, { stage: number; count: number }>()

/**
 * The positions of the pressure plates, keyed by group. Registered on
 * construction; positions are stable so stale entries are harmless.
 */
const plateRegistry = new Map<string, Map<string, [number, number]>>()

/** The ongoing race state (the start time in field frames) */
let raceStartedAt: number | null = null

const transparentImage = await fetch(
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAE0lEQVR4nGNgGAWjYBSMAgYwAAAEEAABsax5zAAAAABJRU5ErkJggg==",
).then((res) => res.blob()).then((blob) => createImageBitmap(blob))

export class Prop implements IProp {
  /** The unique identifier of the item. Only items which are spawned from block map have ids. */
  readonly id: string | null
  readonly i: number
  readonly j: number
  readonly def: PropDefinition
  readonly data: unknown
  #motion: Motion | null = null
  readonly #actionQueue = new ActionQueue<Prop, PropAction>(
    (field, action) => {
      switch (action.type) {
        case "break": {
          this.#motion = new MotionBreak(
            this.#image ?? fallbackImage,
            action.dir,
          )
          this.#motion.cb = action.cb
          return "end"
        }
        case "remove": {
          field.props.remove(this.i, this.j)
          return "next"
        }
        case "spawn-drops": {
          const dirs = DIRS.filter((d) => {
            const [ni, nj] = nextGrid(this.i, this.j, d)
            return field.canEnterStatic(ni, nj)
          })
          for (let n = 0; n < action.count; n++) {
            const item = field.spawnItem(action.itemType, this.i, this.j)
            if (!item) break
            if (dirs.length > 0) {
              item.enqueueActions({ type: "go", dir: dirs[n % dirs.length] })
            }
          }
          return "next"
        }
        default: {
          action satisfies never
          throw new Error("Unreachable")
        }
      }
    },
  )
  readonly #pushed: PushedDelegate | null
  #image: ImageBitmap | undefined
  #growthImages: ImageBitmap[] | undefined
  /** Overrides def.canEnter while set (opened gates and doors) */
  #open: boolean | null = null
  /** Hides the image while true (opened gates and doors) */
  #hidden = false
  /** The field time when a timer gate closes again */
  #openUntil: number | null = null

  static fromSpawn(spawn: PropSpawn) {
    let pushed: PushedDelegate | null = null
    switch (spawn.def.pushed) {
      case "break":
        pushed = new PushedDelegateBreak()
        break
      case "sign":
        pushed = new PushedDelegateSign()
        break
      case "chest":
        pushed = new PushedDelegateChest()
        break
      case "apple-gate":
        pushed = new PushedDelegateAppleGate()
        break
      case "reset-game":
        pushed = new PushedDelegateResetGame()
        break
      case "tree":
        pushed = new PushedDelegateTree()
        break
      case "shop":
        pushed = new PushedDelegateShop()
        break
      case "key-gate":
        pushed = new PushedDelegateKeyGate()
        break
      case "timer-gate":
        pushed = new PushedDelegateTimerGate()
        break
      case "light-lantern":
        pushed = new PushedDelegateLightLantern()
        break
      case "fish-shrine":
        pushed = new PushedDelegateFishShrine()
        break
    }
    return new Prop(
      spawn.id,
      spawn.i,
      spawn.j,
      spawn.def,
      pushed,
      spawn.data,
    )
  }

  /**
   * @param i The column of the grid coordinate
   * @param j The row of the grid coordinate
   * @param def The definition of the prop
   * @param pushed The pushed delegate
   * @param data The additional data
   */
  constructor(
    id: string | null,
    i: number,
    j: number,
    def: PropDefinition,
    pushed: PushedDelegate | null,
    data: unknown,
  ) {
    this.id = id
    this.i = i
    this.j = j
    this.def = def
    this.#pushed = pushed
    this.data = data
    if (def.type === "plate") {
      const group = (data as { group?: string } | undefined)?.group ?? ""
      let plates = plateRegistry.get(group)
      if (!plates) {
        plates = new Map()
        plateRegistry.set(group, plates)
      }
      plates.set(`${i}.${j}`, [i, j])
    }
  }

  /**
   * Vanishes the prop, but keeps its space occupied
   * Useful for removing the visual representation, but keeping the processing of the action queue
   */
  vanish(): void {
    const canvas = new OffscreenCanvas(CELL_SIZE, CELL_SIZE)
    canvas.getContext("2d")
    this.#image = canvas.transferToImageBitmap()
  }

  async loadAssets(options: LoadOptions) {
    const loadImage = options.loadImage
    if (!loadImage) {
      throw new Error("Cannot load assets as loadImage not specified")
    }
    if (this.def.growth) {
      this.#growthImages = await Promise.all(
        this.def.growth.hrefs.map((href) => loadImage(href)),
      )
      this.applyGrowthImage()
      return
    }
    this.#image = await loadImage(this.def.href)
  }

  /** The current growth state of this prop, if growable */
  get growthState(): { stage: number; count: number } | undefined {
    if (!this.def.growth) {
      return undefined
    }
    const key = `${this.i}.${this.j}`
    let state = growthStates.get(key)
    if (!state) {
      state = { stage: 0, count: 0 }
      growthStates.set(key, state)
    }
    return state
  }

  /** Applies the image of the current growth stage */
  applyGrowthImage() {
    const state = this.growthState
    if (!state) {
      return
    }
    const image = this.#growthImages?.[state.stage]
    if (image) {
      this.#image = image
    }
  }

  #stepGrowth() {
    const growth = this.def.growth
    const state = this.growthState
    if (!growth || !state) {
      return
    }
    if (state.stage >= growth.hrefs.length - 1) {
      return
    }
    state.count++
    if (state.count >= growth.interval) {
      state.count = 0
      state.stage++
      this.applyGrowthImage()
    }
  }

  get assetsReady(): boolean {
    return !!this.#image
  }

  image(): ImageBitmap {
    if (this.#motion instanceof MotionBreak) {
      return this.#motion.image()
    }
    if (this.#hidden) {
      return transparentImage
    }
    return this.#image ?? fallbackImage
  }

  get x(): number {
    return this.i * CELL_SIZE
  }

  get y(): number {
    return this.j * CELL_SIZE
  }

  get w(): number {
    return CELL_SIZE
  }

  get h(): number {
    return CELL_SIZE
  }

  get canEnter(): boolean {
    return this.#open ?? this.def.canEnter
  }

  get type(): string {
    return this.def.type
  }

  get isLightSource(): boolean {
    if (this.def.type === "lantern") {
      return true
    }
    // An unlit lantern lit by the player (growth stage 1)
    return this.def.type === "lantern-unlit" &&
      (this.growthState?.stage ?? 0) > 0
  }

  /** Opens or closes the prop as a passage (doors, gates) */
  setOpen(open: boolean) {
    this.#open = open
    this.#hidden = open
  }

  get isOpen(): boolean {
    return this.#open ?? false
  }

  /** Opens for the given number of frames (timer gates) */
  openForDuration(field: IField, duration: number) {
    this.setOpen(true)
    this.#openUntil = field.time + duration
  }

  step(field: IField) {
    this.#stepGrowth()
    this.#stepGate(field)

    if (!this.#motion) {
      this.#actionQueue.process(this, field)
    }

    if (this.#motion) {
      this.#motion.step()
      if (this.#motion.finished) {
        this.#motion.cb?.(this.#motion)
        this.#motion = null
      }
    }
  }

  #stepGate(field: IField) {
    switch (this.def.type) {
      case "door": {
        // Open while any actor stands on a plate of the same group
        const group = (this.data as { group?: string } | undefined)?.group ??
          ""
        const plates = plateRegistry.get(group)
        let occupied = false
        if (plates) {
          for (const [pi, pj] of plates.values()) {
            if (field.actors.get(pi, pj).length > 0) {
              occupied = true
              break
            }
          }
        }
        // Never closes on someone standing in the doorway
        if (!occupied && field.actors.get(this.i, this.j).length > 0) {
          occupied = true
        }
        if (occupied !== this.isOpen) {
          this.setOpen(occupied)
          if (occupied) {
            signal.playSound("powerUp")
          }
        }
        break
      }
      case "timer-gate": {
        if (
          this.isOpen && this.#openUntil !== null &&
          field.time >= this.#openUntil &&
          field.actors.get(this.i, this.j).length === 0
        ) {
          this.setOpen(false)
          this.#openUntil = null
        }
        break
      }
      case "moon-gate": {
        // Open only in the dark of the night
        const open = signal.nightDarkness.get() > 0.5
        if (
          open !== this.isOpen &&
          (open || field.actors.get(this.i, this.j).length === 0)
        ) {
          this.setOpen(open)
        }
        break
      }
    }
  }

  onPushed(event: PushedEvent, field: IField): void {
    this.#pushed?.onPushed(event, this, field)
  }

  onEnter(actor: IActor, field: IField): void {
    if (this.def.onEnter === "teleport") {
      // deno-lint-ignore no-explicit-any
      const data = this.data as any
      const i = data.i
      const j = data.j
      if (typeof i === "number" && typeof j === "number") {
        location.hash = ""
        setTimeout(() => {
          location.replace(`#${i},${j}`)
        }, 10)
      }
    } else if (this.def.onEnter === "spring") {
      const dir = actor.dir
      const [ni, nj] = nextGrid(this.i, this.j, dir)
      if (field.canEnterStatic(ni, nj)) {
        // Fly to the direction the actor was heading, at 4x speed
        for (
          const effect of linePattern0(
            [opposite(dir)],
            this.i,
            this.j,
            1.5,
            0.7,
            3,
            "#cceaff",
          )
        ) {
          field.effects.add(effect)
        }
        actor.unshiftActions(
          { type: "jump" },
          { type: "slide", dir, speed: 4 },
          { type: "slide", dir, speed: 4 },
          { type: "slide", dir, speed: 4 },
        )
      } else {
        // The way is blocked. Jumps on the spot to prevent a soft lock
        // caused by infinite bouncing
        actor.unshiftActions({ type: "jump" })
      }
    } else if (this.def.onEnter === "race-start") {
      raceStartedAt = field.time
      signal.message.update({ text: "GO!" })
      signal.playSound("jump")
    } else if (this.def.onEnter === "race-goal") {
      if (raceStartedAt === null) {
        return
      }
      const frames = field.time - raceStartedAt
      raceStartedAt = null
      const data = this.data as
        | { course?: unknown; par?: unknown; reward?: unknown }
        | undefined
      const course = typeof data?.course === "string" ? data.course : "race"
      const par = typeof data?.par === "number" ? data.par : 900
      const reward = typeof data?.reward === "number" ? data.reward : 10
      const seconds = (frames / 60).toFixed(1)
      const newRecord = recordBestTime(course, frames)
      if (frames <= par) {
        signal.coinCount.update(signal.coinCount.get() + reward)
        signal.playSound("powerUp")
        signal.message.update({
          text: `TIME ${seconds}S +${reward} COINS` +
            (newRecord ? " NEW RECORD!" : ""),
        })
      } else {
        signal.message.update({
          text: `TIME ${seconds}S - TOO SLOW (PAR ${(par / 60).toFixed(1)}S)`,
        })
      }
    }
  }

  enqueueActions(...actions: PropAction[]): void {
    this.#actionQueue.enqueue(...actions)
  }

  clearActions(): void {
    this.#actionQueue.clear()
  }
}

interface PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void
}

class PushedDelegateBreak implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (event.pusher?.id === "main") {
      signal.playSound("explosion")
    }
    prop.enqueueActions(
      { type: "wait", until: field.time + event.peakAt },
      { type: "line-pattern-1", dirs: [event.dir] },
      {
        type: "break",
        dir: event.dir,
        cb: () => {
          prop.vanish()
        },
      },
      { type: "remove" },
    )
  }
}

class PushedDelegateChest implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    const data = prop.data as { drops?: unknown; count?: unknown } | undefined
    const itemType = typeof data?.drops === "string" ? data.drops : "coin"
    const count = typeof data?.count === "number" ? data.count : 3
    if (event.pusher?.id === "main") {
      signal.playSound("explosion")
    }
    prop.enqueueActions(
      { type: "wait", until: field.time + event.peakAt },
      { type: "line-pattern-1", dirs: [event.dir] },
      {
        type: "break",
        dir: event.dir,
        cb: () => {
          prop.vanish()
        },
      },
      { type: "spawn-drops", itemType, count },
      { type: "remove" },
    )
  }
}

class PushedDelegateAppleGate implements PushedDelegate {
  #opened = false

  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (this.#opened || event.pusher?.id !== "main") {
      return
    }
    const data = prop.data as { count?: unknown } | undefined
    const required = typeof data?.count === "number" ? data.count : 10
    const count = signal.appleCount.get()
    if (count >= required) {
      this.#opened = true
      signal.playSound("powerUp")
      prop.enqueueActions(
        { type: "wait", until: field.time + event.peakAt },
        { type: "line-pattern-1", dirs: [event.dir] },
        {
          type: "break",
          dir: event.dir,
          cb: () => {
            prop.vanish()
          },
        },
        { type: "remove" },
      )
    } else {
      signal.message.update({
        text: `NEED ${required} APPLES (${count}/${required})`,
      })
    }
  }
}

class PushedDelegateTree implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, _field: IField): void {
    if (event.pusher?.id !== "main") {
      return
    }
    const growth = prop.def.growth
    const state = prop.growthState
    if (!growth || !state) {
      return
    }
    if (state.stage < growth.hrefs.length - 1) {
      // Not fully grown yet
      return
    }
    // Harvest: apples fall from the tree and it goes back to the
    // previous stage
    signal.playSound("powerUp")
    prop.enqueueActions({ type: "spawn-drops", itemType: "apple", count: 2 })
    state.stage = Math.max(1, state.stage - 1)
    state.count = 0
    prop.applyGrowthImage()
  }
}

class PushedDelegateShop implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, _field: IField): void {
    if (event.pusher?.id !== "main") {
      return
    }
    const data = prop.data as { sells?: unknown; price?: unknown } | undefined
    const sells = typeof data?.sells === "string" ? data.sells : "seed"
    const price = typeof data?.price === "number" ? data.price : 3
    const coins = signal.coinCount.get()
    if (coins < price) {
      signal.message.update({ text: `${sells.toUpperCase()}: ${price} COINS` })
      return
    }
    signal.coinCount.update(coins - price)
    signal.playSound("pickupCoin")
    signal.message.update({ text: `SOLD! 1 ${sells.toUpperCase()}` })
    prop.enqueueActions({ type: "spawn-drops", itemType: sells, count: 1 })
  }
}

class PushedDelegateKeyGate implements PushedDelegate {
  #opened = false

  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (this.#opened || event.pusher?.id !== "main") {
      return
    }
    const keys = signal.keyCount.get()
    if (keys <= 0) {
      signal.message.update({ text: "NEEDS A KEY" })
      return
    }
    this.#opened = true
    signal.keyCount.update(keys - 1)
    signal.playSound("powerUp")
    prop.enqueueActions(
      { type: "wait", until: field.time + event.peakAt },
      { type: "line-pattern-1", dirs: [event.dir] },
      {
        type: "break",
        dir: event.dir,
        cb: () => {
          prop.vanish()
        },
      },
      { type: "remove" },
    )
  }
}

class PushedDelegateTimerGate implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (event.pusher?.id !== "main" || prop.isOpen) {
      return
    }
    const data = prop.data as { duration?: unknown } | undefined
    const duration = typeof data?.duration === "number" ? data.duration : 300
    prop.openForDuration(field, duration)
    signal.playSound("powerUp")
    signal.message.update({
      text: `OPEN FOR ${(duration / 60).toFixed(0)} SECONDS!`,
    })
  }
}

class PushedDelegateLightLantern implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, _field: IField): void {
    if (event.pusher?.id !== "main") {
      return
    }
    const state = prop.growthState
    if (!state || state.stage > 0) {
      return
    }
    state.stage = 1
    prop.applyGrowthImage()
    signal.playSound("powerUp")
  }
}

class PushedDelegateFishShrine implements PushedDelegate {
  onPushed(event: PushedEvent, _prop: Prop, field: IField): void {
    const pusher = event.pusher
    if (pusher?.id !== "main") {
      return
    }
    const follower = pusher.follower
    if (
      follower instanceof Item && follower.def.collect === "fish" &&
      follower.isFollowing
    ) {
      field.collectItem(follower.i, follower.j, follower.id)
      pusher.unsetFollower()
      signal.coinCount.update(signal.coinCount.get() + 5)
      signal.playSound("powerUp")
      signal.message.update({ text: "THANK YOU! +5 COINS" })
    } else {
      signal.message.update({ text: "BRING ME A FISH (NO JUMPING!)" })
    }
  }
}

class PushedDelegateResetGame implements PushedDelegate {
  #triggered = false

  onPushed(event: PushedEvent, _prop: Prop, _field: IField): void {
    if (this.#triggered || event.pusher?.id !== "main") {
      return
    }
    this.#triggered = true
    signal.message.update({ text: "NEW GAME" })
    clearSave()
    setTimeout(() => {
      location.hash = ""
      location.reload()
    }, 500)
  }
}

class PushedDelegateSign implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, _field: IField): void {
    if (event.pusher?.id !== "main") {
      return
    }
    const data = prop.data as { text?: unknown } | undefined
    const text = data?.text
    if (typeof text === "string" && text.length > 0) {
      signal.message.update({ text })
    }
  }
}

interface Motion {
  step(): void
  finished: boolean
  cb?: (motion: Motion) => void
}

class MotionBreak implements Motion {
  #image: ImageBitmap
  #dir: Dir
  #positions = [...Array(16).keys()]
  cb?: (motion: Motion) => void
  constructor(image: ImageBitmap, dir: Dir) {
    this.#image = image
    this.#dir = dir
  }

  step(): void {
    const y = this.#positions.shift()!
    const canvas = new OffscreenCanvas(CELL_SIZE, CELL_SIZE)
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(this.#image, 0, 0)
    switch (this.#dir) {
      case "up":
        ctx.clearRect(0, CELL_SIZE - 1 - y, CELL_SIZE, 1)
        break
      case "down":
        ctx.clearRect(0, y, CELL_SIZE, 1)
        break
      case "left":
        ctx.clearRect(CELL_SIZE - 1 - y, 0, 1, CELL_SIZE)
        break
      case "right":
        ctx.clearRect(y, 0, 1, CELL_SIZE)
        break
    }
    this.#image = canvas.transferToImageBitmap()
  }

  image(): ImageBitmap {
    return this.#image
  }

  get finished(): boolean {
    return this.#positions.length === 0
  }
}
