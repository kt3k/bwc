// The oddities: props that break and let something out, and actors that
// aren't people (ideas/breakables.md). Every one of them is built to
// feel good to touch: a charge and a release (cracks, swelling), chains
// (a crack running along a wall, a row of pebbles bouncing in turn),
// numbers (a box spilling two dozen things), surprises (a smaller jar in
// a jar, a whole barrel falling out of a shadow) and weight (the world
// holds still for a few frames as something breaks, the view shakes).
//
// Props get their behavior from ODD_PROP_PUSHED (by the `pushed` name of
// the catalog), ODD_PROP_STEP and ODD_PROP_INIT (by the prop type).
// Actors get theirs from ODD_ACTORS (by the `idle` / `pushed` names).
import { DIRS, nextGrid, opposite, turnLeft, turnRight } from "../util/dir.ts"
import * as signal from "../util/signals.ts"
import { hitStop, shake } from "../util/juice.ts"
import { Palette, type PaletteColor } from "../util/palette.ts"
import { CELL_SIZE } from "../util/constants.ts"
import { seed } from "../util/random.ts"
import {
  debrisBurst,
  EffectBox,
  EffectDebris,
  flashCell,
  linePattern0,
} from "./effect.ts"
import { dirsToward, manhattan, stepAway } from "./steering.ts"
import type {
  Dir,
  IActor,
  IColorBox,
  IField,
  IFinishable,
  IItem,
  IStepper,
  PushedEvent,
} from "./types.ts"
import type { Prop, PushedDelegate } from "./prop.ts"
import type { Actor } from "./actor.ts"

// ---------------------------------------------------------------------
// shared helpers

const GRAYS: readonly PaletteColor[] = [
  Palette.white,
  Palette.gray2,
  Palette.gray3,
  Palette.gray4,
]

/** Runs `fn` after `frames` frames of the field (paused by a hit-stop) */
export class EffectTimer implements IColorBox, IFinishable, IStepper {
  readonly x = 0
  readonly y = 0
  readonly w = 0
  readonly h = 0
  readonly color = Palette.black
  readonly visible = false
  #left: number
  #fn: (field: IField) => void
  #done = false
  constructor(frames: number, fn: (field: IField) => void) {
    this.#left = frames
    this.#fn = fn
  }
  step(field: IField): void {
    if (this.#done) return
    if (--this.#left <= 0) {
      this.#done = true
      this.#fn(field)
    }
  }
  get finished(): boolean {
    return this.#done
  }
}

/** Runs `fn` after `frames` frames */
export function later(
  field: IField,
  frames: number,
  fn: (field: IField) => void,
) {
  if (frames <= 0) fn(field)
  else field.effects.add(new EffectTimer(frames, fn))
}

/** Throws debris out of the cell, with a white flash */
function burst(
  field: IField,
  i: number,
  j: number,
  colors: readonly PaletteColor[] = GRAYS,
  count = 10,
  dir?: Dir,
) {
  for (const e of debrisBurst(i, j, colors, count, Math.random, dir)) {
    field.effects.add(e)
  }
  field.effects.add(flashCell(i, j))
}

/**
 * The weight of a break: the world holds still a few frames and the
 * view shakes, with debris and a bang
 */
function crunch(
  field: IField,
  i: number,
  j: number,
  {
    stop = 3,
    shakeFrames = 6,
    colors = GRAYS,
    count = 10,
    dir,
    sound = "explosion",
  }: {
    stop?: number
    shakeFrames?: number
    colors?: readonly PaletteColor[]
    count?: number
    dir?: Dir
    sound?: signal.SoundName | null
  } = {},
) {
  hitStop(stop)
  shake(shakeFrames)
  burst(field, i, j, colors, count, dir)
  if (sound) signal.playSound(sound)
}

/** true if an item may lie on the cell */
function open(field: IField, i: number, j: number): boolean {
  return field.canEnterStatic(i, j)
}

/**
 * Throws `count` items of the type out of the cell (i, j), each along a
 * path of 1 to `reach` cells in a direction from `dirs` (all by default),
 * sometimes turning once. Never onto `avoid` (who broke it), never
 * through what can't be entered; with nowhere to go they stay put.
 */
export function scatter(
  field: IField,
  type: string,
  i: number,
  j: number,
  count: number,
  {
    avoid,
    dirs = DIRS,
    reach = 3,
    rand = Math.random,
  }: {
    avoid?: readonly [number, number]
    dirs?: readonly Dir[]
    reach?: number
    rand?: () => number
  } = {},
): IItem[] {
  const items: IItem[] = []
  // only the ways out that are open (and not onto who broke it)
  const ways = dirs.filter((d) => {
    const [ni, nj] = nextGrid(i, j, d)
    return open(field, ni, nj) && !(avoid && avoid[0] === ni && avoid[1] === nj)
  })
  for (let n = 0; n < count; n++) {
    const dir = ways.length > 0
      ? ways[(n + Math.floor(rand() * ways.length)) % ways.length]
      : dirs[0]
    const turn = rand() < 0.5 ? turnLeft(dir) : turnRight(dir)
    const want = 1 + Math.floor(rand() * reach)
    const path: Dir[] = []
    let [ci, cj] = [i, j]
    for (let k = 0; k < want; k++) {
      // the last step of a long throw may turn aside: a fan, not a line
      const d = k > 0 && k === want - 1 && rand() < 0.5 ? turn : dir
      const [ni, nj] = nextGrid(ci, cj, d)
      if (!open(field, ni, nj)) break
      if (avoid && avoid[0] === ni && avoid[1] === nj) break
      path.push(d)
      ;[ci, cj] = [ni, nj]
    }
    const item = field.spawnItem(type, i, j)
    if (!item) break
    if (path.length > 0) {
      item.enqueueActions(
        ...path.map((d) => ({
          type: "go" as const,
          dir: d,
          speed: 4 as const,
        })),
      )
    }
    items.push(item)
  }
  return items
}

/** The free floor cells within the manhattan range, nearest first */
function freeCellsAround(
  field: IField,
  i: number,
  j: number,
  range: number,
  { minDist = 1 }: { minDist?: number } = {},
): [number, number][] {
  const cells: [number, number, number][] = []
  for (let dj = -range; dj <= range; dj++) {
    for (let di = -range; di <= range; di++) {
      const d = Math.abs(di) + Math.abs(dj)
      if (d < minDist || d > range) continue
      if (field.canEnter(i + di, j + dj)) cells.push([i + di, j + dj, d])
    }
  }
  cells.sort((a, b) => a[2] - b[2])
  return cells.map(([ci, cj]) => [ci, cj])
}

/** Shuffles in place */
function shuffle<T>(list: T[], rand = Math.random): T[] {
  for (let k = list.length - 1; k > 0; k--) {
    const m = Math.floor(rand() * (k + 1))
    ;[list[k], list[m]] = [list[m], list[k]]
  }
  return list
}

/**
 * Breaks the prop as the crates break (a sweep of lines, the image wiped
 * away line by line), then runs `after` once it is gone
 */
function breakProp(
  prop: Prop,
  field: IField,
  dir: Dir,
  after?: (field: IField) => void,
  delay = 7,
) {
  prop.enqueueActions(
    { type: "wait", until: field.time + delay },
    { type: "line-pattern-1", dirs: [dir] },
    { type: "break", dir, cb: () => prop.vanish() },
    { type: "remove" },
    { type: "call", fn: (f) => after?.(f) },
  )
}

/** The prop's data as a record */
function dataOf(prop: { data: unknown }): Record<string, unknown> {
  const data = prop.data
  return data && typeof data === "object" ? data as Record<string, unknown> : {}
}

/** Removes the actor from the field, with what it was carrying */
function removeActor(actor: IActor, field: IField) {
  actor.unsetFollower()
  field.actors.remove(actor)
}

/** A cheap repeatable 0..1 random number for the cell */
function cellRand(i: number, j: number, salt = ""): number {
  return seed(`${i}.${j}.${salt}`).rng()
}

// ---------------------------------------------------------------------
// props

/** The nesting jars: each break leaves the next smaller jar */
class NestJar implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    const size = Number(prop.type.split("-").pop())
    if (prop.isBreaking) return
    prop.isBreaking = true
    if (event.pusher?.id === "main") signal.playSound("hitHurt")
    breakProp(prop, field, event.dir, (f) => {
      // smaller and smaller: the last one gives a single coin
      crunch(f, prop.i, prop.j, {
        stop: 2 + size,
        shakeFrames: 2 + size,
        count: 4 + size * 2,
        sound: size === 0 ? "pickupCoin" : "explosion",
      })
      if (size > 0) {
        const next = f.spawnProp(`nest-jar-${size - 1}`, prop.i, prop.j, {}, {
          transient: true,
        })
        // pops up out of the broken one
        next?.drop?.(6)
      } else {
        scatter(f, "coin", prop.i, prop.j, 1, {
          avoid: event.pusher ? [event.pusher.i, event.pusher.j] : undefined,
          reach: 1,
        })
      }
    })
  }
}

/** The tightly packed box: two dozen little things burst out */
class PackedBox implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (prop.isBreaking) return
    prop.isBreaking = true
    breakProp(prop, field, event.dir, (f) => {
      crunch(f, prop.i, prop.j, { stop: 5, shakeFrames: 10, count: 16 })
      const avoid = event.pusher
        ? [event.pusher.i, event.pusher.j] as const
        : undefined
      const kinds = ["pebble", "pebble", "pebble", "button", "gear"]
      for (let n = 0; n < 24; n++) {
        scatter(f, kinds[n % kinds.length], prop.i, prop.j, 1, {
          avoid,
          reach: 4,
        })
      }
    })
  }
}

/**
 * The eggshell wall: a crack runs through every touching shell, a few
 * frames per shell, and chicks peep out of some of them
 */
class EggWall implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (prop.isBreaking) return
    // the shells to crack, by their distance from the hit one
    const seen = new Map<string, [Prop, number]>()
    const queue: [Prop, number][] = [[prop, 0]]
    seen.set(`${prop.i}.${prop.j}`, [prop, 0])
    while (queue.length > 0) {
      const [p, d] = queue.shift()!
      for (const dir of DIRS) {
        const [ni, nj] = nextGrid(p.i, p.j, dir)
        const key = `${ni}.${nj}`
        const next = field.props.get(ni, nj) as Prop | undefined
        if (seen.has(key) || next?.type !== "egg-wall" || next.isBreaking) {
          continue
        }
        seen.set(key, [next, d + 1])
        queue.push([next, d + 1])
      }
    }
    signal.playSound("hitHurt")
    for (const [shell, d] of seen.values()) {
      shell.isBreaking = true
      breakProp(shell, field, event.dir, (f) => {
        burst(f, shell.i, shell.j, [Palette.white, Palette.gray2], 6)
        if (d % 3 === 0) signal.playSound("blipSelect")
        if (cellRand(shell.i, shell.j, "chick") < 0.4) {
          f.spawnActor("chick", shell.i, shell.j, "down")
        }
      }, 7 + d * 3)
    }
    hitStop(3)
    shake(4 + Math.min(seen.size, 12))
  }
}

/** The progress of the bell stone tunes: the order number expected next */
const tuneNext = new Map<string, number>()

/**
 * The bell stones: each rings a note as it breaks. Broken in order (the
 * `order` of their data) they play the tune, and the last one holds a
 * key. A stone out of order breaks the tune.
 */
class BellStone implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (prop.isBreaking) return
    prop.isBreaking = true
    const data = dataOf(prop)
    const group = typeof data.group === "string" ? data.group : ""
    const order = typeof data.order === "number" ? data.order : 1
    const count = typeof data.count === "number" ? data.count : 1
    const note = typeof data.note === "number" ? data.note : 0
    const next = tuneNext.get(group) ?? 1
    signal.playSound("bell", note)
    breakProp(prop, field, event.dir, (f) => {
      burst(f, prop.i, prop.j, GRAYS, 8)
      hitStop(2)
      if (order === next) {
        tuneNext.set(group, next + 1)
        if (next === count) {
          tuneNext.delete(group)
          signal.message.update({ text: "THE TUNE IS COMPLETE!" })
          scatter(f, "key", prop.i, prop.j, 1, { reach: 1 })
          later(f, 10, () => signal.playSound("powerUp"))
        }
      } else {
        // out of tune: the tune starts over with the next stones
        tuneNext.set(group, -1)
        signal.message.update({ text: "OUT OF TUNE..." })
        later(f, 8, () => signal.playSound("hitHurt"))
      }
    }, 3)
  }
}

/** Resets the tunes (tests) */
export function resetTunes() {
  tuneNext.clear()
}

/**
 * The balloon rock: swells a size with each push, and the third push
 * bursts it, blowing everything around one cell away (and breaking the
 * breakable things there in turn)
 */
class BalloonRock implements PushedDelegate {
  onPushed(_event: PushedEvent, prop: Prop, field: IField): void {
    const state = prop.growthState
    if (!state || prop.isBreaking) return
    if (state.stage < 2) {
      prop.showStage(state.stage + 1)
      shake(3)
      signal.playSound("jump")
      return
    }
    prop.isBreaking = true
    prop.enqueueActions(
      { type: "wait", until: field.time + 4 },
      { type: "remove" },
      {
        type: "call",
        fn: (f) => {
          crunch(f, prop.i, prop.j, {
            stop: 6,
            shakeFrames: 14,
            count: 20,
            colors: [Palette.gray2, Palette.gray3, Palette.gray4],
          })
          for (const dir of DIRS) {
            const [ni, nj] = nextGrid(prop.i, prop.j, dir)
            const ev = { type: "pushed", dir, peakAt: 0 } as const
            for (const actor of f.actors.get(ni, nj)) {
              actor.unshiftActions({ type: "slide", dir, speed: 4 })
            }
            f.props.get(ni, nj)?.onPushed(ev, f)
          }
          scatter(f, "coin", prop.i, prop.j, 3)
        },
      },
    )
  }
}

/**
 * The tower of drawers: each push shoots the top drawer's things out,
 * a sock, a letter, then a whole little chest of drawers
 */
class DrawerTower implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    const state = prop.growthState
    if (!state || event.pusher?.id !== "main") return
    if (state.stage >= 3) {
      signal.message.update({ text: "ALL THE DRAWERS ARE EMPTY" })
      return
    }
    const stage = state.stage
    prop.showStage(stage + 1)
    shake(4)
    hitStop(2)
    signal.playSound("blipSelect")
    const avoid = [event.pusher.i, event.pusher.j] as const
    burst(field, prop.i, prop.j, [Palette.gray3, Palette.gray4], 5)
    if (stage === 0) scatter(field, "sock", prop.i, prop.j, 2, { avoid })
    if (stage === 1) scatter(field, "envelope", prop.i, prop.j, 2, { avoid })
    if (stage === 2) {
      // a smaller chest of drawers lands beside it
      const cell = freeCellsAround(field, prop.i, prop.j, 2)
        .find(([ci, cj]) => ci !== avoid[0] || cj !== avoid[1])
      if (cell) {
        const mini = field.spawnProp("mini-drawers", cell[0], cell[1], {
          drops: "coin",
          count: 4,
        }, { transient: true })
        mini?.drop?.(32, () => {
          shake(4)
          burst(field, cell[0], cell[1], [Palette.gray3], 4)
          signal.playSound("hitHurt")
        })
      }
    }
  }
}

/**
 * The fallen crescent moon: broken, it lets out the night. The cells
 * around turn black for a while, stars twinkle in it, and a few of them
 * fall to the ground.
 */
class MoonShell implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (prop.isBreaking) return
    prop.isBreaking = true
    breakProp(prop, field, event.dir, (f) => {
      crunch(f, prop.i, prop.j, {
        stop: 4,
        colors: [Palette.white, Palette.gray1],
        sound: "powerUp",
      })
      signal.message.update({ text: "THE NIGHT SPILLED OUT" })
      const R = 2
      const NIGHT = 150
      for (let dj = -R; dj <= R; dj++) {
        for (let di = -R; di <= R; di++) {
          const x = (prop.i + di) * CELL_SIZE
          const y = (prop.j + dj) * CELL_SIZE
          // the night falls from the middle out
          const delay = (Math.abs(di) + Math.abs(dj)) * 3
          f.effects.add(
            new EffectBox(
              x,
              y,
              CELL_SIZE,
              CELL_SIZE,
              Palette.black,
              NIGHT - delay * 2,
              true,
              delay,
            ),
          )
          // a star or two twinkling in each cell
          for (let s = 0; s < 2; s++) {
            const sx = x + Math.floor(Math.random() * CELL_SIZE)
            const sy = y + Math.floor(Math.random() * CELL_SIZE)
            const at = delay + 4 + Math.floor(Math.random() * 60)
            f.effects.add(
              new EffectBox(sx, sy, 1, 1, Palette.white, 30, true, at),
            )
            f.effects.add(
              new EffectBox(sx, sy, 1, 1, Palette.gray2, 20, true, at + 30),
            )
          }
        }
      }
      // three stars fall: a streak, then a star on the ground
      const cells = shuffle(
        freeCellsAround(f, prop.i, prop.j, R, { minDist: 0 }),
      )
        .slice(0, 3)
      cells.forEach(([ci, cj], n) => {
        later(f, 50 + n * 20, (f2) => {
          for (let k = 0; k < 6; k++) {
            f2.effects.add(
              new EffectBox(
                ci * CELL_SIZE + 7,
                (cj - 6 + k) * CELL_SIZE,
                2,
                CELL_SIZE,
                Palette.white,
                2,
                false,
                k * 2,
              ),
            )
          }
          later(f2, 12, (f3) => {
            f3.spawnItem("star", ci, cj)
            burst(f3, ci, cj, [Palette.white, Palette.yellow1], 6)
            signal.playSound("pickupCoin")
          })
        })
      })
    })
  }
}

/** The places the window shards show, and what picking one up says */
export const SHARDS: Record<string, string> = {
  "shard-sea": "A PIECE OF A FARAWAY SEA",
  "shard-snow": "A PIECE OF A SNOWY FIELD",
  "shard-town": "A PIECE OF A TOWN AT DUSK",
  "shard-sky": "A PIECE OF A CLOUDLESS SKY",
}

/** The window standing alone: its glass shatters into other places */
class LoneWindow implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (prop.isBreaking) return
    prop.isBreaking = true
    breakProp(prop, field, event.dir, (f) => {
      crunch(f, prop.i, prop.j, {
        stop: 4,
        count: 16,
        colors: [Palette.white, Palette.blue1, Palette.cyan1, Palette.gray1],
        dir: event.dir,
        sound: "hitHurt",
      })
      for (const type of Object.keys(SHARDS)) {
        scatter(f, type, prop.i, prop.j, 1, {
          avoid: event.pusher ? [event.pusher.i, event.pusher.j] : undefined,
          dirs: [event.dir, turnLeft(event.dir), turnRight(event.dir)],
        })
      }
    })
  }
}

/** The actors stopped by a broken clock: the field time they move again */
const frozenUntil = new WeakMap<IActor, number>()

/** true while the actor is stopped by a broken clock */
export function isFrozen(actor: IActor, field: IField): boolean {
  return (frozenUntil.get(actor) ?? 0) > field.time
}

/** The range of a breaking clock, and how long it stops the actors */
export const CLOCK_RANGE = 10
export const CLOCK_STOP = 180

/** The clock: broken, its gears fly and the actors around stop */
class Clock implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (prop.isBreaking) return
    prop.isBreaking = true
    breakProp(prop, field, event.dir, (f) => {
      crunch(f, prop.i, prop.j, { stop: 8, shakeFrames: 4, count: 14 })
      let stopped = 0
      for (const actor of f.actors.iter()) {
        if (actor.id === "main") continue
        if (manhattan(actor.i, actor.j, prop.i, prop.j) > CLOCK_RANGE) continue
        actor.clearActionQueue()
        frozenUntil.set(actor, f.time + CLOCK_STOP)
        stopped++
        f.effects.add(flashCell(actor.i, actor.j))
      }
      signal.message.update({
        text: stopped > 0 ? "TICK... TIME STOPPED AROUND HERE" : "TICK...",
      })
      scatter(f, "gear", prop.i, prop.j, 3)
    })
  }
}

/**
 * The piñata tree: shaken, a paper animal drops off its branches; with
 * all three down, the tree itself bursts into a big candy
 */
class PinataTree implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    const state = prop.growthState
    if (!state || prop.isBreaking) return
    if (state.stage < 3) {
      const cell = freeCellsAround(field, prop.i, prop.j, 2, { minDist: 2 })
        .find((
          [ci, cj],
        ) => !event.pusher || ci !== event.pusher.i || cj !== event.pusher.j)
      if (!cell) return
      prop.showStage(state.stage + 1)
      shake(3)
      signal.playSound("jump")
      const pinata = field.spawnProp("pinata", cell[0], cell[1], {}, {
        transient: true,
      })
      pinata?.drop?.(40, () => {
        shake(3)
        signal.playSound("hitHurt")
        burst(field, cell[0], cell[1], [Palette.white, Palette.gray2], 4)
      })
      return
    }
    prop.isBreaking = true
    breakProp(prop, field, event.dir, (f) => {
      crunch(f, prop.i, prop.j, {
        stop: 8,
        shakeFrames: 12,
        count: 20,
        sound: "powerUp",
      })
      const avoid = event.pusher
        ? [event.pusher.i, event.pusher.j] as const
        : undefined
      scatter(f, "big-candy", prop.i, prop.j, 1, { reach: 1, avoid })
      scatter(f, "candy", prop.i, prop.j, 6, { avoid })
    })
  }
}

/** A paper animal of the piñata tree: candies inside */
class Pinata implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (prop.isBreaking) return
    prop.isBreaking = true
    breakProp(prop, field, event.dir, (f) => {
      crunch(f, prop.i, prop.j, {
        stop: 4,
        count: 12,
        colors: [Palette.white, Palette.gray2, Palette.gray3],
      })
      scatter(f, "candy", prop.i, prop.j, 4, {
        avoid: event.pusher ? [event.pusher.i, event.pusher.j] : undefined,
      })
    })
  }
}

/** The cell the toothpaste lays: white, walkable, over water too */
export const PASTE_CELL = "P"
/** How far a squeeze reaches */
export const PASTE_REACH = 12

/**
 * The toothpaste rock: pushed, a white path squeezes out of its far
 * side, over the floor and the water alike, until something stops it
 */
class PasteTube implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    const state = prop.growthState
    if (!state || state.stage > 0) return
    // squeezed flat: it can be walked over onto the paste
    prop.showStage(1)
    prop.setOpen(true, false)
    signal.playSound("jump")
    shake(4)
    let [ci, cj] = [prop.i, prop.j]
    for (let k = 0; k < PASTE_REACH; k++) {
      const [ni, nj] = nextGrid(ci, cj, event.dir)
      const free = field.isWater(ni, nj) ||
        (field.canEnterStatic(ni, nj) && !field.props.get(ni, nj))
      if (!free) break
      ;[ci, cj] = [ni, nj]
      const [pi, pj] = [ci, cj]
      later(field, 4 + k * 4, (f) => {
        f.updateCell(pi, pj, PASTE_CELL)
        burst(f, pi, pj, [Palette.white], 2)
        if (k % 2 === 0) signal.playSound("blipSelect")
      })
    }
  }
}

/**
 * The player's moves (cell, time), kept for the statue's echo. The main
 * character records every step (game/main-character.ts).
 */
const trail: { i: number; j: number; t: number }[] = []
const TRAIL_MAX = 3000

/** Records a step of the player */
export function recordTrail(i: number, j: number, t: number) {
  trail.push({ i, j, t })
  if (trail.length > TRAIL_MAX) trail.splice(0, trail.length - TRAIL_MAX)
}

/** How far behind the player the echo walks (frames) */
export const ECHO_DELAY = 600
/** How long the echo lasts (frames) */
export const ECHO_LIFE = 2400

/** The echoes and the time they started following */
const echoes = new WeakMap<IActor, { since: number; born: number }>()

/** The statue of yourself: inside, you of ten seconds ago */
class SelfStatue implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (prop.isBreaking) return
    prop.isBreaking = true
    breakProp(prop, field, event.dir, (f) => {
      crunch(f, prop.i, prop.j, { stop: 6, count: 14 })
      const echo = f.spawnActor("echo", prop.i, prop.j, "down")
      if (!echo) return
      echoes.set(echo, { since: f.time - ECHO_DELAY, born: f.time })
      ;(echo as Actor).speed = 4
      signal.message.update({ text: "YOU, FROM TEN SECONDS AGO" })
    })
  }
}

/**
 * The echo: walks where the player walked ten seconds ago, standing on
 * the plates the player stood on. Fades away after a while.
 */
class EchoDelegate {
  onIdle(actor: Actor, field: IField): void {
    const echo = echoes.get(actor)
    if (!echo) {
      // a stray echo (re-spawned without a trail)
      removeActor(actor, field)
      return
    }
    if (field.time - echo.born > ECHO_LIFE) {
      burst(field, actor.i, actor.j, [Palette.gray2, Palette.gray3], 8)
      removeActor(actor, field)
      return
    }
    // the next step of the trail that is ten seconds old
    const due = field.time - ECHO_DELAY
    const step = trail.find((s) => s.t > echo.since && s.t <= due)
    if (!step) return
    if (step.i === actor.i && step.j === actor.j) {
      echo.since = step.t
      return
    }
    const dir = dirsToward(step.i - actor.i, step.j - actor.j)[0]
    if (!dir) return
    const [ni, nj] = actor.nextGrid(dir)
    if (field.actors.get(ni, nj).length > 0) return
    // a ghost of you: through anything on its way
    actor.forceMove(dir)
    if (ni === step.i && nj === step.j) echo.since = step.t
  }
  onPushed(_event: PushedEvent, _actor: Actor, _field: IField): void {}
}

/** The slipper mats: positions by group */
const matRegistry = new Map<string, Set<string>>()
const matsDone = new Set<string>()

/**
 * The mat by the door: with a slipper on each mat of the group,
 * footsteps come from somewhere and a coin bag is left
 */
function stepSlipperMat(prop: Prop, field: IField) {
  const group = typeof dataOf(prop).group === "string"
    ? dataOf(prop).group as string
    : ""
  let mats = matRegistry.get(group)
  if (!mats) matRegistry.set(group, mats = new Set())
  mats.add(`${prop.i}.${prop.j}`)
  if (field.time % 15 !== 0 || matsDone.has(group)) return
  const onMats: IActor[] = []
  for (const key of mats) {
    const [i, j] = key.split(".").map(Number)
    const slipper = field.actors.get(i, j).find((a) =>
      a.type === "slipper" || a.type === "slipper-r"
    )
    if (!slipper) return
    onMats.push(slipper)
  }
  if (new Set(onMats.map((a) => a.type)).size < 2) return
  matsDone.add(group)
  for (const s of onMats) settled.add(s)
  signal.message.update({ text: "TAP... TAP... SOMEONE CAME HOME" })
  for (let k = 0; k < 4; k++) {
    later(field, 20 + k * 18, () => signal.playSound("hitHurt"))
  }
  later(field, 100, (f) => {
    crunch(f, prop.i, prop.j, {
      stop: 2,
      shakeFrames: 2,
      sound: "powerUp",
      count: 6,
    })
    scatter(f, "coin-bag", prop.i, prop.j, 1, { reach: 2 })
  })
}

/** Resets the mats (tests) */
export function resetMats() {
  matRegistry.clear()
  matsDone.clear()
}

/** The little house at the end of the unrolled snail shell */
class SnailHouse implements PushedDelegate {
  #thanked = false
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (event.pusher?.id !== "main" || this.#thanked) return
    this.#thanked = true
    signal.message.update({ text: "THANK YOU FOR FINDING MY HOUSE" })
    signal.playSound("powerUp")
    shake(3)
    scatter(field, "coin-bag", prop.i, prop.j, 1, {
      avoid: [event.pusher.i, event.pusher.j],
      reach: 1,
    })
  }
}

/** Pushed delegates of the oddity props, by the catalog's `pushed` name */
export const ODD_PROP_PUSHED: Record<string, () => PushedDelegate> = {
  "nest-jar": () => new NestJar(),
  "packed-box": () => new PackedBox(),
  "egg-wall": () => new EggWall(),
  "bell-stone": () => new BellStone(),
  "balloon-rock": () => new BalloonRock(),
  "drawer-tower": () => new DrawerTower(),
  "moon-shell": () => new MoonShell(),
  "lone-window": () => new LoneWindow(),
  clock: () => new Clock(),
  "pinata-tree": () => new PinataTree(),
  pinata: () => new Pinata(),
  "paste-tube": () => new PasteTube(),
  "self-statue": () => new SelfStatue(),
  "snail-house": () => new SnailHouse(),
}

/** Per-frame behaviors of the oddity props, by type */
export const ODD_PROP_STEP: Record<
  string,
  (prop: Prop, field: IField) => void
> = {
  "slipper-mat": stepSlipperMat,
}

/**
 * On creation, by type: the props whose state lives in the growth
 * stages start whole again when they come back (re-activated)
 */
export const ODD_PROP_INIT: Record<string, (prop: Prop) => void> = {
  "balloon-rock": resetStage,
  "drawer-tower": resetStage,
  "pinata-tree": resetStage,
  "paste-tube": (prop) => {
    resetStage(prop)
    prop.setOpen(false, false)
  },
}

function resetStage(prop: Prop) {
  const state = prop.growthState
  if (state) {
    state.stage = 0
    state.count = 0
  }
}

// ---------------------------------------------------------------------
// actors

/** Slow random steps every `pace` frames */
function crawl(actor: Actor, field: IField, pace: number, salt: string) {
  const { randomInt, choice } = seed(`${actor.id}.${field.time}.${salt}`)
  if (randomInt(pace) !== 0) return
  const dirs = DIRS.filter((d) => actor.canGo(d, field))
  if (dirs.length > 0) actor.tryMove("go", choice(dirs), field)
}

/** The colonies of the spore blobs, and which colony each blob is in */
const colonies = new Map<string, Set<IActor>>()
const colonyOf = new WeakMap<IActor, string>()
/** A colony pops when it grows to this many */
export const COLONY_SIZE = 8

/**
 * The spore blob: poked, it splits in two. A colony grown to eight pops
 * all at once, one after another, each into a coin.
 */
class SporeDelegate {
  #colony(actor: IActor): Set<IActor> {
    let id = colonyOf.get(actor)
    if (!id) colonyOf.set(actor, id = actor.id)
    let colony = colonies.get(id)
    if (!colony) colonies.set(id, colony = new Set())
    colony.add(actor)
    return colony
  }
  onIdle(actor: Actor, field: IField): void {
    this.#colony(actor)
    // sits still while poked at
    if (manhattan(field.me.i, field.me.j, actor.i, actor.j) > 3) {
      crawl(actor, field, 240, "spore")
    }
  }
  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    const colony = this.#colony(actor)
    if (colony.size >= COLONY_SIZE || actor.buff.popping) return
    // the bud goes to the far side if it can, else next to any blob of
    // the colony; never onto who poked it (whose cell reads as free
    // during its own move)
    const pusher = event.pusher
    const cells: [number, number, Dir][] = []
    const order = [
      event.dir,
      turnLeft(event.dir),
      turnRight(event.dir),
      opposite(event.dir),
    ]
    for (const blob of [actor, ...colony]) {
      for (const dir of order) {
        cells.push([...nextGrid(blob.i, blob.j, dir), dir])
      }
    }
    const cell = cells.find(([ci, cj]) =>
      field.canEnter(ci, cj) && !(pusher && pusher.i === ci && pusher.j === cj)
    )
    if (cell) {
      const [ni, nj, dir] = cell
      const bud = field.spawnActor(actor.type, ni, nj, dir)
      if (!bud) return
      colonyOf.set(bud, colonyOf.get(actor)!)
      colony.add(bud)
      bud.enqueueActions({ type: "jump" })
      actor.enqueueActions({ type: "jump" })
      signal.playSound("blipSelect")
      burst(field, ni, nj, [Palette.gray2, Palette.white], 4)
    }
    if (colony.size >= COLONY_SIZE) {
      ;[...colony].forEach((blob, n) => {
        blob.enqueueActions(
          { type: "add-buff", buff: "popping" },
          { type: "wait", until: field.time + 30 + n * 6 },
          {
            type: "call",
            fn: (f) => {
              removeActor(blob, f)
              colony.delete(blob)
              crunch(f, blob.i, blob.j, {
                stop: 2,
                shakeFrames: 3,
                count: 8,
                sound: n % 2 === 0 ? "explosion" : null,
              })
              f.spawnItem("coin", blob.i, blob.j)
            },
          },
        )
      })
    }
  }
}

/** The coins the ghosts took: the piggy bank gives them back */
let lostCoins = 0

/** Counts the coins taken from the player */
export function addLostCoins(n: number) {
  lostCoins += n
}

/** The walking piggy bank: cornered and bumped, it breaks into coins */
class PiggyDelegate {
  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    if (event.pusher?.id !== "main" || actor.buff.broken) return
    actor.buff.broken = true
    const coins = 3 + lostCoins
    const back = lostCoins
    lostCoins = 0
    actor.enqueueActions(
      { type: "wait", until: field.time + event.peakAt },
      {
        type: "call",
        fn: (f) => {
          removeActor(actor, f)
          crunch(f, actor.i, actor.j, {
            stop: 6,
            shakeFrames: 10,
            count: 18,
            colors: [Palette.white, Palette.gray2, Palette.gray3],
          })
          scatter(f, "coin", actor.i, actor.j, Math.min(coins, 30), {
            avoid: [event.pusher!.i, event.pusher!.j],
          })
          if (back > 0) {
            signal.message.update({ text: `${back} LOST COINS CAME BACK!` })
          }
        },
      },
    )
  }
}

/**
 * The fin: a fish swimming under the floor, only its fin showing.
 * Caught (bumped), it leaps out and bursts into scales, fanned out.
 */
class FinDelegate {
  onIdle(actor: Actor, field: IField): void {
    const me = field.me
    if (me && manhattan(me.i, me.j, actor.i, actor.j) <= 2) {
      // shy: darts away
      const { choice } = seed(`${actor.id}.${field.time}`)
      if (stepAway(actor, field, me.i, me.j, choice, 4)) return
    }
    crawl(actor, field, 20, "fin")
  }
  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    if (actor.buff.caught) return
    actor.buff.caught = true
    actor.clearActionQueue()
    actor.enqueueActions(
      { type: "wait", until: field.time + event.peakAt },
      {
        type: "jump",
        cb: () => {
          removeActor(actor, field)
          crunch(field, actor.i, actor.j, {
            stop: 4,
            count: 12,
            colors: [Palette.white, Palette.cyan1, Palette.cyan2],
            dir: event.dir,
            sound: "powerUp",
          })
          scatter(field, "scale", actor.i, actor.j, 5, {
            dirs: [event.dir, turnLeft(event.dir), turnRight(event.dir)],
            avoid: event.pusher ? [event.pusher.i, event.pusher.j] : undefined,
          })
        },
      },
    )
  }
}

/**
 * The cloud fallen to the ground: pushed, it floats two cells. Pressed
 * against something, it gets squashed and rains, and a sapling sprouts
 * where it was.
 */
class CloudDelegate {
  onIdle(actor: Actor, field: IField): void {
    if (manhattan(field.me.i, field.me.j, actor.i, actor.j) > 3) {
      crawl(actor, field, 240, "cloud")
    }
  }
  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    if (actor.buff.raining) return
    if (actor.canGo(event.dir, field)) {
      const second = () => {
        if (actor.canGo(event.dir, field)) {
          actor.unshiftActions({ type: "slide", dir: event.dir, speed: 2 })
        }
      }
      actor.enqueueActions(
        { type: "wait", until: field.time + event.peakAt },
        { type: "slide", dir: event.dir, speed: 2, cb: second },
      )
      return
    }
    // squashed against the wall
    actor.buff.raining = true
    signal.playSound("hitHurt")
    shake(4)
    const { i, j } = actor
    for (let k = 0; k < 24; k++) {
      field.effects.add(
        new EffectDebris(
          i * CELL_SIZE + Math.floor(Math.random() * CELL_SIZE),
          j * CELL_SIZE - 8 - Math.floor(Math.random() * 12),
          0,
          1 + Math.random(),
          k % 2 ? Palette.blue2 : Palette.blue1,
          1,
          2,
          20 + k,
        ),
      )
    }
    later(field, 36, (f) => {
      removeActor(actor, f)
      burst(f, i, j, [Palette.white, Palette.gray1], 8)
      if (!f.props.get(i, j)) {
        f.spawnProp("sapling", i, j)
        signal.playSound("powerUp")
      }
    })
  }
}

/** The lines of pebbles: the followers of each leader, in order */
const congas = new WeakMap<IActor, IActor[]>()
/** Where each follower is to step next, and its leader */
const congaTarget = new WeakMap<
  IActor,
  { i: number; j: number; leader: IActor }
>()
/** How many pebbles follow a leader */
export const CONGA_LENGTH = 9

/**
 * The leader of a line of pebbles walking like ants. Kicked, the bounce
 * runs down the line, and the last pebble turns into a gem.
 */
class CongaLeader {
  #kicked = false
  #home: [number, number] | null = null
  onIdle(actor: Actor, field: IField): void {
    let line = congas.get(actor)
    if (!line) {
      line = this.#spawnLine(actor, field)
      congas.set(actor, line)
    }
    if (this.#kicked) return
    // waits for the line to close up
    for (const p of line) {
      const t = congaTarget.get(p)
      if (t && (p.i !== t.i || p.j !== t.j)) return
    }
    const { randomInt, choice } = seed(`${actor.id}.${field.time}`)
    if (randomInt(20) !== 0) return
    // the ants keep to their ground, around where the leader started
    const home = this.#home ??= [actor.i, actor.j]
    const ok = (d: Dir) => {
      const [ni, nj] = actor.nextGrid(d)
      return actor.canGo(d, field) && manhattan(ni, nj, home[0], home[1]) <= 5
    }
    let dir = actor.dir
    if (!ok(dir) || randomInt(6) === 0) {
      const dirs = DIRS.filter((d) => d !== opposite(actor.dir) && ok(d))
      if (dirs.length === 0) {
        if (!ok(opposite(actor.dir))) return
        dir = opposite(actor.dir)
      } else {
        dir = choice(dirs)
      }
    }
    const from = [actor.i, actor.j] as const
    actor.tryMove("go", dir, field)
    if (actor.i === from[0] && actor.j === from[1]) return
    // each pebble steps where the one before it stood
    let prev: readonly [number, number] = from
    for (const p of line) {
      const here = [p.i, p.j] as const
      congaTarget.set(p, { i: prev[0], j: prev[1], leader: actor })
      prev = here
    }
  }
  #spawnLine(actor: Actor, field: IField): IActor[] {
    const line: IActor[] = []
    let [ci, cj] = [actor.i, actor.j]
    let back = opposite(actor.dir)
    for (let n = 0; n < CONGA_LENGTH; n++) {
      const dirs = [back, turnLeft(back), turnRight(back)]
      const dir = dirs.find((d) => {
        const [ni, nj] = nextGrid(ci, cj, d)
        return field.canEnter(ni, nj)
      })
      if (!dir) break
      ;[ci, cj] = nextGrid(ci, cj, dir)
      const p = field.spawnActor("pebble", ci, cj, opposite(dir))
      if (!p) break
      congaTarget.set(p, { i: ci, j: cj, leader: actor })
      line.push(p)
      back = dir
    }
    return line
  }
  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    const line = congas.get(actor)
    if (event.pusher?.id !== "main" || this.#kicked || !line) {
      actor.enqueueActions({ type: "jump" })
      return
    }
    this.#kicked = true
    actor.enqueueActions({ type: "jump" })
    signal.playSound("jump")
    line.forEach((p, n) => {
      const last = n === line.length - 1
      p.enqueueActions(
        { type: "wait", until: field.time + 6 + n * 5 },
        {
          type: "jump",
          cb: () => {
            if (n % 3 === 0) signal.playSound("blipSelect")
            if (!last) return
            removeActor(p, field)
            crunch(field, p.i, p.j, {
              stop: 6,
              shakeFrames: 8,
              count: 14,
              colors: [Palette.white, Palette.teal1, Palette.teal2],
              sound: "powerUp",
            })
            field.spawnItem("gem", p.i, p.j)
          },
        },
      )
    })
  }
}

/** A pebble of a line: steps where the one before it stood */
class CongaFollower {
  onIdle(actor: Actor, field: IField): void {
    const t = congaTarget.get(actor)
    if (!t) return
    if (
      field.time % 60 === 0 &&
      !field.actors.get(t.leader.i, t.leader.j).includes(t.leader)
    ) {
      // the leader is gone (out of the area): so is the line
      removeActor(actor, field)
      return
    }
    if (actor.i === t.i && actor.j === t.j) return
    const dir = dirsToward(t.i - actor.i, t.j - actor.j)[0]
    if (
      dir && manhattan(actor.i, actor.j, t.i, t.j) === 1 &&
      field.canEnter(t.i, t.j)
    ) {
      actor.tryMove("go", dir, field)
    }
  }
  onPushed(_event: PushedEvent, actor: Actor, _field: IField): void {
    if (actor.isActionQueueEmpty()) actor.enqueueActions({ type: "jump" })
  }
}

/** What falls out of a shadow: its owner */
const OWNERS = ["crate", "packed-box", "nest-jar-2", "balloon-rock", "barrel"]

/**
 * The shadow walking by itself. Stepped on (bumped), whatever cast it
 * falls out of the sky onto its spot.
 */
class ShadowDelegate {
  onIdle(actor: Actor, field: IField): void {
    crawl(actor, field, 40, "shadow")
  }
  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    if (actor.buff.caught) return
    actor.buff.caught = true
    const { i, j } = actor
    actor.enqueueActions(
      { type: "wait", until: field.time + event.peakAt },
      {
        type: "call",
        fn: (f) => {
          removeActor(actor, f)
          const owner =
            OWNERS[Math.floor(cellRand(i, j, `${f.time}`) * OWNERS.length)]
          const prop = f.spawnProp(owner, i, j, {}, { transient: true })
          signal.playSound("jump")
          prop?.drop?.(64, () => {
            crunch(f, i, j, {
              stop: 4,
              shakeFrames: 10,
              count: 10,
              colors: [Palette.gray3, Palette.gray4],
              sound: "explosion",
            })
          })
        },
      },
    )
  }
}

/** The words the books know, and what spelling them gives */
export const WORDS: Record<string, { item: string; count: number }> = {
  KEY: { item: "key", count: 1 },
  GEM: { item: "gem", count: 1 },
  COIN: { item: "coin", count: 8 },
}

/** The word being spelled, and how many letters are picked up */
const spelling = { word: "", next: 0 }

/** Resets the spelling (tests) */
export function resetSpelling() {
  spelling.word = ""
  spelling.next = 0
}

/**
 * The flapping book. Caught, its letters spill out over the floor;
 * picked up in order, they spell the word, which comes true.
 */
class BookDelegate {
  onIdle(actor: Actor, field: IField): void {
    const me = field.me
    if (me && manhattan(me.i, me.j, actor.i, actor.j) <= 2) {
      const { choice } = seed(`${actor.id}.${field.time}`)
      if (field.time % 2 === 0 && stepAway(actor, field, me.i, me.j, choice)) {
        return
      }
    }
    const { randomInt } = seed(`${actor.id}.${field.time}.flap`)
    if (randomInt(80) === 0) actor.jump()
    else crawl(actor, field, 50, "book")
  }
  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    if (actor.buff.caught || event.pusher?.id !== "main") return
    actor.buff.caught = true
    const words = Object.keys(WORDS)
    const word =
      words[Math.floor(cellRand(actor.i, actor.j, actor.id) * words.length)]
    actor.enqueueActions(
      { type: "wait", until: field.time + event.peakAt },
      {
        type: "call",
        fn: (f) => {
          removeActor(actor, f)
          crunch(f, actor.i, actor.j, {
            stop: 4,
            count: 12,
            colors: [Palette.white, Palette.gray2],
            sound: "blipSelect",
          })
          spelling.word = word
          spelling.next = 0
          const cells = shuffle(
            freeCellsAround(f, actor.i, actor.j, 4, { minDist: 1 }).slice(
              0,
              14,
            ),
          )
          ;[...word].forEach((ch, n) => {
            const cell = cells[n]
            if (!cell) return
            const item = f.spawnItem(
              `letter-${ch.toLowerCase()}`,
              actor.i,
              actor.j,
            )
            // flutters to its cell
            item?.enqueueActions(...pathTo(actor.i, actor.j, cell[0], cell[1]))
          })
          signal.message.update({
            text: `${word.length} LETTERS SPILLED OUT. PICK THEM IN ORDER`,
          })
        },
      },
    )
  }
}

/** Straight moves from one cell to another (an L), for flying items */
function pathTo(i0: number, j0: number, i1: number, j1: number) {
  const moves: { type: "go"; dir: Dir; speed: 4 }[] = []
  for (let n = 0; n < Math.abs(i1 - i0); n++) {
    moves.push({ type: "go", dir: i1 > i0 ? "right" : "left", speed: 4 })
  }
  for (let n = 0; n < Math.abs(j1 - j0); n++) {
    moves.push({ type: "go", dir: j1 > j0 ? "down" : "up", speed: 4 })
  }
  return moves
}

/**
 * Picks up a letter of the book: only the next letter of the word goes
 * into the bag; any other hops away. The whole word comes true.
 */
export function collectLetter(actor: IActor, field: IField, item: IItem) {
  const ch = item.def.type.split("-").pop()!.toUpperCase()
  const word = spelling.word
  if (!word || word[spelling.next] !== ch) {
    // not yet: hops off to a free cell
    const dir = DIRS.find((d) => {
      const [ni, nj] = nextGrid(item.i, item.j, d)
      return field.canEnterStatic(ni, nj) && d !== actor.dir
    })
    if (dir) item.enqueueActions({ type: "go", dir, speed: 4 })
    signal.playSound("hitHurt")
    signal.message.update({
      text: word
        ? `${word.slice(0, spelling.next)}${
          "_".repeat(word.length - spelling.next)
        } - NOT ${ch} YET`
        : "A LOOSE LETTER",
    })
    return
  }
  field.collectItem(item.i, item.j, item.id)
  spelling.next++
  pickupLines(field, actor, item, Palette.brown1)
  signal.playSound("bell", [0, 4, 7, 12][(spelling.next - 1) % 4])
  burst(field, actor.i, actor.j, [Palette.white, Palette.gray2], 5)
  if (spelling.next < word.length) {
    signal.message.update({
      text: word.slice(0, spelling.next) +
        "_".repeat(word.length - spelling.next),
    })
    return
  }
  const reward = WORDS[word]
  spelling.word = ""
  spelling.next = 0
  signal.message.update({ text: `${word}! THE WORD CAME TRUE` })
  later(field, 8, (f) => {
    crunch(f, actor.i, actor.j, { stop: 4, count: 14, sound: "powerUp" })
    scatter(f, reward.item, actor.i, actor.j, reward.count, { reach: 2 })
  })
}

/** The lines that burst out of a picked up item, in its main color */
function pickupLines(
  field: IField,
  actor: IActor,
  item: IItem,
  fallback: PaletteColor,
) {
  for (
    const e of linePattern0(
      DIRS,
      actor.i,
      actor.j,
      1,
      0.7,
      3,
      item.def.color ?? fallback,
    )
  ) field.effects.add(e)
}

/** Picks up a window shard: a glimpse of somewhere else */
export function collectShard(
  actor: IActor,
  field: IField,
  item: IItem,
  amount: number,
) {
  field.collectItem(item.i, item.j, item.id)
  pickupLines(field, actor, item, Palette.blue1)
  signal.message.update({
    text: SHARDS[item.def.type] ?? "A PIECE OF SOMEWHERE",
  })
  signal.coinCount.update(signal.coinCount.get() + 2 * amount)
  signal.playSound("pickupCoin")
  burst(field, actor.i, actor.j, [Palette.white, Palette.blue1], 5)
}

/** The eggs, each hatching the next bigger one, and then a bird */
const EGG_NEXT: Record<string, string> = {
  "egg-s": "egg-m",
  "egg-m": "egg-l",
  "egg-l": "bird",
}

/**
 * The boiled egg: pushed, it rolls until it hits something, and cracks.
 * Out comes a slightly bigger egg; out of the biggest, a bird that flies
 * off, leaving a feather.
 */
class EggDelegate {
  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    if (actor.buff.rolling) return
    actor.buff.rolling = true
    const dir = event.dir
    const roll = () => {
      const [ni, nj] = actor.nextGrid(dir)
      if (!field.canEnter(ni, nj)) {
        crack()
        return
      }
      actor.enqueueActions({
        type: "slide",
        dir,
        speed: 4,
        cb: (move) => move.type === "move" ? roll() : crack(),
      })
    }
    const crack = () => {
      const { i, j } = actor
      removeActor(actor, field)
      crunch(field, i, j, {
        stop: 4,
        shakeFrames: 6,
        count: 12,
        colors: [Palette.white, Palette.gray1, Palette.gray2],
        sound: "hitHurt",
      })
      const next = EGG_NEXT[actor.type]
      if (!next) return
      const born = field.spawnActor(next, i, j, dir)
      born?.enqueueActions({ type: "jump" })
      if (next === "bird") {
        signal.playSound("powerUp")
        field.spawnItem("feather", i, j)
      }
    }
    actor.enqueueActions({ type: "wait", until: field.time + event.peakAt })
    roll()
  }
}

/** The bird out of the egg: flies off over everything, and is gone */
class BirdDelegate {
  onIdle(actor: Actor, field: IField): void {
    const flown = (actor.buff.flown as number | undefined) ?? 0
    if (flown >= 12) {
      removeActor(actor, field)
      return
    }
    actor.buff.flown = flown + 1
    actor.speed = 4
    actor.forceMove(flown % 3 === 2 ? "right" : "up")
  }
  onPushed(_event: PushedEvent, _actor: Actor, _field: IField): void {}
}

/** The fluff balls lift off once there are this many around */
export const FLUFF_SWARM = 16

/**
 * The fluff ball: touched, it bursts into seeds which land and grow
 * into new fluff balls. Once the place is full of them, they all lift
 * off at once, each leaving a coin.
 */
class FluffDelegate {
  onIdle(actor: Actor, field: IField): void {
    crawl(actor, field, 120, "fluff")
  }
  onPushed(_event: PushedEvent, actor: Actor, field: IField): void {
    if (actor.buff.burst) return
    actor.buff.burst = true
    const { i, j } = actor
    removeActor(actor, field)
    crunch(field, i, j, {
      stop: 2,
      shakeFrames: 2,
      count: 16,
      colors: [Palette.white, Palette.gray1],
      sound: "blipSelect",
    })
    const swarm = [...field.actors.iter()].filter((a) =>
      a.type === "fluff" && manhattan(a.i, a.j, i, j) <= 16
    )
    const room = FLUFF_SWARM - swarm.length
    const cells = shuffle(freeCellsAround(field, i, j, 3, { minDist: 1 }))
      .slice(0, Math.min(3, room))
    for (const [ci, cj] of cells) {
      later(field, 20 + Math.floor(Math.random() * 20), (f) => {
        if (!f.canEnter(ci, cj)) return
        const seedling = f.spawnActor("fluff", ci, cj, "down")
        seedling?.enqueueActions({ type: "jump" })
        f.effects.add(flashCell(ci, cj))
      })
    }
    const crowded = cells.length < 3 && swarm.length >= FLUFF_SWARM / 2
    if (swarm.length + cells.length >= FLUFF_SWARM || crowded) {
      // full (or no room left for the seeds): once the seeds landed, they
      // all lift off
      later(field, 45, (f) =>
        liftOff(
          [...f.actors.iter()].filter((a) =>
            a.type === "fluff" && manhattan(a.i, a.j, i, j) <= 16
          ),
          f,
        ))
    }
  }
}

/** All the fluff balls lift off, each leaving a coin */
function liftOff(swarm: IActor[], field: IField) {
  if (swarm.some((a) => (a as Actor).buff?.lifting)) return
  signal.message.update({ text: "THE FLUFF LIFTS OFF ALL AT ONCE!" })
  swarm.forEach((a, n) => {
    ;(a as Actor).buff.lifting = true
    a.enqueueActions(
      { type: "wait", until: field.time + 10 + n * 4 },
      {
        type: "call",
        fn: (f) => {
          removeActor(a, f)
          burst(f, a.i, a.j, [Palette.white, Palette.gray1], 6)
          f.spawnItem("coin", a.i, a.j)
          if (n % 3 === 0) signal.playSound("pickupCoin")
        },
      },
    )
  })
}

/** The slippers that settled on their mats */
const settled = new WeakSet<IActor>()
/** The two slippers of a pair */
const pairs = new WeakMap<IActor, IActor>()

/**
 * The pair of slippers, walking about with nobody in them. Bump one and
 * the other startles and runs. Put one on each mat by the door.
 */
class SlipperDelegate {
  onIdle(actor: Actor, field: IField): void {
    if (settled.has(actor)) return
    if (actor.type === "slipper" && !pairs.has(actor)) {
      // the right one comes along
      const cell = freeCellsAround(field, actor.i, actor.j, 1)[0]
      const other = cell &&
        field.spawnActor("slipper-r", cell[0], cell[1], actor.dir)
      if (other) {
        pairs.set(actor, other)
        pairs.set(other, actor)
      } else {
        pairs.set(actor, actor)
      }
    }
    crawl(actor, field, 150, "slipper")
  }
  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    if (settled.has(actor)) return
    // shoved a cell
    actor.enqueueActions(
      { type: "wait", until: field.time + event.peakAt },
      { type: "slide", dir: event.dir },
    )
    const other = pairs.get(actor)
    if (!other || other === actor || settled.has(other)) return
    // the other one startles and runs off a few cells
    other.enqueueActions({ type: "jump" })
    const me = field.me
    for (let n = 0; n < 3; n++) {
      other.enqueueActions({
        type: "call",
        fn: (f) => {
          const { choice } = seed(`${other.id}.${f.time}.${n}`)
          stepAway(other as Actor, f, me.i, me.j, choice, 4)
        },
      })
    }
    signal.playSound("jump")
  }
}

/**
 * The snail with a shell too big for it. Its shell broken, the spiral
 * unrolls into a long straight path, with the shell's owner's house at
 * the end; the snail, now a slug, crawls on.
 */
class SnailDelegate {
  onIdle(actor: Actor, field: IField): void {
    crawl(actor, field, 200, "snail")
  }
  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    if (actor.type !== "snail" || actor.buff.broken) return
    actor.buff.broken = true
    const { i, j } = actor
    const dir = event.dir
    removeActor(actor, field)
    crunch(field, i, j, { stop: 5, shakeFrames: 6, count: 14 })
    // the slug crawls out to a side, off the path
    const side = [turnLeft(dir), turnRight(dir)].map((d) => nextGrid(i, j, d))
      .find(([si, sj]) => field.canEnter(si, sj)) ?? [i, j]
    field.spawnActor("slug", side[0], side[1], dir)
    let [ci, cj] = [i, j]
    let n = 0
    for (; n < 14; n++) {
      const [ni, nj] = nextGrid(ci, cj, dir)
      const free = field.isWater(ni, nj) ||
        (field.canEnterStatic(ni, nj) && !field.props.get(ni, nj) &&
          field.actors.get(ni, nj).length === 0)
      if (!free) break
      ;[ci, cj] = [ni, nj]
      const [pi, pj] = [ci, cj]
      later(field, 6 + n * 3, (f) => {
        f.updateCell(pi, pj, SPIRAL_CELL)
        f.effects.add(flashCell(pi, pj))
        if (pi % 2 === 0 || pj % 2 === 0) signal.playSound("blipSelect")
      })
    }
    if (n === 0) return
    const [hi, hj] = [ci, cj]
    later(field, 10 + n * 3, (f) => {
      // the house at the end, on the last cell of the path
      const house = f.spawnProp("snail-house", hi, hj, {}, { transient: true })
      house?.drop?.(24, () => {
        crunch(f, hi, hj, {
          stop: 2,
          shakeFrames: 4,
          count: 6,
          sound: "powerUp",
        })
      })
    })
  }
}

/** The cell an unrolled snail shell lays */
export const SPIRAL_CELL = "S"

/** A line of this many block fish clears */
export const BLOCK_LINE = 4

/**
 * The block fish, square, swimming in place. Pushed, one slides until it
 * hits something. Four in a row or a column clear, one by one, into
 * grains of light.
 */
class BlockFishDelegate {
  onIdle(actor: Actor, field: IField): void {
    const { randomInt, choice } = seed(`${actor.id}.${field.time}`)
    if (randomInt(90) === 0) actor.setDir(choice(DIRS))
  }
  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    if (actor.buff.sliding || actor.buff.clearing) return
    actor.buff.sliding = true
    const dir = event.dir
    const slide = () => {
      if (!actor.canGo(dir, field)) {
        stop()
        return
      }
      actor.enqueueActions({
        type: "slide",
        dir,
        speed: 4,
        cb: (move) => move.type === "move" ? slide() : stop(),
      })
    }
    const stop = () => {
      delete actor.buff.sliding
      signal.playSound("hitHurt")
      shake(2)
      clearLines(actor, field)
    }
    actor.enqueueActions({ type: "wait", until: field.time + event.peakAt })
    slide()
  }
}

/** Clears the rows and columns of block fish through the actor's cell */
export function clearLines(actor: IActor, field: IField): IActor[] {
  const fish = new Map<string, IActor>()
  for (const a of field.actors.iter()) {
    if (
      a.type === "block-fish" && manhattan(a.i, a.j, actor.i, actor.j) <= 10
    ) {
      fish.set(`${a.i}.${a.j}`, a)
    }
  }
  const run = (di: number, dj: number): IActor[] => {
    const line = [actor]
    for (const s of [1, -1]) {
      for (let k = 1;; k++) {
        const a = fish.get(`${actor.i + di * k * s}.${actor.j + dj * k * s}`)
        if (!a) break
        line.push(a)
      }
    }
    return line
  }
  const cleared = new Set<IActor>()
  for (const line of [run(1, 0), run(0, 1)]) {
    if (line.length >= BLOCK_LINE) line.forEach((a) => cleared.add(a))
  }
  if (cleared.size === 0) return []
  signal.playSound("powerUp")
  hitStop(4)
  ;[...cleared].sort((a, b) => a.i + a.j - b.i - b.j).forEach((a, n) => {
    ;(a as Actor).buff.clearing = true
    later(field, 6 + n * 5, (f) => {
      removeActor(a, f)
      f.effects.add(flashCell(a.i, a.j))
      burst(f, a.i, a.j, [Palette.white, Palette.yellow1, Palette.cyan1], 8)
      f.spawnItem("glim", a.i, a.j)
      signal.playSound("bell", [0, 4, 7, 12, 16, 19][n % 6])
    })
  })
  return [...cleared]
}

/** The oddity actor delegates, by the catalog's `idle` / `pushed` name */
export const ODD_ACTORS: Record<string, new () => object> = {
  spore: SporeDelegate,
  piggy: PiggyDelegate,
  fin: FinDelegate,
  cloud: CloudDelegate,
  "conga-leader": CongaLeader,
  "conga-follower": CongaFollower,
  shadow: ShadowDelegate,
  book: BookDelegate,
  egg: EggDelegate,
  bird: BirdDelegate,
  fluff: FluffDelegate,
  slipper: SlipperDelegate,
  snail: SnailDelegate,
  "block-fish": BlockFishDelegate,
  echo: EchoDelegate,
}
