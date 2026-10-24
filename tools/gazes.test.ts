// The statue's gaze (tools/gazes.ts): the simulator's line on hand-drawn
// patches, and against the game: the solutions of generated statues
// played in the real actors and props (model/actor.ts, model/prop.ts,
// model/gaze.ts), compared move by move.
import { assert, assertEquals } from "@std/assert"
import { seed } from "../util/random.ts"
import { Item } from "../model/item.ts"
import { gazeKey, gazeRewardKey } from "../model/gaze.ts"
import { acceptGaze, dirOf, draftGaze, type Gaze, GAZE_AIMS } from "./gazes.ts"
import { check, parse, sigName, signature, solve, trace } from "./rings.ts"
import { DIR_OF, World } from "./patch_world.ts"

// ---------------------------------------------------------------------
// the line in the simulator

Deno.test("gazes: things and bushes block the line, water doesn't", () => {
  // a stone in the line, pushed down out of it
  assert(check(parse(["..@..", "E.S.T", "....."]), "D"))
  // pushed along it, it stays in it
  assert(!check(parse(["E.S@T"]), "L"))
  // a bush flattened
  assert(check(parse(["E.k@T"]), "L"))
  // a stone sunk in a pool on the line
  assert(check(parse(["EwS@T"]), "L"))
  assertEquals(dirOf(parse(["E..T"])), "right")
  assertEquals(dirOf(parse(["T", ".", "E"])), "up")
})

Deno.test("gazes: a walled line with a pool wants a roll and a sink", () => {
  // the stone and the boulder can't be pushed out sideways (rocks either
  // side): the boulder rolled along the line crushes the stone and sinks
  // in the pool
  const layout = parse([
    ".............",
    ".............",
    "..####.......",
    "..EwSB.T.....",
    "..####.......",
    ".............",
    ".............",
    ".............",
    ".............",
    ".............",
    "......@......",
  ])
  const solved = solve(layout)!
  assertEquals(solved.pushes, 1)
  assertEquals(signature(layout), ["roll", "sink"])
})

// ---------------------------------------------------------------------
// the simulator against the game

/** Plays the statue's solution in the game, comparing each move */
function replay(gaze: Gaze, n: number) {
  const id = `test.${1000 * n}`
  const w = gaze.rows[0].length
  const cells = gaze.rows.join("")
  const t = cells.indexOf("T")
  const to: [number, number] = [1000 * n + t % w, Math.floor(t / w)]
  const world = new World(
    gaze,
    1000 * n,
    0,
    (c) =>
      c === "E"
        ? {
          type: "gaze-statue",
          data: { id, dir: gaze.dir, to, reward: [1000 * n, 0] },
        }
        : c === "T"
        ? { type: "gaze-sun", data: { id } }
        : null,
  )
  const sim = trace(gaze, gaze.solution)
  // the statue sees the line blocked first
  world.settle()
  for (const [k, m] of [...gaze.solution].entries()) {
    world.settle()
    assert(!Item.isCollected(gazeKey(id)), `statue ${n} saw too early`)
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
      `statue ${n} (${sigName(gaze.signature)}), move ${k} of ${gaze.solution}`,
    )
  }
  world.settle()
  return world
}

Deno.test("gazes: the solutions play out the same in the game", () => {
  Item.deserializeCollected([])
  const r = seed("gazes-test")
  let played = 0
  const sigs = new Set<string>()
  for (let n = 0; played < 20 && n < 3000; n++) {
    const gaze = acceptGaze(draftGaze(r, GAZE_AIMS[n % GAZE_AIMS.length]))
    if (!gaze) continue
    played++
    sigs.add(sigName(gaze.signature))
    const world = replay(gaze, played)
    const id = `test.${1000 * played}`
    assert(Item.isCollected(gazeKey(id)), `statue ${played} sees`)
    const rewards = world.items.filter((t) => t.id === gazeRewardKey(id))
    assertEquals(rewards.length, 1)
  }
  assertEquals(played, 20)
  assert(sigs.size >= 4, [...sigs].join(" "))
})
