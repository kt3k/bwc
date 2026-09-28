// The townsfolk: NPCs that make a town feel lived in (see
// ideas/game-ideas-5.md).
//
// - villager: runs errands between the landmarks near its home (shop,
//   well, tables, stools, flower beds, signs, lanterns), lingers at each, goes home to
//   rest, stops to chat with the villagers it meets, and talks back when
//   the player bumps into it
// - keeper: minds its stall. Watches whoever comes near, greets the
//   player, and tidies up (a step aside and back) when nobody is around
// - kid: plays tag with the other kids. The one who is "it" runs after
//   the others (and after the player, who can join in)
// - cat: naps, strolls, keeps clear of strangers; pet it and it follows
//   you for a while
import { DIRS, opposite, UP } from "../util/dir.ts"
import { Palette, type PaletteColor } from "../util/palette.ts"
import { seed } from "../util/random.ts"
import * as signal from "../util/signals.ts"
import type { Actor, ActorPushedDelegate, IdleDelegate } from "./actor.ts"
import { linePattern0 } from "./effect.ts"
import { face, findPath, manhattan, stepAway, stepToward } from "./steering.ts"
import type { Dir, IActor, IField, IProp, PushedEvent } from "./types.ts"

/** A small puff above the head: talking, counting, purring */
function puff(field: IField, actor: IActor, color: PaletteColor) {
  for (
    const effect of linePattern0([UP], actor.i, actor.j, 0.5, 0.5, 1, color)
  ) {
    field.effects.add(effect)
  }
}

/** A deterministic random source for the actor at this frame */
function rng(actor: IActor, field: IField) {
  return seed(`${actor.id}.${field.time}`)
}

// ---------------------------------------------------------------------
// villager

/** The props a villager may run an errand to */
export const LANDMARKS = new Set([
  "shop",
  "table",
  "stool",
  "sign",
  "lantern",
  "lantern-unlit",
  "chest",
  "fish-shrine",
  "sapling",
  "well",
  "barrel",
  "jar",
  "flowers",
  "notice-board",
  "sign-inn",
  "sign-weapon",
  "sign-armor",
  "sign-item",
  "sign-magic",
  "sign-pub",
])

const VILLAGER_LINES = [
  "NICE DAY, ISN'T IT?",
  "HAVE YOU BEEN TO THE SHOP?",
  "I'M OFF ON AN ERRAND",
  "THE CATS HERE LOVE A PAT",
  "THOSE KIDS NEVER STOP PLAYING TAG",
  "I DROPPED A COIN SOMEWHERE...",
  "WELCOME TO OUR TOWN!",
]

/** The villagers on the field, to find someone to chat with */
const villagers = new WeakMap<IActor, VillagerDelegate>()

/**
 * Runs errands: picks a landmark within the range of its home, walks
 * there by the shortest path, lingers a while facing it, and after a
 * few errands goes home to rest. Two villagers who meet stop and chat.
 */
export class VillagerDelegate implements IdleDelegate, ActorPushedDelegate {
  /** How far from home the errands go */
  #range: number
  #home: [number, number] | null = null
  #path: Dir[] = []
  /** Where the villager is heading: a landmark, or home */
  #target: [number, number] | null = null
  #goingHome = false
  #lingerUntil = 0
  #errands = 0
  #waited = 0
  #lastLandmark = ""
  #chatUntil = 0
  #chatWith: [number, number] | null = null
  #chatCooldownUntil = 0
  #line = -1

  constructor(range = 10) {
    this.#range = range
  }

  get isChatting(): boolean {
    return this.#chatWith !== null
  }

  onIdle(actor: Actor, field: IField): void {
    villagers.set(actor, this)
    const home = this.#home ??= [actor.i, actor.j]
    if (this.#chatWith) {
      if (field.time < this.#chatUntil) {
        face(actor, ...this.#chatWith)
        if (field.time % 45 === 0) {
          puff(field, actor, Palette.white)
        }
        return
      }
      this.#chatWith = null
    }
    if (field.time < this.#lingerUntil) {
      return
    }
    if (this.#path.length > 0) {
      if (this.#startChat(actor, field)) {
        return
      }
      const dir = this.#path[0]
      const [ni, nj] = actor.nextGrid(dir)
      if (field.canEnter(ni, nj)) {
        this.#path.shift()
        this.#waited = 0
        actor.tryMove("go", dir, field)
        return
      }
      // Someone is in the way. Waits, then gives up on this errand
      actor.setDir(dir)
      if (++this.#waited > 60) {
        this.#path = []
        this.#target = null
        this.#waited = 0
        this.#lingerUntil = field.time + 30
      }
      return
    }
    const { randomInt } = rng(actor, field)
    if (this.#target) {
      if (this.#goingHome) {
        // Home: rests a good while
        this.#goingHome = false
        this.#lingerUntil = field.time + 300 + randomInt(300)
      } else {
        // Arrived: lingers at the landmark
        face(actor, ...this.#target)
        this.#errands += 1
        this.#lingerUntil = field.time + 120 + randomInt(180)
      }
      this.#target = null
      return
    }
    if (this.#errands >= 3) {
      // Enough errands: goes home
      this.#errands = 0
      const path = this.#pathTo(
        actor,
        field,
        (i, j) => i === home[0] && j === home[1],
      )
      if (path) {
        this.#path = path
        this.#target = home
        this.#goingHome = true
      } else {
        this.#lingerUntil = field.time + 60
      }
      return
    }
    this.#pickErrand(actor, field)
  }

  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    const pusher = event.pusher
    if (!pusher) {
      return
    }
    // Turns to whoever bumped into it and has a word
    this.#chatWith = [pusher.i, pusher.j]
    this.#chatUntil = field.time + 120
    face(actor, pusher.i, pusher.j)
    if (pusher.id === "main") {
      if (this.#line < 0) {
        this.#line = seed(actor.id).randomInt(VILLAGER_LINES.length)
      }
      signal.message.update({ text: VILLAGER_LINES[this.#line] })
      this.#line = (this.#line + 1) % VILLAGER_LINES.length
      puff(field, actor, Palette.white)
    }
  }

  /** Stops to chat with a villager next to it, if both are free */
  #startChat(actor: Actor, field: IField): boolean {
    if (field.time < this.#chatCooldownUntil) {
      return false
    }
    for (const dir of DIRS) {
      const [ni, nj] = actor.nextGrid(dir)
      for (const other of field.actors.get(ni, nj)) {
        const delegate = villagers.get(other)
        if (
          !delegate || delegate === this || delegate.isChatting ||
          field.time < delegate.#chatCooldownUntil
        ) {
          continue
        }
        const until = field.time + 150
        this.#chatWith = [ni, nj]
        this.#chatUntil = until
        this.#chatCooldownUntil = until + 900
        delegate.#chatWith = [actor.i, actor.j]
        delegate.#chatUntil = until
        delegate.#chatCooldownUntil = until + 900
        face(actor, ni, nj)
        puff(field, actor, Palette.white)
        return true
      }
    }
    return false
  }

  #pickErrand(actor: Actor, field: IField) {
    const home = this.#home!
    const { choice } = rng(actor, field)
    const landmarks: IProp[] = []
    for (const prop of field.props.iter()) {
      if (
        LANDMARKS.has(prop.type) &&
        manhattan(prop.i, prop.j, home[0], home[1]) <= this.#range &&
        `${prop.i}.${prop.j}` !== this.#lastLandmark
      ) {
        landmarks.push(prop)
      }
    }
    if (landmarks.length > 0) {
      const prop = choice(landmarks)
      const path = this.#pathTo(
        actor,
        field,
        (i, j) =>
          prop.canEnter
            ? i === prop.i && j === prop.j // sits on the stool
            : manhattan(i, j, prop.i, prop.j) === 1,
      )
      if (path) {
        this.#path = path
        this.#target = [prop.i, prop.j]
        this.#lastLandmark = `${prop.i}.${prop.j}`
        return
      }
    }
    // Nowhere to go: a stroll around the spot
    const dirs = DIRS.filter((d) => {
      const [ni, nj] = actor.nextGrid(d)
      return field.canEnter(ni, nj) &&
        manhattan(ni, nj, home[0], home[1]) <= this.#range
    })
    if (dirs.length > 0) {
      actor.tryMove("go", choice(dirs), field)
    }
    this.#lingerUntil = field.time + 60
  }

  #pathTo(
    actor: Actor,
    field: IField,
    isGoal: (i: number, j: number) => boolean,
  ): Dir[] | null {
    const home = this.#home!
    return findPath(
      actor.i,
      actor.j,
      isGoal,
      (i, j) =>
        field.canEnterStatic(i, j) &&
        manhattan(i, j, home[0], home[1]) <= this.#range + 2,
    )
  }
}

// ---------------------------------------------------------------------
// keeper

const KEEPER_LINES = [
  "WHAT CAN I GET YOU?",
  "FRESH GOODS TODAY!",
  "PUSH THE STALL TO BUY",
  "COME BACK ANYTIME!",
]

/**
 * Minds its stall: faces the nearest person within the range, greets
 * the player once per visit, and when nobody is around steps aside to
 * tidy up, then back to its post.
 */
export class KeeperDelegate implements IdleDelegate, ActorPushedDelegate {
  #range: number
  #post: [number, number] | null = null
  #greeted = false
  #nextTidy = 0
  #backAt = 0
  #line = 0

  constructor(range = 5) {
    this.#range = range
  }

  onIdle(actor: Actor, field: IField): void {
    const post = this.#post ??= [actor.i, actor.j]
    const me = field.me
    const { randomInt, choice } = rng(actor, field)
    const away = actor.i !== post[0] || actor.j !== post[1]
    if (away && field.time >= this.#backAt) {
      // Back to the post
      if (!stepToward(actor, field, post[0], post[1])) {
        this.#backAt = field.time + 30
      }
      return
    }
    // Watches the nearest person
    let nearest: IActor | null = null
    let best = this.#range + 1
    for (const other of field.actors.iter()) {
      if (other.id === actor.id) {
        continue
      }
      const d = manhattan(other.i, other.j, actor.i, actor.j)
      if (d < best) {
        best = d
        nearest = other
      }
    }
    if (nearest) {
      face(actor, nearest.i, nearest.j)
    }
    if (me && me.id !== actor.id) {
      const d = manhattan(me.i, me.j, actor.i, actor.j)
      if (d <= 3 && !this.#greeted) {
        this.#greeted = true
        signal.message.update({ text: "WELCOME! TAKE A LOOK" })
        puff(field, actor, Palette.brown2)
      } else if (d > 6) {
        this.#greeted = false
      }
    }
    if (nearest || away) {
      return
    }
    if (field.time >= this.#nextTidy) {
      this.#nextTidy = field.time + 300 + randomInt(240)
      const dirs = DIRS.filter((d) => {
        const [ni, nj] = actor.nextGrid(d)
        return field.canEnter(ni, nj)
      })
      if (dirs.length > 0) {
        actor.tryMove("go", choice(dirs), field)
        this.#backAt = field.time + 60 + randomInt(60)
      }
    }
  }

  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    const pusher = event.pusher
    if (!pusher) {
      return
    }
    face(actor, pusher.i, pusher.j)
    if (pusher.id === "main") {
      signal.message.update({ text: KEEPER_LINES[this.#line] })
      this.#line = (this.#line + 1) % KEEPER_LINES.length
      puff(field, actor, Palette.brown2)
    }
  }
}

// ---------------------------------------------------------------------
// kid

/** The kids on the field, to find the playmates */
const kids = new WeakMap<IActor, KidDelegate>()
/** True while the player is "it" (tagged by a kid) */
let playerIsIt = false

/** Resets the tag game (for tests) */
export function resetTag() {
  playerIsIt = false
}

/** True while the player is "it" */
export function isPlayerIt(): boolean {
  return playerIsIt
}

/**
 * Plays tag. With no "it" among the kids around, one becomes "it",
 * counts to three, then runs after the nearest kid at double speed; a
 * bump tags the other kid, who counts in turn. The others run from "it"
 * and wander around their home spot otherwise. The player gets tagged
 * when "it" catches them, and tags back by bumping into a kid.
 */
export class KidDelegate implements IdleDelegate, ActorPushedDelegate {
  #home: [number, number] | null = null
  #it = false
  #countUntil = 0
  #restUntil = 0
  /** The playing range around home */
  #range: number

  constructor(range = 8) {
    this.#range = range
  }

  get isIt(): boolean {
    return this.#it
  }

  /** Becomes "it": counts to three before chasing */
  becomeIt(field: IField) {
    this.#it = true
    this.#countUntil = field.time + 90
  }

  onIdle(actor: Actor, field: IField): void {
    kids.set(actor, this)
    const home = this.#home ??= [actor.i, actor.j]
    const me = field.me
    const meDist = me && me.id !== actor.id
      ? manhattan(me.i, me.j, actor.i, actor.j)
      : Infinity
    const playmates: [IActor, KidDelegate][] = []
    for (const other of field.actors.iter()) {
      const kid = kids.get(other)
      if (
        kid && kid !== this &&
        manhattan(other.i, other.j, actor.i, actor.j) <= 12
      ) {
        playmates.push([other, kid])
      }
    }
    if (playerIsIt && meDist > 14) {
      // The player walked off. The game goes on without them
      playerIsIt = false
    }
    if (!this.#it && !playerIsIt && !playmates.some(([, k]) => k.isIt)) {
      this.becomeIt(field)
    }
    const { randomInt, choice } = rng(actor, field)
    if (this.#it) {
      if (field.time < this.#countUntil) {
        // Counting to three
        if ((this.#countUntil - field.time) % 30 === 0) {
          puff(field, actor, Palette.yellow2)
        }
        return
      }
      // Chases the nearest playmate (or the player close by)
      let target: IActor | null = null
      let best = Infinity
      for (const [other] of playmates) {
        const d = manhattan(other.i, other.j, actor.i, actor.j)
        if (d < best) {
          best = d
          target = other
        }
      }
      if (me && meDist <= 6 && meDist < best) {
        target = me
        best = meDist
      }
      if (!target) {
        this.#wander(actor, field, home)
        return
      }
      if (best === 1) {
        face(actor, target.i, target.j)
        actor.tryMove("go", actor.dir, field)
        if (target === me) {
          // Tagged the player
          this.#it = false
          playerIsIt = true
          this.#restUntil = field.time + 60
          signal.message.update({ text: "YOU'RE IT! TAG ONE OF US" })
          signal.playSound("jump")
        }
        // Tagging a kid is handled by its onPushed
        return
      }
      if (!stepToward(actor, field, target.i, target.j, 2)) {
        this.#wander(actor, field, home)
      }
      return
    }
    // Runs from "it"
    let chaser: IActor | null = null
    for (const [other, kid] of playmates) {
      if (kid.isIt && manhattan(other.i, other.j, actor.i, actor.j) <= 4) {
        chaser = other
      }
    }
    if (playerIsIt && meDist <= 3) {
      chaser = me
      // Kids get out of breath: the player can catch up now and then
      if (randomInt(3) === 0) {
        this.#restUntil = field.time + 12
      }
    }
    if (field.time < this.#restUntil) {
      return
    }
    if (chaser) {
      if (!stepAway(actor, field, chaser.i, chaser.j, choice)) {
        face(actor, chaser.i, chaser.j)
      }
      return
    }
    this.#wander(actor, field, home)
  }

  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    const pusher = event.pusher
    if (!pusher || this.#it) {
      return
    }
    const other = kids.get(pusher)
    if (other?.isIt) {
      // Tagged by "it"
      other.#it = false
      other.#restUntil = field.time + 60
      this.becomeIt(field)
      signal.playSound("jump")
      return
    }
    if (pusher.id === "main") {
      if (playerIsIt) {
        playerIsIt = false
        this.becomeIt(field)
        signal.message.update({ text: "OH NO, I'M IT!" })
        signal.playSound("jump")
      } else if (actor.isActionQueueEmpty()) {
        actor.enqueueActions({ type: "jump" })
      }
    }
  }

  #wander(actor: Actor, field: IField, home: [number, number]) {
    if (field.time < this.#restUntil) {
      return
    }
    const { randomInt, choice } = rng(actor, field)
    this.#restUntil = field.time + 20 + randomInt(40)
    if (manhattan(actor.i, actor.j, home[0], home[1]) > this.#range) {
      stepToward(actor, field, home[0], home[1])
      return
    }
    const dirs = DIRS.filter((d) => {
      const [ni, nj] = actor.nextGrid(d)
      return field.canEnter(ni, nj)
    })
    if (dirs.length > 0) {
      actor.tryMove("go", choice(dirs), field)
    }
  }
}

// ---------------------------------------------------------------------
// cat

/**
 * Naps, then strolls a few cells around its spot. Keeps clear of the
 * player (slowly). A bump is taken as a pat: the cat purrs and follows
 * the player for a while.
 */
export class CatDelegate implements IdleDelegate, ActorPushedDelegate {
  #home: [number, number] | null = null
  #napUntil = 0
  #strollSteps = 0
  #nextStep = 0
  #followUntil = 0

  get isFollowing(): boolean {
    return this.#followUntil > 0
  }

  onIdle(actor: Actor, field: IField): void {
    const home = this.#home ??= [actor.i, actor.j]
    const me = field.me
    const { randomInt, choice } = rng(actor, field)
    if (field.time < this.#nextStep) {
      return
    }
    if (me && me.id !== actor.id) {
      const d = manhattan(me.i, me.j, actor.i, actor.j)
      if (field.time < this.#followUntil) {
        // Tags along with the player who patted it
        if (d > 2) {
          stepToward(actor, field, me.i, me.j)
        } else {
          face(actor, me.i, me.j)
          if (randomInt(90) === 0) {
            puff(field, actor, Palette.pink2)
          }
        }
        return
      }
      if (this.#followUntil > 0) {
        // Bored: settles down wherever it is
        this.#followUntil = 0
        this.#home = [actor.i, actor.j]
        this.#napUntil = field.time + 240
      }
      if (d <= 2) {
        // A stranger: walks off, unhurried
        stepAway(actor, field, me.i, me.j, choice)
        this.#nextStep = field.time + 24
        return
      }
    }
    if (field.time < this.#napUntil) {
      return
    }
    if (this.#strollSteps <= 0) {
      this.#strollSteps = 1 + randomInt(3)
      this.#napUntil = field.time + 240 + randomInt(360)
      return
    }
    this.#strollSteps -= 1
    this.#nextStep = field.time + 20 + randomInt(30)
    const dirs = DIRS.filter((d) => {
      const [ni, nj] = actor.nextGrid(d)
      return field.canEnter(ni, nj) && manhattan(ni, nj, home[0], home[1]) <= 4
    })
    if (dirs.length > 0) {
      actor.tryMove("go", choice(dirs), field)
    }
  }

  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    const pusher = event.pusher
    if (pusher?.id !== "main") {
      if (actor.isActionQueueEmpty()) {
        actor.enqueueActions({ type: "jump" })
      }
      return
    }
    // A pat
    actor.setDir(opposite(event.dir))
    this.#followUntil = field.time + 600
    this.#nextStep = field.time + 30
    signal.message.update({ text: "PURR..." })
    signal.playSound("pickupCoin")
    for (
      const effect of linePattern0(
        DIRS,
        actor.i,
        actor.j,
        0.6,
        0.5,
        2,
        Palette.pink2,
      )
    ) {
      field.effects.add(effect)
    }
  }
}
