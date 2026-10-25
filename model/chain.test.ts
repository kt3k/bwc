// The chain of trades at runtime (model/chain.ts): the thing wanted at
// rest on the mat is taken, and the next is laid there; anything else
// does nothing; the last link gives the letter once; the links given are
// kept (in the save too), a reload lays the thing given again, and the
// complete chain counts as a goal
import { assert, assertEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { Actor, goneActorKey, spawnActor } from "./actor.ts"
import { Item } from "./item.ts"
import { Prop } from "./prop.ts"
import { PropSpawn } from "./field-block.ts"
import {
  chainKey,
  chainRewardKey,
  chainRewardType,
  isChainKey,
  linkKey,
  OUT_OF_SIGHT,
  wanterStage,
} from "./chain.ts"
import { goalsDone } from "./goal.ts"
import type { Dir, IActor, IField, IItem } from "./types.ts"
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

/**
 * A chain of two: the first at (100, 0) wants a jar and gives a sack,
 * the second at (104, 0) wants the sack; both face down, their mats at
 * (100, 1) and (104, 1)
 */
class Sim {
  time = 0
  items: { id: string; i: number; j: number; type: string }[] = []
  me = new Actor(102, 4, catalog.actors["static"], "main")
  actorList: IActor[] = [this.me]
  first = Prop.fromSpawn(
    new PropSpawn(100, 0, catalog.props["chain-wanter"], {
      id: "C",
      k: 0,
      n: 2,
      want: "jar",
      gives: "sack",
      dir: "down",
    }),
  )
  second = Prop.fromSpawn(
    new PropSpawn(104, 0, catalog.props["chain-wanter"], {
      id: "C",
      k: 1,
      n: 2,
      want: "sack",
      dir: "down",
      reward: [104, 3],
    }),
  )
  get field() {
    return this as unknown as IField
  }
  canEnterStatic(i: number, j: number) {
    return this.props.get(i, j)?.canEnter ?? true
  }
  isWater() {
    return false
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
    get: (i: number, j: number) =>
      j !== 0
        ? undefined
        : i === 100
        ? this.first
        : i === 104
        ? this.second
        : undefined,
  }
  effects = { add: () => {} }
  peekItems(i: number, j: number) {
    return this.items.filter((t) =>
      t.i === i && t.j === j
    ) as unknown as IItem[]
  }
  spawnItem(type: string, i: number, j: number, id?: string) {
    const item = { id: id ?? "", i, j, type }
    this.items.push(item)
    return item as unknown as IItem
  }
  spawned = 0
  spawnActor(type: string, i: number, j: number, _dir: Dir) {
    const a = spawnActor(
      `${i}.${j}.${type}.laid${this.spawned++}`,
      i,
      j,
      catalog.actors[type],
    )
    this.actorList.push(a)
    return a
  }
  /** A thing of the type, at rest at (i, j) */
  put(type: string, i: number, j: number, id = `${i}.${j}.${type}`) {
    const a = spawnActor(id, i, j, catalog.actors[type])
    this.actorList.push(a)
    return a
  }
  /** The things (not the player) at (i, j) */
  at(i: number, j: number) {
    return this.actorList.filter((a) => a !== this.me && a.i === i && a.j === j)
  }
  step(n = 1) {
    for (let k = 0; k < n; k++) {
      this.time++
      this.first.step(this.field)
      this.second.step(this.field)
    }
  }
}

Deno.test("chain: its props and things", () => {
  const wanter = catalog.props["chain-wanter"]
  assert(!wanter.canEnter && catalog.props["chain-mat"].canEnter)
  assertEquals(wanter.growth?.hrefs.length, 20)
  assertEquals(catalog.actors["jar"].pushed, "shove")
  assertEquals(catalog.actors["sack"].pushed, "shove")
  assertEquals(catalog.actors["wheel"].pushed, "roll")
  assertEquals(catalog.actors["cask"].pushed, "roll")
  assertEquals(wanterStage("up", "jar"), 0)
  assertEquals(wanterStage("down", null), 9)
  assertEquals(wanterStage("right", "cask"), 18)
})

Deno.test("chain: the wrong thing on the mat does nothing", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  sim.put("sack", 100, 1)
  sim.step(40)
  assert(!Item.isCollected(linkKey("C", 0)))
  assertEquals(signal.message.get()?.text, "THAT IS NOT WHAT I WANT")
  assertEquals(sim.at(100, 1).map((a) => a.type), ["sack"])
  assertEquals(sim.first.growthState?.stage, wanterStage("down", "jar"))
  // the second's sack, given before the first link: not taken either
  sim.put("sack", 104, 1)
  sim.step(40)
  assert(!Item.isCollected(linkKey("C", 1)))
  assertEquals(sim.items, [])
})

Deno.test("chain: the thing wanted is taken and the next laid, the last gives the letter once", () => {
  Item.deserializeCollected([])
  const sim = new Sim()
  const jar = sim.put("jar", 100, 1, "100.5.jar")
  sim.step(1)
  assert(Item.isCollected(linkKey("C", 0)))
  assert(Item.isCollected(goneActorKey("100.5.jar")))
  assert(!sim.actorList.includes(jar))
  assertEquals(signal.message.get()?.text, "THANK YOU. TAKE THIS")
  // the sack laid on the mat, the first content
  const [sack] = sim.at(100, 1)
  assertEquals(sack.type, "sack")
  assertEquals(sim.first.growthState?.stage, wanterStage("down", null))
  assert(!Item.isCollected(chainKey("C")))
  assertEquals(goalsDone(), 0) // the sack brought to the second
  ;(sack as Actor).fastTravel(104, 1)
  sim.step(1)
  assert(Item.isCollected(linkKey("C", 1)))
  assert(Item.isCollected(chainKey("C")))
  // no gone key for a thing laid
  assert(!Item.isCollected(goneActorKey(sack.id)))
  assertEquals(sim.at(104, 1), [])
  assertEquals(sim.second.growthState?.stage, wanterStage("down", null))
  assertEquals(goalsDone(), 1)
  // the letter, a little way off
  assertEquals(sim.items.length, 1)
  const [letter] = sim.items
  assertEquals(letter.id, chainRewardKey("C"))
  assertEquals(letter.type, chainRewardType("C"))
  const d = Math.max(Math.abs(letter.i - 104), Math.abs(letter.j))
  assert(d >= 3 && d <= 4, `${d}`)
  sim.step(200)
  assertEquals(sim.items.length, 1)
  // nothing laid again
  assertEquals(sim.at(100, 1), [])
})

Deno.test("chain: a link given lasts a reload, and its thing is laid again", () => {
  Item.deserializeCollected([])
  const first = new Sim()
  first.put("jar", 100, 1)
  first.step(1)
  const saved = Item.serializeCollected()

  Item.deserializeCollected(saved)
  const second = new Sim()
  second.step(60)
  assertEquals(second.first.growthState?.stage, wanterStage("down", null))
  assertEquals(second.second.growthState?.stage, wanterStage("down", "sack"))
  assertEquals(second.at(100, 1).map((a) => a.type), ["sack"])
  // sunk (gone): laid again only once the mat is out of sight
  const [sack] = second.at(100, 1)
  second.actors.remove(sack)
  second.step(60)
  assertEquals(second.at(100, 1), [])
  second.me.fastTravel(100 + OUT_OF_SIGHT + 1, 4)
  second.step(60)
  assertEquals(second.at(100, 1).map((a) => a.type), ["sack"])
})

Deno.test("chain: a complete one stays complete after a reload, and counts once", () => {
  Item.deserializeCollected([])
  const first = new Sim()
  first.put("jar", 100, 1)
  first.step(1)
  const [sack] = first.at(100, 1)
  first.actors.remove(sack)
  first.put("sack", 104, 1, "x")
  first.step(1)
  assertEquals(goalsDone(), 1)
  const saved = Item.serializeCollected()

  Item.deserializeCollected(saved)
  const second = new Sim()
  second.step(60)
  assertEquals(second.first.growthState?.stage, wanterStage("down", null))
  assertEquals(second.second.growthState?.stage, wanterStage("down", null))
  // nothing laid: the next has it
  assertEquals(second.at(100, 1), [])
  assertEquals(second.items, first.items)
  Item.collect(chainRewardKey("C"))
  assertEquals(goalsDone(), 1)
  assert(isChainKey(chainKey("C")))
  assert(isChainKey(chainKey("123.456")))
  assert(!isChainKey(linkKey("C", 0)))
  assert(!isChainKey(linkKey("123.456", 2)))
  assert(!isChainKey(chainRewardKey("C")))
})
