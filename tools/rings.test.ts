// The missing ring's simulator, solver and signatures (tools/rings.ts),
// on hand-drawn patches, and the simulator against the game: the
// solutions of generated rings played in the real actors and props
// (model/actor.ts, model/prop.ts, model/ring.ts), compared move by move.
import { assert, assertEquals } from "@std/assert"
import { seed } from "../util/random.ts"
import { Item } from "../model/item.ts"
import { ringKey, ringRewardKey } from "../model/ring.ts"
import { DIR_OF, type PropOf, World } from "./patch_world.ts"
import {
  accept,
  AIMS,
  check,
  draft,
  parse,
  type Ring,
  sigName,
  signature,
  solve,
  trace,
} from "./rings.ts"

// ---------------------------------------------------------------------
// the rules, one by one

/** The patch after the moves, drawn (the things on it) */
function after(rows: string[], moves: string): string[] {
  const layout = parse(rows)
  const w = layout.rows[0].length
  const last = trace(layout, moves).at(-1)!
  const g = layout.rows.map((r) => [...r])
  for (const p of last.filled) g[Math.floor(p / w)][p % w] = "="
  for (const p of last.flat) g[Math.floor(p / w)][p % w] = "-"
  last.things.forEach((p, n) => {
    if (p < 0) return
    const c = layout.things[n].kind === "stone" ? "S" : "B"
    g[Math.floor(p / w)][p % w] = c
  })
  g[Math.floor(last.player / w)][last.player % w] = "@"
  return g.map((r) => r.join(""))
}

Deno.test("rings: a stone moves a cell, a boulder rolls till stopped", () => {
  // (the player stays where it stood when it pushes)
  assertEquals(after(["@S...#"], "R"), ["@.S..#"])
  assertEquals(after(["@B...#"], "R"), ["@...B#"])
})

Deno.test("rings: on ice a stone slides on, and the player too", () => {
  assertEquals(after(["@Siii.#"], "R"), ["@.iiiS#"])
  assertEquals(after(["@Siii#."], "R"), ["@.iiS#."])
  assertEquals(after(["@iii#"], "R"), [".ii@#"])
})

Deno.test("rings: a thing pushed into water sinks and fills it", () => {
  assertEquals(after(["@Sw."], "R"), ["@.=."])
  assertEquals(after(["@B..w"], "R"), ["@...="])
  // and then it can be walked
  assertEquals(after(["@Sw."], "RRR"), ["..@."])
})

Deno.test("rings: the player pushes a bush flat, a thing can't", () => {
  assertEquals(after(["@k.."], "R"), ["@-.."])
  assertEquals(after(["@k.."], "RR"), [".@.."])
  assertEquals(after(["@Sk."], "R"), ["@Sk."])
  assertEquals(after(["@B.k"], "R"), ["@.Bk"])
})

Deno.test("rings: a boulder crushes a thing in its way, a stone stops", () => {
  assertEquals(after(["@B.S.#"], "R"), ["@...B#"])
  assertEquals(after(["@S.S.#"], "RRR"), [".@SS.#"])
})

Deno.test("rings: a thing pushed into the gap fills it", () => {
  const ring = [
    ".ooo.",
    ".oOo.",
    ".o_o.",
    ".....",
    "..S..",
    "..@..",
  ]
  assert(!check(parse(ring), "UU"))
  assert(check(parse(ring), "UUU"))
  // a boulder stops in the gap too: the heart is behind it
  const rolled = [
    ".ooo.",
    ".oOo.",
    ".o_o.",
    ".....",
    "..B..",
    "..@..",
  ]
  assertEquals(solve(parse(rolled))?.pushes, 1)
})

// ---------------------------------------------------------------------
// the solver and the signatures, on drawn patches

Deno.test("rings: a bank shot wants the roll alone", () => {
  // the boulder rolls to the rock, then up into the gap
  const layout = parse([
    ".............",
    ".............",
    "...ooo.......",
    "...oOo.......",
    "...o_o.......",
    ".............",
    ".B...#.......",
    ".............",
    ".............",
    ".............",
    "......@......",
  ])
  const solved = solve(layout)!
  assertEquals(solved.pushes, 2)
  assertEquals(solved.fills, "boulder")
  assert(check(layout, solved.moves))
  assertEquals(signature(layout), ["roll"])
})

Deno.test("rings: a ring in a moat wants a stone sunk first", () => {
  const layout = parse([
    ".............",
    ".............",
    "...wwwww.....",
    "...wooow.....",
    "...woOow.....",
    "...wo_ow.....",
    "...wwwww.....",
    ".....S.......",
    ".............",
    ".....S.......",
    "......@......",
  ])
  const solved = solve(layout)!
  assertEquals(solved.pushes, 5)
  assert(check(layout, solved.moves))
  assertEquals(signature(layout), ["push", "sink"])
})

Deno.test("rings: a stone on the ice wants the ice", () => {
  const layout = parse([
    ".............",
    ".............",
    ".............",
    "....ooo......",
    "....oOo......",
    "....o_o......",
    "..iiiiiii....",
    "..iiisiii....",
    "..iiiiiii....",
    ".............",
    "......@......",
  ])
  assertEquals(solve(layout)?.pushes, 1)
  assertEquals(signature(layout), ["push", "ice"])
})

Deno.test("rings: a boulder in a hedge wants bushes flat and a roll", () => {
  const layout = parse([
    ".............",
    ".............",
    "....ooo......",
    "....oOo......",
    "....o_o......",
    ".............",
    "...kkkkk.....",
    "...k.B.k.....",
    "...kkkkk.....",
    ".............",
    "......@......",
  ])
  const solved = solve(layout)!
  assertEquals(solved.pushes, 3)
  assertEquals(signature(layout), ["roll", "bush"])
  assertEquals(sigName(signature(layout)!), "roll+bush")
})

Deno.test("rings: an easy one is thrown away", () => {
  // walk to the stone and push it in: no signature but the push
  const layout = parse([
    ".............",
    ".............",
    "....ooo......",
    "....oOo......",
    "....o_o......",
    ".............",
    ".............",
    ".....S.......",
    ".............",
    ".............",
    "......@......",
  ])
  assertEquals(signature(layout), ["push"])
  assertEquals(accept(layout), null)
})

// ---------------------------------------------------------------------
// the simulator against the game

/** The ring's props, by the patch's character */
const ringProps = (id: string, reward: [number, number]): PropOf => (c) =>
  c === "o"
    ? { type: "ring-stone" }
    : c === "O"
    ? { type: "ring-heart", data: { id, reward } }
    : c === "_"
    ? { type: "ring-slot", data: { id, reward } }
    : null

/** Plays the ring's solution in the game, comparing each move */
function replay(ring: Ring, n: number) {
  const world = new World(
    ring,
    1000 * n,
    0,
    ringProps(`test.${1000 * n}`, [1000 * n, 0]),
  )
  const sim = trace(ring, ring.solution)
  for (const [k, m] of [...ring.solution].entries()) {
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
      `ring ${n} (${sigName(ring.signature)}), move ${k} of ${ring.solution}`,
    )
  }
  world.settle()
  return world
}

Deno.test("rings: the solutions play out the same in the game", () => {
  Item.deserializeCollected([])
  const r = seed("rings-test")
  let played = 0
  const sigs = new Set<string>()
  for (let n = 0; played < 25 && n < 2000; n++) {
    const ring = accept(draft(r, AIMS[n % AIMS.length]))
    if (!ring) continue
    played++
    sigs.add(sigName(ring.signature))
    const world = replay(ring, played)
    const id = `test.${1000 * played}`
    assert(Item.isCollected(ringKey(id)), `ring ${played} is whole`)
    // the reward lies by the ring, once
    const rewards = world.items.filter((t) => t.id === ringRewardKey(id))
    assertEquals(rewards.length, 1)
  }
  assertEquals(played, 25)
  // a few different tricks among them
  assert(sigs.size >= 4, [...sigs].join(" "))
})
