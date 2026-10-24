import "./ui/dom-polyfill.ts"
import { assert, assertEquals } from "@std/assert"
import { Actor } from "../model/actor.ts"
import { Prop, SPRING_DISTANCE } from "../model/prop.ts"
import type { ActorDefinition, PropDefinition } from "../model/catalog.ts"
import type { IActor, IField, IItem, IProp } from "../model/types.ts"
import { EMERGE_FRAMES, Item } from "../model/item.ts"
import { chooseTool } from "../model/tool.ts"
import * as signal from "../util/signals.ts"
import { clearInput, Input, inputQueue } from "./ui/input.ts"
import { IdleMainActor, MoveEndMainActor } from "./main-character.ts"

const actorDef: ActorDefinition = {
  type: "main",
  src: "../main/",
  href: "./main/",
}

const springDef: PropDefinition = {
  type: "spring",
  canEnter: true,
  onEnter: "spring",
  src: "../prop/spring.png",
  href: "./prop/spring.png",
}

function makeField(me: IActor, props: Map<string, IProp>): IField {
  return {
    get me() {
      return me
    },
    canEnter: () => true,
    canEnterStatic: () => true,
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
    actors: { iter: () => [], get: () => [], add: () => {}, remove: () => {} },
    props: {
      get: (i, j) => props.get(`${i}.${j}`),
      remove: () => {},
      iter: () => props.values(),
    },
    effects: { add: () => {} },
    get time() {
      return 0
    },
    colorCell: () => {},
  }
}

Deno.test("spring launches the actor instead of trapping it in jumps", () => {
  const me = new Actor(
    0,
    0,
    actorDef,
    "main",
    "down",
    16,
    new MoveEndMainActor(),
    null,
  )
  const spring = new Prop(null, 1, 0, springDef, null, undefined)
  const field = makeField(me, new Map([["1.0", spring]]))

  // Walk onto the spring
  me.tryMove("go", "right", field)
  assertEquals(me.i, 1)

  // The spring launches the actor SPRING_DISTANCE cells to the heading
  // direction. Before the fix the actor kept jumping on the spot forever.
  for (const _ of Array(200)) {
    me.step(field)
  }
  assertEquals(me.i, 1 + SPRING_DISTANCE)
  assertEquals(me.j, 0)
  assert(me.isActionQueueEmpty())
})

Deno.test("spring flight lands at the first obstacle", () => {
  const me = new Actor(
    0,
    0,
    actorDef,
    "main",
    "down",
    16,
    new MoveEndMainActor(),
    null,
  )
  const spring = new Prop(null, 1, 0, springDef, null, undefined)
  // A wall 4 cells past the spring
  const field: IField = {
    ...makeField(me, new Map([["1.0", spring]])),
    canEnter: (i) => i < 5,
  }
  me.tryMove("go", "right", field)
  let bumps = 0
  for (const _ of Array(200)) {
    me.step(field)
    if (!me.isActionQueueEmpty() && me.i === 4) bumps++
  }
  assertEquals(me.i, 4)
  assert(me.isActionQueueEmpty())
  // The flight ends there: no queue of bounces into the wall is left
  assert(bumps < 20)
})

Deno.test("spring flight hands over to the ice it lands on", () => {
  const me = new Actor(
    0,
    0,
    actorDef,
    "main",
    "down",
    16,
    new MoveEndMainActor(),
    null,
  )
  const spring = new Prop(null, 1, 0, springDef, null, undefined)
  // Ice from 3 on, a wall at 30: the ice slide decides where it stops
  const field: IField = {
    ...makeField(me, new Map([["1.0", spring]])),
    canEnter: (i) => i < 30,
    isSlippery: (i) => i >= 3,
  }
  me.tryMove("go", "right", field)
  for (const _ of Array(400)) {
    me.step(field)
  }
  assertEquals(me.i, 29)
  assert(me.isActionQueueEmpty())
})

Deno.test("the next spring takes over a spring flight", () => {
  const me = new Actor(
    0,
    0,
    actorDef,
    "main",
    "down",
    16,
    new MoveEndMainActor(),
    null,
  )
  const first = new Prop(null, 1, 0, springDef, null, undefined)
  const second = new Prop(null, 4, 0, springDef, null, undefined)
  const field = makeField(me, new Map([["1.0", first], ["4.0", second]]))
  me.tryMove("go", "right", field)
  for (const _ of Array(400)) {
    me.step(field)
  }
  // One flight from the second spring, not two overlapping ones
  assertEquals(me.i, 4 + SPRING_DISTANCE)
  assert(me.isActionQueueEmpty())
})

Deno.test("the player stands still while a put apple comes out", () => {
  const me = new Actor(0, 0, actorDef, "main")
  me.setDir("right")
  const items: IItem[] = []
  const field = {
    ...makeField(me, new Map()),
    peekItems: (i: number, j: number) =>
      items.filter((it) => it.i === i && it.j === j),
    spawnItem: (type: string, i: number, j: number) => {
      const item = new Item(null, i, j, {
        type,
        collect: type,
        src: "",
        href: "",
      })
      items.push(item)
      return item
    },
  }
  signal.appleCount.update(1)
  chooseTool("apple")
  const idle = new IdleMainActor()
  inputQueue.push("space")
  idle.onIdle(me, field)
  assertEquals(items.map((it) => [it.i, it.j]), [[1, 0]])
  // walking away is held until the apple is out
  Input.left = true
  for (let n = 0; n < EMERGE_FRAMES; n++) {
    idle.onIdle(me, field)
    assertEquals([me.i, me.dir], [0, "right"])
  }
  idle.onIdle(me, field)
  assertEquals([me.i, me.dir], [-1, "left"])
  clearInput()
  chooseTool(null)
  signal.appleCount.update(0)
})
