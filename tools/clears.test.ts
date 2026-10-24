// The dais to clear (tools/clears.ts): the simulator's dais on
// hand-drawn patches, and against the game: the solutions of generated
// daises played in the real actors and props (model/actor.ts,
// model/prop.ts, model/clear.ts), compared move by move.
import { assert, assertEquals } from "@std/assert"
import { seed } from "../util/random.ts"
import { Item } from "../model/item.ts"
import { clearKey, clearRewardKey } from "../model/clear.ts"
import { acceptClear, type Clear, CLEAR_AIMS, draftClear } from "./clears.ts"
import { check, parse, sigName, signature, solve, trace } from "./rings.ts"
import { DIR_OF, World } from "./patch_world.ts"

/** A layout with a dais under the first thing */
const withDais = (rows: string[]) => {
  const layout = parse(rows)
  const w = layout.rows[0].length
  const [first] = layout.things
  const cells = [...layout.rows.join("")]
  cells[first.y * w + first.x] = "D"
  return {
    ...layout,
    rows: layout.rows.map((_, y) => cells.slice(y * w, y * w + w).join("")),
  }
}

// ---------------------------------------------------------------------
// the dais in the simulator

Deno.test("clears: done when what sat on the dais is gone", () => {
  // pushed off, a cell
  assert(check(withDais(["..S@"]), "L"))
  // jammed against a rock: not off
  assert(!check(withDais(["#S@"]), "LL"))
  // sunk
  assert(check(withDais(["wS@"]), "L"))
})

Deno.test("clears: a stone jammed in a nook, a bush behind it", () => {
  // from the front it jams against the bush; round the back, flatten
  // the bush and push it out from behind
  const layout = withDais([
    ".............",
    ".............",
    ".............",
    ".....k.......",
    "....#S#......",
    ".............",
    ".............",
    ".............",
    ".............",
    ".............",
    "......@......",
  ])
  const solved = solve(layout)!
  assertEquals(solved.pushes, 2)
  assertEquals(signature(layout), ["push", "bush"])
  const clear = acceptClear(layout)!
  assertEquals(clear.sits, "stone")
})

// ---------------------------------------------------------------------
// the simulator against the game

/** Plays the dais' solution in the game, comparing each move */
function replay(clear: Clear, n: number) {
  const id = `test.${1000 * n}`
  const world = new World(
    clear,
    1000 * n,
    0,
    (c) =>
      c === "D"
        ? { type: "clear-dais", data: { id, reward: [1000 * n, 0] } }
        : null,
  )
  const sim = trace(clear, clear.solution)
  // the dais sees what sits on it
  world.settle()
  for (const [k, m] of [...clear.solution].entries()) {
    world.settle()
    assert(!Item.isCollected(clearKey(id)), `dais ${n} clear too early`)
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
      `dais ${n} (${sigName(clear.signature)}), move ${k} of ${clear.solution}`,
    )
  }
  world.settle()
  return world
}

Deno.test("clears: the solutions play out the same in the game", () => {
  Item.deserializeCollected([])
  const r = seed("clears-test")
  let played = 0
  const sigs = new Set<string>()
  for (let n = 0; played < 20 && n < 2000; n++) {
    const clear = acceptClear(draftClear(r, CLEAR_AIMS[n % CLEAR_AIMS.length]))
    if (!clear) continue
    played++
    sigs.add(sigName(clear.signature))
    const world = replay(clear, played)
    const id = `test.${1000 * played}`
    assert(Item.isCollected(clearKey(id)), `dais ${played} is clear`)
    const rewards = world.items.filter((t) => t.id === clearRewardKey(id))
    assertEquals(rewards.length, 1)
  }
  assertEquals(played, 20)
  assert(sigs.size >= 4, [...sigs].join(" "))
})
