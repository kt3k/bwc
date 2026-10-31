// The puzzles run by finite groups (model/group-lever.ts): the group laws
// the puzzles rely on, the levers moving the stones, the door opening on
// its target once (kept), the bell, the plaque of the odd one out, the
// reset of the area, and a patrol and a rolling boulder pulling levers
import { assert, assertEquals, assertFalse, assertNotEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { spawnActor } from "./actor.ts"
import { Item } from "./item.ts"
import { Prop } from "./prop.ts"
import { PropSpawn } from "./field-block.ts"
import { goalsDone } from "./goal.ts"
import { resetGoals } from "./goal-reset.ts"
import {
  arrangementOf,
  type Cycles,
  groupKey,
  groupRewardKey,
  groupRewardType,
  identity,
  isGroupKey,
  isIdentity,
  MIRROR,
  moaiPose,
  NOT_ODD_TEXT,
  orderOf,
  poseStage,
  pull,
  pullAll,
  pullLever,
  resetGroupStates,
  same,
  TURN,
} from "./group-lever.ts"
import type { IActor, IField, IItem } from "./types.ts"
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

/** All the arrangements the levers reach from e */
function closure(levers: readonly Cycles[], n: number): number[][] {
  const seen = new Map<string, number[]>()
  const queue = [identity(n)]
  seen.set(String(queue[0]), queue[0])
  while (queue.length) {
    const arr = queue.shift()!
    for (const lever of levers) {
      const next = pull(arr, lever)
      if (!seen.has(String(next))) {
        seen.set(String(next), next)
        queue.push(next)
      }
    }
  }
  return [...seen.values()]
}

const L: Cycles = [[0, 1]], R: Cycles = [[1, 2]]

Deno.test("group: a lever moves the things along its cycles", () => {
  // the thing at 0 goes to 1, at 1 to 2, at 2 to 0
  assertEquals(pull([0, 1, 2], [[0, 1, 2]]), [2, 0, 1])
  assertEquals(pull([], [[0, 1]]), [1, 0])
  // places it doesn't touch keep their tokens
  assertEquals(pull([0, 1, 2, 3], [[1, 2]]), [0, 2, 1, 3])
  assert(same([0, 1], [0, 1, 2]))
  assertFalse(same([1, 0], [0, 1]))
})

Deno.test("group: S3 is not commutative (left then right is not right then left)", () => {
  const lr = pullAll([L, R], 3)
  const rl = pullAll([R, L], 3)
  assertNotEquals(lr, rl)
  assertEquals(lr, [1, 2, 0])
  assertEquals(rl, [2, 0, 1])
  // swaps undo themselves; LR has order 3 and its inverse is RL
  assertEquals(orderOf(L), 2)
  assert(isIdentity(pullAll([L, R, L, R, L, R], 3)))
  assertEquals(pullAll([L, R, L, R], 3), rl)
  // the braid: LRL = RLR, the order reversed
  assertEquals(pullAll([L, R, L], 3), [2, 1, 0])
  assertEquals(pullAll([R, L, R], 3), [2, 1, 0])
  assertEquals(closure([L, R], 3).length, 6)
})

Deno.test("group: three adjacent swaps make all 24 orders of 4 (S4)", () => {
  const swaps: Cycles[] = [[[0, 1]], [[1, 2]], [[2, 3]]]
  assertEquals(closure(swaps, 4).length, 24)
  // the reverse takes 6 swaps
  const [a, b, c] = swaps
  assertEquals(pullAll([a, b, c, a, b, a], 4), [3, 2, 1, 0])
})

Deno.test("group: the Moai's turn and mirror make D4", () => {
  const r = TURN, s = MIRROR
  // r^4 = s^2 = e, srs = r^-1
  assertEquals(orderOf(r), 4)
  assertEquals(orderOf(s), 2)
  assertEquals(pullAll([s, r, s], 4), pullAll([r, r, r], 4))
  assert(!same(pullAll([r, s], 4), pullAll([s, r], 4)))
  const all = closure([r, s], 4)
  assertEquals(all.length, 8)
  // the 8 poses all look apart
  assertEquals(new Set(all.map(poseStage)).size, 8)
  // the turn alone: Z4, the 4 facings, never mirrored
  const turns = closure([r], 4)
  assertEquals(turns.length, 4)
  assert(turns.every((arr) => !moaiPose(arr).mirrored))
})

Deno.test("group: the Moai's pose, from the start (looking down)", () => {
  assertEquals(moaiPose(identity(4)), { dir: "down", mirrored: false })
  // a quarter turn clockwise: looking left
  assertEquals(moaiPose(pull([], TURN)), { dir: "left", mirrored: false })
  assertEquals(moaiPose(pullAll([TURN, TURN], 4)).dir, "up")
  // mirrored it still looks down
  assertEquals(moaiPose(pull([], MIRROR)), { dir: "down", mirrored: true })
  // mirror then turn: looking left, mirrored; turn then mirror: right
  assertEquals(moaiPose(pullAll([MIRROR, TURN], 4)), {
    dir: "left",
    mirrored: true,
  })
  assertEquals(moaiPose(pullAll([TURN, MIRROR], 4)), {
    dir: "right",
    mirrored: true,
  })
})

Deno.test("group: Z4 and Z2xZ2 both have 4 states, but not the same orders", () => {
  const dial: Cycles = [[0, 1, 3, 2]]
  const cols: Cycles = [[0, 1], [2, 3]], rows: Cycles = [[0, 2], [1, 3]]
  assertEquals(closure([dial], 4).length, 4)
  assertEquals(closure([cols, rows], 4).length, 4)
  assertEquals(orderOf(dial), 4)
  // every state of Z2xZ2 undoes itself
  for (const arr of closure([cols, rows], 4)) {
    assert(same(pull([], toCycles(arr)), arr))
    assert(orderOf(toCycles(arr)) <= 2)
  }
  // the half turn: twice the dial, or both toggles
  assertEquals(pullAll([dial, dial], 4), pullAll([cols, rows], 4))
  // and the toggles commute
  assertEquals(pullAll([cols, rows], 4), pullAll([rows, cols], 4))
})

/** The arrangement as a lever (where each token goes from its own place) */
function toCycles(arr: readonly number[]): Cycles {
  // token t sits at place p: the lever moving t's place to p
  const to = new Map(arr.map((t, p) => [t, p]))
  const seen = new Set<number>()
  const cycles: number[][] = []
  for (const start of to.keys()) {
    if (seen.has(start) || to.get(start) === start) continue
    const cycle = []
    for (let p = start; !seen.has(p); p = to.get(p)!) {
      seen.add(p)
      cycle.push(p)
    }
    cycles.push(cycle)
  }
  return cycles
}

Deno.test("group: Z6 has an element of order 6, S3 and D3 none", () => {
  const dial6: Cycles = [[0, 1, 2, 3, 4, 5]]
  assertEquals(orderOf(dial6), 6)
  assertEquals(closure([dial6], 6).length, 6)
  // D3: the triangle turned and flipped, the same 6 as S3
  const turn3: Cycles = [[0, 1, 2]], flip: Cycles = [[1, 2]]
  const d3 = closure([turn3, flip], 3)
  assertEquals(d3.length, 6)
  const s3 = closure([L, R], 3)
  assertEquals(new Set(d3.map(String)), new Set(s3.map(String)))
  for (const arr of s3) assert(orderOf(toCycles(arr)) <= 3)
})

// ---------------------------------------------------------------------
// the props

const spawn = (i: number, j: number, type: string, data: unknown) =>
  Prop.fromSpawn(new PropSpawn(i, j, catalog.props[type], data))

/** A small field: walls, props and actors */
class Sim {
  time = 0
  items: { id: string; i: number; j: number; type: string }[] = []
  walls = new Set<string>()
  propList: Prop[] = []
  actorList: IActor[] = []
  me: IActor = spawnActor("main", 0, 50, catalog.actors["static"])
  constructor() {
    this.actorList.push(this.me)
  }
  get field() {
    return this as unknown as IField
  }
  add<T extends Prop>(prop: T): T {
    this.propList.push(prop)
    return prop
  }
  canEnterStatic(i: number, j: number) {
    return !this.walls.has(`${i}.${j}`) &&
      (this.props.get(i, j)?.canEnter ?? true)
  }
  canEnter(i: number, j: number) {
    return this.canEnterStatic(i, j) && this.actors.get(i, j).length === 0
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
  actors = {
    iter: () => this.actorList,
    get: (i: number, j: number) =>
      this.actorList.filter((a) => a.i === i && a.j === j),
    add: (a: IActor) => this.actorList.push(a),
    remove: (a: IActor) => {
      this.actorList = this.actorList.filter((x) => x !== a)
    },
  }
  props = {
    get: (i: number, j: number) =>
      this.propList.find((p) => p.i === i && p.j === j),
    iter: () => this.propList,
    remove: () => {},
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
  bump(prop: Prop, pusher: IActor = this.me) {
    prop.onPushed({ type: "pushed", dir: "up", peakAt: 7, pusher }, this.field)
  }
  step(n = 1) {
    for (let k = 0; k < n; k++) {
      this.time++
      for (const a of [...this.actorList]) a.step(this.field)
      for (const p of this.propList) p.step(this.field)
    }
  }
}

/** The S3 bay: 3 stones, 2 levers, a door wanting LR */
function s3Bay(sim: Sim, group = "t-s3") {
  const stones = [0, 1, 2].map((place) =>
    sim.add(spawn(10 + place, 0, "group-stone", { group, place }))
  )
  const left = sim.add(
    spawn(10, 2, "group-lever", { group, cycles: [[0, 1]], name: "l" }),
  )
  const right = sim.add(
    spawn(12, 2, "group-lever", { group, cycles: [[1, 2]], name: "r" }),
  )
  const door = sim.add(
    spawn(15, 0, "group-door", {
      group,
      id: "t-s3",
      target: [1, 2, 0],
      reward: [16, 0],
    }),
  )
  return { stones, left, right, door }
}

const fresh = () => {
  Item.deserializeCollected([])
  resetGroupStates()
}

Deno.test("group props: the catalog's parts", () => {
  for (
    const type of [
      "group-lever",
      "group-stone",
      "group-moai",
      "group-door",
      "group-bell",
      "group-mural",
    ]
  ) {
    assert(catalog.props[type], type)
    assertFalse(catalog.props[type].canEnter, type)
  }
  assertEquals(catalog.props["group-moai"].growth?.hrefs.length, 8)
  assertEquals(catalog.props["group-stone"].growth?.hrefs.length, 6)
  assertEquals(catalog.props["group-lever"].growth?.hrefs.length, 8)
  assertEquals(catalog.props["group-mural"].growth?.hrefs.length, 16)
})

Deno.test("group props: each lever applies its permutation, the stones show it", () => {
  fresh()
  const sim = new Sim()
  const { stones, left, right } = s3Bay(sim)
  sim.step()
  assertEquals(stones.map((s) => s.growthState?.stage), [0, 1, 2])
  sim.bump(left)
  sim.step()
  assert(same(arrangementOf("t-s3"), [1, 0, 2]))
  assertEquals(stones.map((s) => s.growthState?.stage), [1, 0, 2])
  // the handle flips at each pull
  assertEquals(left.growthState?.stage, 1)
  sim.bump(right)
  sim.step()
  assertEquals(stones.map((s) => s.growthState?.stage), [1, 2, 0])
  assertEquals(right.growthState?.stage, 1)
})

Deno.test("group props: the door opens exactly on the target, once, kept", () => {
  fresh()
  const sim = new Sim()
  const { left, right, door } = s3Bay(sim)
  // right then left is not it
  sim.bump(right)
  sim.bump(left)
  sim.step(5)
  assertFalse(door.canEnter)
  assertFalse(Item.isCollected(groupKey("t-s3")))
  assertEquals(sim.items, [])
  // back to e (RL then LR... RLRL = LR? no: RL has order 3, RL RL = LR)
  sim.bump(right)
  sim.bump(left)
  sim.step()
  assertEquals(arrangementOf("t-s3"), [1, 2, 0])
  assert(door.canEnter)
  assert(Item.isCollected(groupKey("t-s3")))
  assertEquals(door.growthState?.stage, 1)
  // the letter behind the door
  assertEquals(sim.items.length, 1)
  assertEquals(sim.items[0].id, groupRewardKey("t-s3"))
  assertEquals(sim.items[0].type, groupRewardType("t-s3"))
  assertEquals([sim.items[0].i, sim.items[0].j], [16, 0])
  // pulling on: the door stays open, no second letter
  sim.bump(left)
  sim.step(100)
  assert(door.canEnter)
  assertEquals(sim.items.length, 1)
  assertEquals(goalsDone(), 1)
  // after a reload (the stones back at e) it is still open
  resetGroupStates()
  const again = new Sim()
  const bay = s3Bay(again)
  again.step()
  assert(bay.door.canEnter)
})

Deno.test("group props: the reset of the area undoes its puzzles", () => {
  Item.deserializeCollected([
    groupKey("groups-s3"),
    groupRewardKey("groups-s3"),
    groupKey("elsewhere"),
  ])
  assert(isGroupKey(groupKey("groups-s3")))
  assertFalse(isGroupKey(groupRewardKey("groups-s3")))
  resetGoals({ prefix: "groups-", box: [0, 0, 0, 0] })
  assertFalse(Item.isCollected(groupKey("groups-s3")))
  assertFalse(Item.isCollected(groupRewardKey("groups-s3")))
  assert(Item.isCollected(groupKey("elsewhere")))
})

Deno.test("group props: the Moai shows its pose", () => {
  fresh()
  const sim = new Sim()
  const moai = sim.add(spawn(0, 0, "group-moai", { group: "t-d4" }))
  const turn = sim.add(
    spawn(1, 1, "group-lever", { group: "t-d4", cycles: TURN, look: 1 }),
  )
  const mirror = sim.add(
    spawn(2, 1, "group-lever", { group: "t-d4", cycles: MIRROR, look: 2 }),
  )
  sim.step()
  assertEquals(moai.growthState?.stage, 4) // looking down
  assertEquals(turn.growthState?.stage, 2)
  assertEquals(mirror.growthState?.stage, 4)
  sim.bump(mirror)
  sim.bump(turn)
  sim.step()
  assertEquals(moai.growthState?.stage, 7) // looking left, mirrored
})

Deno.test("group props: the bell rings back at e; with both levers it's the goal", () => {
  fresh()
  const sim = new Sim()
  const group = "t-bell"
  const bell = sim.add(
    spawn(0, 0, "group-bell", {
      group,
      id: "t-bell",
      need: ["s", "c"],
      reward: [0, 2],
    }),
  )
  const s = sim.add(
    spawn(1, 0, "group-lever", { group, cycles: [[0, 1]], name: "s" }),
  )
  const c = sim.add(
    spawn(2, 0, "group-lever", { group, cycles: [[0, 1, 2]], name: "c" }),
  )
  sim.step()
  // the swap twice: it rings, but only one lever was used
  sim.bump(s)
  sim.bump(s)
  sim.step()
  assertNotEquals(bell.growthState?.stage, 0)
  assertFalse(Item.isCollected(groupKey("t-bell")))
  sim.step(60)
  assertEquals(bell.growthState?.stage, 0)
  // s c s c: both levers, back at e
  for (const lever of [s, c, s]) sim.bump(lever)
  sim.step()
  assertFalse(Item.isCollected(groupKey("t-bell")))
  sim.bump(c)
  sim.step()
  assert(Item.isCollected(groupKey("t-bell")))
  assertEquals(sim.items.length, 1)
  assertEquals([sim.items[0].i, sim.items[0].j], [0, 2])
})

Deno.test("group props: the odd one's plaque, and the others'", () => {
  fresh()
  const sim = new Sim()
  const same = sim.add(spawn(0, 0, "group-mural", { id: "t-odd", odd: false }))
  const odd = sim.add(
    spawn(5, 0, "group-mural", { id: "t-odd", odd: true, reward: [5, 2] }),
  )
  const tile = sim.add(spawn(9, 0, "group-mural", { show: 3 }))
  sim.step()
  assertEquals(tile.growthState?.stage, 3)
  assertEquals(odd.growthState?.stage, 14)
  sim.bump(same)
  assertEquals(signal.message.get()?.text, NOT_ODD_TEXT)
  assertFalse(Item.isCollected(groupKey("t-odd")))
  // a thing bumping it does nothing
  sim.bump(odd, spawnActor("b", 5, 1, catalog.actors["boulder"]))
  assertFalse(Item.isCollected(groupKey("t-odd")))
  sim.bump(odd)
  sim.step()
  assert(Item.isCollected(groupKey("t-odd")))
  assertEquals(odd.growthState?.stage, 15)
  assertEquals(same.growthState?.stage, 14)
  assertEquals(sim.items.length, 1)
})

Deno.test("group field: a patrol pulls the levers at both ends of its lane", () => {
  fresh()
  const sim = new Sim()
  const group = "t-patrol"
  // the lane: a lever at x=0 and x=5, the patrol walking in between
  const a0 = sim.add(spawn(0, 0, "group-lever", { group, cycles: [[0, 1]] }))
  sim.add(spawn(5, 0, "group-lever", { group, cycles: [[0, 1]] }))
  for (let x = 0; x <= 5; x++) {
    sim.walls.add(`${x}.-1`)
    sim.walls.add(`${x}.1`)
  }
  const patrol = spawnActor("p", 2, 0, catalog.actors["patrol"], {
    dir: "right",
  })
  sim.actors.add(patrol)
  const seen: string[] = []
  for (let t = 0; t < 400; t++) {
    sim.step()
    const now = String(arrangementOf(group))
    if (seen.at(-1) !== now) seen.push(now)
  }
  // it swaps and swaps back, a pull at each end (a clock of order 2)
  assert(seen.length >= 4, `${seen}`)
  assertEquals(seen.slice(0, 4), ["", "1,0", "0,1", "1,0"])
  assert(a0.growthState!.stage >= 0)
  // the player's pull in between: what the patrol's next pull makes of
  // it depends on when (S3: pulled at e, then a: [A C B] -> [C A B]; pulled
  // at a: [B A C] -> [B C A] -> a: [C B A])
  resetGroupStates()
  pullLever("x", [[0, 1]])
  pullLever("x", [[1, 2]])
  pullLever("x", [[0, 1]])
  assertEquals(arrangementOf("x"), [2, 1, 0])
  resetGroupStates()
  pullLever("y", [[1, 2]])
  pullLever("y", [[0, 1]])
  assertEquals(arrangementOf("y"), [2, 0, 1])
})

Deno.test("group field: a boulder rolling over flat levers pulls them in order", () => {
  fresh()
  const sim = new Sim()
  const group = "t-roll"
  const a = sim.add(
    spawn(3, 0, "group-lever", {
      group,
      cycles: [[0, 1]],
      over: true,
      look: 3,
    }),
  )
  const b = sim.add(
    spawn(5, 0, "group-lever", {
      group,
      cycles: [[1, 2]],
      over: true,
      look: 3,
    }),
  )
  // flat: open, to be rolled over
  assert(a.canEnter && b.canEnter)
  sim.walls.add("8.0")
  const boulder = spawnActor("b", 1, 0, catalog.actors["boulder"])
  sim.actors.add(boulder)
  sim.step()
  // a bump on a flat lever does nothing
  sim.bump(a)
  assertEquals(arrangementOf(group), [])
  boulder.onPushed(
    { type: "pushed", dir: "right", peakAt: 0, pusher: sim.me },
    sim.field,
  )
  sim.step(200)
  assertEquals(boulder.i, 7)
  // a then b: [B C A]
  assertEquals(arrangementOf(group), [1, 2, 0])
  assertEquals(a.growthState?.stage, 7)
  // the player walking over doesn't pull it
  const me = sim.me as unknown as { i: number }
  assertEquals(me.i, 0)
})
