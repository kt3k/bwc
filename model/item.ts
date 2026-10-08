import { CELL_SIZE } from "../util/constants.ts"
import { Actor } from "./actor.ts"
import { ItemSpawn } from "./field-block.ts"
import { ItemDefinition } from "./catalog.ts"
import type {
  Dir,
  IActor,
  IField,
  IFollower,
  IItem,
  LoadOptions,
  Move,
} from "./types.ts"
import { DIRS } from "../util/dir.ts"
import * as signal from "../util/signals.ts"
import { countPopup, linePattern0 } from "./effect.ts"
import { ActionQueue, type ItemAction } from "./action-queue.ts"
import { MoveGo } from "./move.ts"
import { Palette, type PaletteColor } from "../util/palette.ts"
import { collectLetter, collectShard } from "./oddities.ts"

const fallbackImage = await fetch(
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAADRJREFUOE9jZKAQMFKon2FoGPAfzZsoribGC0PQALxORo92bGEwDAwgKXUTkw7wGjjwBgAAiwgIEW1Cnt4AAAAASUVORK5CYII=",
).then((res) => res.blob()).then((blob) => createImageBitmap(blob))

export class Item implements IItem {
  /** The unique identifier of the item. */
  readonly id: string
  i: number
  j: number
  readonly def: ItemDefinition
  readonly w = CELL_SIZE
  readonly h = CELL_SIZE
  #image: ImageBitmap | undefined
  #move: Move | null = null
  #lastMoveDir: Dir | null = null
  #follower: IFollower | null = null
  #followState: "following" | "waiting" | null = null
  readonly #actionQueue = new ActionQueue<Item, ItemAction>(
    (_field, action) => {
      switch (action.type) {
        case "go": {
          this.#move = new MoveGo(action.speed ?? 1, action.dir)
          switch (action.dir) {
            case "up":
              this.j -= 1
              break
            case "down":
              this.j += 1
              break
            case "left":
              this.i -= 1
              break
            case "right":
              this.i += 1
              break
          }
          return "end"
        }
        default: {
          action.type satisfies never
          throw new Error("Unreachable")
        }
      }
    },
  )

  static #collectedItemIds = new Set<string>()

  static isCollected(id: string) {
    return this.#collectedItemIds.has(id)
  }

  static collect(id: string) {
    this.#collectedItemIds.add(id)
  }

  /** Serializes the collected item ids for saving */
  static serializeCollected(): string[] {
    return [...this.#collectedItemIds]
  }

  /** Restores the collected item ids from a saved state */
  static deserializeCollected(ids: readonly string[]) {
    this.#collectedItemIds = new Set(ids)
  }

  static fromSpawn(spawn: ItemSpawn): Item {
    return new Item(
      spawn.id,
      spawn.i,
      spawn.j,
      spawn.def,
    )
  }

  /**
   * @param i The column of the grid coordinate
   * @param j The row of the grid coordinate
   * @param def The item definition
   */
  constructor(
    id: string | null,
    i: number,
    j: number,
    def: ItemDefinition,
  ) {
    this.id = id ?? `item-${i}-${j}-${crypto.randomUUID()}`
    this.i = i
    this.j = j
    this.def = def
  }

  /**
   * @param amount How many items of this kind are picked up at once (the
   * others of a stack are collected by collectAll)
   */
  onCollect(actor: Actor, field: IField, amount = 1) {
    switch (this.def.collect) {
      case "apple": {
        const delegate = new CollectApple()
        delegate.onCollect(actor, field, this, amount)
        break
      }
      case "green-apple": {
        const delegate = new CollectGreenApple()
        delegate.onCollect(actor, field, this, amount)
        break
      }
      case "coin": {
        const delegate = new CollectCoin()
        delegate.onCollect(actor, field, this, amount)
        break
      }
      case "seed": {
        const delegate = new CollectSeed()
        delegate.onCollect(actor, field, this, amount)
        break
      }
      case "key": {
        const delegate = new CollectKey()
        delegate.onCollect(actor, field, this, amount)
        break
      }
      case "mushroom": {
        const delegate = new CollectMushroom()
        delegate.onCollect(actor, field, this, amount)
        break
      }
      case "purple-mushroom": {
        const delegate = new CollectPurpleMushroom()
        delegate.onCollect(actor, field, this, amount)
        break
      }
      case "treasure": {
        const delegate = new CollectTreasure()
        delegate.onCollect(actor, field, this, amount)
        break
      }
      case "fish": {
        const delegate = new CollectFish()
        delegate.onCollect(actor, field, this, amount)
        break
      }
      case "letter":
        collectLetter(actor, field, this)
        break
      case "shard":
        collectShard(actor, field, this, amount)
        break
    }
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
    return this.#image ?? fallbackImage
  }

  get x(): number {
    return this.i * CELL_SIZE + (this.#move?.x ?? 0)
  }
  get y(): number {
    return this.j * CELL_SIZE + (this.#move?.y ?? 0)
  }

  step(field: IField) {
    if (!this.#move) {
      this.#actionQueue.process(this, field)
    }

    if (this.#move) {
      this.#move.step()
      if (this.#move.finished) {
        this.#move.cb?.(this.#move)
        if (this.#move.type === "move") {
          this.#lastMoveDir = this.#move.dir
        }
        this.#move = null
      }
    }
  }

  enqueueActions(...actions: ItemAction[]) {
    for (const action of actions) {
      this.#actionQueue.enqueue(action)
    }
  }

  setFollower(follower: IFollower): void {
    if (this.#follower) {
      this.#follower.setFollower(follower)
    } else {
      this.#follower = follower
    }
  }

  follow(i: number, j: number, dir: Dir, speed: 1 | 2 | 4 | 8 | 16) {
    if (this.#followState === "following") {
      this.enqueueActions({ type: "go", dir, speed })
      if (this.#follower && this.#lastMoveDir) {
        this.#follower.follow(this.i, this.j, this.#lastMoveDir, speed)
      }
    } else if (this.#followState === "waiting") {
      if (this.i === i && this.j === j) {
        this.#followState = "following"
      }
    }
  }

  unfollow() {
    this.#followState = null
    if (this.#follower) {
      this.#follower.unfollow()
      this.#follower = null
    }
  }

  get isFollowing() {
    return this.#followState !== null
  }

  startFollowing() {
    this.#followState = "waiting"
  }
}

/**
 * The color of an item's pickup lines: the color used most in its sprite
 * (the catalog's `color`, tools/item_colors.ts), or the given fallback
 */
export function fxColor(item: Item, fallback: PaletteColor): PaletteColor {
  return item.def.color ?? fallback
}

interface CollectDelegate {
  onCollect(actor: IActor, field: IField, item: Item, amount: number): void
}

/**
 * Picks up every item on the actor's cell at once. Items of a kind are
 * collected together (the counter goes up by their number, the effect
 * plays once); fish each start following. When more than one item is
 * taken, "xN" pops up over the cell.
 */
export function collectAll(
  actor: Actor,
  field: IField,
  items: readonly IItem[],
): void {
  const kinds = new Map<string, IItem[]>()
  for (const item of items) {
    const kind = kinds.get(item.def.collect)
    if (kind) kind.push(item)
    else kinds.set(item.def.collect, [item])
  }
  for (const [collect, kind] of kinds) {
    if (collect === "fish" || collect === "letter") {
      // one by one: fish each follow, letters must come in order
      for (const item of kind) item.onCollect(actor, field)
      continue
    }
    const [first, ...rest] = kind
    for (const item of rest) field.collectItem(actor.i, actor.j, item.id)
    first.onCollect(actor, field, kind.length)
  }
  if (items.length > 1) {
    for (const effect of countPopup(actor.i, actor.j, items.length)) {
      field.effects.add(effect)
    }
  }
}

export class CollectApple implements CollectDelegate {
  onCollect(
    actor: IActor,
    field: IField,
    item: Item,
    amount: number,
  ): void {
    field.collectItem(actor.i, actor.j, item.id)
    const dirs = [] as Dir[]
    for (const dir of DIRS) {
      if (dir === actor.dir) continue
      if (!actor.canGo(dir, field)) continue
      const spawned = field.spawnActor("inertial", actor.i, actor.j, dir)
      if (!spawned) continue
      spawned.enqueueActions({ type: "go", dir })
      dirs.push(dir)
    }

    for (
      const effect of linePattern0(
        dirs,
        actor.i,
        actor.j,
        1,
        1,
        2,
        fxColor(item, Palette.pink4),
      )
    ) {
      field.effects.add(effect)
    }

    const count = signal.appleCount.get()
    signal.appleCount.update(count + amount)
    signal.playSound("pickupCoin")
  }
}

export class CollectGreenApple implements CollectDelegate {
  onCollect(
    actor: IActor,
    field: IField,
    item: Item,
    amount: number,
  ): void {
    field.collectItem(actor.i, actor.j, item.id)

    for (
      const effect of linePattern0(
        DIRS,
        actor.i,
        actor.j,
        1,
        0.7,
        3,
        fxColor(item, Palette.green4),
      )
    ) {
      field.effects.add(effect)
    }

    const count = signal.greenAppleCount.get()
    signal.greenAppleCount.update(count + amount)
    signal.playSound("pickupCoin")
  }
}

export class CollectCoin implements CollectDelegate {
  onCollect(
    actor: IActor,
    field: IField,
    item: Item,
    amount: number,
  ): void {
    field.collectItem(actor.i, actor.j, item.id)

    for (
      const effect of linePattern0(
        DIRS,
        actor.i,
        actor.j,
        1,
        0.7,
        3,
        fxColor(item, Palette.brown3),
      )
    ) {
      field.effects.add(effect)
    }

    const count = signal.coinCount.get()
    signal.coinCount.update(count + amount)
    signal.playSound("pickupCoin")
  }
}

/**
 * Treasures (gems, swords, potions... from ff5study): there is nothing
 * to use them for yet, so they are worth coins (the value in the catalog)
 */
export class CollectTreasure implements CollectDelegate {
  onCollect(
    actor: IActor,
    field: IField,
    item: Item,
    amount: number,
  ): void {
    field.collectItem(actor.i, actor.j, item.id)
    const coins = (item.def.value ?? 1) * amount
    const name = item.def.type.toUpperCase().replaceAll("-", " ")
    signal.message.update({
      text: amount > 1
        ? `GOT ${amount} ${name}S! +${coins} COINS`
        : `GOT ${/^[AEIOU]/.test(name) ? "AN" : "A"} ${name}! +${coins} COINS`,
    })
    for (
      const effect of linePattern0(
        DIRS,
        actor.i,
        actor.j,
        1,
        0.7,
        3,
        fxColor(item, Palette.brown2),
      )
    ) {
      field.effects.add(effect)
    }
    signal.coinCount.update(signal.coinCount.get() + coins)
    signal.playSound("powerUp")
  }
}

export class CollectSeed implements CollectDelegate {
  onCollect(
    actor: IActor,
    field: IField,
    item: Item,
    amount: number,
  ): void {
    field.collectItem(actor.i, actor.j, item.id)

    for (
      const effect of linePattern0(
        DIRS,
        actor.i,
        actor.j,
        1,
        0.7,
        3,
        fxColor(item, Palette.brown4),
      )
    ) {
      field.effects.add(effect)
    }

    const count = signal.seedCount.get()
    signal.seedCount.update(count + amount)
    signal.playSound("pickupCoin")
  }
}

export class CollectKey implements CollectDelegate {
  onCollect(
    actor: IActor,
    field: IField,
    item: Item,
    amount: number,
  ): void {
    field.collectItem(actor.i, actor.j, item.id)
    signal.message.update({
      text: amount > 1 ? `GOT ${amount} KEYS` : "GOT A KEY",
    })

    for (
      const effect of linePattern0(
        DIRS,
        actor.i,
        actor.j,
        1,
        0.7,
        3,
        fxColor(item, Palette.brown3),
      )
    ) {
      field.effects.add(effect)
    }

    const count = signal.keyCount.get()
    signal.keyCount.update(count + amount)
    signal.playSound("powerUp")
  }
}

export class CollectMushroom implements CollectDelegate {
  onCollect(
    actor: IActor,
    field: IField,
    item: Item,
    _amount: number,
  ): void {
    field.collectItem(actor.i, actor.j, item.id)
    for (
      const effect of linePattern0(
        DIRS,
        actor.i,
        actor.j,
        1,
        0.7,
        3,
        fxColor(item, Palette.orange3),
      )
    ) {
      field.effects.add(effect)
    }
    signal.playSound("powerUp")
    actor.clearActionQueue()
    actor.enqueueActions(
      { type: "jump" },
      { type: "speed", change: "2x" },
      { type: "add-buff", buff: "mushroom" },
      {
        type: "speed-timeout",
        timeout: 15000,
        cb: () => {
          actor.unshiftActions({ type: "remove-buff", buff: "mushroom" })
        },
      },
    )
  }
}

export class CollectPurpleMushroom implements CollectDelegate {
  onCollect(
    actor: IActor,
    field: IField,
    item: Item,
    _amount: number,
  ): void {
    field.collectItem(actor.i, actor.j, item.id)
    signal.playSound("powerUp")
    actor.clearActionQueue()
    actor.enqueueActions(
      { type: "jump" },
      { type: "speed", change: "4x" },
    )
    const end = () => {
      actor.enqueueActions(
        { type: "speed", change: "reset" },
        { type: "jump" },
      )
    }
    let dirs = [] as Dir[], offsetI = 0, offsetJ = 0
    const offset = 2
    switch (actor.dir) {
      case "up":
        dirs = ["down"]
        offsetJ = -1 * offset
        break
      case "down":
        dirs = ["up"]
        offsetJ = 1 * offset
        break
      case "left":
        dirs = ["right"]
        offsetI = -1 * offset
        break
      case "right":
        dirs = ["left"]
        offsetI = 1 * offset
        break
    }

    for (const _ of Array(30)) {
      actor.enqueueActions({
        type: "line-pattern-0",
        dirs,
        baseSpeed: 1.3,
        p0: 0.4,
        dist: 3,
        color: fxColor(item, Palette.magenta4),
        offsetI,
        offsetJ,
      }, {
        type: "go",
        dir: actor.dir,
        cb: (move) => {
          if (move.type === "bounce") {
            actor.clearActionQueue()
            end()
          }
        },
      })
    }
    end()
  }
}

export class CollectFish implements CollectDelegate {
  onCollect(
    actor: IActor,
    field: IField,
    item: Item,
    _amount: number,
  ): void {
    if (item.isFollowing) {
      return
    }
    actor.setFollower(item)
    item.startFollowing()

    for (
      const effect of linePattern0(
        DIRS,
        actor.i,
        actor.j,
        1,
        0.7,
        3,
        fxColor(item, Palette.cyan3),
      )
    ) {
      field.effects.add(effect)
    }
  }
}
