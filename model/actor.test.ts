import {
  Actor,
  ActorPushedDelegateRoll,
  ActorPushedDelegateUnstoppable,
  CrowDelegate,
  IdleDelegateChase,
  IdleDelegateFlee,
  IdleDelegateMirror,
  IdleDelegatePatrol,
  MoveEndDelegatePatrol,
} from "./actor.ts"
import { MoveGo } from "./move.ts"
import { Item } from "./item.ts"
import { ActorDefinition } from "./catalog.ts"
import type { IActor, IField, IProp, PushedEvent } from "./types.ts"
import * as signal from "../util/signals.ts"
import { assert, assertEquals, assertFalse } from "@std/assert"

const actorDef: ActorDefinition = {
  type: "main",
  src: "../main/",
  href: "./main/",
}

/** Creates a minimal IField stub for delegate tests */
function makeField(me: IActor): IField {
  return {
    get me() {
      return me
    },
    canEnter: (i, j) => !(i === me.i && j === me.j),
    canEnterStatic: () => true,
    isSlippery: () => false,
    isWater: () => false,
    conveyorDir: () => null,
    isDiggable: () => false,
    updateCell: () => {},
    peekItem: () => undefined,
    spawnActor: () => null,
    spawnItem: () => null,
    spawnProp: () => null,
    collectItem: () => {},
    actors: {
      iter: () => [],
      get: (i, j) => (i === me.i && j === me.j ? [me] : []),
      add: () => {},
      remove: () => {},
    },
    props: { get: () => undefined, remove: () => {}, iter: () => [] },
    effects: { add: () => {} },
    get time() {
      return 0
    },
    colorCell: () => {},
  }
}

Deno.test("Actor", async (t) => {
  await t.step("physicalGridKey", () => {
    const mc = new Actor(100, 100, actorDef, "main")
    assertEquals(mc.physicalGridKey, "100.100")

    const npc = new Actor(200, 200, actorDef, "npc")
    assertEquals(npc.physicalGridKey, "200.200")
  })

  await t.step("frontGrid", () => {
    const c = new Actor(100, 100, actorDef, "main")
    assertEquals(c.frontGrid(), [100, 101])

    c.setDir("right")
    assertEquals(c.frontGrid(), [101, 100])
    c.setDir("left")
    assertEquals(c.frontGrid(), [99, 100])
    c.setDir("up")
    assertEquals(c.frontGrid(), [100, 99])
  })
})

Deno.test("IdleDelegateChase", async (t) => {
  await t.step("chases the player within range", () => {
    const me = new Actor(3, 0, actorDef, "main")
    const chaser = new Actor(0, 0, actorDef, "npc", "down", 1, null, null)
    const field = makeField(me)
    const chase = new IdleDelegateChase()
    chase.onIdle(chaser, field)
    assertEquals(chaser.i, 1)
    assertEquals(chaser.j, 0)
    assertEquals(chaser.dir, "right")
  })

  await t.step("waits on the spot when the player is out of range", () => {
    const me = new Actor(100, 100, actorDef, "main")
    const chaser = new Actor(0, 0, actorDef, "npc", "down", 1, null, null)
    const field = makeField(me)
    const chase = new IdleDelegateChase()
    chase.onIdle(chaser, field)
    assertEquals(chaser.i, 0)
    assertEquals(chaser.j, 0)
  })

  await t.step("steals an apple on contact with cooldown", () => {
    signal.appleCount.update(5)
    const me = new Actor(1, 0, actorDef, "main")
    const chaser = new Actor(0, 0, actorDef, "npc", "down", 1, null, null)
    const field = makeField(me)
    const chase = new IdleDelegateChase()
    chase.onIdle(chaser, field)
    // The chaser bounces into the player and steals an apple
    assertEquals(chaser.i, 0)
    assertEquals(signal.appleCount.get(), 4)
    // The second contact within the cooldown doesn't steal
    chase.onIdle(chaser, field)
    assertEquals(signal.appleCount.get(), 4)
    signal.appleCount.update(0)
  })
})

Deno.test("Actor keeps sliding on slippery cells at 4x speed", () => {
  const me = new Actor(50, 50, actorDef, "main")
  const actor = new Actor(0, 0, actorDef, "npc", "down", 16, null, null)
  const field: IField = {
    ...makeField(me),
    isSlippery: (i, _j) => i >= 1 && i <= 2,
  }
  actor.tryMove("go", "right", field)
  assertEquals(actor.i, 1)
  actor.step(field) // The move finishes on the slippery cell
  actor.step(field) // Slides to (2, 0), still slippery
  assertEquals(actor.i, 2)
  // At 4x speed each slide takes 4 frames: (3, 0) is reached at the
  // 6th step (a 1x slide would need 18 steps)
  for (const _ of Array(4)) {
    actor.step(field)
  }
  assertEquals(actor.i, 3)
  for (const _ of Array(6)) {
    actor.step(field)
  }
  // The actor stops on the non-slippery cell
  assertEquals(actor.i, 3)
})

Deno.test("ActorPushedDelegateRoll rolls until blocked", () => {
  const me = new Actor(50, 50, actorDef, "main")
  const boulder = new Actor(
    0,
    0,
    actorDef,
    "boulder",
    "down",
    16,
    null,
    null,
    new ActorPushedDelegateRoll(),
  )
  const field: IField = {
    ...makeField(me),
    canEnterStatic: (i, _j) => i < 3,
  }
  boulder.onPushed({ type: "pushed", dir: "right", peakAt: 7 }, field)
  for (const _ of Array(10)) {
    boulder.step(field)
  }
  // The boulder stops right before the blocked cell (3, 0)
  assertEquals(boulder.i, 2)
  assertEquals(boulder.j, 0)
})

Deno.test("Actor is carried by conveyor cells at 4x speed", () => {
  const me = new Actor(50, 50, actorDef, "main")
  const actor = new Actor(0, 0, actorDef, "npc", "down", 16, null, null)
  const field: IField = {
    ...makeField(me),
    conveyorDir: (i, _j) => (i >= 1 && i <= 2 ? "right" : null),
  }
  actor.tryMove("go", "right", field)
  assertEquals(actor.i, 1)
  // At 4x speed the two belt cells are crossed within 6 steps
  for (const _ of Array(6)) {
    actor.step(field)
  }
  assertEquals(actor.i, 3)
  for (const _ of Array(6)) {
    actor.step(field)
  }
  // Dropped at (3, 0) past the belts
  assertEquals(actor.i, 3)
})

Deno.test("Boulder sinks into water and builds a bridge", () => {
  const me = new Actor(50, 50, actorDef, "main")
  const boulder = new Actor(
    0,
    0,
    actorDef,
    "boulder",
    "down",
    16,
    null,
    null,
    new ActorPushedDelegateRoll(),
  )
  const updated: [number, number, string][] = []
  let removed = false
  const field: IField = {
    ...makeField(me),
    isWater: (i, _j) => i === 3,
    updateCell: (i, j, cell) => {
      updated.push([i, j, cell])
    },
    actors: {
      iter: () => [],
      get: () => [],
      add: () => {},
      remove: () => {
        removed = true
      },
    },
  }
  boulder.onPushed({ type: "pushed", dir: "right", peakAt: 7 }, field)
  for (const _ of Array(10)) {
    boulder.step(field)
  }
  // The water cell became a floor and the boulder is gone
  assertEquals(updated, [[3, 0, "0"]])
  assert(removed)
  assertEquals(boulder.i, 2)
})

Deno.test("Rolling boulder presses the prop it stops at", () => {
  const me = new Actor(50, 50, actorDef, "main")
  const boulder = new Actor(
    0,
    0,
    actorDef,
    "boulder",
    "down",
    16,
    null,
    null,
    new ActorPushedDelegateRoll(),
  )
  const pushedBy: string[] = []
  const field: IField = {
    ...makeField(me),
    canEnterStatic: (i, _j) => i < 3,
    props: {
      get: (i, j) => {
        if (i !== 3 || j !== 0) return undefined
        return {
          onPushed: (ev: PushedEvent) => {
            pushedBy.push(ev.pusher?.id ?? "?")
          },
        } as unknown as IProp
      },
      remove: () => {},
      iter: () => [],
    },
  }
  boulder.onPushed({ type: "pushed", dir: "right", peakAt: 7 }, field)
  for (const _ of Array(10)) {
    boulder.step(field)
  }
  assertEquals(boulder.i, 2)
  assertEquals(pushedBy, ["boulder"])
})

Deno.test("Patrol actor bounces between the ends of its lane", () => {
  const me = new Actor(50, 50, actorDef, "main")
  const patrol = new Actor(
    1,
    0,
    actorDef,
    "patrol",
    "right",
    16,
    new MoveEndDelegatePatrol(),
    new IdleDelegatePatrol(),
  )
  const field: IField = {
    ...makeField(me),
    canEnter: (i, _j) => i >= 0 && i <= 2,
  }
  patrol.step(field) // starts walking right on its own (16x: 1 frame)
  assertEquals(patrol.i, 2)
  patrol.step(field) // bumps into the wall and bounces
  assertEquals(patrol.i, 2)
  assertEquals(patrol.dir, "right")
  patrol.step(field) // turned back after the bounce
  assertEquals(patrol.i, 1)
  assertEquals(patrol.dir, "left")
})

Deno.test("Rolling boulder stops in front of an unstoppable actor", () => {
  const me = new Actor(50, 50, actorDef, "main")
  const patrol = new Actor(
    3,
    0,
    actorDef,
    "patrol",
    "down",
    1,
    null,
    null,
    new ActorPushedDelegateUnstoppable(),
  )
  const boulder = new Actor(
    0,
    0,
    actorDef,
    "boulder",
    "down",
    16,
    null,
    null,
    new ActorPushedDelegateRoll(),
  )
  let removed = false
  const field: IField = {
    ...makeField(me),
    canEnter: (i, j) => !(i === 3 && j === 0),
    actors: {
      iter: () => [],
      get: (i, j) => (i === 3 && j === 0 ? [patrol] : []),
      add: () => {},
      remove: () => {
        removed = true
      },
    },
  }
  boulder.onPushed({ type: "pushed", dir: "right", peakAt: 7 }, field)
  for (const _ of Array(10)) {
    boulder.step(field)
  }
  assertFalse(removed)
  assertEquals(boulder.i, 2)
})

Deno.test("Patrol actor turns back after knocking an actor", () => {
  const me = new Actor(0, 0, actorDef, "main")
  const patrol = new Actor(
    2,
    0,
    actorDef,
    "patrol",
    "left",
    16,
    new MoveEndDelegatePatrol(),
    new IdleDelegatePatrol(),
  )
  const field = makeField(me)
  patrol.step(field) // walks to (1, 0)
  assertEquals(patrol.i, 1)
  patrol.step(field) // bumps into the player and knocks it
  patrol.step(field) // ...then turns back instead of plowing through
  assertEquals(patrol.i, 2)
  assertEquals(patrol.dir, "right")
})

Deno.test("ActorGoMove", () => {
  const move = new MoveGo(1, "up")
  assertFalse(move.halfPassed)
  assertEquals(move.x, 0)
  assertEquals(move.y, 16)
  move.step() // 1
  assertEquals(move.x, 0)
  assertEquals(move.y, 15)
  move.step() // 2
  assertEquals(move.x, 0)
  assertEquals(move.y, 14)
  move.step() // 3
  assertEquals(move.x, 0)
  assertEquals(move.y, 13)
  move.step() // 4
  assertEquals(move.x, 0)
  assertEquals(move.y, 12)
  move.step() // 5
  assertEquals(move.x, 0)
  assertEquals(move.y, 11)
  move.step() // 6
  assertEquals(move.x, 0)
  assertEquals(move.y, 10)
  move.step() // 7
  assertEquals(move.x, 0)
  assertEquals(move.y, 9)
  assertFalse(move.halfPassed)
  move.step() // 8
  assertEquals(move.x, 0)
  assertEquals(move.y, 8)
  assert(move.halfPassed)
  move.step() // 9
  assertEquals(move.x, 0)
  assertEquals(move.y, 7)
  move.step() // 10
  assertEquals(move.x, 0)
  assertEquals(move.y, 6)
  move.step() // 11
  assertEquals(move.x, 0)
  assertEquals(move.y, 5)
  move.step() // 12
  assertEquals(move.x, 0)
  assertEquals(move.y, 4)
  move.step() // 13
  assertEquals(move.x, 0)
  assertEquals(move.y, 3)
  move.step() // 14
  assertEquals(move.x, 0)
  assertEquals(move.y, 2)
  move.step() // 15
  assertEquals(move.x, 0)
  assertEquals(move.y, 1)
  assertFalse(move.finished)
  move.step() // 16
  assertEquals(move.x, 0)
  assertEquals(move.y, 0)
  assert(move.finished)
})

Deno.test("IdleDelegateMirror", async (t) => {
  await t.step("replays the player's steps with left and right swapped", () => {
    const me = new Actor(5, 0, actorDef, "main")
    const mirror = new Actor(0, 0, actorDef, "npc")
    const field = makeField(me)
    const delegate = new IdleDelegateMirror()
    // The first call only syncs to the player
    delegate.onIdle(mirror, field)
    assertEquals([mirror.i, mirror.j], [0, 0])
    me.fastTravel(6, 0)
    delegate.onIdle(mirror, field)
    assertEquals([mirror.i, mirror.j], [-1, 0])
    assertEquals(mirror.dir, "left")
    me.fastTravel(6, 1)
    delegate.onIdle(mirror, field)
    assertEquals([mirror.i, mirror.j], [-1, 1])
    assertEquals(mirror.dir, "down")
    // Nothing happens while the player stands still
    delegate.onIdle(mirror, field)
    assertEquals([mirror.i, mirror.j], [-1, 1])
  })

  await t.step("replays a backlog one step at a time", () => {
    const me = new Actor(5, 0, actorDef, "main")
    const mirror = new Actor(0, 0, actorDef, "npc")
    const field = makeField(me)
    const delegate = new IdleDelegateMirror()
    delegate.onIdle(mirror, field)
    me.fastTravel(3, 0)
    delegate.onIdle(mirror, field)
    assertEquals([mirror.i, mirror.j], [1, 0])
    delegate.onIdle(mirror, field)
    assertEquals([mirror.i, mirror.j], [2, 0])
    delegate.onIdle(mirror, field)
    assertEquals([mirror.i, mirror.j], [2, 0])
  })

  await t.step("bumps the wall instead of moving, getting out of sync", () => {
    const me = new Actor(5, 0, actorDef, "main")
    const mirror = new Actor(0, 0, actorDef, "npc")
    const field: IField = {
      ...makeField(me),
      canEnter: (i, j) => !(i === -1 && j === 0) && !(i === me.i && j === me.j),
    }
    const delegate = new IdleDelegateMirror()
    delegate.onIdle(mirror, field)
    me.fastTravel(6, 0)
    delegate.onIdle(mirror, field)
    assertEquals([mirror.i, mirror.j], [0, 0])
    assertEquals(mirror.dir, "left")
  })

  await t.step("re-syncs without moving when the player warps", () => {
    const me = new Actor(5, 0, actorDef, "main")
    const mirror = new Actor(0, 0, actorDef, "npc")
    const field = makeField(me)
    const delegate = new IdleDelegateMirror()
    delegate.onIdle(mirror, field)
    me.fastTravel(12, 0)
    delegate.onIdle(mirror, field)
    assertEquals([mirror.i, mirror.j], [0, 0])
    me.fastTravel(13, 0)
    delegate.onIdle(mirror, field)
    assertEquals([mirror.i, mirror.j], [-1, 0])
  })
})

Deno.test("IdleDelegateFlee", async (t) => {
  await t.step("runs straight away from the approaching player", () => {
    const me = new Actor(0, 0, actorDef, "main")
    const sheep = new Actor(2, 0, actorDef, "npc")
    const field = makeField(me)
    new IdleDelegateFlee().onIdle(sheep, field)
    assertEquals([sheep.i, sheep.j], [3, 0])
  })

  await t.step("grazes while the player is out of range", () => {
    const me = new Actor(0, 0, actorDef, "main")
    const sheep = new Actor(10, 0, actorDef, "npc")
    const field = makeField(me)
    new IdleDelegateFlee().onIdle(sheep, field)
    assertEquals([sheep.i, sheep.j], [10, 0])
  })

  await t.step("sidesteps when the way ahead is blocked", () => {
    const me = new Actor(0, 0, actorDef, "main")
    const sheep = new Actor(2, 0, actorDef, "npc")
    const field: IField = {
      ...makeField(me),
      canEnter: (i, j) => !(i === 3 && j === 0) && !(i === me.i && j === me.j),
    }
    new IdleDelegateFlee().onIdle(sheep, field)
    assertEquals(sheep.i, 2)
    assertEquals(Math.abs(sheep.j), 1)
  })

  await t.step("never steps toward the player when cornered", () => {
    const me = new Actor(0, 0, actorDef, "main")
    const sheep = new Actor(1, 0, actorDef, "npc")
    const field: IField = {
      ...makeField(me),
      canEnter: (i, _j) => i < 1,
    }
    new IdleDelegateFlee().onIdle(sheep, field)
    assertEquals([sheep.i, sheep.j], [1, 0])
    assertEquals(sheep.dir, "left")
  })
})

Deno.test("CrowDelegate", async (t) => {
  const coinDef = { type: "coin", collect: "coin", src: "", href: "" }
  const appleDef = { type: "apple", collect: "apple", src: "", href: "" }

  function makeCrowField(me: IActor, items: Item[], water = new Set<string>()) {
    const field: IField = {
      ...makeField(me),
      canEnter: (i, j) =>
        !water.has(`${i}.${j}`) && !(i === me.i && j === me.j),
      isWater: (i, j) => water.has(`${i}.${j}`),
      peekItem: (i, j) =>
        items.find((item) => item.i === i && item.j === j && !item.isFollowing),
    }
    return field
  }

  await t.step("steals the nearest coin and carries it to the nest", () => {
    const me = new Actor(0, -4, actorDef, "main")
    const crow = new Actor(0, 0, actorDef, "npc")
    const coin = new Item("coin1", 3, 0, coinDef)
    const apple = new Item("apple1", 0, 3, appleDef)
    const field = makeCrowField(me, [coin, apple])
    const delegate = new CrowDelegate()
    for (let n = 0; n < 3; n++) delegate.onIdle(crow, field)
    assertEquals([crow.i, crow.j], [3, 0])
    delegate.onIdle(crow, field)
    assertEquals(delegate.carrying, "coin1")
    assert(coin.isFollowing)
    assertEquals(crow.follower, coin)
    for (let n = 0; n < 3; n++) delegate.onIdle(crow, field)
    assertEquals([crow.i, crow.j], [0, 0])
    // Home: drops the coin by the nest
    delegate.onIdle(crow, field)
    assertEquals(delegate.carrying, null)
    assertFalse(coin.isFollowing)
    assertEquals(crow.follower, null)
  })

  await t.step("leaves the hoard around the nest alone", () => {
    const me = new Actor(0, -4, actorDef, "main")
    const crow = new Actor(0, 0, actorDef, "npc")
    const coin = new Item("coin1", 2, 0, coinDef)
    const field = makeCrowField(me, [coin])
    const delegate = new CrowDelegate()
    delegate.onIdle(crow, field)
    assertEquals([crow.i, crow.j], [0, 0])
  })

  await t.step("stays home while the player is away", () => {
    const me = new Actor(50, 50, actorDef, "main")
    const crow = new Actor(0, 0, actorDef, "npc")
    const coin = new Item("coin1", 3, 0, coinDef)
    const field = makeCrowField(me, [coin])
    new CrowDelegate().onIdle(crow, field)
    assertEquals([crow.i, crow.j], [0, 0])
  })

  await t.step(
    "keeps flying to the loot when it leaves the player behind",
    () => {
      // The player is 8 cells from the nest, and 9 from the crow after
      // its first step
      const me = new Actor(-3, -5, actorDef, "main")
      const crow = new Actor(0, 0, actorDef, "npc")
      const coin = new Item("coin1", 4, 0, coinDef)
      const field = makeCrowField(me, [coin])
      const delegate = new CrowDelegate()
      for (let n = 0; n < 4; n++) delegate.onIdle(crow, field)
      assertEquals([crow.i, crow.j], [4, 0])
    },
  )

  await t.step("flies over the water", () => {
    const me = new Actor(0, -4, actorDef, "main")
    const crow = new Actor(0, 0, actorDef, "npc")
    const coin = new Item("coin1", 4, 0, coinDef)
    const field = makeCrowField(me, [coin], new Set(["1.0", "2.0"]))
    const delegate = new CrowDelegate()
    delegate.onIdle(crow, field)
    assertEquals([crow.i, crow.j], [1, 0])
  })

  await t.step("drops the loot when bumped on land", () => {
    const me = new Actor(0, -4, actorDef, "main")
    const crow = new Actor(0, 0, actorDef, "npc")
    const coin = new Item("coin1", 3, 0, coinDef)
    const field = makeCrowField(me, [coin])
    const delegate = new CrowDelegate()
    for (let n = 0; n < 4; n++) delegate.onIdle(crow, field)
    assertEquals(delegate.carrying, "coin1")
    const ev: PushedEvent = { type: "pushed", dir: "right", peakAt: 7 }
    delegate.onPushed(ev, crow, field)
    assertEquals(delegate.carrying, null)
    assertFalse(coin.isFollowing)
  })

  await t.step("holds tight over the water", () => {
    const me = new Actor(0, -4, actorDef, "main")
    const crow = new Actor(0, 0, actorDef, "npc")
    const coin = new Item("coin1", 3, 0, coinDef)
    const water = new Set<string>()
    const field = makeCrowField(me, [coin], water)
    const delegate = new CrowDelegate()
    for (let n = 0; n < 4; n++) delegate.onIdle(crow, field)
    water.add(`${crow.i}.${crow.j}`)
    const ev: PushedEvent = { type: "pushed", dir: "right", peakAt: 7 }
    delegate.onPushed(ev, crow, field)
    assertEquals(delegate.carrying, "coin1")
  })
})
