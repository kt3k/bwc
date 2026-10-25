// The chain of trades (tools/chains.ts): the simulator's mats on a
// hand-drawn patch (only the thing wanted is taken, the next laid), and
// against the game: the solutions of generated chains played in the real
// actors and props (model/actor.ts, model/prop.ts, model/chain.ts),
// compared move by move, link after link, to the letter.
import { assert, assertEquals } from "@std/assert"
import { seed } from "../util/random.ts"
import { Item } from "../model/item.ts"
import { goneActorKey } from "../model/actor.ts"
import { chainKey, chainRewardKey, linkKey } from "../model/chain.ts"
import {
  acceptChain,
  after,
  type Chain,
  type ChainLayout,
  chainName,
  draftChain,
  freshPlace,
  givesOf,
  linksDone,
  matOf,
  solveChain,
  stageOf,
} from "./chains.ts"
import { parse, sigName, solve, trace } from "./rings.ts"
import { DIR_OF, type PropOf, World } from "./patch_world.ts"

// ---------------------------------------------------------------------
// the mats in the simulator

/**
 * Two travellers: the first (V at 1,1) faces down and wants the jar (at
 * 1,4), the second (V at 5,1) faces down and wants the wheel the first
 * gives
 */
const two = (): ChainLayout => {
  const layout = parse([
    ".......",
    ".V...V.",
    ".M...M.",
    ".......",
    ".S.....",
    ".......",
    "...@...",
  ])
  return {
    ...layout,
    things: [{ kind: "stone", x: 1, y: 4, goods: "jar" }],
    links: [
      { at: [1, 1], dir: "down", want: "jar" },
      { at: [5, 1], dir: "down", want: "wheel" },
    ],
  }
}

Deno.test("chains: the mat takes only the thing wanted", () => {
  const chain = two()
  // a stone (no good) pushed onto the first mat: not given
  const spare: ChainLayout = {
    ...chain,
    things: [
      { kind: "stone", x: 1, y: 4 },
      { kind: "stone", x: 3, y: 4, goods: "jar" },
    ],
  }
  const stage = stageOf(spare, 0, freshPlace(spare, 0))
  assertEquals(stage.give, 0)
  assert(!trace(stage, "LLUUUU").at(-1)?.done)
  // the jar, pushed up onto it: given
  const first = stageOf(chain, 0, freshPlace(chain, 0))
  assertEquals(first.rows[2], "._.....")
  assert(trace(first, "LLUUUU").at(-1)!.done)
})

Deno.test("chains: the thing given is laid on the mat, wanted by the next", () => {
  const chain = two()
  const place = after(chain, 0, freshPlace(chain, 0), "LLUUUU")
  // the jar taken, the wheel on the first mat, the player below it
  assertEquals(place.things, [{ kind: "boulder", goods: "wheel", x: 1, y: 2 }])
  assertEquals(place.start, [1, 4])
  assertEquals(givesOf(chain, 0), "wheel")
  assertEquals(givesOf(chain, 1), undefined)
  assertEquals(matOf(chain.links[1]), [5, 2])
  // the wheel can't roll onto the second mat (nothing stops it)...
  assertEquals(solve(stageOf(chain, 1, place)), null)
  // ...unless a rock beyond stops it
  const banked: ChainLayout = {
    ...chain,
    rows: chain.rows.map((r, y) => y === 2 ? r.slice(0, 6) + "#" : r),
  }
  const solved = solveChain(banked)!
  assertEquals(solved.pushes, [2, 1])
  assertEquals(linksDone(banked, solved.links.join("")), 2)
  assertEquals(linksDone(banked, solved.links[0]), 1)
})

// ---------------------------------------------------------------------
// the simulator against the game

/** The props of a chain's patch: the travellers and their mats */
const chainProps =
  (chain: Chain, id: string, ox: number): PropOf => (c, x, y) => {
    if (c === "M") return { type: "chain-mat" }
    if (c !== "V") return null
    const k = chain.links.findIndex((l) => l.at[0] === x && l.at[1] === y)
    const link = chain.links[k]
    const gives = givesOf(chain, k)
    const last = k === chain.links.length - 1
    return {
      type: "chain-wanter",
      data: {
        id,
        k,
        n: chain.links.length,
        want: link.want,
        dir: link.dir,
        ...(gives ? { gives } : {}),
        ...(last ? { reward: [ox + chain.reward[0], chain.reward[1]] } : {}),
      },
    }
  }

/**
 * Plays a chain's links in the game, comparing each move with the
 * simulator (link by link, from where the last left everything)
 */
function replay(chain: Chain, id: string, ox: number) {
  const world = new World(chain, ox, 0, chainProps(chain, id, ox))
  const w = chain.rows[0].length
  const cell = (i: number, j: number) => j * w + (i - ox)
  const solved = solveChain(chain)!
  let place = freshPlace(chain, 0)
  let filled: number[] = [], flat: number[] = []
  const join = (a: number[], b: number[]) =>
    [...new Set([...a, ...b])].sort((p, q) => p - q)
  for (const [k, moves] of solved.links.entries()) {
    const stage = stageOf(chain, k, place)
    const sim = trace(stage, moves)
    for (const [s, m] of [...moves].entries()) {
      world.settle()
      world.me.tryMove("go", DIR_OF[m], world.field)
      world.settle()
      const want = sim[s]
      if (want.done) break
      const snap = world.snapshot()
      assertEquals(
        {
          player: snap.player,
          things: world.actorList.filter((a) => a !== world.me)
            .map((a) => `${cell(a.i, a.j)}:${a.type}`).sort(),
          filled: snap.filled,
          flat: snap.flat,
        },
        {
          player: want.player,
          things: want.things.flatMap((p, n) =>
            p < 0
              ? []
              : [`${p}:${stage.things[n].goods ?? stage.things[n].kind}`]
          ).sort(),
          filled: join(filled, want.filled),
          flat: join(flat, want.flat),
        },
        `chain ${id}, link ${k}, move ${s} of ${moves}`,
      )
    }
    world.settle()
    assert(Item.isCollected(linkKey(id, k)), `chain ${id}: link ${k} given`)
    const end = sim.at(-1)!
    filled = join(filled, end.filled)
    flat = join(flat, end.flat)
    place = after(chain, k, place, moves)
  }
  world.settle()
  return world
}

Deno.test("chains: the solutions play out the same in the game, to the letter", () => {
  Item.deserializeCollected([])
  const r = seed("chains-test")
  let played = 0
  const names = new Set<string>()
  const lengths = new Set<number>()
  for (let n = 0; played < 8 && n < 3000; n++) {
    const chain = acceptChain(draftChain(r))
    if (!chain) continue
    played++
    names.add(chainName(chain))
    lengths.add(chain.links.length)
    // each link 2 pushes or more from a fresh place, more than "push"
    assert(chain.linkPushes.every((p) => p >= 2))
    assert(sigName(chain.signature) !== "push")
    const id = `test.${played}`
    const world = replay(chain, id, 1000 * played)
    assert(Item.isCollected(chainKey(id)), `chain ${id} is complete`)
    const rewards = world.items.filter((t) => t.id === chainRewardKey(id))
    assertEquals(rewards.length, 1)
    // the first thing given is gone for good (the rest weren't spawns)
    const first = chain.things.findIndex((t) => t.goods === chain.links[0].want)
    assert(Item.isCollected(goneActorKey(`thing${first}`)))
  }
  assertEquals(played, 8)
  assert(names.size >= 3, [...names].join(" "))
  assertEquals(lengths.size, 2)
})
