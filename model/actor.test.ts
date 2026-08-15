import { Actor, ActorPushedDelegateRoll, IdleDelegateChase } from "./actor.ts"
import { MoveGo } from "./move.ts"
import { ActorDefinition } from "./catalog.ts"
import type { IActor, IField } from "./types.ts"
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
    props: { get: () => undefined, remove: () => {} },
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

Deno.test("Actor keeps sliding on slippery cells", () => {
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
  actor.step(field) // Slides to (3, 0), not slippery
  assertEquals(actor.i, 3)
  actor.step(field)
  actor.step(field)
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
