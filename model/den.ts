// The animal homes (ideas/animal-homes.md): where the animals of the
// WILDS live, each with its way of being won over or outwitted.
//
// - the warren: rabbits graze round their holes; come close and one
//   bolts down the nearest hole and pops up out of another. An apple
//   holds one still to nibble it; pat it then and it leaves a clover
// - the sheep pen: a fenced fold with a gate; drive the flock in and the
//   gate shuts on them, and the shepherd pays
// - the fox's den: the fox keeps a hoard of shiny things and guards it;
//   a fish puts it to sleep, and then the hoard can be taken
// - the beehive: the bees buzz round it and go out to the flowers by
//   turns; bump it while they are home and they drive you off, while
//   they are out and there is a honeycomb in it
//
// What has been won is kept with the collected item ids (as
// "warren.<id>", "pen.<id>", "den.<id>", "hive.<id>").
import { DIRS } from "../util/dir.ts"
import { Palette, type PaletteColor } from "../util/palette.ts"
import * as signal from "../util/signals.ts"
import { shake } from "../util/juice.ts"
import { seed } from "../util/random.ts"
import type { Actor } from "./actor.ts"
import { eatBait, findBait, stepToBait } from "./bait.ts"
import { linePattern0 } from "./effect.ts"
import { Item } from "./item.ts"
import { scatter } from "./oddities.ts"
import type { Prop, PushedDelegate } from "./prop.ts"
import { face, manhattan, stepAway, stepToward } from "./steering.ts"
import type { IActor, IField, PushedEvent } from "./types.ts"

type DenData = { id?: string }
const idOf = (prop: Prop) => ((prop.data ?? {}) as DenData).id ?? ""

const say = (prop: Prop, text: string, dir?: string) =>
  signal.speech.update({ i: prop.i, j: prop.j, text, below: dir === "down" })

function sparkle(
  field: IField,
  i: number,
  j: number,
  color: PaletteColor = Palette.white,
) {
  for (const effect of linePattern0(DIRS, i, j, 1, 0.7, 2, color)) {
    field.effects.add(effect)
  }
}

/** The props of the type within the manhattan range, nearest first */
function propsNear(
  field: IField,
  type: string,
  i: number,
  j: number,
  range: number,
): Prop[] {
  const found: Prop[] = []
  for (const p of field.props.iter()) {
    if (p.type === type && manhattan(p.i, p.j, i, j) <= range) {
      found.push(p as Prop)
    }
  }
  return found.sort((a, b) =>
    manhattan(a.i, a.j, i, j) - manhattan(b.i, b.j, i, j)
  )
}

/** The actors of the type within the manhattan range */
function actorsNear(
  field: IField,
  type: string,
  i: number,
  j: number,
  range: number,
): IActor[] {
  const found: IActor[] = []
  for (const a of field.actors.iter()) {
    if (a.type === type && manhattan(a.i, a.j, i, j) <= range) found.push(a)
  }
  return found
}

// ---------------------------------------------------------------------
// the warren

/** The holes a rabbit is down, and when it comes up (field time) */
const popping = new Map<string, number>()
const holeKey = (prop: Prop) => `${prop.i}.${prop.j}`

/** How long a rabbit stays down a hole (frames) */
export const BURROWED = 150
/** How long an apple holds a rabbit (frames) */
export const NIBBLE = 600

/** The hole shows ears while a rabbit is down it; then the rabbit pops up */
export function stepRabbitHole(prop: Prop, field: IField) {
  const at = popping.get(holeKey(prop))
  prop.showStage(at === undefined ? 0 : 1)
  if (at === undefined || field.time < at) return
  if (field.actors.get(prop.i, prop.j).length > 0) return
  popping.delete(holeKey(prop))
  const rabbit = field.spawnActor("rabbit", prop.i, prop.j, "down")
  rabbit?.enqueueActions({ type: "jump" })
}

/** Down the hole: up again out of another hole of the warren */
function burrow(actor: IActor, hole: Prop, field: IField) {
  const warren = propsNear(field, "rabbit-hole", hole.i, hole.j, 10)
    .filter((h) => idOf(h) === idOf(hole) && !popping.has(holeKey(h)))
  const others = warren.filter((h) => h !== hole)
  const { choice } = seed(`${actor.id}.${field.time}`)
  const out = others.length > 0 ? choice(others) : hole
  field.actors.remove(actor)
  popping.set(holeKey(out), field.time + BURROWED)
  signal.playSound("blipSelect")
}

export class RabbitDelegate {
  #nextStep = 0
  #home: [number, number] | null = null
  #nibbleUntil = 0

  onIdle(actor: Actor, field: IField): void {
    const home = this.#home ??= [actor.i, actor.j]
    if (field.time < this.#nextStep || field.time < this.#nibbleUntil) return
    const me = field.me
    const near = me && me.id !== actor.id &&
      manhattan(me.i, me.j, actor.i, actor.j) <= 3
    if (!near) {
      const apple = findBait(field, actor.i, actor.j, "apple", 6)
      if (apple) {
        if (apple.i === actor.i && apple.j === actor.j) {
          eatBait(actor, field, apple, "THE RABBIT NIBBLES THE APPLE")
          this.#nibbleUntil = field.time + NIBBLE
          return
        }
        if (stepToBait(actor, field, apple)) {
          this.#nextStep = field.time + 10
          return
        }
      }
      // grazing: a hop now and then, never far from home
      const { randomInt, choice } = seed(`${actor.id}.${field.time}`)
      if (randomInt(90) !== 0) return
      const dirs = DIRS.filter((d) => {
        const [ni, nj] = actor.nextGrid(d)
        return field.canEnter(ni, nj) &&
          manhattan(ni, nj, home[0], home[1]) <= 3
      })
      if (dirs.length > 0) actor.tryMove("go", choice(dirs), field)
      this.#nextStep = field.time + 30
      return
    }
    // bolts for the nearest hole of the warren
    const hole = propsNear(field, "rabbit-hole", actor.i, actor.j, 6)[0]
    if (hole && hole.i === actor.i && hole.j === actor.j) {
      burrow(actor, hole, field)
      return
    }
    this.#nextStep = field.time + 4
    if (hole && stepToward(actor, field, hole.i, hole.j, 4)) return
    const { choice } = seed(`${actor.id}.${field.time}`)
    stepAway(actor, field, me!.i, me!.j, choice, 4)
  }

  onContact(actor: Actor, field: IField, by: IActor): void {
    if (by.id !== "main" || field.time >= this.#nibbleUntil) {
      if (actor.isActionQueueEmpty()) actor.enqueueActions({ type: "jump" })
      return
    }
    // patted while nibbling: it thumps its foot, glad of you
    face(actor, by.i, by.j)
    actor.enqueueActions({ type: "jump" })
    sparkle(field, actor.i, actor.j, Palette.pink2)
    const hole = propsNear(field, "rabbit-hole", actor.i, actor.j, 12)[0]
    const key = `warren.${hole ? idOf(hole) : `${actor.i}.${actor.j}`}`
    if (Item.isCollected(key)) {
      signal.message.update({ text: "THE RABBIT THUMPS ITS FOOT" })
      return
    }
    Item.collect(key)
    signal.playSound("powerUp")
    signal.message.update({
      text: "THE RABBIT THUMPS ITS FOOT. IT LEFT A FOUR-LEAF CLOVER",
    })
    scatter(field, "herb", actor.i, actor.j, 1, {
      avoid: [by.i, by.j],
      reach: 1,
    })
  }
}

// ---------------------------------------------------------------------
// the sheep pen

type PenData = DenData & {
  i0?: number
  j0?: number
  i1?: number
  j1?: number
  count?: number
}

/** The coins for a full fold */
export const PEN_REWARD = 30

/** The sheep standing inside the pen's rectangle */
export function sheepInPen(field: IField, data: PenData): number {
  let n = 0
  for (const a of field.actors.iter()) {
    if (
      a.type === "sheep" && a.i >= data.i0! && a.i <= data.i1! &&
      a.j >= data.j0! && a.j <= data.j1!
    ) n++
  }
  return n
}

/** The gate shuts once the whole flock is in */
export function stepPenGate(prop: Prop, field: IField) {
  const data = (prop.data ?? {}) as PenData
  const key = `pen.${data.id}`
  const occupied = field.actors.get(prop.i, prop.j).length > 0
  if (Item.isCollected(key)) {
    // (not on whoever stands in the gateway)
    if (occupied) return
    prop.setOpen(false, false)
    prop.showStage(1)
    return
  }
  prop.showStage(0)
  if (field.time % 20 !== 0 || data.i0 === undefined) return
  if (sheepInPen(field, data) < (data.count ?? 1)) return
  if (occupied) return
  Item.collect(key)
  prop.setOpen(false, false)
  prop.showStage(1)
  signal.coinCount.update(signal.coinCount.get() + PEN_REWARD)
  signal.playSound("powerUp")
  shake(6)
  sparkle(field, prop.i, prop.j)
  say(prop, `THE FOLD IS FULL. THE GATE SWINGS SHUT. ${PEN_REWARD} COINS`)
}

// ---------------------------------------------------------------------
// the fox's den

/** The hoard: a gem and some coins */
export const HOARD_COINS = 4

/** The den shows its glint until the hoard is taken */
export function stepFoxDen(prop: Prop, _field: IField) {
  prop.showStage(Item.isCollected(`den.${idOf(prop)}`) ? 1 : 0)
}

/** true if a fox near the den is awake to guard it */
export function denGuarded(field: IField, i: number, j: number): boolean {
  return actorsNear(field, "fox", i, j, 12).some((fox) =>
    ((fox as Actor).buff.asleepUntil as number | undefined ?? 0) <= field.time
  )
}

export class FoxDenPushed implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (event.pusher?.id !== "main") return
    const key = `den.${idOf(prop)}`
    if (Item.isCollected(key)) {
      say(prop, "THE DEN IS EMPTY. A FEW HAIRS, NOTHING SHINY", event.dir)
      return
    }
    if (denGuarded(field, prop.i, prop.j)) {
      for (const fox of actorsNear(field, "fox", prop.i, prop.j, 12)) {
        face(fox as Actor, event.pusher.i, event.pusher.j)
        fox.enqueueActions({ type: "jump" })
      }
      signal.playSound("hitHurt")
      say(prop, "A FOX BRISTLES AND YAPS. SOMETHING GLINTS IN THERE", event.dir)
      return
    }
    Item.collect(key)
    signal.playSound("powerUp")
    shake(6)
    sparkle(field, prop.i, prop.j)
    say(prop, "THE FOX'S HOARD! IT SLEEPS ON, NONE THE WISER", event.dir)
    const avoid = [event.pusher.i, event.pusher.j] as const
    scatter(field, "gem", prop.i, prop.j, 1, { avoid, reach: 2 })
    scatter(field, "coin", prop.i, prop.j, HOARD_COINS, { avoid, reach: 2 })
  }
}

// ---------------------------------------------------------------------
// the beehive

/** The bees' day: home for the first part of it, out at the flowers after */
export const BEE_DAY = 1500
export const BEES_HOME = 900
/** How many bees buzz round a hive */
export const SWARM = 3

/** true while the hive's bees are home */
export function beesHome(id: string, time: number): boolean {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (time + h) % BEE_DAY < BEES_HOME
}

/** Keeps the swarm round the hive while the bees are home; sends them off */
export function stepBeehive(prop: Prop, field: IField) {
  const id = idOf(prop)
  prop.showStage(Item.isCollected(`hive.${id}`) ? 1 : 0)
  if (field.time % 30 !== 0) return
  const bees = actorsNear(field, "bee", prop.i, prop.j, 6)
  if (!beesHome(id, field.time)) {
    for (const bee of bees) (bee as Actor).buff.leaving = true
    return
  }
  const missing = SWARM - bees.length
  if (missing <= 0) return
  const spots = DIRS.map((d) => {
    const [di, dj] = d === "up"
      ? [0, -1]
      : d === "down"
      ? [0, 1]
      : d === "left"
      ? [-1, 0]
      : [1, 0]
    return [prop.i + di, prop.j + dj]
  }).filter(([i, j]) => field.canEnter(i, j))
  if (spots.length === 0) return
  const [i, j] = spots[field.time % spots.length]
  const bee = field.spawnActor("bee", i, j, "down") as Actor | null
  if (bee) bee.buff.hive = [prop.i, prop.j]
}

/** How long the bees chase after the hive is bumped (frames) */
export const ANGRY = 300

export class BeeDelegate {
  #nextStep = 0
  #stungAt = -Infinity

  onIdle(actor: Actor, field: IField): void {
    if (field.time < this.#nextStep) return
    const hive = (actor.buff.hive as [number, number] | undefined) ??
      [actor.i, actor.j]
    const me = field.me
    const angry = (actor.buff.angryUntil as number | undefined ?? 0) >
      field.time
    if (angry && me && me.id !== actor.id) {
      this.#nextStep = field.time + 6
      if (manhattan(me.i, me.j, actor.i, actor.j) <= 1) {
        this.#sting(actor, me as Actor, field)
        return
      }
      stepToward(actor, field, me.i, me.j, 2)
      return
    }
    if (actor.buff.leaving) {
      // off to the flowers, over everything, and out of sight
      const flown = (actor.buff.flown as number | undefined) ?? 0
      if (flown >= 8) {
        field.actors.remove(actor)
        return
      }
      actor.buff.flown = flown + 1
      actor.speed = 2
      actor.forceMove(flown % 2 === 0 ? "up" : "right")
      return
    }
    // buzzing round the hive
    this.#nextStep = field.time + 12
    const { choice } = seed(`${actor.id}.${field.time}`)
    const dirs = DIRS.filter((d) => {
      const [ni, nj] = actor.nextGrid(d)
      return field.canEnter(ni, nj) && manhattan(ni, nj, hive[0], hive[1]) <= 2
    })
    if (dirs.length > 0) actor.tryMove("go", choice(dirs), field, undefined, 2)
  }

  #sting(actor: Actor, me: Actor, field: IField) {
    if (field.time - this.#stungAt < 40) return
    this.#stungAt = field.time
    face(actor, me.i, me.j)
    // the player is driven back a step, away from the bee
    const away = DIRS.find((d) => {
      const [ni, nj] = me.nextGrid(d)
      return manhattan(ni, nj, actor.i, actor.j) > 1 && field.canEnter(ni, nj)
    })
    if (away && me.isActionQueueEmpty()) {
      me.enqueueActions({ type: "slide", dir: away, speed: 4 })
    }
    signal.playSound("hitHurt")
    shake(4)
    signal.message.update({ text: "OUCH! THE BEES DRIVE YOU OFF" })
  }

  onPushed(_event: PushedEvent, actor: Actor, field: IField): void {
    actor.buff.angryUntil = field.time + ANGRY
  }
}

export class BeehivePushed implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    if (event.pusher?.id !== "main") return
    const id = idOf(prop)
    const bees = actorsNear(field, "bee", prop.i, prop.j, 6)
    if (bees.length > 0) {
      for (const bee of bees) {
        ;(bee as Actor).buff.angryUntil = field.time + ANGRY
      }
      signal.playSound("hitHurt")
      say(prop, "BZZZZ! THE BEES POUR OUT AT YOU", event.dir)
      return
    }
    const key = `hive.${id}`
    if (Item.isCollected(key)) {
      say(prop, "A QUIET HIVE. NO HONEY TO SPARE", event.dir)
      return
    }
    Item.collect(key)
    signal.playSound("powerUp")
    sparkle(field, prop.i, prop.j, Palette.brown2)
    say(prop, "THE BEES ARE OUT AT THE FLOWERS. A HONEYCOMB!", event.dir)
    scatter(field, "honey", prop.i, prop.j, 1, {
      avoid: [event.pusher!.i, event.pusher!.j],
      reach: 1,
    })
  }
}
