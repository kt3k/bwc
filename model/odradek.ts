// Odradek (ideas/goal-types.md, ご褒美; after Kafka, "Die Sorge des
// Hausvaters", 1919): a flat star-shaped spool of thread, old bits of
// thread knotted in, standing on one point and a rod. It is useless and
// harmless, and it does nothing for the player: that is the point. It
// turns up in one more corner of the island for every goal done
// (model/goal.ts), and it will probably outlive us all.
//
// - Where: the k-th Odradek has its home, from static/map/odradek.json
//   (tools/odradek_homes.ts): the hall of waystones on the START island
//   first, then the houses of the villages and cities of the WILDS, one
//   town after another. A home has a few corners (a floor cell with walls
//   on two adjacent sides), and the Odradek turns up in one of them, by
//   turns: another one each time it comes back into view.
// - When: the field spawns it when its home is near (game/field.ts,
//   checkActivate), like the other actors, but from the count of goals
//   done instead of from the map. Nothing in the maps changes.
// - What it does: mostly nothing. When the player comes within NEAR
//   cells it scuttles off, fast, to another corner nearby, and once there
//   it lets the player come up for a while. It can never be laid hold of:
//   a push never lands, it just moves off.
// - Talked to (standing by it, facing it), it answers in a line or two
//   and laughs, a laugh with no lungs behind it, like the rustling of
//   fallen leaves: a handful of leaves (model/leaf-wind.ts) scatter round
//   it. Then it is off again.
import { DIRS, nextGrid } from "../util/dir.ts"
import { CELL_SIZE } from "../util/constants.ts"
import * as signal from "../util/signals.ts"
import type { Actor, ActorPushedDelegate, IdleDelegate } from "./actor.ts"
import { goalsDone } from "./goal.ts"
import { EffectLeaf, LEAF_COLORS } from "./leaf-wind.ts"
import { face, manhattan, stepAway } from "./steering.ts"
import { rng, say } from "./townsfolk.ts"
import type { Dir, IActor, IField, PushedEvent } from "./types.ts"

/** A home of an Odradek (static/map/odradek.json) */
export type OdradekHome = {
  /** The town, or the hall */
  place: string
  /** The bounds it keeps to (world cells, walls inclusive) */
  box: [number, number, number, number]
  /** The corners it turns up in, by turns */
  corners: [number, number][]
}

let homes: OdradekHome[] = []

/** Sets the homes (tests), or loads them from the map */
export function setOdradekHomes(list: OdradekHome[]) {
  homes = list
}

/** Loads the homes; without them, no Odradek turns up */
export async function loadOdradekHomes(url = "map/odradek.json") {
  try {
    const res = await fetch(url)
    if (res.ok) homes = await res.json()
  } catch {
    // no Odradek
  }
}

/** The actor type */
export const ODRADEK = "odradek"
/** The actor id of the k-th Odradek */
export const odradekId = (k: number) => `odradek.${k}`

/** How many Odradeks there are: one for each goal done (as many as homes) */
export function odradekCount(done = goalsDone()): number {
  return Math.min(done, homes.length)
}

/** How many times each Odradek has turned up (this session) */
const visits = new Map<number, number>()

/** Forgets the visits (tests) */
export function resetOdradekVisits() {
  visits.clear()
}

/** An Odradek due on the field: its id, its home and where it turns up */
export type OdradekSpawn = {
  id: string
  k: number
  home: OdradekHome
  i: number
  j: number
}

/**
 * The Odradeks that should be on the field and aren't (`has` tells the
 * ones that are), each in the corner of its home it turns up in this
 * time, by turns: the first free one from the corner after last time's.
 * `canEnter` tells a free corner (not loaded counts as not free)
 */
export function dueOdradeks(
  has: (id: string) => boolean,
  canEnter: (i: number, j: number) => boolean,
  count = odradekCount(),
): OdradekSpawn[] {
  const out: OdradekSpawn[] = []
  for (let k = 0; k < count; k++) {
    const id = odradekId(k)
    if (has(id)) continue
    const home = homes[k]
    const n = home.corners.length
    const visit = visits.get(k) ?? 0
    for (let m = 0; m < n; m++) {
      const [i, j] = home.corners[(k + visit + m) % n]
      if (!canEnter(i, j)) continue
      out.push({ id, k, home, i, j })
      break
    }
  }
  return out
}

/** Records that the Odradek turned up (it picks the next corner next time) */
export function odradekTurnedUp(k: number) {
  visits.set(k, (visits.get(k) ?? 0) + 1)
}

// ---------------------------------------------------------------------
// the creature

/** It scuttles off when the player comes this near (manhattan) */
export const NEAR = 2
/** Once in a corner, it lets the player come near for this long */
export const CALM = 300
/** After a word, it stays this long before it is off */
export const LINGER = 60
/** Its speed scuttling off (a cell in 4 frames: the player's is 16) */
export const SCUTTLE = 4
/** How far it looks for another corner (manhattan, from where it is) */
export const REACH = 12

/** What it answers (one each time; after the story, cut short) */
export const ODRADEK_LINES = [
  "YOUR NAME? - ODRADEK",
  "WHERE DO YOU LIVE? - NO FIXED ABODE",
  "AND AFTER THAT? - NOTHING. WOODEN AS IT LOOKS",
]
/** Its laugh, shown with the leaves */
export const LAUGH = "(IT LAUGHS, LIKE FALLEN LEAVES RUSTLING)"
/** The leaves of its laugh */
export const LAUGH_LEAVES = 8

/** true at a corner: a bare floor (nothing put there, not even a gate one
 * walks into) with walls (or anything fixed) on a vertical side and a
 * horizontal side */
export function isCorner(field: IField, i: number, j: number): boolean {
  const free = (i: number, j: number) => field.canEnterStatic(i, j)
  return free(i, j) && !field.props.get(i, j) &&
    (!free(i, j - 1) || !free(i, j + 1)) &&
    (!free(i - 1, j) || !free(i + 1, j))
}

/** The bounds of its home, if it was told them */
const boxOf = (actor: Actor) =>
  (actor.data as { box?: OdradekHome["box"] } | undefined)?.box ?? null

/**
 * The way to another corner nearby, away from (fi, fj): the corner
 * farthest from there, at least NEAR + 1 away, the nearest of those to
 * walk to. Within its home's bounds, if it has one; never through
 * (fi, fj), and if it can, not by it either. null if there is none
 */
export function wayToCorner(
  actor: Actor,
  field: IField,
  fi: number,
  fj: number,
): Dir[] | null {
  return searchCorner(actor, field, fi, fj, 2) ??
    searchCorner(actor, field, fi, fj, 1)
}

/** wayToCorner, through cells `keepOff` or more from (fi, fj) */
function searchCorner(
  actor: Actor,
  field: IField,
  fi: number,
  fj: number,
  keepOff: number,
): Dir[] | null {
  const box = boxOf(actor)
  const passable = (i: number, j: number) =>
    field.canEnter(i, j) && manhattan(i, j, fi, fj) >= keepOff &&
    manhattan(i, j, actor.i, actor.j) <= REACH &&
    (!box || (i >= box[0] && i <= box[2] && j >= box[1] && j <= box[3]))
  const start = `${actor.i}.${actor.j}`
  const from = new Map<string, [string, Dir]>()
  const queue: [number, number][] = [[actor.i, actor.j]]
  const seen = new Set([start])
  let best: string | null = null
  let bestD = NEAR
  for (let n = 0; n < queue.length && n < 600; n++) {
    const [i, j] = queue[n]
    const key = `${i}.${j}`
    const d = manhattan(i, j, fi, fj)
    if (key !== start && d > bestD && isCorner(field, i, j)) {
      best = key
      bestD = d
    }
    for (const dir of DIRS) {
      const [ni, nj] = nextGrid(i, j, dir)
      const nk = `${ni}.${nj}`
      if (seen.has(nk) || !passable(ni, nj)) continue
      seen.add(nk)
      from.set(nk, [key, dir])
      queue.push([ni, nj])
    }
  }
  if (!best) return null
  const path: Dir[] = []
  for (let k = best; k !== start;) {
    const [prev, dir] = from.get(k)!
    path.unshift(dir)
    k = prev
  }
  return path
}

/**
 * The leaves of its laugh: a handful scattering round the cell (i, j),
 * each its own way, slow, then gone. `rand` is a 0..1 random source
 */
export function laughLeaves(
  i: number,
  j: number,
  rand: () => number = Math.random,
  count = LAUGH_LEAVES,
): EffectLeaf[] {
  const cx = i * CELL_SIZE + CELL_SIZE / 2
  const cy = j * CELL_SIZE + CELL_SIZE / 2
  return Array.from({ length: count }, (_, n) => {
    const a = (n / count + rand() * 0.1) * Math.PI * 2
    const speed = 0.4 + rand() * 0.4
    return new EffectLeaf(
      Math.round(cx + Math.cos(a) * 4),
      Math.round(cy + Math.sin(a) * 4),
      Math.cos(a) * speed,
      Math.sin(a) * speed,
      LEAF_COLORS[n % LEAF_COLORS.length],
      40 + Math.floor(rand() * 30),
      Math.floor(rand() * 10),
      Math.floor(rand() * 16),
    )
  })
}

/**
 * Odradek: sits in its corner; scuttles off to another when the player
 * comes near, and lets them come up for a while once there; never taken
 * by a push; talked to, it answers and laughs
 */
export class OdradekDelegate implements IdleDelegate, ActorPushedDelegate {
  #path: Dir[] = []
  #calmUntil = 0
  #leaveAt = 0
  #line = 0

  /** true while it is scuttling off */
  get isScuttling(): boolean {
    return this.#path.length > 0
  }

  onIdle(actor: Actor, field: IField): void {
    const me = field.me
    if (this.#path.length > 0) {
      this.#scuttle(actor, field)
      return
    }
    if (!me || me.id === actor.id) return
    const d = manhattan(me.i, me.j, actor.i, actor.j)
    if (this.#leaveAt > 0) {
      // said its piece: off it goes in a moment
      if (field.time >= this.#leaveAt) {
        this.#leaveAt = 0
        this.#flee(actor, field)
      }
      return
    }
    if (d <= NEAR && field.time >= this.#calmUntil) {
      this.#flee(actor, field)
      return
    }
    // idle: keeps an eye on whoever is near, or looks about now and then
    if (d <= 6) {
      if (field.time % 20 === 0) face(actor, me.i, me.j)
      return
    }
    const { randomInt, choice } = rng(actor, field)
    if (randomInt(150) === 0) actor.setDir(choice(DIRS))
  }

  /** A push never lands: it is off before it does */
  onPushed(_event: PushedEvent, actor: Actor, field: IField): void {
    if (this.#path.length === 0) this.#flee(actor, field)
  }

  onContact(actor: Actor, field: IField, by: IActor): void {
    if (by.id !== field.me?.id) return
    face(actor, by.i, by.j)
    say(actor, field, ODRADEK_LINES[this.#line % ODRADEK_LINES.length])
    this.#line++
    signal.message.update({ text: LAUGH })
    const { rng: random } = rng(actor, field)
    for (const leaf of laughLeaves(actor.i, actor.j, random)) {
      field.effects.add(leaf)
    }
    this.#leaveAt = field.time + LINGER
  }

  /** Makes for another corner nearby, or just away */
  #flee(actor: Actor, field: IField) {
    const me = field.me
    const path = wayToCorner(actor, field, me.i, me.j)
    if (path && path.length > 0) {
      this.#path = path
      this.#scuttle(actor, field)
      return
    }
    const { choice } = rng(actor, field)
    stepAway(actor, field, me.i, me.j, choice, SCUTTLE)
    this.#calmUntil = field.time + CALM
  }

  /** A step along the way; in its corner at last, it settles */
  #scuttle(actor: Actor, field: IField) {
    const dir = this.#path[0]
    const [ni, nj] = actor.nextGrid(dir)
    if (!field.canEnter(ni, nj)) {
      // someone in the way: another way, from here
      this.#path = []
      this.#flee(actor, field)
      return
    }
    this.#path.shift()
    actor.tryMove("go", dir, field, undefined, SCUTTLE)
    if (this.#path.length === 0) this.#calmUntil = field.time + CALM
  }
}
