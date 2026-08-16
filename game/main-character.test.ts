import "./ui/dom-polyfill.ts"
import { assert, assertEquals } from "@std/assert"
import { Actor } from "../model/actor.ts"
import { Prop } from "../model/prop.ts"
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

  // The spring launches the actor 3 cells to the heading direction.
  // Before the fix the actor kept jumping on the spot forever.
  for (const _ of Array(60)) {
    me.step(field)
  }
  assertEquals(me.i, 4)
  assertEquals(me.j, 0)
  assert(me.isActionQueueEmpty())
})
