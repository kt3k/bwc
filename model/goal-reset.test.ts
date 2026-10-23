// The reset of a goals debug map (model/goal-reset.ts): it undoes the
// goals of its map, their letters and what they took from the map, and
// leaves everything else (the WILDS' goals above all) as it was
import { assert, assertEquals } from "@std/assert"
import * as signal from "../util/signals.ts"
import { goneActorKey } from "./actor.ts"
import { belongsToMap, resetGoals } from "./goal-reset.ts"
import { goalsDone } from "./goal.ts"
import { Item } from "./item.ts"
import { oddKey, oddRewardKey } from "./odd-one.ts"
import { goneKey } from "./prop.ts"
import { ringKey, ringRewardKey } from "./ring.ts"

const MAP = {
  prefix: "goals-",
  box: [10400, -10000, 10599, -9801] as [number, number, number, number],
}

/** The ids of the GOALS map: two goals, a letter, a stone gone, a coin */
const MAP_IDS = [
  ringKey("goals-roll+sink"),
  ringRewardKey("goals-roll+sink"),
  oddKey("goals-tulip"),
  goneActorKey("10410.-9985.stone.-.-"),
  goneKey("crate", 10420, -9900),
  "10405.-9990.coin",
]
/** The ids of elsewhere: the WILDS' goals and letters, a waystone, ... */
const OTHER_IDS = [
  ringKey("3120.955"),
  ringRewardKey("3120.955"),
  oddKey("2950.410"),
  oddRewardKey("2950.410"),
  // the debug map's own goals
  ringKey("debug"),
  oddKey("debug-tulip"),
  goneActorKey("3121.950.stone.-.-"),
  goneKey("crate", 0, 0),
  "3000.400.coin",
  "waystone.LOOKOUT",
]

Deno.test("goal reset: only the ids of its map belong to it", () => {
  for (const id of MAP_IDS) assert(belongsToMap(id, MAP), id)
  for (const id of OTHER_IDS) assert(!belongsToMap(id, MAP), id)
})

Deno.test("goal reset: undoes the map's goals and letters, nothing else", () => {
  Item.deserializeCollected([...MAP_IDS, ...OTHER_IDS])
  signal.glyphs.update([
    { id: ringRewardKey("goals-roll+sink"), glyph: 3 },
    { id: ringRewardKey("3120.955"), glyph: 5 },
    { id: oddRewardKey("2950.410"), glyph: 7 },
  ])
  const before = goalsDone()
  assertEquals(resetGoals(MAP), MAP_IDS.length)
  for (const id of MAP_IDS) assert(!Item.isCollected(id), id)
  for (const id of OTHER_IDS) assert(Item.isCollected(id), id)
  // the two goals of the map no longer count (Odradek goes with them)
  assertEquals(goalsDone(), before - 2)
  assertEquals(signal.glyphs.get().map((g) => g.id), [
    ringRewardKey("3120.955"),
    oddRewardKey("2950.410"),
  ])
  // again: nothing left to undo
  assertEquals(resetGoals(MAP), 0)
  Item.deserializeCollected([])
  signal.glyphs.update([])
})
