// Odradek (model/odradek.ts): one for each goal done, in a corner of its
// home by turns; it scuttles off when the player comes near, a push
// never lands, and talked to it answers and laughs (leaves scatter)
import { assert, assertEquals, assertNotEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { Actor, spawnActor } from "./actor.ts"
import { Item } from "./item.ts"
import { goalsDone } from "./goal.ts"
import { ringKey, ringRewardKey } from "./ring.ts"
import { EffectLeaf } from "./leaf-wind.ts"
import {
  CALM,
  dueOdradeks,
  isCorner,
  LAUGH,
  LAUGH_LEAVES,
  LINGER,
  NEAR,
  ODRADEK_LINES,
  odradekCount,
  type OdradekHome,
  odradekId,
  odradekTurnedUp,
  resetOdradekVisits,
  setOdradekHomes,
} from "./odradek.ts"
import { manhattan } from "./steering.ts"
import * as signal from "../util/signals.ts"
import type { IActor, IField } from "./types.ts"

const catalog = Catalog.fromJSON(
  [{
    src: "base.json",
    json: JSON.parse(
      await Deno.readTextFile(
        new URL("../static/catalog/base.json", import.meta.url),
      ),
    ),
  }],
  "http://localhost/catalog/",
)

/** A room: walls round x 0..10, y 0..6; its corners inside are the four */
const ROOM: OdradekHome = {
  place: "TEST",
  box: [0, 0, 10, 6],
  corners: [[1, 1], [9, 5], [9, 1]],
}
const wall = (i: number, j: number) => i <= 0 || i >= 10 || j <= 0 || j >= 6

class Sim {
  time = 0
  actorList: IActor[] = []
  effectList: unknown[] = []
  me: Actor
  constructor(mi: number, mj: number) {
    this.me = new Actor(mi, mj, catalog.actors["static"], "main")
    this.actorList.push(this.me)
  }
  get field() {
    return this as unknown as IField
  }
  canEnter(i: number, j: number) {
    return this.canEnterStatic(i, j) &&
      !this.actorList.some((a) => a.i === i && a.j === j)
  }
  canEnterStatic(i: number, j: number) {
    return !wall(i, j)
  }
  isSlippery() {
    return false
  }
  isWater() {
    return false
  }
  conveyorDir() {
    return null
  }
  peekItems() {
    return []
  }
  get actors() {
    return {
      iter: () => this.actorList,
      get: (i: number, j: number) =>
        this.actorList.filter((a) => a.i === i && a.j === j),
      add: (a: IActor) => this.actorList.push(a),
      remove: () => {},
    }
  }
  get props() {
    return { get: () => undefined, iter: () => [], remove: () => {} }
  }
  get effects() {
    return { add: (e: unknown) => this.effectList.push(e) }
  }
  odradek(i: number, j: number) {
    const a = spawnActor(odradekId(0), i, j, catalog.actors["odradek"], {
      data: { box: ROOM.box },
    })
    this.actorList.push(a)
    return a
  }
  run(n: number, each?: () => void) {
    for (let k = 0; k < n; k++) {
      for (const a of [...this.actorList]) {
        if (a !== this.me) (a as Actor).step(this.field)
      }
      this.time++
      each?.()
    }
  }
}

Deno.test("as many Odradeks as goals done (the rewards don't count)", () => {
  Item.deserializeCollected([])
  setOdradekHomes([ROOM, ROOM, ROOM])
  assertEquals(goalsDone(), 0)
  assertEquals(odradekCount(), 0)
  Item.collect(ringKey("596.1439"))
  Item.collect(ringRewardKey("596.1439"))
  Item.collect("waystone.LOOKOUT")
  assertEquals(goalsDone(), 1)
  assertEquals(odradekCount(), 1)
  Item.collect(ringKey("zoo"))
  assertEquals(odradekCount(), 2)
  // never more than there are homes
  assertEquals(odradekCount(7), 3)
  // the k-th turns up while missing from the field, not while there
  resetOdradekVisits()
  const due = dueOdradeks(() => false, () => true)
  assertEquals(due.map((o) => o.id), [odradekId(0), odradekId(1)])
  assertEquals(dueOdradeks((id) => id === odradekId(0), () => true).length, 1)
  Item.deserializeCollected([])
  assertEquals(dueOdradeks(() => false, () => true).length, 0)
})

Deno.test("an Odradek turns up in the corners of its home, by turns", () => {
  setOdradekHomes([ROOM])
  resetOdradekVisits()
  const at = () => {
    const [o] = dueOdradeks(() => false, () => true, 1)
    return `${o.i}.${o.j}`
  }
  // the same corner until it turns up there
  const first = at()
  assertEquals(at(), first)
  odradekTurnedUp(0)
  const second = at()
  assertNotEquals(second, first)
  // a corner taken is passed over
  const [o] = dueOdradeks(() => false, (i, j) => `${i}.${j}` !== second, 1)
  assertNotEquals(`${o.i}.${o.j}`, second)
  // and all of them are corners of the room
  const sim = new Sim(5, 3)
  for (const [i, j] of ROOM.corners) assert(isCorner(sim.field, i, j))
  assert(!isCorner(sim.field, 5, 3))
})

Deno.test("the homes on the map are corners, the hall first", async () => {
  const homes: OdradekHome[] = JSON.parse(
    await Deno.readTextFile(
      new URL("../static/map/odradek.json", import.meta.url),
    ),
  )
  assert(homes.length >= 50, `${homes.length} homes`)
  assertEquals(homes[0].place, "THE HALL OF WAYSTONES")
  const blocks = new Map<string, string[]>()
  const cell = async (i: number, j: number) => {
    const bi = Math.floor(i / 200) * 200, bj = Math.floor(j / 200) * 200
    const name = i < -9000 ? "-10000.-10000" : `${bi}.${bj}`
    if (!blocks.has(name)) {
      const b = JSON.parse(
        await Deno.readTextFile(
          new URL(`../static/map/block_${name}.json`, import.meta.url),
        ),
      )
      blocks.set(name, b.field)
    }
    const [oi, oj] = name.split(".").map(Number)
    return blocks.get(name)![j - oj][i - oi]
  }
  const walls = new Set(["1", "2", "b"])
  for (const home of homes) {
    assert(home.corners.length >= 2, home.place)
    for (const [i, j] of home.corners) {
      const [x0, y0, x1, y1] = home.box
      assert(i > x0 && i < x1 && j > y0 && j < y1, `${i},${j} out of its box`)
      const w = async (i: number, j: number) => walls.has(await cell(i, j))
      assert(!(await w(i, j)), `${i},${j} is a wall`)
      assert(
        ((await w(i, j - 1)) || (await w(i, j + 1))) &&
          ((await w(i - 1, j)) || (await w(i + 1, j))),
        `${home.place} ${i},${j} is not a corner`,
      )
    }
  }
})

Deno.test("it scuttles off to another corner when the player comes near", () => {
  const sim = new Sim(5, 3)
  const od = sim.odradek(1, 1)
  // far: it stays
  sim.run(60)
  assertEquals([od.i, od.j], [1, 1])
  // the player comes within NEAR: it makes for another corner, fast
  sim.me.fastTravel(1 + NEAR, 1)
  sim.run(80)
  assert(isCorner(sim.field, od.i, od.j), `not in a corner: ${od.i},${od.j}`)
  assertNotEquals([od.i, od.j], [1, 1])
  assert(manhattan(od.i, od.j, sim.me.i, sim.me.j) > NEAR)
  assert(od.i > 0 && od.i < 10 && od.j > 0 && od.j < 6, "left its home")
  // once there it lets the player come up for a while...
  const [ci, cj] = [od.i, od.j]
  sim.me.fastTravel(ci === 9 ? 8 : 2, cj)
  sim.run(CALM / 2)
  assertEquals([od.i, od.j], [ci, cj])
  // ...and then it is off again
  sim.run(CALM)
  assertNotEquals([od.i, od.j], [ci, cj])
})

Deno.test("a push never lands: it just moves off", () => {
  // pushed from the side in the middle of the room: a shove would move it
  // one cell over; it is off to a far corner instead
  const sim = new Sim(4, 3)
  const od = sim.odradek(5, 3)
  od.onPushed(
    { type: "pushed", dir: "right", peakAt: 4, pusher: sim.me },
    sim.field,
  )
  sim.run(60)
  assert(isCorner(sim.field, od.i, od.j), `not in a corner: ${od.i},${od.j}`)
  assert(manhattan(od.i, od.j, sim.me.i, sim.me.j) > NEAR + 2)
  // a long chase, pushing whenever it is in reach: it is never had
  let pushes = 0
  const corners = new Set<string>()
  sim.run(3000, () => {
    // the player's steps: a cell in 8 frames (it scuttles one in 4)
    if (sim.time % 8 !== 0) return
    const di = od.i - sim.me.i, dj = od.j - sim.me.j
    if (Math.abs(di) + Math.abs(dj) === 1) {
      const dir = di > 0 ? "right" : di < 0 ? "left" : dj > 0 ? "down" : "up"
      od.onPushed({ type: "pushed", dir, peakAt: 4, pusher: sim.me }, sim.field)
      pushes++
      return
    }
    const ni = sim.me.i + Math.sign(di)
    const nj = sim.me.j +
      (di === 0 || !sim.canEnter(ni, sim.me.j) ? Math.sign(dj) : 0)
    const [ti, tj] = sim.canEnter(ni, sim.me.j) && di !== 0
      ? [ni, sim.me.j]
      : [sim.me.i, nj]
    if (sim.canEnter(ti, tj)) sim.me.fastTravel(ti, tj)
    if (isCorner(sim.field, od.i, od.j)) corners.add(`${od.i}.${od.j}`)
  })
  assert(pushes > 0, "never got to push it")
  assert(corners.size >= 2, `kept to ${[...corners]}`)
  assert(od.i > 0 && od.i < 10 && od.j > 0 && od.j < 6, "left its home")
})

Deno.test("talked to, it answers, laughs, and the leaves scatter", () => {
  const sim = new Sim(2, 1)
  const od = sim.odradek(1, 1)
  // the player stands by it, facing it
  sim.me.setDir("left")
  sim.run(1)
  assertEquals(signal.speech.get()?.text, ODRADEK_LINES[0])
  assertEquals(signal.message.get()?.text, LAUGH)
  const leaves = sim.effectList.filter((e) => e instanceof EffectLeaf)
  assertEquals(leaves.length, LAUGH_LEAVES)
  // the leaves scatter round it, each its own way
  const ways = new Set(
    (leaves as EffectLeaf[]).map((l) =>
      `${Math.sign(Math.round(l.vx * 4))}.${Math.sign(Math.round(l.vy * 4))}`
    ),
  )
  assert(ways.size >= 4, `${ways.size} ways`)
  // it stays a moment, then it is off
  sim.run(LINGER - 5)
  assertEquals([od.i, od.j], [1, 1])
  sim.run(40)
  assertNotEquals([od.i, od.j], [1, 1])
})
