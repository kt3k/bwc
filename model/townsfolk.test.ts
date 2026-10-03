import { assert, assertEquals, assertFalse } from "@std/assert"
import { Actor } from "./actor.ts"
import type { ActorDefinition } from "./catalog.ts"
import { findPath } from "./steering.ts"
import {
  CatDelegate,
  isPlayerIt,
  KeeperDelegate,
  KidDelegate,
  resetTag,
  VillagerDelegate,
} from "./townsfolk.ts"
import type { IActor, IField, IProp } from "./types.ts"
import * as signal from "../util/signals.ts"

const def: ActorDefinition = { type: "npc", src: "../x/", href: "./x/" }

/**
 * A field of open floor except the given walls, holding the given
 * actors (collisions included) and props. The time can be advanced.
 */
function makeTown(
  me: Actor,
  others: Actor[],
  props: IProp[] = [],
  walls = new Set<string>(),
) {
  let time = 0
  const all = () => [me, ...others]
  const blockedByProp = (i: number, j: number) =>
    props.some((p) => p.i === i && p.j === j && !p.canEnter)
  const field: IField = {
    get me() {
      return me
    },
    canEnter: (i, j) =>
      !walls.has(`${i}.${j}`) && !blockedByProp(i, j) &&
      !all().some((a) => a.i === i && a.j === j),
    canEnterStatic: (i, j) => !walls.has(`${i}.${j}`) && !blockedByProp(i, j),
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

function makeProp(type: string, i: number, j: number, canEnter = false) {
  return { type, i, j, canEnter } as unknown as IProp
}

Deno.test("findPath walks around the walls", () => {
  const walls = new Set(["1.0", "1.1", "1.-1"])
  const path = findPath(
    0,
    0,
    (i, j) => i === 2 && j === 0,
    (i, j) => !walls.has(`${i}.${j}`) && Math.abs(i) < 5 && Math.abs(j) < 5,
  )
  assertEquals(path?.length, 6)
  assertEquals(
    findPath(
      0,
      0,
      (i, j) => i === 9 && j === 9,
      (i, j) => Math.abs(i) < 3 && Math.abs(j) < 3,
    ),
    null,
  )
})

Deno.test("VillagerDelegate", async (t) => {
  await t.step("walks to a landmark, lingers, then moves on", () => {
    const me = new Actor(50, 50, def, "main")
    const villager = new Actor(0, 0, def, "v1")
    const table = makeProp("table", 4, 0)
    const { field, tick } = makeTown(me, [villager], [table])
    const delegate = new VillagerDelegate()
    for (let n = 0; n < 10; n++) {
      delegate.onIdle(villager, field)
      tick()
    }
    // Stands next to the table, facing it
    assertEquals([villager.i, villager.j], [3, 0])
    assertEquals(villager.dir, "right")
    // Lingers there for a while
    delegate.onIdle(villager, field)
    tick(10)
    delegate.onIdle(villager, field)
    assertEquals([villager.i, villager.j], [3, 0])
  })

  await t.step("sits on a stool", () => {
    const me = new Actor(50, 50, def, "main")
    const villager = new Actor(0, 0, def, "v1")
    const stool = makeProp("stool", 0, 3, true)
    const { field, tick } = makeTown(me, [villager], [stool])
    const delegate = new VillagerDelegate()
    for (let n = 0; n < 5; n++) {
      delegate.onIdle(villager, field)
      tick()
    }
    assertEquals([villager.i, villager.j], [0, 3])
  })

  await t.step("ignores the landmarks far from home", () => {
    const me = new Actor(50, 50, def, "main")
    const villager = new Actor(0, 0, def, "v1")
    const table = makeProp("table", 30, 0)
    const { field } = makeTown(me, [villager], [table])
    new VillagerDelegate().onIdle(villager, field)
    assert(Math.abs(villager.i) + Math.abs(villager.j) <= 1)
  })

  await t.step("stops to chat with the villager it meets", () => {
    const me = new Actor(50, 50, def, "main")
    // A one-row corridor: a walks to the table where b already stands
    const a = new Actor(0, 0, def, "a")
    const b = new Actor(6, 0, def, "b")
    const table = makeProp("table", 7, 0)
    const walls = new Set<string>()
    for (let i = -2; i <= 9; i++) walls.add(`${i}.-1`).add(`${i}.1`)
    const { field, tick } = makeTown(me, [a, b], [table], walls)
    const da = new VillagerDelegate()
    const db = new VillagerDelegate()
    let met = false
    for (let n = 0; n < 10 && !met; n++) {
      da.onIdle(a, field)
      db.onIdle(b, field)
      met = da.isChatting && db.isChatting
      tick()
    }
    assert(met)
    // They face each other
    assertEquals(
      Math.abs(a.i - b.i) + Math.abs(a.j - b.j),
      1,
    )
  })

  await t.step("talks to the player who bumps into it", () => {
    signal.message.update(null)
    const me = new Actor(1, 0, def, "main")
    const villager = new Actor(0, 0, def, "v1")
    const { field } = makeTown(me, [villager])
    const delegate = new VillagerDelegate()
    delegate.onPushed(
      { type: "pushed", dir: "left", peakAt: 7, pusher: me },
      villager,
      field,
    )
    assert(signal.message.get()?.text)
    assertEquals(villager.dir, "right")
    assertEquals([villager.i, villager.j], [0, 0])
  })
})

Deno.test("KeeperDelegate", async (t) => {
  await t.step("greets the player once and watches them", () => {
    signal.message.update(null)
    const me = new Actor(0, 3, def, "main")
    const keeper = new Actor(0, 0, def, "k")
    const { field, tick } = makeTown(me, [keeper])
    const delegate = new KeeperDelegate()
    delegate.onIdle(keeper, field)
    assertEquals(signal.message.get()?.text, "WELCOME! TAKE A LOOK")
    assertEquals(keeper.dir, "down")
    signal.message.update(null)
    tick()
    delegate.onIdle(keeper, field)
    assertEquals(signal.message.get(), null)
  })

  await t.step("tidies up and comes back to its post", () => {
    const me = new Actor(50, 50, def, "main")
    const keeper = new Actor(0, 0, def, "k")
    const { field, tick } = makeTown(me, [keeper])
    const delegate = new KeeperDelegate()
    delegate.onIdle(keeper, field)
    assertEquals(Math.abs(keeper.i) + Math.abs(keeper.j), 1)
    tick(200)
    delegate.onIdle(keeper, field)
    assertEquals([keeper.i, keeper.j], [0, 0])
  })
})

Deno.test("KidDelegate", async (t) => {
  await t.step("one kid becomes it and chases the other", () => {
    resetTag()
    const me = new Actor(50, 50, def, "main")
    const a = new Actor(0, 0, def, "a")
    const b = new Actor(5, 0, def, "b")
    const { field, tick } = makeTown(me, [a, b])
    const ka = new KidDelegate()
    const kb = new KidDelegate()
    ka.onIdle(a, field)
    kb.onIdle(b, field)
    assert(ka.isIt)
    assertFalse(kb.isIt)
    // Counts to three, then runs after b
    tick(90)
    ka.onIdle(a, field)
    assertEquals([a.i, a.j], [1, 0])
  })

  await t.step("a bump from it passes it on", () => {
    resetTag()
    const me = new Actor(50, 50, def, "main")
    const a = new Actor(0, 0, def, "a")
    const b = new Actor(1, 0, def, "b")
    const { field } = makeTown(me, [a, b])
    const ka = new KidDelegate()
    const kb = new KidDelegate()
    ka.onIdle(a, field)
    kb.onIdle(b, field)
    kb.onPushed(
      { type: "pushed", dir: "right", peakAt: 7, pusher: a },
      b,
      field,
    )
    assertFalse(ka.isIt)
    assert(kb.isIt)
  })

  await t.step("tags the player, who tags back by a bump", () => {
    resetTag()
    const me = new Actor(1, 0, def, "main")
    const a = new Actor(0, 0, def, "a")
    const b = new Actor(0, 4, def, "b")
    const { field, tick } = makeTown(me, [a, b])
    const ka = new KidDelegate()
    const kb = new KidDelegate()
    ka.onIdle(a, field)
    kb.onIdle(b, field)
    tick(90)
    ka.onIdle(a, field)
    assert(isPlayerIt())
    assertFalse(ka.isIt)
    kb.onPushed(
      { type: "pushed", dir: "down", peakAt: 7, pusher: me as IActor },
      b,
      field,
    )
    assertFalse(isPlayerIt())
    assert(kb.isIt)
    resetTag()
  })
})

Deno.test("CatDelegate", async (t) => {
  await t.step("walks off from a stranger", () => {
    const me = new Actor(0, 0, def, "main")
    const cat = new Actor(2, 0, def, "c")
    const { field } = makeTown(me, [cat])
    new CatDelegate().onIdle(cat, field)
    assertEquals([cat.i, cat.j], [3, 0])
  })

  await t.step("follows the player who patted it", () => {
    const me = new Actor(0, 0, def, "main")
    const cat = new Actor(1, 0, def, "c")
    const { field, tick } = makeTown(me, [cat])
    const delegate = new CatDelegate()
    delegate.onPushed(
      { type: "pushed", dir: "right", peakAt: 7, pusher: me },
      cat,
      field,
    )
    assert(delegate.isFollowing)
    me.fastTravel(-4, 0)
    tick(40)
    delegate.onIdle(cat, field)
    assertEquals([cat.i, cat.j], [0, 0])
    // Loses interest after a while
    tick(1000)
    delegate.onIdle(cat, field)
    assertFalse(delegate.isFollowing)
  })
})
