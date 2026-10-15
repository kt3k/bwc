import { assert, assertEquals } from "@std/assert"
import { Actor } from "./actor.ts"
import {
  BEE_DAY,
  beesHome,
  BURROWED,
  denGuarded,
  RabbitDelegate,
  sheepInPen,
  stepRabbitHole,
} from "./den.ts"
import type { Prop } from "./prop.ts"
import type { IActor, IField } from "./types.ts"

const def = (type: string) => ({ type, src: "", href: "" })

/** A fake hole: a prop at (i, j) of the warren */
const hole = (i: number, j: number) => {
  const h = {
    i,
    j,
    type: "rabbit-hole",
    data: { id: "w" },
    stage: 0,
    showStage: (n: number) => {
      h.stage = n
    },
  }
  return h as unknown as Prop & { stage: number }
}

/** Open floor with the actors and props; the time can advance */
function makeField(me: Actor, others: Actor[], props: Prop[] = []) {
  let time = 0
  const actors = [me, ...others]
  const spawned: string[] = []
  const field = {
    get me() {
      return me
    },
    canEnter: (i: number, j: number) =>
      !actors.some((a) => a.i === i && a.j === j),
    isWater: () => false,
    peekItems: () => [],
    spawnActor: (type: string, i: number, j: number) => {
      spawned.push(`${type}@${i},${j}`)
      const a = new Actor(i, j, def(type), `${type}${spawned.length}`)
      actors.push(a)
      return a
    },
    actors: {
      iter: () => actors,
      get: (i: number, j: number) =>
        actors.filter((a) => a.i === i && a.j === j) as IActor[],
      add: () => {},
      remove: (a: IActor) => {
        actors.splice(actors.indexOf(a as Actor), 1)
      },
    },
    props: { iter: () => props, get: () => undefined, remove: () => {} },
    effects: { add: () => {} },
    get time() {
      return time
    },
  } as unknown as IField
  return { field, actors, spawned, tick: (n: number) => time += n }
}

Deno.test("the bees are home for part of the day, out the rest", () => {
  const home = [...Array(BEE_DAY).keys()].filter((t) => beesHome("h", t))
  assert(home.length > 0 && home.length < BEE_DAY)
  assertEquals(beesHome("h", 7), beesHome("h", 7 + BEE_DAY))
})

Deno.test("the sheep in the pen are counted", () => {
  const me = new Actor(30, 30, def("main"), "main")
  const sheep = [[1, 1], [2, 2], [5, 5]].map(([i, j], n) =>
    new Actor(i, j, def("sheep"), `s${n}`)
  )
  const { field } = makeField(me, sheep)
  assertEquals(sheepInPen(field, { i0: 0, j0: 0, i1: 3, j1: 3 }), 2)
})

Deno.test("a fox guards its den unless it sleeps", () => {
  const me = new Actor(30, 30, def("main"), "main")
  const fox = new Actor(2, 2, def("fox"), "fox")
  const { field, tick } = makeField(me, [fox])
  assert(denGuarded(field, 0, 0))
  fox.buff.asleepUntil = 100
  assert(!denGuarded(field, 0, 0))
  tick(100)
  assert(denGuarded(field, 0, 0))
})

Deno.test("a rabbit bolts down a hole and pops up out of another", () => {
  const me = new Actor(2, 0, def("main"), "main")
  const rabbit = new Actor(0, 0, def("rabbit"), "rabbit")
  const a = hole(0, 0), b = hole(5, 5)
  const { field, actors, spawned, tick } = makeField(me, [rabbit], [a, b])
  new RabbitDelegate().onIdle(rabbit, field)
  // down the hole it stands on: gone, ears in the other hole
  assert(!actors.includes(rabbit))
  stepRabbitHole(b, field)
  assertEquals(b.stage, 1)
  tick(BURROWED)
  stepRabbitHole(b, field)
  assertEquals(spawned, ["rabbit@5,5"])
  assertEquals(b.stage, 1)
  stepRabbitHole(b, field)
  assertEquals(b.stage, 0)
})
