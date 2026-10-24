// The bell out of reach (tools/bells.ts): the simulator's bell on
// hand-drawn patches, and against the game: the solutions of generated
// bells played in the real actors and props (model/actor.ts,
// model/prop.ts, model/bell.ts), compared move by move.
import { assert, assertEquals } from "@std/assert"
import { seed } from "../util/random.ts"
import { Item } from "../model/item.ts"
import { bellKey, bellRewardKey } from "../model/bell.ts"
import { acceptBell, type Bell, BELL_AIMS, draftBell } from "./bells.ts"
import { check, parse, sigName, signature, solve, trace } from "./rings.ts"
import { DIR_OF, World } from "./patch_world.ts"

// ---------------------------------------------------------------------
// the bell in the simulator

Deno.test("bells: a thing bumping into the bell rings it, a knock doesn't", () => {
  // a boulder rolled at it
  assert(check(parse(["A...B@"]), "L"))
  // a stone pushed into it, a cell at a time (the player stays put as
  // it pushes)
  assert(!check(parse(["A..S@"]), "LLLL"))
  assert(check(parse(["A..S@"]), "LLLLL"))
  // the player's knock
  assert(!check(parse(["A.@"]), "LLL"))
  // the thing stops against it
  const layout = parse(["A...B@"])
  assertEquals(trace(layout, "L").at(-1)?.things, [1])
})

Deno.test("bells: a bell on an islet wants a stone sunk and a boulder", () => {
  const layout = parse([
    ".............",
    ".............",
    ".....www.....",
    ".....wAw.....",
    ".....www.....",
    ".............",
    "......S......",
    ".............",
    "......B......",
    ".............",
    "......@......",
  ])
  const solved = solve(layout)!
  assert(check(layout, solved.moves))
  assertEquals(solved.fills, "boulder")
  assertEquals(signature(layout), ["push", "roll", "sink"])
  const bell = acceptBell(layout)!
  assertEquals(sigName(bell.signature), "push+roll+sink")
  // the reward where the player can walk, off the pond
  assertEquals(bell.rows[bell.reward[1]][bell.reward[0]], ".")
})

Deno.test("bells: one in reach of the hand is thrown away", () => {
  // a stone walked up to it and pushed in
  const layout = parse([
    ".............",
    ".............",
    "......A......",
    ".............",
    ".....S.......",
    ".............",
    ".............",
    ".............",
    ".............",
    ".............",
    "......@......",
  ])
  assert(solve(layout))
  assertEquals(acceptBell(layout), null)
})

// ---------------------------------------------------------------------
// the simulator against the game

/** Plays the bell's solution in the game, comparing each move */
function replay(bell: Bell, n: number) {
  const id = `test.${1000 * n}`
  const world = new World(
    bell,
    1000 * n,
    0,
    (c) =>
      c === "A"
        ? { type: "goal-bell", data: { id, reward: [1000 * n, 0] } }
        : null,
  )
  const sim = trace(bell, bell.solution)
  for (const [k, m] of [...bell.solution].entries()) {
    world.settle()
    assert(!Item.isCollected(bellKey(id)), `bell ${n} rang early`)
    world.me.tryMove("go", DIR_OF[m], world.field)
    world.settle()
    const want = sim[k]
    if (want.done) break
    assertEquals(
      world.snapshot(),
      {
        player: want.player,
        things: want.things,
        filled: want.filled,
        flat: want.flat,
      },
      `bell ${n} (${sigName(bell.signature)}), move ${k} of ${bell.solution}`,
    )
  }
  world.settle()
  return world
}

Deno.test("bells: the solutions play out the same in the game", () => {
  Item.deserializeCollected([])
  const r = seed("bells-test")
  let played = 0
  const sigs = new Set<string>()
  for (let n = 0; played < 20 && n < 2000; n++) {
    const bell = acceptBell(draftBell(r, BELL_AIMS[n % BELL_AIMS.length]))
    if (!bell) continue
    played++
    sigs.add(sigName(bell.signature))
    const world = replay(bell, played)
    const id = `test.${1000 * played}`
    assert(Item.isCollected(bellKey(id)), `bell ${played} rang`)
    // the reward lies by the bell, once
    const rewards = world.items.filter((t) => t.id === bellRewardKey(id))
    assertEquals(rewards.length, 1)
  }
  assertEquals(played, 20)
  // a few different tricks among them
  assert(sigs.size >= 4, [...sigs].join(" "))
})
