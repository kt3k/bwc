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
  ROLES,
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
  water = new Set<string>(),
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
      !walls.has(`${i}.${j}`) && !water.has(`${i}.${j}`) &&
      !blockedByProp(i, j) && !all().some((a) => a.i === i && a.j === j),
    canEnterStatic: (i, j) =>
      !walls.has(`${i}.${j}`) && !water.has(`${i}.${j}`) &&
      !blockedByProp(i, j),
    isSlippery: () => false,
    isWater: (i, j) => water.has(`${i}.${j}`),
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

Deno.test("villager roles", async (t) => {
  /** Runs the delegate for n frames, one step per frame */
  const run = (
    delegate: VillagerDelegate,
    actor: Actor,
    tick: (n?: number) => void,
    field: IField,
    n: number,
  ) => {
    for (let k = 0; k < n; k++) {
      delegate.onIdle(actor, field)
      tick()
    }
  }

  await t.step("sentry: walks its beat to the end and looks on", () => {
    const me = new Actor(50, 50, def, "main")
    const guard = new Actor(0, 0, def, "g")
    // a corridor running right from the post
    const walls = new Set<string>()
    for (let i = -1; i <= 9; i++) walls.add(`${i}.-1`).add(`${i}.1`)
    walls.add("-1.0")
    const { field, tick } = makeTown(me, [guard], [], walls)
    const delegate = new VillagerDelegate(ROLES.sentry())
    run(delegate, guard, tick, field, 12)
    assertEquals([guard.i, guard.j], [6, 0])
    assertEquals(guard.dir, "right")
  })

  await t.step("fisher: stands at the bank facing the water", () => {
    const me = new Actor(50, 50, def, "main")
    const fisher = new Actor(0, 0, def, "f")
    const water = new Set<string>()
    for (let j = -5; j <= 5; j++) water.add(`4.${j}`)
    const { field, tick } = makeTown(me, [fisher], [], new Set(), water)
    const delegate = new VillagerDelegate(ROLES.fisher())
    run(delegate, fisher, tick, field, 8)
    assertEquals(fisher.i, 3)
    assertEquals(fisher.dir, "right")
  })

  await t.step("elder: sits on the bench", () => {
    const me = new Actor(50, 50, def, "main")
    const elder = new Actor(0, 0, def, "e")
    const bench = makeProp("bench", 0, 4, true)
    const { field, tick } = makeTown(me, [elder], [bench])
    const delegate = new VillagerDelegate(ROLES.elder())
    run(delegate, elder, tick, field, 8)
    assertEquals([elder.i, elder.j], [0, 4])
  })

  await t.step("farmer: works next to a crop", () => {
    const me = new Actor(50, 50, def, "main")
    const farmer = new Actor(0, 0, def, "fa")
    const crop = makeProp("sapling", 5, 0)
    const { field, tick } = makeTown(me, [farmer], [crop])
    const delegate = new VillagerDelegate(ROLES.farmer())
    run(delegate, farmer, tick, field, 8)
    assertEquals([farmer.i, farmer.j], [4, 0])
    assertEquals(farmer.dir, "right")
  })

  await t.step("attendant: keeps near the princess", () => {
    const me = new Actor(50, 50, def, "main")
    const princess = new Actor(
      8,
      0,
      { ...def, type: "princess" },
      "p",
    )
    const chancellor = new Actor(0, 0, def, "c")
    const { field, tick } = makeTown(me, [princess, chancellor])
    const delegate = new VillagerDelegate(ROLES.attendant())
    run(delegate, chancellor, tick, field, 10)
    assertEquals(
      Math.abs(chancellor.i - 8) + Math.abs(chancellor.j),
      2,
    )
  })

  await t.step("lamplighter: goes round the lamp posts", () => {
    const me = new Actor(50, 50, def, "main")
    const lighter = new Actor(0, 0, def, "ll")
    const lamps = [makeProp("lamp-post", 6, 0), makeProp("lamp-post", 0, 6)]
    const { field, tick } = makeTown(me, [lighter], lamps)
    const delegate = new VillagerDelegate(ROLES.lamplighter())
    const visited = new Set<string>()
    for (let k = 0; k < 600; k++) {
      delegate.onIdle(lighter, field)
      tick()
      for (const l of lamps) {
        if (Math.abs(l.i - lighter.i) + Math.abs(l.j - lighter.j) === 1) {
          visited.add(`${l.i}.${l.j}`)
        }
      }
    }
    assertEquals(visited.size, 2)
  })

  await t.step("shopper: looks at a stall", () => {
    const me = new Actor(50, 50, def, "main")
    const shopper = new Actor(0, 0, def, "sh")
    const shop = makeProp("shop", 0, 5)
    const { field, tick } = makeTown(me, [shopper], [shop])
    const delegate = new VillagerDelegate(ROLES.shopper())
    run(delegate, shopper, tick, field, 8)
    assertEquals([shopper.i, shopper.j], [0, 4])
    assertEquals(shopper.dir, "down")
  })

  await t.step("commuter: goes to work far off, then home", () => {
    const me = new Actor(80, 80, def, "main")
    const commuter = new Actor(0, 0, def, "co")
    const work = makeProp("notice-board", 20, 0)
    const { field, tick } = makeTown(me, [commuter], [work])
    const delegate = new VillagerDelegate(ROLES.commuter())
    run(delegate, commuter, tick, field, 25)
    assertEquals([commuter.i, commuter.j], [19, 0])
    // after the work, back home
    for (let k = 0; k < 60 && commuter.i !== 0; k++) {
      delegate.onIdle(commuter, field)
      tick(60)
    }
    assertEquals([commuter.i, commuter.j], [0, 0])
  })

  await t.step("beggar: takes a coin when bumped", () => {
    signal.coinCount.update(2)
    const me = new Actor(1, 0, def, "main")
    const beggar = new Actor(0, 0, def, "be")
    const { field } = makeTown(me, [beggar])
    const delegate = new VillagerDelegate(ROLES.beggar())
    delegate.onPushed(
      { type: "pushed", dir: "left", peakAt: 7, pusher: me },
      beggar,
      field,
    )
    assertEquals(signal.coinCount.get(), 1)
    assert(signal.message.get()?.text.includes("BLESS"))
  })

  await t.step("crier: calls the news to the player nearby", () => {
    signal.message.update(null)
    const me = new Actor(3, 0, def, "main")
    const crier = new Actor(0, 0, def, "cr")
    const { field, tick } = makeTown(me, [crier])
    const delegate = new VillagerDelegate(ROLES.crier())
    run(delegate, crier, tick, field, 320)
    assert(signal.message.get()?.text.startsWith("HEAR YE"))
  })

  await t.step("performer: stays on its spot and draws a listener", () => {
    const me = new Actor(50, 50, def, "main")
    const bard = new Actor(0, 0, def, "b")
    const listener = new Actor(6, 0, def, "l")
    const { field, tick } = makeTown(me, [bard, listener])
    const db = new VillagerDelegate(ROLES.performer())
    const dl = new VillagerDelegate()
    let came = false
    for (let k = 0; k < 4000 && !came; k++) {
      db.onIdle(bard, field)
      dl.onIdle(listener, field)
      came = Math.abs(listener.i) + Math.abs(listener.j) === 2
      tick()
    }
    assertEquals([bard.i, bard.j], [0, 0])
    assert(came)
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
