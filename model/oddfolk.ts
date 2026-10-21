// The folk of the odd houses (tools/house_plans.ts growPlan: the houses
// of 10-40 rooms grown room by room, with doors here and there). Each is
// told the house it lives in by its spawn's data (`HouseData`: the rooms
// as rects, walls inclusive, and the doors with the way out of each),
// and lives in it in its own way:
//
// - lost: wanders from room to room looking for the way out, forgets
//   where it has been, and when it finds a door at last goes straight
//   back in. Bumped by the player it asks to be shown the door, and
//   follows them until they lead it outside
// - roomkeeper: keeps to one room and does what the room is for: sleeps
//   in the beds of a dormitory one after another, waits in the line of
//   the privies, reads shelf to shelf in the library, lights the
//   candles of the candlelit room, paces the corners of an empty one
// - counter: walks every room in turn counting them, a puff at each,
//   and gets a different count every round
// - passer: goes in one door and out another, through the house, as
//   its short cut, day after day
// - hider: plays hide and seek with the other hiders of the house: one
//   seeks, counting first, the rest hide in the rooms; the seeker finds
//   a hider by coming into its room; the found wait in the front room
//   until all are found, then the first found seeks. The player finds a
//   hider by bumping into it
import { DIRS } from "../util/dir.ts"
import { Palette } from "../util/palette.ts"
import type { Actor, ActorPushedDelegate, IdleDelegate } from "./actor.ts"
import { face, findPath, manhattan, stepToward } from "./steering.ts"
import {
  besideProp,
  type Errand,
  propsNear,
  puff,
  rng,
  type Role,
  say,
} from "./townsfolk.ts"
import type { IActor, IField, IProp, PushedEvent } from "./types.ts"
import type { Dir } from "./types.ts"

/** A room of the house: its rect, walls inclusive, and what it is for */
export type HouseRoom = {
  x0: number
  y0: number
  x1: number
  y1: number
  kind: string
}
/** A door of the house and the way out of it */
export type HouseDoor = { x: number; y: number; out: [number, number] }
export type HouseData = { rooms: HouseRoom[]; doors: HouseDoor[] }

/** The house in a spawn's data, if it holds one */
export function houseOf(data: unknown): HouseData | null {
  const d = data as { house?: HouseData } | undefined
  const house = d?.house
  if (!house || !Array.isArray(house.rooms) || house.rooms.length === 0) {
    return null
  }
  return { rooms: house.rooms, doors: house.doors ?? [] }
}

/** true inside the house: in a room (walls inclusive) or a door cell */
export function inHouse(house: HouseData, i: number, j: number): boolean {
  return house.rooms.some((r) =>
    i >= r.x0 && i <= r.x1 && j >= r.y0 && j <= r.y1
  ) || house.doors.some((d) => d.x === i && d.y === j)
}

/** The room whose inside (off the walls) holds the cell, or -1 */
export function roomAt(house: HouseData, i: number, j: number): number {
  return house.rooms.findIndex((r) =>
    i > r.x0 && i < r.x1 && j > r.y0 && j < r.y1
  )
}

/** The middle of the room's inside */
const middleOf = (r: HouseRoom): [number, number] => [
  (r.x0 + r.x1) >> 1,
  (r.y0 + r.y1) >> 1,
]

/** The cells of the room's inside that can be stood on */
function freeCells(field: IField, r: HouseRoom): [number, number][] {
  const out: [number, number][] = []
  for (let y = r.y0 + 1; y < r.y1; y++) {
    for (let x = r.x0 + 1; x < r.x1; x++) {
      if (field.canEnterStatic(x, y)) out.push([x, y])
    }
  }
  return out
}

/** A way inside the house to a cell of the room (its middle, or any) */
function pathToRoom(
  actor: Actor,
  field: IField,
  house: HouseData,
  r: HouseRoom,
): Dir[] | null {
  const [mx, my] = middleOf(r)
  const passable = (i: number, j: number) =>
    field.canEnterStatic(i, j) && inHouse(house, i, j)
  if (field.canEnterStatic(mx, my)) {
    const path = findPath(
      actor.i,
      actor.j,
      (i, j) => i === mx && j === my,
      passable,
      4000,
    )
    if (path) return path
  }
  return findPath(
    actor.i,
    actor.j,
    (i, j) => i > r.x0 && i < r.x1 && j > r.y0 && j < r.y1,
    passable,
    4000,
  )
}

/** Steps along the path, waiting on whoever is in the way; true if the
 * path is done with (walked, or given up on) */
function walk(
  actor: Actor,
  field: IField,
  state: { path: Dir[]; waited: number },
) {
  if (state.path.length === 0) return true
  const dir = state.path[0]
  const [ni, nj] = actor.nextGrid(dir)
  if (field.canEnter(ni, nj)) {
    state.path.shift()
    state.waited = 0
    actor.tryMove("go", dir, field)
    return state.path.length === 0
  }
  actor.setDir(dir)
  if (++state.waited > 60) {
    state.path = []
    state.waited = 0
    return true
  }
  return false
}

// ---------------------------------------------------------------------
// lost

const LOST_LINES = [
  "WHICH WAY IS OUT?",
  "I'VE SEEN THIS ROOM BEFORE",
  "WAS IT LEFT, OR LEFT?",
  "THE DOOR WAS HERE THIS MORNING",
  "EVERY ROOM LEADS TO ANOTHER ROOM",
]

/**
 * Looks for the way out of the house and never quite finds it: picks a
 * room, goes there, looks around, picks another; now and then makes for
 * a door, steps out ("OUT AT LAST!") and comes straight back in for
 * something it forgot. Bumped by the player it asks to be shown the
 * door and tags along, until they lead it outside or walk too far
 */
export class LostDelegate implements IdleDelegate, ActorPushedDelegate {
  #state = { path: [] as Dir[], waited: 0 }
  #lingerUntil = 0
  #roomsSince = 0
  #toDoor = false
  #followUntil = 0
  #line = 0
  #home: [number, number] | null = null

  get isFollowing(): boolean {
    return this.#followUntil > 0
  }

  onIdle(actor: Actor, field: IField): void {
    const home = this.#home ??= [actor.i, actor.j]
    const house = houseOf(actor.data)
    const me = field.me
    const { randomInt, choice } = rng(actor, field)
    if (this.#followUntil > 0) {
      const d = me ? manhattan(me.i, me.j, actor.i, actor.j) : Infinity
      if (field.time >= this.#followUntil || d > 12) {
        this.#followUntil = 0
        say(actor, field, "...AND NOW I'VE LOST YOU TOO")
        this.#lingerUntil = field.time + 120
        return
      }
      if (house && me && !inHouse(house, me.i, me.j) && d <= 3) {
        // Led outside: free at last, for a moment
        this.#followUntil = 0
        this.#roomsSince = 0
        say(actor, field, "OUT AT LAST! ...WAIT, MY HAT IS INSIDE")
        this.#lingerUntil = field.time + 150
        return
      }
      if (d > 1) {
        if (field.time % 8 === 0 && me) stepToward(actor, field, me.i, me.j)
      } else if (me) {
        face(actor, me.i, me.j)
      }
      return
    }
    if (this.#state.path.length > 0) {
      walk(actor, field, this.#state)
      return
    }
    if (field.time < this.#lingerUntil) {
      // Looking around the room
      if (field.time % 40 === 0) {
        puff(field, actor, Palette.white)
        actor.setDir(choice([...DIRS]))
      }
      if (
        me && field.time % 150 === 0 &&
        manhattan(me.i, me.j, actor.i, actor.j) <= 4
      ) {
        say(actor, field, LOST_LINES[this.#line++ % LOST_LINES.length])
      }
      return
    }
    if (!house) {
      // No house to be lost in: wanders near its spot
      const dirs = DIRS.filter((d) => {
        const [ni, nj] = actor.nextGrid(d)
        return field.canEnter(ni, nj) &&
          manhattan(ni, nj, home[0], home[1]) <= 6
      })
      if (dirs.length > 0) actor.tryMove("go", choice(dirs), field)
      this.#lingerUntil = field.time + 30 + randomInt(60)
      return
    }
    if (this.#toDoor) {
      // At the door at last. Out it goes... and back in
      this.#toDoor = false
      this.#roomsSince = 0
      const door = house.doors.find((d) => d.x === actor.i && d.y === actor.j)
      if (door) actor.setDir(dirOf(door.out))
      if (me && manhattan(me.i, me.j, actor.i, actor.j) <= 6) {
        say(actor, field, "OUT AT LAST! ...OH, I FORGOT MY HAT")
      } else puff(field, actor, Palette.yellow2)
      this.#lingerUntil = field.time + 120
      return
    }
    this.#roomsSince++
    if (this.#roomsSince >= 4 + randomInt(4) && house.doors.length > 0) {
      const door = choice(house.doors)
      const path = findPath(
        actor.i,
        actor.j,
        (i, j) => i === door.x && j === door.y,
        (i, j) => field.canEnterStatic(i, j) && inHouse(house, i, j),
        4000,
      )
      if (path) {
        this.#state.path = path
        this.#toDoor = true
        return
      }
    }
    const here = roomAt(house, actor.i, actor.j)
    const rooms = house.rooms.filter((_, k) => k !== here)
    const room = choice(rooms.length > 0 ? rooms : house.rooms)
    const path = pathToRoom(actor, field, house, room)
    if (path) this.#state.path = path
    this.#lingerUntil = field.time + 60 + randomInt(90)
  }

  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    const pusher = event.pusher
    if (!pusher) return
    face(actor, pusher.i, pusher.j)
    if (pusher.id !== "main") return
    if (this.#followUntil > 0) {
      say(actor, field, "LEAD ON, I'M RIGHT BEHIND YOU")
      return
    }
    say(actor, field, "WHICH WAY IS THE DOOR? SHOW ME, PLEASE")
    this.#followUntil = field.time + 1200
    this.#state.path = []
    this.#toDoor = false
    this.#lingerUntil = 0
    puff(field, actor, Palette.white)
  }
}

const dirOf = ([dx, dy]: [number, number]): Dir =>
  dx > 0 ? "right" : dx < 0 ? "left" : dy > 0 ? "down" : "up"

// ---------------------------------------------------------------------
// roomkeeper

const KEEPER_PROPS: Record<string, string[]> = {
  dormitory: ["bed-foot"],
  privies: ["toilet"],
  library: ["bookshelf"],
  candlelit: ["candles"],
  empty: [],
}
const ANY_FURNITURE = [
  "table",
  "table-l",
  "chair",
  "stool",
  "bed-foot",
  "counter",
  "stove",
  "desk",
  "bookshelf",
]
const KEEPER_LINES: Record<string, string[]> = {
  dormitory: ["SO MANY BEDS, SO LITTLE SLEEP", "WHICH ONE IS MINE AGAIN?"],
  privies: ["IS THIS THE LINE?", "ALL OF THEM TAKEN, SOMEHOW"],
  library: ["EVERY BOOK HERE IS ABOUT THIS HOUSE", "SHH. THIS IS A LIBRARY"],
  candlelit: ["ONE GOES OUT, I LIGHT IT AGAIN", "MIND THE WAX"],
  empty: ["NOTHING IN HERE. I LIKE IT", "THEY SAY THIS ROOM MOVES AT NIGHT"],
}
const KEEPER_COLOR: Record<string, (typeof Palette)[keyof typeof Palette]> = {
  dormitory: Palette.white,
  privies: Palette.yellow2,
  library: Palette.white,
  candlelit: Palette.yellow1,
  empty: Palette.gray2,
}

/**
 * Keeps to its room (the room of the spawn's data, or the few cells
 * round its spot) and does what the room is for, piece by piece
 */
export function roomKeeperRole(data?: unknown): Role {
  const house = houseOf(data)
  const index = (data as { room?: number } | undefined)?.room ?? -1
  const room = house?.rooms[index] ?? null
  const kind = room?.kind ?? "empty"
  let line = 0
  let k = 0
  let corner = 0
  const range = room ? room.x1 - room.x0 + room.y1 - room.y0 : 5
  return {
    range,
    errands: 0,
    watch: 3,
    talk: () => {
      const lines = KEEPER_LINES[kind] ?? KEEPER_LINES.empty
      return lines[line++ % lines.length]
    },
    passable: room
      ? (i, j) => i >= room.x0 && i <= room.x1 && j >= room.y0 && j <= room.y1
      : undefined,
    next(_actor, field, home, { randomInt }) {
      const types = new Set(KEEPER_PROPS[kind] ?? ANY_FURNITURE)
      const color = KEEPER_COLOR[kind] ?? Palette.white
      const pieces =
        (room
          ? [...field.props.iter()].filter((p) =>
            types.has(p.type) && p.i > room.x0 && p.i < room.x1 &&
            p.j > room.y0 && p.j < room.y1
          )
          : propsNear(field, home, range, types)).sort((a, b) =>
            a.j - b.j || a.i - b.i
          )
      if (pieces.length === 0) {
        // Nothing to tend: paces the corners of the room
        if (!room) return null
        const corners: [number, number][] = [
          [room.x0 + 1, room.y0 + 1],
          [room.x1 - 1, room.y0 + 1],
          [room.x1 - 1, room.y1 - 1],
          [room.x0 + 1, room.y1 - 1],
        ]
        const [cx, cy] = corners[corner++ % 4]
        return {
          goal: (i, j) => i === cx && j === cy,
          linger: 60 + randomInt(60),
          activity: (actor, field) => {
            if (field.time % 60 === 0) puff(field, actor, color)
          },
        }
      }
      const piece: IProp = pieces[k++ % pieces.length]
      const linger = kind === "dormitory"
        ? 300 + randomInt(300)
        : kind === "privies"
        ? 120 + randomInt(120)
        : 90 + randomInt(90)
      const every = kind === "dormitory" ? 60 : kind === "candlelit" ? 20 : 40
      const errand: Errand = {
        ...besideProp(piece, linger),
        activity: (actor, field) => {
          if (field.time % every === 0) puff(field, actor, color)
        },
      }
      return errand
    },
  }
}

// ---------------------------------------------------------------------
// counter

/**
 * Counts the rooms: walks into each in turn, a puff at each, and tells
 * the count when bumped. No two rounds give the same number
 */
export function counterRole(data?: unknown): Role {
  const house = houseOf(data)
  let k = 0
  let counted = 0
  let last = -1
  let seed = 0
  const range = house
    ? Math.max(
      ...house.rooms.map((r) =>
        Math.max(r.x1 - r.x0, r.y1 - r.y0) +
        Math.abs(r.x0 - house.rooms[0].x0) + Math.abs(r.y0 - house.rooms[0].y0)
      ),
    ) + 4
    : 8
  return {
    range,
    errands: 0,
    watch: 4,
    talk: () => {
      if (!house) return "ONE, TWO... I'VE LOST COUNT"
      if (last < 0) return `COUNTING, DON'T TALK TO ME... ${counted + 1}`
      return `I MAKE IT ${last} ROOMS. YESTERDAY IT WAS ${
        last + (seed % 2 ? 1 : -1) - (seed % 3 === 0 ? 1 : 0)
      }`
    },
    passable: house ? (i, j) => inHouse(house, i, j) : undefined,
    next(_actor, field, _home, { randomInt }) {
      if (!house) return null
      const n = house.rooms.length
      if (k > 0 && k % n === 0) {
        // A round done: the count is off by one or two, one way or the
        // other, and never the same twice
        seed = randomInt(1000)
        const off = (seed % 3) - 1
        last = n + (off === 0 ? (seed % 2 ? 2 : -2) : off)
        counted = 0
      }
      const room = house.rooms[k++ % n]
      const [mx, my] = middleOf(room)
      const cells = freeCells(field, room)
      const spot = field.canEnterStatic(mx, my)
        ? [mx, my]
        : cells[randomInt(Math.max(1, cells.length))]
      if (!spot) return null
      let puffed = false
      return {
        goal: (i, j) => i === spot[0] && j === spot[1],
        linger: 30,
        activity: (actor, field) => {
          if (!puffed) {
            puffed = true
            counted++
            puff(field, actor, Palette.yellow2)
          }
        },
      }
    },
  }
}

// ---------------------------------------------------------------------
// passer

const PASSER_LINES = [
  "THROUGH THE HOUSE IS QUICKER",
  "IN THE FRONT, OUT THE BACK",
  "THEY DON'T MIND. THEY NEVER NOTICE",
  "TWELVE ROOMS SAVES ME A STREET",
]

/**
 * Takes the house as its short cut: from outside one door, through the
 * rooms, to outside another, and back the same way after a while
 */
export function passerRole(data?: unknown): Role {
  const house = houseOf(data)
  const outs: [number, number][] = (house?.doors ?? []).map((d) => [
    d.x + d.out[0],
    d.y + d.out[1],
  ])
  let k = 0
  let line = 0
  const range = house
    ? Math.max(
      ...outs.map(([x, y]) =>
        Math.abs(x - outs[0][0]) + Math.abs(y - outs[0][1])
      ),
    ) + 8
    : 8
  return {
    range,
    errands: 0,
    talk: () => PASSER_LINES[line++ % PASSER_LINES.length],
    passable: house
      ? (i, j) =>
        inHouse(house, i, j) || outs.some(([x, y]) => x === i && y === j)
      : undefined,
    next(_actor, _field, _home, { randomInt }) {
      if (outs.length < 2) return null
      const [x, y] = outs[++k % outs.length]
      return {
        goal: (i, j) => i === x && j === y,
        linger: 150 + randomInt(300),
      }
    },
  }
}

/** The roles of the odd houses, by the idle name in the catalog */
export const ODD_ROLES: Record<string, (data?: unknown) => Role> = {
  roomkeeper: roomKeeperRole,
  counter: counterRole,
  passer: passerRole,
}

// ---------------------------------------------------------------------
// hider

type Game = {
  seeker: IActor | null
  /** The hiders found this round, first first */
  found: IActor[]
  /** How many the player found, all rounds */
  byPlayer: number
}
/** The games, one a house (keyed by its front room) */
const games = new Map<string, Game>()
/** The hiders on the field */
const hiders = new WeakMap<IActor, HideSeekDelegate>()

/** Resets the games (for tests) */
export function resetHideSeek() {
  games.clear()
}

/**
 * Plays hide and seek in the house. The seeker counts, then walks the
 * rooms; a hider in the room it walks into is found, says so, and waits
 * in the front room. When every hider is found, the first found seeks
 * next and the rest hide again. The player finds a hider by bumping into
 * it (the seeker doesn't count that against them)
 */
export class HideSeekDelegate implements IdleDelegate, ActorPushedDelegate {
  #state = { path: [] as Dir[], waited: 0 }
  #mode: "hiding" | "hidden" | "found" | "counting" | "seeking" = "hiding"
  #until = 0
  #visited = new Set<number>()
  #home: [number, number] | null = null
  /** The round is over: everyone found, the breather before the next */
  #ending = false

  get mode(): string {
    return this.#mode
  }

  #game(house: HouseData): Game {
    const r = house.rooms[0]
    const key = `${r.x0}.${r.y0}`
    let game = games.get(key)
    if (!game) {
      game = { seeker: null, found: [], byPlayer: 0 }
      games.set(key, game)
    }
    return game
  }

  onIdle(actor: Actor, field: IField): void {
    hiders.set(actor, this)
    this.#home ??= [actor.i, actor.j]
    const house = houseOf(actor.data)
    const { randomInt, choice } = rng(actor, field)
    if (!house) return
    const game = this.#game(house)
    const me = field.me
    if (!game.seeker || !hiders.has(game.seeker)) {
      // No seeker: this one counts
      game.seeker = actor
      game.found = []
      this.#mode = "counting"
      this.#until = field.time + 150
      this.#visited.clear()
    }
    if (this.#state.path.length > 0) {
      walk(actor, field, this.#state)
      return
    }
    switch (this.#mode) {
      case "counting": {
        if (field.time < this.#until) {
          if ((this.#until - field.time) % 30 === 0) {
            puff(field, actor, Palette.yellow2)
          }
          return
        }
        this.#mode = "seeking"
        this.#until = 0
        return
      }
      case "seeking": {
        if (field.time < this.#until) {
          // Looks round the room
          if (field.time % 20 === 0) actor.setDir(choice([...DIRS]))
          return
        }
        // Everyone in this room is found
        const here = roomAt(house, actor.i, actor.j)
        for (const other of field.actors.iter()) {
          const h = hiders.get(other)
          if (!h || h === this || h.#mode === "found") continue
          if (
            roomAt(house, other.i, other.j) === here &&
            manhattan(other.i, other.j, actor.i, actor.j) <= 4
          ) {
            h.#found(other as Actor, field, house, game, false)
          }
        }
        const others = [...field.actors.iter()].filter((o) => {
          const h = hiders.get(o)
          return h && h !== this
        })
        if (
          others.length > 0 &&
          others.every((o) => hiders.get(o)!.#mode === "found")
        ) {
          // All found: a breather, then the first found seeks next
          if (!this.#ending) {
            this.#ending = true
            this.#until = field.time + 240
            if (me && manhattan(me.i, me.j, actor.i, actor.j) <= 6) {
              say(actor, field, "FOUND YOU ALL! YOUR TURN TO SEEK")
            }
            return
          }
          this.#ending = false
          const next = game.found[0]
          const nextD = next ? hiders.get(next) : undefined
          game.found = []
          if (nextD && next) {
            game.seeker = next
            nextD.#mode = "counting"
            nextD.#until = field.time + 150
            nextD.#visited.clear()
          } else {
            game.seeker = null
          }
          for (const o of others) {
            const h = hiders.get(o)!
            if (h !== nextD) {
              h.#mode = "hiding"
              h.#state.path = []
            }
          }
          this.#mode = "hiding"
          this.#until = field.time + 60
          return
        }
        // The next room not looked in yet
        const left = house.rooms.map((_, k) => k).filter((k) =>
          !this.#visited.has(k) && k !== here
        )
        if (left.length === 0) this.#visited.clear()
        const k = left.length > 0 ? choice(left) : randomInt(house.rooms.length)
        this.#visited.add(k)
        const path = pathToRoom(actor, field, house, house.rooms[k])
        if (path) this.#state.path = path
        this.#until = field.time + 40 + randomInt(40)
        return
      }
      case "hiding": {
        if (field.time < this.#until) return
        // Picks a room the seeker is not in, and a free cell of it
        const seekerRoom = game.seeker
          ? roomAt(house, game.seeker.i, game.seeker.j)
          : -1
        const rooms = house.rooms.filter((_, k) => k !== seekerRoom && k !== 0)
        const room = choice(rooms.length > 0 ? rooms : house.rooms)
        const cells = freeCells(field, room)
        if (cells.length === 0) {
          this.#until = field.time + 60
          return
        }
        const [sx, sy] = choice(cells)
        const path = findPath(
          actor.i,
          actor.j,
          (i, j) => i === sx && j === sy,
          (i, j) => field.canEnterStatic(i, j) && inHouse(house, i, j),
          4000,
        )
        if (path) {
          this.#state.path = path
          this.#mode = "hidden"
        } else {
          this.#until = field.time + 60
        }
        return
      }
      case "hidden": {
        // Keeps still; a giggle now and then
        if (field.time % 240 === 0) puff(field, actor, Palette.pink2)
        return
      }
      case "found": {
        // Waits in the front room
        if (field.time < this.#until) return
        const front = house.rooms[0]
        if (roomAt(house, actor.i, actor.j) !== 0) {
          const path = pathToRoom(actor, field, house, front)
          if (path) this.#state.path = path
        }
        this.#until = field.time + 120
        return
      }
    }
  }

  /** Found: says so, and goes to wait in the front room */
  #found(
    actor: Actor,
    field: IField,
    _house: HouseData,
    game: Game,
    byPlayer: boolean,
  ) {
    this.#mode = "found"
    this.#state.path = []
    this.#until = field.time + 60
    game.found.push(actor)
    if (byPlayer) {
      game.byPlayer++
      say(
        actor,
        field,
        `AW, YOU FOUND ME! THAT'S ${game.byPlayer} OF US YOU'VE FOUND`,
      )
    } else if (actor.isActionQueueEmpty()) {
      actor.enqueueActions({ type: "jump" })
    }
  }

  onPushed(event: PushedEvent, actor: Actor, field: IField): void {
    const pusher = event.pusher
    if (pusher?.id !== "main") return
    face(actor, pusher.i, pusher.j)
    const house = houseOf(actor.data)
    if (!house) return
    const game = this.#game(house)
    switch (this.#mode) {
      case "hidden":
        this.#found(actor, field, house, game, true)
        break
      case "hiding":
        say(actor, field, "SHH! I'M LOOKING FOR A SPOT")
        break
      case "found":
        say(actor, field, "I'M OUT. THE OTHERS ARE STILL HIDING")
        break
      default:
        say(actor, field, "I'M IT! THEY'RE IN THERE SOMEWHERE")
    }
  }
}
