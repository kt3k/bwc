import { Prop } from "./prop.ts"
import { Actor } from "./actor.ts"
import type { ActorDefinition, PropDefinition } from "./catalog.ts"
import type { IActor, IField } from "./types.ts"
import { assert, assertFalse } from "@std/assert"

const actorDef: ActorDefinition = {
  type: "main",
  src: "../main/",
  href: "./main/",
}

const plateDef: PropDefinition = {
  type: "plate",
  canEnter: true,
  src: "../prop/plate.png",
  href: "./prop/plate.png",
}

const doorDef: PropDefinition = {
  type: "door",
  canEnter: false,
  src: "../prop/door.png",
  href: "./prop/door.png",
}

function makeField(
  me: IActor,
  occupiedCells: () => Set<string>,
): IField {
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
    actors: {
      iter: () => [],
      get: (i, j) => (occupiedCells().has(`${i}.${j}`) ? [me] : []),
      add: () => {},
      remove: () => {},
    },
    props: { get: () => undefined, remove: () => {}, iter: () => [] },
    effects: { add: () => {} },
    get time() {
      return 0
    },
    colorCell: () => {},
  }
}

Deno.test("door opens while a plate of the same group is occupied", () => {
  const me = new Actor(0, 0, actorDef, "main")
  const occupied = new Set<string>()
  const field = makeField(me, () => occupied)
  // The plate registers itself on construction
  new Prop(null, 5, 5, plateDef, null, { group: "test-room" })
  const door = new Prop(null, 9, 9, doorDef, null, { group: "test-room" })

  door.step(field)
  assertFalse(door.canEnter)

  occupied.add("5.5")
  door.step(field)
  assert(door.canEnter)

  occupied.delete("5.5")
  door.step(field)
  assertFalse(door.canEnter)
})
