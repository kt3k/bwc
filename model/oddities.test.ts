// The oddities (model/oddities.ts) in a small simulated field: real
// actors, props and items of the catalog, walls and water by cell, and
// the effects (the timers) stepped as the game does.
import { assert, assertEquals, assertFalse } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { Actor, spawnActor } from "./actor.ts"
import { Prop } from "./prop.ts"
import { Item } from "./item.ts"
import { PropSpawn } from "./field-block.ts"
import {
  addLostCoins,
  collectLetter,
  COLONY_SIZE,
  CONGA_LENGTH,
  isFrozen,
  PASTE_CELL,
  resetMats,
  resetSpelling,
  resetTunes,
} from "./oddities.ts"
import type {
  Dir,
  IActor,
  IColorBox,
  IField,
  IFinishable,
  IItem,
  IProp,
  IStepper,
} from "./types.ts"
import * as signal from "../util/signals.ts"
import { juice } from "../util/juice.ts"

// The breaking motion paints on an OffscreenCanvas, which Deno lacks
// deno-lint-ignore no-explicit-any
const g = globalThis as any
g.OffscreenCanvas = class {
  getContext() {
    return { drawImage() {}, clearRect() {} }
  }
  transferToImageBitmap() {
    return {}
  }
}

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

type Effect = IStepper & IColorBox & IFinishable

const key = (i: number, j: number) => `${i}.${j}`

/** A small field: open floor, with walls and water where set */
class Sim implements IField {
  time = 0
  walls = new Set<string>()
  water = new Set<string>()
  cells = new Map<string, string>()
  actorList: IActor[] = []
  itemList: IItem[] = []
  propMap = new Map<string, IProp>()
  effectList: Effect[] = []
  me: Actor
  constructor(meAt: [number, number] = [0, 0]) {
    this.me = new Actor(meAt[0], meAt[1], catalog.actors["static"], "main")
    this.actorList.push(this.me)
  }
  #open(i: number, j: number) {
    if (this.cells.get(key(i, j)) === PASTE_CELL) return true
    return !this.walls.has(key(i, j)) && !this.water.has(key(i, j))
  }
  canEnterStatic(i: number, j: number) {
    const prop = this.propMap.get(key(i, j))
    return this.#open(i, j) && (!prop || prop.canEnter)
  }
  canEnter(i: number, j: number) {
    return this.canEnterStatic(i, j) && this.actors.get(i, j).length === 0
  }
  isSlippery() {
    return false
  }
  isWater(i: number, j: number) {
    return this.water.has(key(i, j)) &&
      this.cells.get(key(i, j)) !== PASTE_CELL
  }
  conveyorDir() {
    return null
  }
  isDiggable() {
    return false
  }
  updateCell(i: number, j: number, cell: string) {
    this.cells.set(key(i, j), cell)
  }
  peekItem(i: number, j: number) {
    return this.peekItems(i, j)[0]
  }
  peekItems(i: number, j: number) {
    return this.itemList.filter((it) =>
      it.i === i && it.j === j && !it.isFollowing
    )
  }
  spawnActor(type: string, i: number, j: number, dir: Dir) {
    const def = catalog.actors[type]
    if (!def) throw new Error(`no actor ${type}`)
    const actor = spawnActor(`${type}.${crypto.randomUUID()}`, i, j, def, {
      dir,
    })
    this.actorList.push(actor)
    return actor
  }
  spawnItem(type: string, i: number, j: number, id?: string) {
    const def = catalog.items[type]
    if (!def) throw new Error(`no item ${type}`)
    const item = new Item(id ?? null, i, j, def)
    this.itemList.push(item)
    return item
  }
  spawnProp(type: string, i: number, j: number, data?: unknown) {
    const def = catalog.props[type]
    if (!def) throw new Error(`no prop ${type}`)
    const prop = Prop.fromSpawn(new PropSpawn(i, j, def, data))
    this.propMap.set(key(i, j), prop)
    return prop
  }
  collectItem(_i: number, _j: number, id: string) {
    this.itemList = this.itemList.filter((it) => it.id !== id)
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
  props = {
    get: (i: number, j: number) => this.propMap.get(key(i, j)),
    remove: (i: number, j: number) => void this.propMap.delete(key(i, j)),
    iter: () => this.propMap.values(),
  }
  effects = { add: (e: Effect) => void this.effectList.push(e) }
  colorCell() {}
  /** Steps the field n frames */
  run(n = 1) {
    for (let k = 0; k < n; k++) {
      this.time++
      for (const a of [...this.actorList]) {
        if (this.actorList.includes(a)) a.step(this)
      }
      for (const it of [...this.itemList]) it.step(this)
      for (const p of [...this.propMap.values()]) p.step(this)
      for (const e of [...this.effectList]) {
        e.step(this)
        if (e.finished) this.effectList.splice(this.effectList.indexOf(e), 1)
      }
    }
    juice.freeze = 0
    juice.shake = 0
  }
  /** The player walks (or bumps) one step, and the world moves on */
  walk(dir: Dir, frames = 40) {
    this.me.tryMove("go", dir, this)
    this.run(frames)
  }
  /** A wall ring around the box (x0, y0)-(x1, y1) (the inside is open) */
  ring(x0: number, y0: number, x1: number, y1: number) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      this.walls.add(key(x, y0 - 1)).add(key(x, y1 + 1))
    }
    for (let y = y0; y <= y1; y++) {
      this.walls.add(key(x0 - 1, y)).add(key(x1 + 1, y))
    }
  }
  count(type: string) {
    return this.itemList.filter((it) => it.def.type === type).length
  }
  actorsOf(type: string) {
    return this.actorList.filter((a) => a.type === type)
  }
}

Deno.test("nesting jars: each break leaves a smaller jar, the last a coin", () => {
  const sim = new Sim([5, 6])
  sim.spawnProp("nest-jar-2", 5, 5)
  for (const next of ["nest-jar-1", "nest-jar-0"]) {
    sim.walk("up", 60)
    assertEquals(sim.props.get(5, 5)?.type, next)
  }
  sim.walk("up", 60)
  assertEquals(sim.props.get(5, 5), undefined)
  assertEquals(sim.count("coin"), 1)
})

Deno.test("packed box: two dozen things burst out", () => {
  const sim = new Sim([5, 6])
  sim.spawnProp("packed-box", 5, 5)
  sim.walk("up", 80)
  assertEquals(sim.props.get(5, 5), undefined)
  assertEquals(
    sim.count("pebble") + sim.count("button") + sim.count("gear"),
    24,
  )
  // never onto the one who broke it
  assertEquals(sim.peekItems(5, 6).length, 0)
})

Deno.test("eggshell wall: the crack runs through every touching shell", () => {
  const sim = new Sim([0, 3])
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) sim.spawnProp("egg-wall", i, j)
  }
  sim.spawnProp("egg-wall", 9, 0) // not touching
  sim.walk("up", 150)
  assertEquals([...sim.props.iter()].map((p) => p.type), ["egg-wall"])
})

Deno.test("bell stones: in order the last holds a key, out of order nothing", () => {
  resetTunes()
  const sim = new Sim([0, 1])
  for (let n = 0; n < 3; n++) {
    sim.spawnProp("bell-stone", n * 2, 0, {
      group: "t",
      order: n + 1,
      count: 3,
      note: n,
    })
  }
  sim.walk("up", 40)
  sim.walk("right", 20)
  sim.walk("right", 20)
  sim.walk("up", 40)
  sim.walk("right", 20)
  sim.walk("right", 20)
  sim.walk("up", 60)
  assertEquals(sim.count("key"), 1)

  resetTunes()
  const sim2 = new Sim([2, 1])
  for (let n = 0; n < 2; n++) {
    sim2.spawnProp("bell-stone", n * 2, 0, {
      group: "u",
      order: n + 1,
      count: 2,
      note: n,
    })
  }
  sim2.walk("up", 40) // the second stone first
  sim2.walk("left", 20)
  sim2.walk("left", 20)
  sim2.walk("up", 60)
  assertEquals(sim2.count("key"), 0)
})

Deno.test("balloon rock: swells twice, bursts on the third push", () => {
  const sim = new Sim([5, 6])
  const rock = sim.spawnProp("balloon-rock", 5, 5) as Prop
  const crate = sim.spawnProp("crate", 5, 4)
  sim.walk("up")
  assertEquals(rock.growthState?.stage, 1)
  sim.walk("up")
  assertEquals(rock.growthState?.stage, 2)
  sim.walk("up", 60)
  assertEquals(sim.props.get(5, 5), undefined)
  // the blast broke the crate behind it, and blew the player back
  assertFalse([...sim.props.iter()].includes(crate))
  assertEquals(sim.me.j, 7)
  assertEquals(sim.count("coin"), 3)
})

Deno.test("clock: the actors around stop for a while", () => {
  const sim = new Sim([5, 6])
  sim.spawnProp("clock", 5, 5)
  const sheep = sim.spawnActor("sheep", 8, 8, "down")
  const far = sim.spawnActor("sheep", 40, 40, "down")
  sim.walk("up", 40)
  assert(isFrozen(sheep, sim))
  assertFalse(isFrozen(far, sim))
  assertFalse(isFrozen(sim.me, sim))
  sim.run(200)
  assertFalse(isFrozen(sheep, sim))
})

Deno.test("toothpaste rock: a path over the water, out of its far side", () => {
  const sim = new Sim([1, 5])
  sim.spawnProp("paste-tube", 2, 5)
  for (let i = 3; i <= 6; i++) sim.water.add(key(i, 5))
  sim.walls.add(key(8, 5))
  sim.walk("right", 60)
  for (let i = 3; i <= 7; i++) assertEquals(sim.cells.get(key(i, 5)), "P")
  assertFalse(sim.cells.has(key(8, 5)))
  // the flattened tube is walked over onto the paste
  assert(sim.canEnterStatic(2, 5))
})

Deno.test("spore blob: splits when poked, the colony of 8 pops into coins", () => {
  const sim = new Sim([5, 6])
  sim.spawnActor("spore", 5, 5, "down")
  for (let n = 1; n < COLONY_SIZE; n++) {
    // (the colony starts popping 30 frames after it is full)
    sim.walk("up", 20)
    assertEquals(sim.actorsOf("spore").length, Math.min(n + 1, COLONY_SIZE))
  }
  sim.run(200)
  assertEquals(sim.actorsOf("spore").length, 0)
  assertEquals(sim.count("coin"), COLONY_SIZE)
})

Deno.test("piggy bank: breaks into coins, with the lost ones back", () => {
  const sim = new Sim([5, 6])
  addLostCoins(4)
  sim.spawnActor("piggy", 5, 5, "down")
  sim.me.tryMove("go", "up", sim)
  sim.run(40)
  assertEquals(sim.actorsOf("piggy").length, 0)
  assertEquals(sim.count("coin"), 3 + 4)
})

Deno.test("pebbles: the leader brings a line; a kick makes the last one a gem", () => {
  const sim = new Sim([5, 30])
  const leader = sim.spawnActor("pebble-leader", 5, 5, "down")
  sim.run(1)
  assertEquals(sim.actorsOf("pebble").length, CONGA_LENGTH)
  // the kick: the player right under the leader
  sim.actors.remove(sim.me)
  sim.me = new Actor(leader.i, leader.j + 1, catalog.actors["static"], "main")
  sim.actorList.push(sim.me)
  sim.walk("up", 200)
  assertEquals(sim.actorsOf("pebble").length, CONGA_LENGTH - 1)
  assertEquals(sim.count("gem"), 1)
})

Deno.test("block fish: four in a row clear into light", () => {
  const sim = new Sim([0, 6])
  sim.ring(0, 0, 9, 6)
  for (const i of [1, 2, 3]) sim.spawnActor("block-fish", i, 0, "down")
  sim.spawnActor("block-fish", 4, 5, "down")
  // pushed up, the fourth slides to the top row next to the others
  sim.me.tryMove("go", "right", sim)
  sim.run(20)
  sim.me.tryMove("go", "right", sim)
  sim.run(20)
  sim.me.tryMove("go", "right", sim)
  sim.run(20)
  sim.me.tryMove("go", "right", sim)
  sim.run(20)
  sim.me.tryMove("go", "down", sim)
  sim.run(20)
  // the player is at (4, 6), the fish at (4, 5) above it
  sim.walk("up", 120)
  assertEquals(sim.actorsOf("block-fish").length, 0)
  assertEquals(sim.count("glim"), 4)
})

Deno.test("book: its letters picked up in order make the word come true", () => {
  resetSpelling()
  const sim = new Sim([5, 6])
  sim.ring(0, 0, 10, 10)
  sim.spawnActor("book", 5, 5, "down")
  sim.walk("up", 80)
  const letters = sim.itemList.filter((it) => it.def.collect === "letter")
  assert(letters.length >= 3)
  const word = letters.map((it) => it.def.type.split("-").pop()).join("")
  // out of order: the letter hops away instead
  const order = ["key", "gem", "coin"].find((w) =>
    [...w].sort().join("") === [...word].sort().join("")
  )!
  const byChar = (ch: string) =>
    letters.find((it) => it.def.type === `letter-${ch}`)!
  const wrong = byChar(order[1])
  collectLetter(sim.me, sim, wrong)
  assert(sim.itemList.includes(wrong))
  for (const ch of order) collectLetter(sim.me, sim, byChar(ch))
  sim.run(60)
  const reward = { key: "key", gem: "gem", coin: "coin" }[order]!
  assert(sim.count(reward) >= 1)
})

Deno.test("boiled egg: rolls into the wall and hatches a bigger egg", () => {
  const sim = new Sim([1, 5])
  sim.walls.add(key(6, 5))
  sim.spawnActor("egg-s", 2, 5, "down")
  sim.walk("right", 80)
  assertEquals(sim.actorsOf("egg-s").length, 0)
  const [egg] = sim.actorsOf("egg-m")
  assertEquals([egg.i, egg.j], [5, 5])
})

Deno.test("slippers: one on each mat brings someone home", () => {
  resetMats()
  const sim = new Sim([20, 20])
  sim.spawnProp("slipper-mat", 5, 5, { group: "m" })
  sim.spawnProp("slipper-mat", 6, 5, { group: "m" })
  sim.run(1)
  sim.actorList.push(
    spawnActor("s1", 5, 5, catalog.actors["slipper-r"]),
    spawnActor("s2", 6, 5, catalog.actors["slipper"]),
  )
  sim.run(200)
  assertEquals(sim.count("coin-bag"), 1)
})

Deno.test("shards say where they are from", () => {
  const sim = new Sim([5, 5])
  const shard = sim.spawnItem("shard-sea", 5, 5)
  shard.onCollect(sim.me, sim)
  assertEquals(signal.message.get()?.text, "A PIECE OF A FARAWAY SEA")
  assertEquals(sim.itemList.length, 0)
})

Deno.test("shadow: stepped on, its owner falls out of the sky", () => {
  const sim = new Sim([5, 6])
  sim.spawnActor("shadow", 5, 5, "down")
  sim.walk("up", 60)
  assertEquals(sim.actorsOf("shadow").length, 0)
  assert(sim.props.get(5, 5))
})

Deno.test("fluff: bursts into seeds that grow; a full plot lifts off", () => {
  const sim = new Sim([5, 6])
  sim.ring(0, 0, 10, 10)
  sim.spawnActor("fluff", 5, 5, "down")
  sim.walk("up", 80)
  const grown = sim.actorsOf("fluff").length
  assert(grown >= 1 && grown <= 3)
  // fill the place up to one short of a swarm
  let n = 0
  for (let j = 0; j <= 3 && sim.actorsOf("fluff").length < 15; j++) {
    for (let i = 0; i <= 10 && sim.actorsOf("fluff").length < 15; i++) {
      if (sim.canEnter(i, j)) sim.spawnActor("fluff", i, j, "down"), n++
    }
  }
  const [one] = sim.actorsOf("fluff").filter((a) => a.j === 0)
  sim.actors.remove(sim.me)
  sim.me = new Actor(one.i, one.j + 1, catalog.actors["static"], "main")
  sim.actorList.push(sim.me)
  for (const a of sim.actors.get(one.i, one.j + 1)) {
    if (a !== sim.me) sim.actors.remove(a)
  }
  sim.walk("up", 400)
  assertEquals(sim.actorsOf("fluff").length, 0)
  assert(sim.count("coin") >= 15)
})

Deno.test("snail: the broken shell unrolls into a path to its house", () => {
  const sim = new Sim([4, 5])
  sim.spawnActor("snail", 5, 5, "right")
  for (let i = 6; i <= 9; i++) sim.water.add(key(i, 5))
  sim.walls.add(key(12, 5))
  sim.walk("right", 120)
  assertEquals(sim.actorsOf("snail").length, 0)
  assertEquals(sim.actorsOf("slug").length, 1)
  for (let i = 6; i <= 11; i++) assertEquals(sim.cells.get(key(i, 5)), "S")
  assertEquals(sim.props.get(11, 5)?.type, "snail-house")
})

Deno.test("fin: caught, the fish leaps out into scales", () => {
  const sim = new Sim([5, 6])
  sim.spawnActor("fin", 5, 5, "down")
  sim.walk("up", 80)
  assertEquals(sim.actorsOf("fin").length, 0)
  assertEquals(sim.count("scale"), 5)
})

Deno.test("cloud: floats when pushed, rains into a sapling against a wall", () => {
  const sim = new Sim([5, 6])
  sim.walls.add(key(5, 2))
  const cloud = sim.spawnActor("cloud", 5, 5, "down")
  sim.walk("up", 80)
  assertEquals(cloud.j, 3)
  sim.walk("up", 40)
  sim.walk("up", 40)
  sim.walk("up", 80)
  assertEquals(sim.actorsOf("cloud").length, 0)
  assertEquals(sim.props.get(5, 3)?.type, "sapling")
})
