import { assert, assertEquals } from "@std/assert"
import { Actor } from "./actor.ts"
import type { ActorDefinition } from "./catalog.ts"
import {
  counterRole,
  HideSeekDelegate,
  type HouseData,
  inHouse,
  LostDelegate,
  passerRole,
  resetHideSeek,
  roomAt,
  roomKeeperRole,
} from "./oddfolk.ts"
import { VillagerDelegate } from "./townsfolk.ts"
import type { IField, IProp } from "./types.ts"

const def: ActorDefinition = { type: "npc", src: "../x/", href: "./x/" }

/**
 * Two rooms side by side (walls inclusive: 0..6 and 6..12 by 0..6),
 * a doorway between them at (6,3), the front door at (3,6) opening
 * south and a back door at (12,3) opening east
 */
const HOUSE: HouseData = {
  rooms: [
    { x0: 0, y0: 0, x1: 6, y1: 6, kind: "library" },
    { x0: 6, y0: 0, x1: 12, y1: 6, kind: "dormitory" },
  ],
  doors: [
    { x: 3, y: 6, out: [0, 1] },
    { x: 12, y: 3, out: [1, 0] },
  ],
}
const GAPS = new Set(["6.3", "3.6", "12.3"])
const WALLS = new Set<string>()
for (const r of HOUSE.rooms) {
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const edge = x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1
      if (edge && !GAPS.has(`${x}.${y}`)) WALLS.add(`${x}.${y}`)
    }
  }
}

/** A field of open floor but the walls, holding the actors and props */
function makeField(me: Actor, others: Actor[], props: IProp[] = []) {
  let time = 0
  const all = () => [me, ...others]
  const blockedByProp = (i: number, j: number) =>
    props.some((p) => p.i === i && p.j === j && !p.canEnter)
  const field: IField = {
    get me() {
      return me
    },
    canEnter: (i, j) =>
      !WALLS.has(`${i}.${j}`) && !blockedByProp(i, j) &&
      !all().some((a) => a.i === i && a.j === j),
    canEnterStatic: (i, j) => !WALLS.has(`${i}.${j}`) && !blockedByProp(i, j),
    isSlippery: () => false,
    isWater: () => false,
    conveyorDir: () => null,
    isDiggable: () => false,
    updateCell: () => {},
    peekItem: () => undefined,
    peekItems: () => [],
    spawnActor: () => null,
    spawnItem: () => null,
    spawnProp: () => null,
    collectItem: () => {},
    actors: {
      iter: () => all(),
      get: (i, j) => all().filter((a) => a.i === i && a.j === j),
      add: () => {},
      remove: () => {},
    },
    props: {
      get: (i, j) => props.find((p) => p.i === i && p.j === j),
      remove: () => {},
      iter: () => props,
    },
    effects: { add: () => {} },
    get time() {
      return time
    },
    colorCell: () => {},
  }
  return {
    field,
    tick(n = 1) {
      time += n
    },
  }
}

const makeProp = (type: string, i: number, j: number) =>
  ({ type, i, j, canEnter: false }) as unknown as IProp

/** Runs the actors' idle steps (and the moves) for n frames */
function run(
  field: IField,
  tick: (n?: number) => void,
  pairs: [Actor, { onIdle(a: Actor, f: IField): void }][],
  n: number,
  each?: () => void,
) {
  for (let k = 0; k < n; k++) {
    for (const [actor, d] of pairs) d.onIdle(actor, field)
    each?.()
    tick()
  }
}

Deno.test("the house helpers", () => {
  assert(inHouse(HOUSE, 6, 3))
  assert(inHouse(HOUSE, 12, 3))
  assert(!inHouse(HOUSE, 13, 3))
  assertEquals(roomAt(HOUSE, 2, 2), 0)
  assertEquals(roomAt(HOUSE, 8, 2), 1)
  assertEquals(roomAt(HOUSE, 6, 3), -1)
})

Deno.test("the lost one keeps to the house and follows the player out", () => {
  const me = new Actor(30, 30, def, "main")
  const lost = new Actor(2, 2, def, "lost", "down", 1, null, null, null, {
    house: HOUSE,
  })
  const { field, tick } = makeField(me, [lost])
  const d = new LostDelegate()
  const seen = new Set<string>()
  run(field, tick, [[lost, d]], 1500, () => {
    assert(
      inHouse(HOUSE, lost.i, lost.j),
      `left the house at ${lost.i},${lost.j}`,
    )
    seen.add(`${lost.i}.${lost.j}`)
  })
  assert(seen.size > 3, "never went anywhere")
  // Bumped: asks to be shown out, and tags along
  me.fastTravel(lost.i, lost.j + 1)
  d.onContact(lost, field, me)
  assert(d.isFollowing)
  // The player steps out of the front door: the lost one is led out
  me.fastTravel(3, 8)
  lost.fastTravel(3, 5)
  d.onIdle(lost, field)
  assert(!d.isFollowing)
})

Deno.test("the counter walks the rooms and gives a count", () => {
  const me = new Actor(30, 30, def, "main")
  const counter = new Actor(2, 4, def, "c", "down", 1, null, null, null, {
    house: HOUSE,
  })
  const { field, tick } = makeField(me, [counter])
  const role = counterRole(counter.data)
  const d = new VillagerDelegate(role)
  assert(role.talk!(counter, field)!.startsWith("COUNTING"))
  const rooms = new Set<number>()
  run(field, tick, [[counter, d]], 900, () => {
    rooms.add(roomAt(HOUSE, counter.i, counter.j))
  })
  assert(rooms.has(0) && rooms.has(1), "did not visit both rooms")
  const said = role.talk!(counter, field)!
  assert(said.includes("ROOMS"), said)
  assert(!said.includes(" 2 ROOMS") || said.includes("YESTERDAY"), said)
})

Deno.test("the passer goes through the house from door to door", () => {
  const me = new Actor(30, 30, def, "main")
  const passer = new Actor(3, 7, def, "p", "down", 1, null, null, null, {
    house: HOUSE,
  })
  const { field, tick } = makeField(me, [passer])
  const role = passerRole(passer.data)
  assert(role.passable!(6, 3))
  assert(role.passable!(13, 3))
  assert(!role.passable!(14, 3))
  const d = new VillagerDelegate(role)
  const cells: string[] = []
  run(field, tick, [[passer, d]], 400, () => {
    cells.push(`${passer.i}.${passer.j}`)
  })
  assert(cells.includes("13.3"), "never came out of the back door")
  assert(cells.includes("6.3"), "did not go through the doorway")
})

Deno.test("the room keeper tends its room's pieces", () => {
  const me = new Actor(30, 30, def, "main")
  const keeper = new Actor(8, 4, def, "k", "down", 1, null, null, null, {
    house: HOUSE,
    room: 1,
  })
  const beds = [makeProp("bed-foot", 7, 2), makeProp("bed-foot", 10, 2)]
  const { field, tick } = makeField(me, [keeper], beds)
  const role = roomKeeperRole(keeper.data)
  assert(role.talk!(keeper, field)!.includes("BED"))
  const d = new VillagerDelegate(role)
  const beside = new Set<string>()
  run(field, tick, [[keeper, d]], 1500, () => {
    assertEquals(roomAt(HOUSE, keeper.i, keeper.j), 1, "left the room")
    for (const b of beds) {
      if (Math.abs(keeper.i - b.i) + Math.abs(keeper.j - b.j) === 1) {
        beside.add(`${b.i}`)
      }
    }
  })
  assertEquals(beside.size, 2, "did not visit both beds")
})

Deno.test("hide and seek: the seeker finds the hider in its room", () => {
  resetHideSeek()
  const me = new Actor(30, 30, def, "main")
  const a = new Actor(3, 4, def, "a", "down", 1, null, null, null, {
    house: HOUSE,
  })
  const b = new Actor(3, 3, def, "b", "down", 1, null, null, null, {
    house: HOUSE,
  })
  const { field, tick } = makeField(me, [a, b])
  const da = new HideSeekDelegate(), db = new HideSeekDelegate()
  da.onIdle(a, field)
  assertEquals(da.mode, "counting")
  let found = false
  run(field, tick, [[a, da], [b, db]], 3000, () => {
    if (db.mode === "found") found = true
  })
  assert(found, `the hider was never found (${db.mode})`)
})
