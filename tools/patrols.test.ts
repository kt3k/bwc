// The patrol's way (tools/patrols.ts): the simulator's lane on
// hand-drawn patches, and against the game: the solutions of generated
// lanes played in the real actors and props (model/actor.ts,
// model/prop.ts, model/beacon.ts), compared move by move; then a real
// patrol walks the lane and lights the beacon, which it doesn't before.
import { assert, assertEquals } from "@std/assert"
import { seed } from "../util/random.ts"
import { Item } from "../model/item.ts"
import { spawnActor } from "../model/actor.ts"
import { beaconKey, beaconRewardKey } from "../model/beacon.ts"
import {
  acceptPatrol,
  dirOf,
  draftPatrol,
  type Patrol,
  PATROL_AIMS,
} from "./patrols.ts"
import { check, parse, sigName, signature, solve, trace } from "./rings.ts"
import { catalog, DIR_OF, World } from "./patch_world.ts"

// ---------------------------------------------------------------------
// the lane in the simulator

Deno.test("patrols: water and bushes cut the lane, filled or flat it's open", () => {
  // water: a stone sunk in it
  assert(check(parse(["#J.w.L", "...S..", "...@.."]), "U"))
  // a bush flattened
  assert(check(parse(["#J.k@L"]), "L"))
  // a stone pushed into the lane blocks it
  assert(!check(parse(["#J..L", "..S..", "..@.."]), "U"))
  assertEquals(dirOf(parse(["J..L"])), "right")
})

Deno.test("patrols: a lane cut by water wants a stone sunk from the side", () => {
  const layout = parse([
    ".............",
    ".............",
    "..#######....",
    "..#J..w..L...",
    "..####.###...",
    ".............",
    "......S......",
    ".............",
    ".............",
    ".............",
    "......@......",
  ])
  const solved = solve(layout)!
  assertEquals(solved.pushes, 3)
  assertEquals(signature(layout), ["push", "sink"])
})

// ---------------------------------------------------------------------
// the simulator against the game

const props =
  (patrol: Patrol, id: string, reward: [number, number]) => (c: string) =>
    c === "L" ? { type: "patrol-beacon", data: { id, reward } } : null

/**
 * A real patrol walking the lane from its start, for `frames` frames
 * (the player gone off: the patrol turns back at the player too)
 */
function walkPatrol(world: World, patrol: Patrol, frames: number) {
  world.actorList = world.actorList.filter((a) => a !== world.me)
  const w = patrol.rows[0].length
  const j = patrol.rows.join("").indexOf("J")
  world.actorList.push(
    spawnActor(
      "patrol",
      world.ox + j % w,
      world.oy + Math.floor(j / w),
      catalog.actors["patrol"],
      { dir: patrol.dir },
    ),
  )
  for (let n = 0; n < frames; n++) world.step()
}

/** Plays the lane's solution in the game, comparing each move */
function replay(patrol: Patrol, n: number) {
  const id = `test.${1000 * n}`
  const world = new World(
    patrol,
    1000 * n,
    0,
    props(patrol, id, [1000 * n, 0]),
  )
  const sim = trace(patrol, patrol.solution)
  for (const [k, m] of [...patrol.solution].entries()) {
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
      `lane ${n} (${
        sigName(patrol.signature)
      }), move ${k} of ${patrol.solution}`,
    )
  }
  world.settle()
  return world
}

Deno.test("patrols: the solutions play out the same, and the patrol lights the beacon", () => {
  Item.deserializeCollected([])
  const r = seed("patrols-test")
  let played = 0
  const sigs = new Set<string>()
  for (let n = 0; played < 15 && n < 3000; n++) {
    const patrol = acceptPatrol(
      draftPatrol(r, PATROL_AIMS[n % PATROL_AIMS.length]),
    )
    if (!patrol) continue
    played++
    sigs.add(sigName(patrol.signature))
    // left as it is, the patrol turns back short of the beacon
    const idle = `idle.${1000 * played}`
    const before = new World(
      patrol,
      1000 * played,
      100,
      props(patrol, idle, [1000 * played, 100]),
    )
    walkPatrol(before, patrol, 800)
    assert(!Item.isCollected(beaconKey(idle)), `lane ${played}: lit as it is`)
    // the way opened, it walks on and lights it
    const world = replay(patrol, played)
    walkPatrol(world, patrol, 800)
    const id = `test.${1000 * played}`
    assert(Item.isCollected(beaconKey(id)), `lane ${played}: not lit`)
    const rewards = world.items.filter((t) => t.id === beaconRewardKey(id))
    assertEquals(rewards.length, 1)
  }
  assertEquals(played, 15)
  assert(sigs.size >= 3, [...sigs].join(" "))
})
