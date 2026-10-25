import { MOON_GATE_RANGE, passedKey, Prop, resetSwitchStates } from "./prop.ts"
import { Item } from "./item.ts"
import { Actor } from "./actor.ts"
import { PropSpawn } from "./field-block.ts"
import type { ActorDefinition, PropDefinition } from "./catalog.ts"
import type { Dir, IActor, IField } from "./types.ts"
import { assert, assertEquals, assertFalse } from "@std/assert"

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
  clock: { time: number } = { time: 0 },
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
    peekItems: () => [],
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
      return clock.time
    },
    colorCell: () => {},
  }
}

/** A prop definition with two state images (raised / lowered) */
function stateDef(
  type: string,
  canEnter: boolean,
  pushed?: string,
): PropDefinition {
  return {
    type,
    canEnter,
    pushed,
    src: `../prop/${type}.png`,
    href: `./prop/${type}.png`,
    growth: {
      stages: [`../prop/${type}.png`, `../prop/${type}_down.png`],
      hrefs: [`./prop/${type}.png`, `./prop/${type}_down.png`],
      interval: 100000000,
    },
  }
}

/** Spawns a prop with its pushed delegate, as the field does */
function spawn(def: PropDefinition, i: number, j: number, data: unknown) {
  return Prop.fromSpawn(new PropSpawn(i, j, def, data))
}

const push = (pusher: IActor) =>
  ({ type: "pushed", dir: "right", peakAt: 7, pusher }) as const

Deno.test("switch flips the blue and red walls of its group", () => {
  resetSwitchStates()
  const me = new Actor(0, 0, actorDef, "main")
  const occupied = new Set<string>()
  const field = makeField(me, () => occupied)
  const sw = spawn(stateDef("switch", false, "switch"), 1, 1, { group: "g" })
  const blue = spawn(stateDef("blue-wall", false), 2, 2, { group: "g" })
  const red = spawn(stateDef("red-wall", true), 3, 3, { group: "g" })
  const step = () => [sw, blue, red].forEach((p) => p.step(field))

  step()
  assertFalse(blue.canEnter)
  assert(red.canEnter)

  sw.onPushed(push(me), field)
  step()
  assert(blue.canEnter)
  assertFalse(red.canEnter)
  assertEquals(sw.growthState?.stage, 1)

  // The red wall never rises on someone standing in its cell
  sw.onPushed(push(me), field)
  occupied.add("2.2")
  step()
  assert(blue.canEnter)
  occupied.delete("2.2")
  step()
  assertFalse(blue.canEnter)
  assert(red.canEnter)
})

Deno.test("and-wall lowers only when every linked group is on", () => {
  resetSwitchStates()
  const me = new Actor(0, 0, actorDef, "main")
  const field = makeField(me, () => new Set())
  const swDef = stateDef("switch", false, "switch")
  // A toggles a; B toggles a and b; C toggles b and c
  const a = spawn(swDef, 1, 0, { group: "a" })
  const b = spawn(swDef, 2, 0, { group: "b", also: ["a"] })
  const c = spawn(swDef, 3, 0, { group: "c", also: ["b"] })
  const wall = spawn(stateDef("and-wall", false), 5, 0, {
    groups: ["a", "b", "c"],
  })

  b.onPushed(push(me), field)
  wall.step(field)
  assertFalse(wall.canEnter)
  // The solution: press A and C (B is a trap)
  b.onPushed(push(me), field)
  a.onPushed(push(me), field)
  c.onPushed(push(me), field)
  wall.step(field)
  assert(wall.canEnter)
})

Deno.test("timer button holds its shutters open for the duration", () => {
  resetSwitchStates()
  const me = new Actor(0, 0, actorDef, "main")
  const occupied = new Set<string>()
  const clock = { time: 100 }
  const field = makeField(me, () => occupied, clock)
  const button = spawn(stateDef("timer-button", false, "timer-button"), 0, 1, {
    group: "t",
    duration: 60,
  })
  const shutter = spawn(stateDef("shutter", false), 9, 9, { group: "t" })

  shutter.step(field)
  assertFalse(shutter.canEnter)
  button.onPushed(push(me), field)
  shutter.step(field)
  assert(shutter.canEnter)
  clock.time = 159
  shutter.step(field)
  assert(shutter.canEnter)
  // Closes when the time is up, unless someone is in the doorway
  clock.time = 160
  occupied.add("9.9")
  shutter.step(field)
  assert(shutter.canEnter)
  occupied.delete("9.9")
  shutter.step(field)
  assertFalse(shutter.canEnter)
})

Deno.test("seal wall opens when the buttons are pressed in order", () => {
  resetSwitchStates()
  const me = new Actor(0, 0, actorDef, "main")
  const field = makeField(me, () => new Set())
  const def = stateDef("seq-button", false, "seq-button")
  const b1 = spawn(def, 1, 0, { group: "s", order: 1 })
  const b2 = spawn(def, 2, 0, { group: "s", order: 2 })
  const b3 = spawn(def, 3, 0, { group: "s", order: 3 })
  const wall = spawn(stateDef("seal-wall", false), 5, 0, {
    group: "s",
    count: 3,
  })

  b1.onPushed(push(me), field)
  b1.step(field)
  assertEquals(b1.growthState?.stage, 1)
  // Skipping ahead resets the sequence
  b3.onPushed(push(me), field)
  b1.step(field)
  assertEquals(b1.growthState?.stage, 0)
  wall.step(field)
  assertFalse(wall.canEnter)

  b1.onPushed(push(me), field)
  b1.onPushed(push(me), field) // pressing again is harmless
  b2.onPushed(push(me), field)
  b3.onPushed(push(me), field)
  wall.step(field)
  assert(wall.canEnter)
  // Stays open: the state survives a re-spawn of the wall
  const respawned = spawn(stateDef("seal-wall", false), 5, 0, {
    group: "s",
    count: 3,
  })
  respawned.step(field)
  assert(respawned.canEnter)
})

Deno.test("slide button moves the gap along the slide walls", () => {
  resetSwitchStates()
  const me = new Actor(0, 0, actorDef, "main")
  const field = makeField(me, () => new Set())
  const button = spawn(stateDef("slide-button", false, "slide-button"), 0, 5, {
    group: "w",
  })
  const walls = [0, 1, 2].map((index) =>
    spawn(stateDef("slide-wall", false), 5 + index, 0, { group: "w", index })
  )
  const gaps = () => {
    walls.forEach((w) => w.step(field))
    return walls.map((w) => w.canEnter)
  }
  assertEquals(gaps(), [true, false, false])
  button.onPushed(push(me), field)
  assertEquals(gaps(), [false, true, false])
  button.onPushed(push(me), field)
  assertEquals(gaps(), [false, false, true])
  button.onPushed(push(me), field)
  assertEquals(gaps(), [true, false, false])
})

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

Deno.test("door lets the player back out the way they came in", () => {
  Item.deserializeCollected([])
  const me = new Actor(9, 10, actorDef, "main", "up")
  const occupied = new Set<string>()
  const clock = { time: 0 }
  const field = makeField(me, () => occupied, clock)
  new Prop(null, 15, 15, plateDef, null, { group: "exit-room" })
  const door = new Prop(null, 9, 9, doorDef, null, { group: "exit-room" })
  const bump = (dir: Dir) =>
    door.onPushed({ type: "pushed", dir, peakAt: 7, pusher: me }, field)
  const tick = (n = 1) => {
    for (let k = 0; k < n; k++) {
      clock.time++
      door.step(field)
    }
  }
  // never been through: a bump either way does nothing
  bump("up")
  tick()
  assertFalse(door.canEnter)
  bump("down")
  tick()
  assertFalse(door.canEnter)
  // the plate held, the player goes through, going up (the way is kept)
  occupied.add("15.15")
  tick()
  assert(door.canEnter)
  occupied.add("9.9")
  me.setDir("up")
  tick()
  assert(Item.isCollected(passedKey(9, 9, "up")))
  // gone on through; the plate let go: the door shuts behind
  occupied.clear()
  tick()
  assertFalse(door.canEnter)
  // (a reload: the same, the way kept in the save)
  const back = new Prop(null, 9, 9, doorDef, null, { group: "exit-room" })
  back.step(field)
  assertFalse(back.canEnter)
  // going back down: it opens, a while, and shuts again after
  back.onPushed({ type: "pushed", dir: "down", peakAt: 7, pusher: me }, field)
  assert(back.canEnter)
  for (let k = 0; k < 20; k++) {
    clock.time++
    back.step(field)
  }
  assert(back.canEnter)
  for (let k = 0; k < 60; k++) {
    clock.time++
    back.step(field)
  }
  assertFalse(back.canEnter)
  // but not the other way, up: that wants the plate
  back.onPushed({ type: "pushed", dir: "up", peakAt: 7, pusher: me }, field)
  assertFalse(back.canEnter)
})

Deno.test("moon gate opens once a lantern within range is lit", () => {
  const me = new Actor(0, 0, actorDef, "main")
  const clock = { time: 0 }
  const base = makeField(me, () => new Set(), clock)
  const gate = spawn(
    {
      type: "moon-gate",
      canEnter: false,
      src: "../prop/moon_gate.png",
      href: "./prop/moon_gate.png",
    },
    0,
    0,
    undefined,
  )
  const lanternDef = {
    ...stateDef("lantern-unlit", false, "light-lantern"),
  }
  const near = spawn(lanternDef, MOON_GATE_RANGE, 0, undefined)
  const far = spawn(lanternDef, MOON_GATE_RANGE + 1, 0, undefined)
  const props = [gate, near, far]
  const field: IField = {
    ...base,
    props: { get: () => undefined, remove: () => {}, iter: () => props },
    get time() {
      return clock.time
    },
  }
  const tick = () => {
    clock.time += 15
    gate.step(field)
  }

  tick()
  assertFalse(gate.canEnter)

  // A lit lantern out of range does nothing
  far.onPushed(push(me), field)
  assert(far.isLightSource)
  tick()
  assertFalse(gate.canEnter)

  // The one within range opens it
  near.onPushed(push(me), field)
  tick()
  assert(gate.canEnter)
})
