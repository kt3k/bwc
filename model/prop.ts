import { CELL_SIZE } from "../util/constants.ts"
import { DIRS, nextGrid } from "../util/dir.ts"
import * as signal from "../util/signals.ts"
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
    this.#image = await loadImage(this.def.href)
  }

  get assetsReady(): boolean {
    return !!this.#image
  }

  image(): ImageBitmap {
    if (this.#motion instanceof MotionBreak) {
      return this.#motion.image()
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
    return this.def.canEnter
  }

  step(field: IField) {
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
        // Fly to the direction the actor was heading
        actor.unshiftActions(
          { type: "jump" },
          { type: "slide", dir },
          { type: "slide", dir },
          { type: "slide", dir },
        )
      } else {
        // The way is blocked. Jumps on the spot to prevent a soft lock
        // caused by infinite bouncing
        actor.unshiftActions({ type: "jump" })
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
