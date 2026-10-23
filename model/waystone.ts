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
import type { Actor } from "./actor.ts"
import type {
  Dir,
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
    // a bird flies up and leads on to the next waystone
    spawnLeadBird(field, prop.i, prop.j, id)
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

// ---------------------------------------------------------------------
// The bird by the waystone (docs/research-open-world-tedium.md, E-2): as
// a waystone wakes, a bird flies up by it and leads on to the nearest
// waystone still asleep, Ghost of Tsushima's yellow bird with no marker
// on the screen. It flies a short hop, lands and waits; come near and it
// flies on. Leave it and it gives up and flies off. At the next stone it
// waits once more for you, and then it is gone.

/** A waystone of the WILDS: its id, its name and its gate home */
export type WaystoneSite = { id: string; name: string; i: number; j: number }

let sites: WaystoneSite[] = []

/** Sets the waystones of the WILDS (tests), or loads them from the map */
export function setWaystones(list: WaystoneSite[]) {
  sites = list
}

/**
 * Loads the waystones of the WILDS from the hall of waystones on the
 * START island: each gate there names its waystone and leads to the gate
 * by it. Without them, no bird leads anywhere
 */
export async function loadWaystones(url = "map/block_-10000.-10000.json") {
  try {
    const res = await fetch(url)
    if (!res.ok) return
    const json = await res.json() as {
      props?: { type: string; data?: WayData }[]
    }
    sites = (json.props ?? []).flatMap(({ type, data }) =>
      type === "waygate" && data && !data.home && data.id &&
        typeof data.i === "number" && typeof data.j === "number"
        ? [{ id: data.id, name: data.name ?? data.id, i: data.i, j: data.j }]
        : []
    )
  } catch {
    // no waystones known
  }
}

/** The nearest waystone still asleep, from (i, j); none once all woke */
export function nextWaystone(
  i: number,
  j: number,
  awake: (id: string) => boolean = isAwake,
): WaystoneSite | undefined {
  let best: WaystoneSite | undefined
  let bestD = Infinity
  for (const s of sites) {
    if (awake(s.id)) continue
    const d = Math.hypot(s.i - i, s.j - j)
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

/** Cells the bird flies in one hop (it stays on the screen) */
export const BIRD_HOP = 10
/** The player this near (cells) sends the waiting bird on */
export const BIRD_NEAR = 4
/** Farther than this (cells), the player is going away from the bird */
export const BIRD_FAR = 16
/** Frames the player may stay far off before the bird gives up */
export const BIRD_GIVE_UP = 300
/** This near to its waystone's gate (cells), the bird is there */
export const BIRD_ARRIVE = 2

/** The leading bird's state, kept in its buff */
type Lead = {
  id: string
  name: string
  i: number
  j: number
  /** Cells left to fly in this hop (0: landed, waiting) */
  hop: number
  /** Frames the player has been far off */
  far: number
  /** At the waystone */
  arrived: boolean
  /** Told the player it leads */
  told: boolean
}

const cheb = (i0: number, j0: number, i1: number, j1: number) =>
  Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0))

/** The way to step from (di, dj) off: along the longer side first */
function toward(di: number, dj: number): Dir {
  if (Math.abs(di) >= Math.abs(dj)) return di > 0 ? "right" : "left"
  return dj > 0 ? "down" : "up"
}

/** The bird gives up leading: flies off over everything (BirdDelegate) */
function flyOff(actor: Actor) {
  delete actor.buff.lead
  actor.buff.flown = 0
}

/**
 * The leading bird, when idle: flies its hop toward the waystone, or
 * waits for the player. Returns false for a bird that leads nowhere
 */
export function leadBird(actor: Actor, field: IField): boolean {
  const lead = actor.buff.lead as Lead | undefined
  if (!lead) return false
  if (lead.hop > 0) {
    if (cheb(actor.i, actor.j, lead.i, lead.j) <= BIRD_ARRIVE) {
      lead.hop = 0
      lead.arrived = true
    } else {
      lead.hop--
      actor.speed = 4
      actor.forceMove(toward(lead.i - actor.i, lead.j - actor.j))
      return true
    }
  }
  // landed: waits for the player
  const me = field.me
  const away = me ? cheb(me.i, me.j, actor.i, actor.j) : Infinity
  if (away <= BIRD_NEAR) {
    lead.far = 0
    if (lead.arrived || isAwake(lead.id)) {
      // there (or someone woke it meanwhile): its work is done
      flyOff(actor)
      return true
    }
    if (!lead.told) {
      lead.told = true
      signal.message.update({
        text: `THE BIRD FLIES ON, TOWARD THE WAYSTONE OF ${lead.name}`,
      })
    }
    lead.hop = BIRD_HOP
    return true
  }
  if (away > BIRD_FAR) {
    if (++lead.far >= BIRD_GIVE_UP) flyOff(actor)
  } else {
    lead.far = 0
  }
  return true
}

/**
 * A bird flies up by the just woken waystone and leads on to the nearest
 * one still asleep (if any is). Returns the bird
 */
export function spawnLeadBird(
  field: IField,
  i: number,
  j: number,
  from: string,
): IActor | null {
  if (!sites.some((s) => s.id === from)) return null // not of the WILDS
  const next = nextWaystone(i, j)
  if (!next) return null
  const cell = ([[0, -1], [1, 0], [0, 1], [-1, 0]] as const)
    .map(([di, dj]) => [i + di, j + dj] as const)
    .find(([ci, cj]) => field.canEnter(ci, cj))
  if (!cell) return null
  const bird = field.spawnActor(
    "bird",
    cell[0],
    cell[1],
    toward(next.i - i, next.j - j),
  ) as Actor | null
  if (!bird) return null
  const lead: Lead = {
    id: next.id,
    name: next.name,
    i: next.i,
    j: next.j,
    hop: BIRD_HOP,
    far: 0,
    arrived: false,
    told: false,
  }
  bird.buff.lead = lead
  // it hops up, and after a moment takes off
  bird.enqueueActions(
    { type: "jump" },
    { type: "wait", until: field.time + 40 },
  )
  return bird
}
