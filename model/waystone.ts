// The waystones (ideas/wilds-roaming-todo.md, 6): an old stone stands in
// a circle of standing stones by each landmark of the WILDS. Touched, it
// wakes, and its gate in the hall of waystones on the START island opens:
// a portal back to it. A gate only opens for those who walked there.
//
// Whether a waystone is awake is kept with the collected item ids (as
// "waystone.<id>"), so it lasts in the save like a picked-up item.
import { DIRS } from "../util/dir.ts"
import { CELL_SIZE } from "../util/constants.ts"
import { Palette, type PaletteColor } from "../util/palette.ts"
import * as signal from "../util/signals.ts"
import { shake } from "../util/juice.ts"
import { linePattern0 } from "./effect.ts"
import { Item } from "./item.ts"
import type { Prop, PushedDelegate } from "./prop.ts"
import type {
  IActor,
  IColorBox,
  IField,
  IFinishable,
  IStepper,
  PushedEvent,
} from "./types.ts"

/** The collected-id key of the waystone */
export const waystoneKey = (id: string) => `waystone.${id}`

/** true once the player woke the waystone */
export function isAwake(id: string): boolean {
  return Item.isCollected(waystoneKey(id))
}

type WayData = {
  id?: string
  name?: string
  i?: number
  j?: number
  /** A gate by the waystone itself, leading home to the hall */
  home?: boolean
}
const dataOf = (prop: Prop) => (prop.data ?? {}) as WayData

/**
 * A mote of light rising from the stone: one pixel, a pixel every 3
 * frames, twinkling out at the end (on, off, on: no fading)
 */
export class EffectMote implements IColorBox, IFinishable, IStepper {
  #frame = 0
  readonly w = 1
  readonly h = 1
  constructor(
    readonly x0: number,
    readonly y0: number,
    readonly color: PaletteColor,
    readonly life = 36,
  ) {}
  step(_field: IField): void {
    this.#frame++
  }
  get x(): number {
    return this.x0
  }
  get y(): number {
    return this.y0 - Math.floor(this.#frame / 3)
  }
  get visible(): boolean {
    return this.#frame < this.life - 12 || (this.#frame >> 2) % 2 === 0
  }
  get finished(): boolean {
    return this.#frame >= this.life
  }
}

/** A small deterministic hash of the frame and the cell */
const roll = (field: IField, prop: Prop, salt: number) => {
  let h = (field.time * 374761393 + prop.i * 668265263 + prop.j * 2246822519 +
    salt * 3266489917) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * The motes over the stone: rare and gray while it sleeps, many, white
 * and pale blue while it is awake
 */
function motes(prop: Prop, field: IField, awake: boolean, height: number) {
  const every = awake ? 7 : 45
  if ((field.time + prop.i * 5 + prop.j * 3) % every !== 0) return
  const r = roll(field, prop, 1)
  const x = prop.i * CELL_SIZE + 3 + (r % 10)
  const y = prop.j * CELL_SIZE + height + ((r >> 8) % 4)
  const color = !awake
    ? Palette.gray1
    : (r >> 12) % 3 === 0
    ? Palette.cyan1
    : Palette.white
  field.effects.add(new EffectMote(x, y, color, awake ? 40 : 30))
}

/** The waystone, every frame: its face shows whether it is awake */
export function stepWaystone(prop: Prop, field: IField) {
  const awake = isAwake(dataOf(prop).id ?? "")
  prop.showStage(awake ? 1 : 0)
  motes(prop, field, awake, 2)
}

/** The waygate in the hall, every frame: open once its waystone woke */
export function stepWaygate(prop: Prop, field: IField) {
  const awake = isAwake(dataOf(prop).id ?? "")
  prop.showStage(awake ? 1 : 0)
  if (awake) motes(prop, field, true, 8)
}

/** Touching the waystone wakes it (once), with a chime and a burst of light */
export class WaystonePushed implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (event.pusher?.id !== "main") return
    const { id, name } = dataOf(prop)
    if (!id) return
    if (isAwake(id)) {
      signal.playSound("bell", 12)
      signal.message.update({
        text: `THE WAYSTONE OF ${name} HUMS. ITS GATE IS OPEN`,
      })
      return
    }
    Item.collect(waystoneKey(id))
    prop.showStage(1)
    shake(2)
    // a rising chime: the notes of a chord, one after another
    prop.enqueueActions(
      ...[0, 4, 7, 12].flatMap((note, n) => [
        { type: "wait" as const, until: field.time + 8 * n },
        { type: "call" as const, fn: () => signal.playSound("bell", note) },
      ]),
    )
    for (
      const effect of linePattern0(
        DIRS,
        prop.i,
        prop.j,
        1.5,
        0.7,
        4,
        Palette.white,
      )
    ) {
      field.effects.add(effect)
    }
    for (let k = 0; k < 16; k++) {
      const r = roll(field, prop, k + 7)
      field.effects.add(
        new EffectMote(
          prop.i * CELL_SIZE - 8 + (r % 32),
          prop.j * CELL_SIZE + 4 + ((r >> 8) % 12),
          k % 3 === 0 ? Palette.cyan1 : Palette.white,
          40 + ((r >> 16) % 24),
        ),
      )
    }
    signal.message.update({
      text:
        `THE WAYSTONE OF ${name} WAKES. ITS GATES OPEN, HERE AND IN THE HALL`,
    })
  }
}

/**
 * Stepping on a waygate: through it if its waystone woke. The gates in the
 * hall lead to their waystones; the gate by each waystone (home) leads
 * back to the hall
 */
export function enterWaygate(prop: Prop, actor: IActor) {
  if (actor.id !== "main") return
  const { id, name, i, j, home } = dataOf(prop)
  if (!id || !isAwake(id)) {
    signal.playSound("blipSelect")
    signal.message.update({
      text: home
        ? `THE GATE SLEEPS. THE WAYSTONE OF ${name} WAKES IT`
        : `THE GATE OF ${name} SLEEPS. ITS WAYSTONE IS OUT IN THE WILDS`,
    })
    return
  }
  if (typeof i !== "number" || typeof j !== "number") return
  location.hash = ""
  setTimeout(() => location.replace(`#${i},${j}`), 10)
}
