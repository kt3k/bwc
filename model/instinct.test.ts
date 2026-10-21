import { assert, assertEquals } from "@std/assert"
import { Actor } from "./actor.ts"
import { FEAR_RANGE, FEARS, instinct, LIKES } from "./instinct.ts"
import type { IActor, IField } from "./types.ts"

const def = (type: string) => ({ type, src: "", href: "" })

/** Open floor with the actors; counts the mark pixels shown */
function makeField(actors: Actor[]) {
  let marks = 0
  const field = {
    get me() {
      return actors.find((a) => a.id === "main")
    },
    canEnter: (i: number, j: number) =>
      !actors.some((a) => a.i === i && a.j === j),
    peekItems: () => [],
    actors: {
      iter: () => actors,
      get: (i: number, j: number) =>
        actors.filter((a) => a.i === i && a.j === j) as IActor[],
    },
    effects: { add: () => marks++ },
    time: 0,
  } as unknown as IField
  return { field, marks: () => marks }
}

Deno.test("every fear and hunt names an animal of the table", () => {
  for (const [who, fear] of Object.entries(FEARS)) assert(who !== fear)
  assertEquals(LIKES.fox.actor, "rabbit")
  assertEquals(FEARS.rabbit, "fox")
})

Deno.test("an animal runs from what it fears, sweating", () => {
  const me = new Actor(30, 30, def("main"), "main")
  const sheep = new Actor(5, 5, def("sheep"), "sheep")
  const fox = new Actor(5, 5 + FEAR_RANGE - 1, def("fox"), "fox")
  const { field, marks } = makeField([me, sheep, fox])
  assert(instinct(sheep, field))
  // one step on its way, up and away from the fox below
  assertEquals([sheep.i, sheep.j], [5, 4])
  assert(marks() > 0)
})

Deno.test("a hunter gives chase to what it likes", () => {
  const me = new Actor(30, 30, def("main"), "main")
  const fox = new Actor(0, 0, def("fox"), "fox")
  const rabbit = new Actor(4, 0, def("rabbit"), "rabbit")
  const { field } = makeField([me, fox, rabbit])
  assert(instinct(fox, field))
  assertEquals([fox.i, fox.j], [1, 0])
})

Deno.test("asleep, nothing stirs it", () => {
  const me = new Actor(30, 30, def("main"), "main")
  const fox = new Actor(0, 0, def("fox"), "fox")
  const bee = new Actor(1, 0, def("bee"), "bee")
  fox.buff.asleepUntil = 100
  const { field } = makeField([me, fox, bee])
  assertEquals(instinct(fox, field), false)
  assertEquals([fox.i, fox.j], [0, 0])
})

Deno.test("an animal with no likes or fears goes its own way", () => {
  const me = new Actor(30, 30, def("main"), "main")
  const slime = new Actor(0, 0, def("slime"), "slime")
  const { field } = makeField([me, slime])
  assertEquals(instinct(slime, field), false)
})
