// The townsfolk: NPCs that make a town feel lived in (see
// ideas/game-ideas-5.md).
//
// - villager: runs errands between the landmarks near its home (shop,
//   well, tables, stools, flower beds, signs, lanterns), lingers at each, goes home to
//   rest, stops to chat with the villagers it meets, and talks back when
//   the player bumps into it. Other roles live the same way but pick
//   their errands differently (the idle name in the catalog):
//   - sentry (guard, lady knight): walks a beat from its post and back,
//     watching the player
//   - performer / dancer (bard, dancer): plays on its spot (notes, a
//     spin); the villagers nearby come to listen now and then
//   - fisher (fishwife, sailor): fishes from the nearest bank
//   - farmer: works the field, crop by crop
//   - elder (sage, nun): sits on a bench for a long while
//   - traveler (merchant): walks to the landmarks far off
//   - sweeper (apprentice): sweeps around its spot
//   - attendant (chancellor): keeps near the princess
//   - lamplighter: makes the round of the lamp posts, lighting each
//   - crier: calls the news in the square to whoever passes by
//   - shopper: goes from stall to stall
//   - commuter: goes to work a way off, and home again, day after day
//   - beggar: asks for a coin, and takes one when bumped
// - keeper: minds its stall. Watches whoever comes near, greets the
//   player, and tidies up (a step aside and back) when nobody is around
// - kid: plays tag with the other kids. The one who is "it" runs after
//   the others (and after the player, who can join in)
// - cat: naps, strolls, keeps clear of strangers; pet it and it follows
//   you for a while
import { DIRS, nextGrid, opposite, UP } from "../util/dir.ts"
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
  "lamp-post",
  "bench",
  "flower-pot",
  "campfire",
  "tent",
  "gravestone",
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

/**
 * What the folk of ff5study (original/) say, by actor type; the others
 * say the VILLAGER_LINES
 */
const ROLE_LINES: Record<string, readonly string[]> = {
  merchant: ["WARES FROM FAR AWAY!", "MY PACK GETS HEAVIER EVERY TOWN"],
  guard: ["ALL QUIET HERE", "MOVE ALONG, TRAVELER"],
  sage: ["THE RIVERS REMEMBER", "SEEK THE CAVERN'S THREE TRIALS"],
  bard: ["SHALL I SING OF THE WILDS?", "LA LA LAAA..."],
  blacksmith: ["MIND THE SPARKS", "A GOOD SWORD IS WORTH 6 COINS"],
  fishwife: ["FRESH FISH! WELL, YESTERDAY'S", "TRY FISHING BY THE RIVER"],
  assassin: ["...", "YOU SAW NOTHING"],
  princess: ["IT IS SO NICE TO BE OUTSIDE", "DON'T TELL THE CHANCELLOR"],
  chancellor: ["HAVE YOU SEEN THE PRINCESS?", "PROTOCOL, PROTOCOL..."],
  sailor: ["THE SEA IS CALLING", "HEAVE HO!"],
  farmer: ["PLANT A SEED, WAIT A WHILE", "THE APPLES ARE GOOD THIS YEAR"],
  nun: ["BLESSINGS ON YOUR ROAD", "REST A WHILE, CHILD"],
  apprentice: ["I'M STILL LEARNING", "MASTER SAYS TO SWEEP AGAIN"],
  inventor: ["IT ALMOST WORKS!", "STAND BACK, IT MIGHT GO BOOM"],
  "lady-knight": ["I GUARD THE ROAD", "TRAIN EVERY DAY"],
  dancer: ["ONE, TWO, TURN!", "MUSIC MAKES THE ROAD SHORT"],
  thief: ["NOTHING TO SEE HERE", "NICE COINS YOU'VE GOT..."],
  lamplighter: ["ONE MORE LAMP AND I'M DONE", "THE CITY NEVER SLEEPS"],
  shopper: ["SO MANY STALLS!", "THE BREAD HERE IS THE BEST"],
  commuter: ["CAN'T STOP, I'M LATE!", "WORK, HOME, WORK, HOME..."],
  townsman: ["THE CITY IS BUSY TODAY", "HAVE YOU SEEN THE CASTLE?"],
  townswoman: ["THE HARBOR SMELLS OF FISH", "LOVELY WEATHER IN THE PARK"],
}

/** The villagers on the field, to find someone to chat with */
const villagers = new WeakMap<IActor, VillagerDelegate>()
/** The performers on the field: the villagers gather round to listen */
const performers = new Set<IActor>()

/** One errand: where to go, and what to do there */
export interface Errand {
  /** Where to stand */
  goal: (i: number, j: number) => boolean
  /** The spot to face on arrival (the landmark, the water...) */
  face?: (actor: IActor, field: IField) => [number, number] | null
  /** How long to stay */
  linger: number
  /** Called every frame while staying (puffs, turning around) */
  activity?: (actor: Actor, field: IField) => void
}

/**
 * How a villager spends the day: the errand it picks next. Every
 * `errands` errands it goes home to rest (0: never). With `watch`, it
 * turns to the player who comes that near while it stays somewhere.
 */
export interface Role {
  readonly range: number
  readonly errands: number
  readonly watch?: number
  /** What it says when the player bumps into it (null: its usual lines) */
  talk?(actor: Actor, field: IField): string | null
  next(
    actor: Actor,
    field: IField,
    home: readonly [number, number],
    random: ReturnType<typeof seed>,
  ): Errand | null
}

/** Stands next to the prop (or on it, when it can be entered) */
const besideProp = (prop: IProp, linger: number): Errand => ({
  goal: (i, j) =>
    prop.canEnter
      ? i === prop.i && j === prop.j
      : manhattan(i, j, prop.i, prop.j) === 1,
  face: (actor) =>
    actor.i === prop.i && actor.j === prop.j ? null : [prop.i, prop.j],
  linger,
})

/** The props of the given types within the range of home */
function propsNear(
  field: IField,
  home: readonly [number, number],
  range: number,
  types: ReadonlySet<string>,
): IProp[] {
  const found: IProp[] = []
  for (const prop of field.props.iter()) {
    if (
      types.has(prop.type) &&
      manhattan(prop.i, prop.j, home[0], home[1]) <= range
    ) {
      found.push(prop)
    }
  }
  return found
}

/** The default: runs errands to the landmarks, or listens to a show */
export function errandsRole(range = 10): Role {
  let last = ""
  return {
    range,
    errands: 3,
    next(actor, field, home, { choice, randomInt }) {
      // A show nearby draws a crowd now and then
      const shows = [...performers].filter((p) => {
        // forgets the performers who are gone from the field
        if (!field.actors.get(p.i, p.j).includes(p)) {
          performers.delete(p)
          return false
        }
        return p !== actor && manhattan(p.i, p.j, home[0], home[1]) <= range
      })
      if (shows.length > 0 && randomInt(3) === 0) {
        const p = choice(shows)
        return {
          goal: (i, j) => manhattan(i, j, p.i, p.j) === 2,
          face: () => [p.i, p.j],
          linger: 240 + randomInt(180),
        }
      }
      const landmarks = propsNear(field, home, range, LANDMARKS).filter((p) =>
        `${p.i}.${p.j}` !== last
      )
      if (landmarks.length === 0) return null
      const prop = choice(landmarks)
      last = `${prop.i}.${prop.j}`
      return besideProp(prop, 120 + randomInt(180))
    },
  }
}

/**
 * The guard: walks a beat from its post to the end of the longest
 * straight run (up to 6 cells) and back, pausing at each end, and keeps
 * an eye on the player
 */
export function sentryRole(beat = 6): Role {
  let end: [number, number] | null = null
  let out = false
  return {
    range: beat + 2,
    errands: 0,
    watch: 5,
    next(_actor, field, home) {
      if (!end) {
        end = [home[0], home[1]]
        let best = 0
        for (const dir of DIRS) {
          let [i, j] = [home[0], home[1]]
          let n = 0
          while (n < beat) {
            const [ni, nj] = nextGrid(i, j, dir)
            if (!field.canEnterStatic(ni, nj)) break
            ;[i, j] = [ni, nj]
            n++
          }
          if (n > best) {
            best = n
            end = [i, j]
          }
        }
      }
      out = !out
      const [ti, tj] = out ? end : home
      const [fi, fj] = out ? home : end
      return {
        goal: (i, j) => i === ti && j === tj,
        // looks on along the beat, away from where it came from
        face: () => [ti + Math.sign(ti - fi), tj + Math.sign(tj - fj)],
        linger: 150,
      }
    },
  }
}

/** The bard and the dancer: perform on their spot; folk come to listen */
export function performerRole(dance = false): Role {
  return {
    range: 1,
    errands: 0,
    watch: dance ? undefined : 4,
    next(actor) {
      performers.add(actor)
      let turn = 0
      return {
        goal: () => true,
        linger: 600,
        activity: (actor, field) => {
          if (field.time % 40 === 0) {
            puff(field, actor, dance ? Palette.pink2 : Palette.yellow1)
          }
          if (dance && field.time % 20 === 0) {
            actor.setDir(DIRS[turn++ % 4])
          }
        },
      }
    },
  }
}

/** Fishes from the nearest bank: faces the water, now and then a bite */
export function fisherRole(range = 16): Role {
  const waterBeside = (field: IField, i: number, j: number) =>
    DIRS.map((d) => nextGrid(i, j, d)).find(([wi, wj]) =>
      field.isWater(wi, wj)
    ) ?? null
  return {
    range,
    errands: 1,
    next(_actor, _field, _home, { randomInt }) {
      return {
        goal: (i, j) => waterBeside(_field, i, j) !== null,
        face: (actor, field) => waterBeside(field, actor.i, actor.j),
        linger: 600 + randomInt(600),
        activity: (actor, field) => {
          if (field.time % 150 === 0) {
            puff(field, actor, Palette.cyan2)
          }
        },
      }
    },
  }
}

const CROPS = new Set(["sapling"])
/** Tends the field: goes from crop to crop, working at each */
export function farmerRole(range = 14): Role {
  let last = ""
  return {
    range,
    errands: 6,
    next(_actor, field, home, { choice, randomInt }) {
      const crops = propsNear(field, home, range, CROPS).filter((p) =>
        `${p.i}.${p.j}` !== last
      )
      if (crops.length === 0) return null
      const crop = choice(crops)
      last = `${crop.i}.${crop.j}`
      return {
        ...besideProp(crop, 150 + randomInt(120)),
        activity: (actor, field) => {
          if (field.time % 50 === 0) puff(field, actor, Palette.green2)
        },
      }
    },
  }
}

const SEATS = new Set(["bench", "stool"])
/** The old folk: sit on a bench for a long while, rarely go elsewhere */
export function elderRole(range = 14): Role {
  return {
    range,
    errands: 2,
    watch: 3,
    next(_actor, field, home, { choice, randomInt }) {
      const seats = propsNear(field, home, range, SEATS)
      if (seats.length === 0) return null
      return besideProp(choice(seats), 900 + randomInt(600))
    },
  }
}

/** The merchant: walks to the landmarks far off, a short stop at each */
export function travelerRole(range = 40): Role {
  return {
    range,
    errands: 5,
    next(actor, field, home, { choice, randomInt }) {
      const far = propsNear(field, home, range, LANDMARKS).filter((p) =>
        manhattan(p.i, p.j, actor.i, actor.j) > range / 3
      )
      if (far.length === 0) return null
      return besideProp(choice(far), 90 + randomInt(90))
    },
  }
}

/** Sweeps around home: short steps to and fro, raising dust */
export function sweeperRole(range = 3): Role {
  return {
    range,
    errands: 0,
    next(_actor, _field, home, { randomInt }) {
      const ti = home[0] + randomInt(2 * range + 1) - range
      const tj = home[1] + randomInt(2 * range + 1) - range
      return {
        goal: (i, j) => i === ti && j === tj,
        linger: 60 + randomInt(60),
        activity: (actor, field) => {
          if (field.time % 15 === 0) {
            actor.setDir(DIRS[(field.time / 15) % 2 ? 2 : 3])
          }
          if (field.time % 30 === 0) puff(field, actor, Palette.gray3)
        },
      }
    },
  }
}

/** Follows someone of the given type around (the chancellor) */
export function attendantRole(whom: string, range = 30): Role {
  return {
    range,
    errands: 0,
    next(actor, field, _home, { randomInt }) {
      let target: IActor | null = null
      for (const other of field.actors.iter()) {
        if (
          other.type === whom &&
          manhattan(other.i, other.j, actor.i, actor.j) <= range
        ) {
          target = other
          break
        }
      }
      if (!target) return null
      const t = target
      if (manhattan(t.i, t.j, actor.i, actor.j) <= 2) {
        return { goal: () => true, face: () => [t.i, t.j], linger: 40 }
      }
      return {
        goal: (i, j) => manhattan(i, j, t.i, t.j) === 2,
        face: () => [t.i, t.j],
        linger: 20 + randomInt(40),
      }
    },
  }
}

/**
 * Lives by its role (errands to the landmarks by default): walks to each
 * errand by the shortest path, stays a while, and after a few errands
 * goes home to rest. Two villagers who meet on the way stop and chat, and
 * the player who bumps into one gets a word.
 */
export class VillagerDelegate implements IdleDelegate, ActorPushedDelegate {
  #role: Role
  #home: [number, number] | null = null
  #path: Dir[] = []
  #errand: Errand | null = null
  #goingHome = false
  #arrived = false
  #lingerUntil = 0
  #errands = 0
  #waited = 0
  #chatUntil = 0
  #chatWith: [number, number] | null = null
  #chatCooldownUntil = 0
  #line = -1

  constructor(role: Role | number = 10) {
    this.#role = typeof role === "number" ? errandsRole(role) : role
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
      if (this.#arrived) {
        this.#errand?.activity?.(actor, field)
        this.#watch(actor, field)
      }
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
        this.#errand = null
        this.#goingHome = false
        this.#waited = 0
        this.#lingerUntil = field.time + 30
      }
      return
    }
    const random = rng(actor, field)
    if (this.#errand && !this.#arrived) {
      // Arrived
      this.#arrived = true
      if (this.#goingHome) {
        // Home: rests a good while
        this.#goingHome = false
        this.#errand = null
        this.#lingerUntil = field.time + 300 + random.randomInt(300)
        return
      }
      const spot = this.#errand.face?.(actor, field)
      if (spot) face(actor, ...spot)
      this.#errands += 1
      this.#lingerUntil = field.time + this.#errand.linger
      return
    }
    this.#errand = null
    this.#arrived = false
    const { errands } = this.#role
    if (errands > 0 && this.#errands >= errands) {
      // Enough errands: goes home
      this.#errands = 0
      if (actor.i === home[0] && actor.j === home[1]) {
        this.#lingerUntil = field.time + 300 + random.randomInt(300)
        return
      }
      const path = this.#pathTo(
        actor,
        field,
        (i, j) => i === home[0] && j === home[1],
      )
      if (path) {
        this.#path = path
        this.#errand = { goal: () => true, linger: 0 }
        this.#goingHome = true
      } else {
        this.#lingerUntil = field.time + 60
      }
      return
    }
    const errand = this.#role.next(actor, field, home, random)
    if (errand) {
      const path = this.#pathTo(actor, field, errand.goal)
      if (path) {
        this.#path = path
        this.#errand = errand
        return
      }
    }
    // Nowhere to go: a stroll around the spot
    const range = Math.max(this.#role.range, 2)
    const dirs = DIRS.filter((d) => {
      const [ni, nj] = actor.nextGrid(d)
      return field.canEnter(ni, nj) &&
        manhattan(ni, nj, home[0], home[1]) <= range
    })
    if (dirs.length > 0 && this.#role.errands !== 0) {
      actor.tryMove("go", random.choice(dirs), field)
    }
    this.#lingerUntil = field.time + 60
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
      const said = this.#role.talk?.(actor, field)
      if (said) {
        signal.message.update({ text: said })
      } else {
        const lines = ROLE_LINES[actor.type] ?? VILLAGER_LINES
        if (this.#line < 0) {
          this.#line = seed(actor.id).randomInt(lines.length)
        }
        signal.message.update({ text: lines[this.#line % lines.length] })
        this.#line = (this.#line + 1) % lines.length
      }
      puff(field, actor, Palette.white)
    }
  }

  /** Turns to the player when they come near */
  #watch(actor: Actor, field: IField) {
    const near = this.#role.watch
    if (!near) return
    const me = field.me
    if (manhattan(me.i, me.j, actor.i, actor.j) <= near) {
      face(actor, me.i, me.j)
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

  #pathTo(
    actor: Actor,
    field: IField,
    isGoal: (i: number, j: number) => boolean,
  ): Dir[] | null {
    const home = this.#home!
    const range = this.#role.range
    return findPath(
      actor.i,
      actor.j,
      isGoal,
      (i, j) =>
        field.canEnterStatic(i, j) &&
        manhattan(i, j, home[0], home[1]) <= range + 2,
      Math.max(600, (2 * range + 5) ** 2),
    )
  }
}

const LAMPS = new Set(["lamp-post"])
/**
 * Lights the lamps: makes the round of the lamp posts near home in order
 * around it, a little glow at each
 */
export function lamplighterRole(range = 24): Role {
  let round: IProp[] = []
  let k = 0
  return {
    range,
    errands: 0,
    next(_actor, field, home) {
      if (round.length === 0) {
        round = propsNear(field, home, range, LAMPS).sort((a, b) =>
          Math.atan2(a.j - home[1], a.i - home[0]) -
          Math.atan2(b.j - home[1], b.i - home[0])
        )
        if (round.length === 0) return null
      }
      const lamp = round[k++ % round.length]
      return {
        ...besideProp(lamp, 90),
        activity: (actor, field) => {
          if (field.time % 20 === 0) puff(field, actor, Palette.yellow1)
        },
      }
    },
  }
}

const NEWS = [
  "HEAR YE! THE CASTLE GATES ARE OPEN TO ALL",
  "HEAR YE! FRESH FISH AT THE HARBOR TODAY",
  "HEAR YE! THREE TRIALS AWAIT IN THE CAVERN",
  "HEAR YE! THE PRINCESS WAS SEEN IN THE GARDEN",
  "HEAR YE! MIND THE CANAL, IT IS DEEP",
]
/** The town crier: stays in the square and calls the news to passers-by */
export function crierRole(): Role {
  let k = 0
  return {
    range: 1,
    errands: 0,
    watch: 8,
    talk: () => NEWS[k++ % NEWS.length],
    next() {
      return {
        goal: () => true,
        linger: 600,
        activity: (actor, field) => {
          if (field.time % 300 !== 0) return
          puff(field, actor, Palette.white)
          const me = field.me
          if (manhattan(me.i, me.j, actor.i, actor.j) <= 8) {
            signal.message.update({ text: NEWS[k++ % NEWS.length] })
          }
        },
      }
    },
  }
}

const SHOPS = new Set(["shop"])
/** Goes from stall to stall, looking at the goods */
export function shopperRole(range = 24): Role {
  let last = ""
  return {
    range,
    errands: 4,
    next(_actor, field, home, { choice, randomInt }) {
      const shops = propsNear(field, home, range, SHOPS).filter((p) =>
        `${p.i}.${p.j}` !== last
      )
      if (shops.length === 0) return null
      const shop = choice(shops)
      last = `${shop.i}.${shop.j}`
      return besideProp(shop, 150 + randomInt(150))
    },
  }
}

/** Where the commuters work */
const WORKPLACES = new Set([
  ...LANDMARKS,
  "crate",
  "shop",
])
/**
 * Goes to work and back: picks a workplace a way off from home, spends
 * a long while there, then goes home to rest, day after day
 */
export function commuterRole(range = 60): Role {
  let work: IProp | null = null
  return {
    range,
    errands: 1,
    next(_actor, field, home, { choice, randomInt }) {
      if (!work) {
        const far = propsNear(field, home, range, WORKPLACES).filter((p) =>
          manhattan(p.i, p.j, home[0], home[1]) >= 15
        )
        if (far.length === 0) return null
        work = choice(far)
      }
      return besideProp(work, 900 + randomInt(900))
    },
  }
}

/** Sits on its spot and asks for a coin; takes one if the player has any */
export function beggarRole(): Role {
  return {
    range: 1,
    errands: 0,
    watch: 4,
    talk: () => {
      const coins = signal.coinCount.get()
      if (coins <= 0) return "SPARE A COIN, TRAVELER?"
      signal.coinCount.update(coins - 1)
      return "BLESS YOU! (YOU GAVE 1 COIN)"
    },
    next() {
      return { goal: () => true, linger: 900 }
    },
  }
}

/** The roles by the idle name in the catalog */
export const ROLES: Record<string, () => Role> = {
  villager: () => errandsRole(),
  sentry: () => sentryRole(),
  performer: () => performerRole(),
  dancer: () => performerRole(true),
  fisher: () => fisherRole(),
  farmer: () => farmerRole(),
  elder: () => elderRole(),
  traveler: () => travelerRole(),
  sweeper: () => sweeperRole(),
  attendant: () => attendantRole("princess"),
  lamplighter: () => lamplighterRole(),
  crier: () => crierRole(),
  shopper: () => shopperRole(),
  commuter: () => commuterRole(),
  beggar: () => beggarRole(),
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
