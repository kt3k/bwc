import "./ui/dom-polyfill.ts"
import { assert, assertEquals } from "@std/assert"
import { Actor } from "../model/actor.ts"
import { Prop, SPRING_DISTANCE } from "../model/prop.ts"
import type { ActorDefinition, PropDefinition } from "../model/catalog.ts"
import type { IActor, IField, IProp } from "../model/types.ts"
import { MoveEndMainActor } from "./main-character.ts"

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
