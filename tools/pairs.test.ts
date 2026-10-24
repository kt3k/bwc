// The pair (tools/pairs.ts): the simulator's plinth on hand-drawn
// patches, and against the game: the solutions of generated pairs played
// in the real actors and props (model/actor.ts, model/prop.ts,
// model/pair.ts), compared move by move, and the decoy's way too, which
// makes no pair.
import { assert, assertEquals } from "@std/assert"
import { seed } from "../util/random.ts"
import { Item } from "../model/item.ts"
import { pairKey, pairRewardKey } from "../model/pair.ts"
import {
  acceptPair,
  draftPair,
  type Pair,
  PAIR_AIMS,
  wantOf,
  withWant,
} from "./pairs.ts"
import { check, type Layout, parse, sigName, solve, trace } from "./rings.ts"
import { DIR_OF, type PropOf, World } from "./patch_world.ts"

// ---------------------------------------------------------------------
// the plinth in the simulator

Deno.test("pairs: the plinth takes only its twin's kind", () => {
  // the twin holds a boulder: a boulder rolled on stops against it
  assert(check(parse(["ZP..B@"]), "L"))
  // a stone pushed on is not a pair
  assert(!check(parse(["ZP.S@"]), "LLL"))
  // the twin holds a stone: the stone is
  assert(check(parse(["YP.S@"]), "LLL"))
  assertEquals(wantOf(parse(["ZP"])), "boulder")
  assertEquals(wantOf(withWant(parse(["ZP"]), "stone")), "stone")
})

Deno.test("pairs: the easy boulder is a decoy when the twin holds a stone", () => {
  // the boulder rolls on in a push (stopped by the rock beyond); the
  // stone is pushed round the hedge: "push" alone, kept for the decoy
  const layout = parse([
    ".............",
    ".............",
    "......Y......",
    ".....#P...B..",
    ".............",
    ".....kkk.....",
    ".............",
    "......S......",
    ".............",
    ".............",
    "......@......",
  ])
  const pair = acceptPair(layout)!
  assertEquals(pair.want, "stone")
  assertEquals(pair.decoy, 1)
  assertEquals(pair.pushes, 5)
  assertEquals(sigName(pair.signature), "push")
  assert(check(pair, pair.solution))
})

// ---------------------------------------------------------------------
// the simulator against the game

const pairProps = (
  layout: Layout,
  id: string,
  reward: [number, number],
): PropOf =>
(c) =>
  c === "P"
    ? { type: "pair-plinth", data: { id, want: wantOf(layout), reward } }
    : c === "Y" || c === "Z"
    ? { type: "pair-twin", data: { id, holds: wantOf(layout) } }
    : null

/** Plays the moves in the game, comparing each with the simulator */
function replay(layout: Layout, moves: string, id: string, n: number) {
  const world = new World(
    layout,
    1000 * n,
    0,
    pairProps(layout, id, [
      1000 * n,
      0,
    ]),
  )
  const sim = trace(layout, moves)
  for (const [k, m] of [...moves].entries()) {
    world.settle()
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
      `pair ${n}, move ${k} of ${moves}`,
    )
  }
  world.settle()
  return world
}

Deno.test("pairs: the solutions play out the same in the game, the decoys make none", () => {
  Item.deserializeCollected([])
  const r = seed("pairs-test")
  let played = 0
  const sigs = new Set<string>()
  const wants = new Set<string>()
  for (let n = 0; played < 20 && n < 2000; n++) {
    const pair: Pair | null = acceptPair(
      draftPair(r, PAIR_AIMS[n % PAIR_AIMS.length]),
    )
    if (!pair) continue
    played++
    sigs.add(sigName(pair.signature))
    wants.add(pair.want)
    // the decoy brought to the plinth: no pair
    const other = pair.want === "stone" ? "boulder" : "stone"
    const wrong = solve(withWant(pair, other))!
    const decoyId = `decoy.${1000 * played}`
    replay(pair, wrong.moves, decoyId, 100 + played)
    assert(!Item.isCollected(pairKey(decoyId)), `pair ${played}: decoy`)
    // the solution: a pair
    const id = `test.${1000 * played}`
    const world = replay(pair, pair.solution, id, played)
    assert(Item.isCollected(pairKey(id)), `pair ${played} is whole`)
    const rewards = world.items.filter((t) => t.id === pairRewardKey(id))
    assertEquals(rewards.length, 1)
  }
  assertEquals(played, 20)
  assert(sigs.size >= 4, [...sigs].join(" "))
  assertEquals(wants.size, 2)
})
