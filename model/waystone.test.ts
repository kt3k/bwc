// The bird by the waystone (model/waystone.ts, E-2 of
// docs/research-open-world-tedium.md) in a small open field: the real
// bird of the catalog, the player standing or walking where set.
import { assert, assertEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { Actor, spawnActor } from "./actor.ts"
import { Item } from "./item.ts"
import {
  BIRD_ARRIVE,
  BIRD_FAR,
  BIRD_GIVE_UP,
  BIRD_HOP,
  nextWaystone,
  setWaystones,
  spawnLeadBird,
  waystoneKey,
} from "./waystone.ts"
import type { Dir, IActor, IField } from "./types.ts"
import * as signal from "../util/signals.ts"

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

/** An open field with nothing but the player and what spawns */
class Sim {
  time = 0
  actorList: IActor[] = []
  me: Actor
  constructor(meAt: [number, number]) {
    this.me = new Actor(meAt[0], meAt[1], catalog.actors["static"], "main")
    this.actorList.push(this.me)
  }
  canEnter(i: number, j: number) {
    return !this.actorList.some((a) => a.i === i && a.j === j)
  }
  spawnActor(type: string, i: number, j: number, dir: Dir) {
    const actor = spawnActor(
      `${type}.${this.time}`,
      i,
      j,
      catalog.actors[type],
      {
        dir,
      },
    )
    this.actorList.push(actor)
    return actor
  }
  actors = {
    iter: () => this.actorList[Symbol.iterator](),
    get: (i: number, j: number) =>
      this.actorList.filter((a) => a.i === i && a.j === j),
    add: (a: IActor) => void this.actorList.push(a),
    remove: (a: IActor) => {
      this.actorList = this.actorList.filter((x) => x !== a)
    },
  }
  effects = { add: () => {} }
  isSlippery() {
    return false
  }
  conveyorDir() {
    return null
  }
  run(n = 1) {
    for (let k = 0; k < n; k++) {
      this.time++
      for (const a of [...this.actorList]) {
        if (this.actorList.includes(a)) a.step(this as unknown as IField)
      }
    }
  }
  get field() {
    return this as unknown as IField
  }
  /** Puts the player at (i, j) */
  put(i: number, j: number) {
    this.actorList = this.actorList.filter((a) => a !== this.me)
    this.me = new Actor(i, j, catalog.actors["static"], "main")
    this.actorList.unshift(this.me)
  }
  birds() {
    return this.actorList.filter((a) => a.type === "bird")
  }
}

const WAYSTONES = [
  { id: "A", name: "A", i: 0, j: 0 },
  { id: "B", name: "B", i: 100, j: 0 },
  { id: "C", name: "C", i: 0, j: 40 },
]

function fresh() {
  Item.deserializeCollected([])
  setWaystones(WAYSTONES)
}

Deno.test("waystone bird: the nearest waystone still asleep", () => {
  fresh()
  assertEquals(nextWaystone(0, 0)?.id, "A")
  Item.collect(waystoneKey("A"))
  assertEquals(nextWaystone(0, 0)?.id, "C")
  Item.collect(waystoneKey("C"))
  assertEquals(nextWaystone(0, 0)?.id, "B")
  Item.collect(waystoneKey("B"))
  assertEquals(nextWaystone(0, 0), undefined)
})

Deno.test("waystone bird: none once every waystone is awake", () => {
  fresh()
  const sim = new Sim([0, 2])
  for (const w of WAYSTONES) Item.collect(waystoneKey(w.id))
  assertEquals(spawnLeadBird(sim.field, 0, 0, "A"), null)
  assertEquals(sim.birds().length, 0)
})

Deno.test("waystone bird: none by a waystone outside the WILDS", () => {
  fresh()
  const sim = new Sim([0, 2])
  assertEquals(spawnLeadBird(sim.field, 0, 0, "DEBUG"), null)
})

Deno.test("waystone bird: hops toward the next one, and waits there", () => {
  fresh()
  Item.collect(waystoneKey("A"))
  const sim = new Sim([1, 1])
  const bird = spawnLeadBird(sim.field, 0, 0, "A")!
  assert(bird)
  sim.run(200)
  // one hop toward C (0, 40) from beside A, then it waits for the player
  assertEquals([bird.i, bird.j], [0, -1 + BIRD_HOP])
  sim.run(300)
  assertEquals([bird.i, bird.j], [0, -1 + BIRD_HOP])
  // come near and it flies on
  sim.put(bird.i + 2, bird.j)
  sim.run(100)
  assertEquals([bird.i, bird.j], [0, -1 + 2 * BIRD_HOP])
  assert(signal.message.get()?.text.includes("WAYSTONE OF C"))
})

Deno.test("waystone bird: follow it to the waystone, then it is gone", () => {
  fresh()
  Item.collect(waystoneKey("A"))
  const sim = new Sim([1, 1])
  const bird = spawnLeadBird(sim.field, 0, 0, "A")!
  let farthest = 0
  for (let k = 0; k < 12 && sim.birds().length; k++) {
    sim.run(120)
    farthest = Math.max(farthest, bird.j)
    sim.put(bird.i + 1, bird.j)
  }
  assertEquals(sim.birds().length, 0)
  // it got there, by the gate of C, before it went
  assertEquals(farthest, 40 - BIRD_ARRIVE)
})

Deno.test("waystone bird: gives up when the player goes away", () => {
  fresh()
  Item.collect(waystoneKey("A"))
  const sim = new Sim([1, 1])
  spawnLeadBird(sim.field, 0, 0, "A")
  sim.run(150)
  assertEquals(sim.birds().length, 1)
  sim.put(0, -BIRD_FAR - 20)
  sim.run(BIRD_GIVE_UP / 2)
  assertEquals(sim.birds().length, 1)
  sim.run(BIRD_GIVE_UP + 200)
  assertEquals(sim.birds().length, 0)
})

Deno.test("waystone bird: a while near keeps it waiting", () => {
  fresh()
  Item.collect(waystoneKey("A"))
  const sim = new Sim([1, 1])
  const bird = spawnLeadBird(sim.field, 0, 0, "A")!
  sim.run(150)
  // within sight, not near: it waits on and on
  sim.put(bird.i + 8, bird.j)
  sim.run(BIRD_GIVE_UP * 3)
  assertEquals(sim.birds().length, 1)
})
