// Generates the GOALS debug map (block_10400.-10000, laid out by
// tools/goals_map.ts): a ring for every signature tools/rings.ts makes,
// a bell for every signature tools/bells.ts makes, a pair for every
// signature and kind tools/pairs.ts makes, a dais to clear for every
// signature and kind tools/clears.ts makes, a statue for every signature
// tools/gazes.ts makes, a patrol's lane for every signature
// tools/patrols.ts makes, an odd one for every family, Odradek's room and a reset that undoes the goals of this map
// only. It is linked from the start island by a
// "GOALS" portal room, to the left of the DEBUG room.
//
// The rings are real: drawn and solved by tools/rings.ts. First the very
// pool the WILDS draw theirs from (the same seed and draws as
// tools/generate_wilds.ts), the first of each signature, which is the
// ring the WILDS place first; then more drafts with a seed of their own
// (--drafts, 3000 by default; it takes some minutes) for the signatures
// the WILDS don't have. The bays go by the number of rules, then by the
// rules. Deterministic: the same rings every run. The bells, the pairs,
// the daises, the statues and the patrols the same way (--bell-drafts,
// --pair-drafts, --clear-drafts, --gaze-drafts, --patrol-drafts, 1500 by
// default).
//
// Usage: deno -A tools/generate_goals_map.ts [--drafts 3000]
//   [--bell-drafts 1500] [--pair-drafts 1500] [--clear-drafts 1500]
//   [--gaze-drafts 1500] [--patrol-drafts 1500]
import { parseArgs } from "@std/cli/parse-args"
import { loadCatalog } from "../model/catalog.ts"
import { ODD_FAMILIES } from "../model/odd-families.ts"
import { validate } from "../util/json-schema.ts"
import { seed } from "../util/random.ts"
import { accept, AIMS, draft, type Ring, RULES, sigName } from "./rings.ts"
import { arrange } from "./odd_ones.ts"
import { acceptBell, type Bell, BELL_AIMS, draftBell } from "./bells.ts"
import { acceptPair, draftPair, type Pair, PAIR_AIMS } from "./pairs.ts"
import { acceptClear, type Clear, CLEAR_AIMS, draftClear } from "./clears.ts"
import { acceptGaze, draftGaze, type Gaze, GAZE_AIMS } from "./gazes.ts"
import {
  acceptPatrol,
  draftPatrol,
  type Patrol,
  PATROL_AIMS,
} from "./patrols.ts"
import {
  ARRIVAL,
  BI,
  BJ,
  type BlockJson,
  buildGoalsMap,
  type GoalBell,
  type GoalClear,
  type GoalGaze,
  type GoalPair,
  type GoalPatrol,
  type GoalRing,
  type Spawn,
} from "./goals_map.ts"

const args = parseArgs(Deno.args, {
  string: [
    "drafts",
    "bell-drafts",
    "pair-drafts",
    "clear-drafts",
    "gaze-drafts",
    "patrol-drafts",
  ],
})
const EXTRA_DRAFTS = Number(args.drafts ?? 3000)
const EXTRA_BELL_DRAFTS = Number(args["bell-drafts"] ?? 1500)
const EXTRA_PAIR_DRAFTS = Number(args["pair-drafts"] ?? 1500)
const EXTRA_CLEAR_DRAFTS = Number(args["clear-drafts"] ?? 1500)
const EXTRA_GAZE_DRAFTS = Number(args["gaze-drafts"] ?? 1500)
const EXTRA_PATROL_DRAFTS = Number(args["patrol-drafts"] ?? 1500)

const catalog = await loadCatalog(
  new URL("../static/catalog/base.json", import.meta.url).href,
  ["base.json"],
)

// ---------------------------------------------------------------------
// the rings

/** The first ring of each signature, in the order found */
const bySig = new Map<string, GoalRing>()
const add = (ring: Ring, inWilds: boolean) => {
  const sig = sigName(ring.signature)
  if (!bySig.has(sig)) bySig.set(sig, { ...ring, inWilds })
}
{
  // the WILDS' pool: as tools/generate_wilds.ts draws it
  const plan = JSON.parse(
    await Deno.readTextFile(new URL("./wilds_plan.json", import.meta.url)),
  ) as { seed: string; blocks: { w: number; h: number } }
  const W = plan.blocks.w * 200, H = plan.blocks.h * 200
  const SCALE = Math.max(1, Math.round((W * H) / (1600 * 1000)))
  const COUNT = 12 * SCALE
  const rr = seed(`${plan.seed}/rings`)
  let drawn = 0
  for (let n = 0; n < 160 * SCALE && drawn < 4 * COUNT; n++) {
    const ring = accept(draft(rr, AIMS[n % AIMS.length]))
    if (!ring) continue
    add(ring, true)
    drawn++
  }
  console.log(`the WILDS' pool: ${bySig.size} signatures`)
}
{
  // more, for the signatures the WILDS don't have
  const rr = seed("goals/rings")
  for (let n = 0; n < EXTRA_DRAFTS; n++) {
    const ring = accept(draft(rr, AIMS[n % AIMS.length]))
    if (ring) add(ring, false)
    if (n % 500 === 499) {
      console.log(`${n + 1} more drafts: ${bySig.size} signatures`)
    }
  }
}
const rank = (sig: string) =>
  sig.split("+").map((r) => RULES.indexOf(r as typeof RULES[number]))
/** By the number of rules, then by the rules */
const bySignature = ([a]: [string, unknown], [b]: [string, unknown]) => {
  const ra = rank(a), rb = rank(b)
  if (ra.length !== rb.length) return ra.length - rb.length
  for (let k = 0; k < ra.length; k++) {
    if (ra[k] !== rb[k]) return ra[k] - rb[k]
  }
  return 0
}
const rings = [...bySig.entries()].sort(bySignature).map(([, ring]) => ring)

// ---------------------------------------------------------------------
// the bells

/** The first bell of each signature, in the order found */
const bellBySig = new Map<string, GoalBell>()
const addBell = (bell: Bell, inWilds: boolean) => {
  const sig = sigName(bell.signature)
  if (!bellBySig.has(sig)) bellBySig.set(sig, { ...bell, inWilds })
}
{
  // the WILDS' pool: as tools/generate_wilds.ts draws it
  const plan = JSON.parse(
    await Deno.readTextFile(new URL("./wilds_plan.json", import.meta.url)),
  ) as { seed: string; blocks: { w: number; h: number } }
  const W = plan.blocks.w * 200, H = plan.blocks.h * 200
  const SCALE = Math.max(1, Math.round((W * H) / (1600 * 1000)))
  const COUNT = 8 * SCALE
  const rr = seed(`${plan.seed}/bells`)
  let drawn = 0
  for (let n = 0; n < 160 * SCALE && drawn < 4 * COUNT; n++) {
    const bell = acceptBell(draftBell(rr, BELL_AIMS[n % BELL_AIMS.length]))
    if (!bell) continue
    addBell(bell, true)
    drawn++
  }
  console.log(`the WILDS' bells: ${bellBySig.size} signatures`)
}
{
  // more, for the signatures the WILDS don't have
  const rr = seed("goals/bells")
  for (let n = 0; n < EXTRA_BELL_DRAFTS; n++) {
    const bell = acceptBell(draftBell(rr, BELL_AIMS[n % BELL_AIMS.length]))
    if (bell) addBell(bell, false)
    if (n % 500 === 499) {
      console.log(`${n + 1} more bell drafts: ${bellBySig.size} signatures`)
    }
  }
}
const bells = [...bellBySig.entries()].sort(bySignature).map(([, b]) => b)

// ---------------------------------------------------------------------
// the pairs (by signature and the kind wanted)

const pairBySig = new Map<string, GoalPair>()
const addPair = (pair: Pair, inWilds: boolean) => {
  const key = `${sigName(pair.signature)} ${pair.want}`
  if (!pairBySig.has(key)) pairBySig.set(key, { ...pair, inWilds })
}
{
  // the WILDS' pool: as tools/generate_wilds.ts draws it
  const plan = JSON.parse(
    await Deno.readTextFile(new URL("./wilds_plan.json", import.meta.url)),
  ) as { seed: string; blocks: { w: number; h: number } }
  const W = plan.blocks.w * 200, H = plan.blocks.h * 200
  const SCALE = Math.max(1, Math.round((W * H) / (1600 * 1000)))
  const COUNT = 8 * SCALE
  const rr = seed(`${plan.seed}/pairs`)
  let drawn = 0
  for (let n = 0; n < 160 * SCALE && drawn < 4 * COUNT; n++) {
    const pair = acceptPair(draftPair(rr, PAIR_AIMS[n % PAIR_AIMS.length]))
    if (!pair) continue
    addPair(pair, true)
    drawn++
  }
  console.log(`the WILDS' pairs: ${pairBySig.size} signatures and kinds`)
}
{
  // more, for the signatures the WILDS don't have
  const rr = seed("goals/pairs")
  for (let n = 0; n < EXTRA_PAIR_DRAFTS; n++) {
    const pair = acceptPair(draftPair(rr, PAIR_AIMS[n % PAIR_AIMS.length]))
    if (pair) addPair(pair, false)
    if (n % 500 === 499) {
      console.log(`${n + 1} more pair drafts: ${pairBySig.size}`)
    }
  }
}
const pairs = [...pairBySig.entries()]
  .map(([key, p]) => [key.split(" ")[0], p, key] as const)
  .sort((a, b) => bySignature([a[0], 0], [b[0], 0]) || (a[2] < b[2] ? -1 : 1))
  .map(([, p]) => p)

// ---------------------------------------------------------------------
// the odd ones

const odds = (() => {
  const rr = seed("goals/odd-ones")
  return ODD_FAMILIES.map((family) => arrange(rr, family))
})()

// ---------------------------------------------------------------------
// the block, checked

// ---------------------------------------------------------------------
// the daises to clear (by signature and what sits on them)

const clearBySig = new Map<string, GoalClear>()
const addClear = (clear: Clear, inWilds: boolean) => {
  const key = `${sigName(clear.signature)} ${clear.sits}`
  if (!clearBySig.has(key)) clearBySig.set(key, { ...clear, inWilds })
}
{
  // the WILDS' pool: as tools/generate_wilds.ts draws it
  const plan = JSON.parse(
    await Deno.readTextFile(new URL("./wilds_plan.json", import.meta.url)),
  ) as { seed: string; blocks: { w: number; h: number } }
  const W = plan.blocks.w * 200, H = plan.blocks.h * 200
  const SCALE = Math.max(1, Math.round((W * H) / (1600 * 1000)))
  const COUNT = 8 * SCALE
  const rr = seed(`${plan.seed}/clears`)
  let drawn = 0
  for (let n = 0; n < 160 * SCALE && drawn < 4 * COUNT; n++) {
    const clear = acceptClear(
      draftClear(rr, CLEAR_AIMS[n % CLEAR_AIMS.length]),
    )
    if (!clear) continue
    addClear(clear, true)
    drawn++
  }
  console.log(`the WILDS' daises: ${clearBySig.size} signatures and kinds`)
}
{
  // more, for the signatures the WILDS don't have
  const rr = seed("goals/clears")
  for (let n = 0; n < EXTRA_CLEAR_DRAFTS; n++) {
    const clear = acceptClear(
      draftClear(rr, CLEAR_AIMS[n % CLEAR_AIMS.length]),
    )
    if (clear) addClear(clear, false)
    if (n % 500 === 499) {
      console.log(`${n + 1} more dais drafts: ${clearBySig.size}`)
    }
  }
}
const clears = [...clearBySig.entries()]
  .map(([key, c]) => [key.split(" ")[0], c, key] as const)
  .sort((a, b) => bySignature([a[0], 0], [b[0], 0]) || (a[2] < b[2] ? -1 : 1))
  .map(([, c]) => c)

// ---------------------------------------------------------------------
// the statues

const gazeBySig = new Map<string, GoalGaze>()
const addGaze = (gaze: Gaze, inWilds: boolean) => {
  const sig = sigName(gaze.signature)
  if (!gazeBySig.has(sig)) gazeBySig.set(sig, { ...gaze, inWilds })
}
{
  // the WILDS' pool: as tools/generate_wilds.ts draws it
  const plan = JSON.parse(
    await Deno.readTextFile(new URL("./wilds_plan.json", import.meta.url)),
  ) as { seed: string; blocks: { w: number; h: number } }
  const W = plan.blocks.w * 200, H = plan.blocks.h * 200
  const SCALE = Math.max(1, Math.round((W * H) / (1600 * 1000)))
  const COUNT = 8 * SCALE
  const rr = seed(`${plan.seed}/gazes`)
  let drawn = 0
  for (let n = 0; n < 160 * SCALE && drawn < 4 * COUNT; n++) {
    const gaze = acceptGaze(draftGaze(rr, GAZE_AIMS[n % GAZE_AIMS.length]))
    if (!gaze) continue
    addGaze(gaze, true)
    drawn++
  }
  console.log(`the WILDS' statues: ${gazeBySig.size} signatures`)
}
{
  // more, for the signatures the WILDS don't have
  const rr = seed("goals/gazes")
  for (let n = 0; n < EXTRA_GAZE_DRAFTS; n++) {
    const gaze = acceptGaze(draftGaze(rr, GAZE_AIMS[n % GAZE_AIMS.length]))
    if (gaze) addGaze(gaze, false)
    if (n % 500 === 499) {
      console.log(`${n + 1} more statue drafts: ${gazeBySig.size}`)
    }
  }
}
const gazes = [...gazeBySig.entries()].sort(bySignature).map(([, g]) => g)

// ---------------------------------------------------------------------
// the patrols

const patrolBySig = new Map<string, GoalPatrol>()
const addPatrol = (patrol: Patrol, inWilds: boolean) => {
  const sig = sigName(patrol.signature)
  if (!patrolBySig.has(sig)) patrolBySig.set(sig, { ...patrol, inWilds })
}
{
  // the WILDS' pool: as tools/generate_wilds.ts draws it
  const plan = JSON.parse(
    await Deno.readTextFile(new URL("./wilds_plan.json", import.meta.url)),
  ) as { seed: string; blocks: { w: number; h: number } }
  const W = plan.blocks.w * 200, H = plan.blocks.h * 200
  const SCALE = Math.max(1, Math.round((W * H) / (1600 * 1000)))
  const COUNT = 8 * SCALE
  const rr = seed(`${plan.seed}/patrols`)
  let drawn = 0
  for (let n = 0; n < 160 * SCALE && drawn < 4 * COUNT; n++) {
    const patrol = acceptPatrol(
      draftPatrol(rr, PATROL_AIMS[n % PATROL_AIMS.length]),
    )
    if (!patrol) continue
    addPatrol(patrol, true)
    drawn++
  }
  console.log(`the WILDS' patrols: ${patrolBySig.size} signatures`)
}
{
  // more, for the signatures the WILDS don't have
  const rr = seed("goals/patrols")
  for (let n = 0; n < EXTRA_PATROL_DRAFTS; n++) {
    const patrol = acceptPatrol(
      draftPatrol(rr, PATROL_AIMS[n % PATROL_AIMS.length]),
    )
    if (patrol) addPatrol(patrol, false)
    if (n % 500 === 499) {
      console.log(`${n + 1} more patrol drafts: ${patrolBySig.size}`)
    }
  }
}
const patrols = [...patrolBySig.entries()].sort(bySignature).map(([, p]) => p)

const block = buildGoalsMap(
  rings,
  bells,
  pairs,
  clears,
  gazes,
  patrols,
  odds,
)

const fail = (...msg: unknown[]) => {
  console.error(...msg)
  Deno.exit(1)
}
for (const p of block.props) {
  const def = catalog.props[p.type]
  if (!def) fail("unknown prop type:", p.type)
  if (def.dataSchema && !validate(def.dataSchema, p.data ?? {})) {
    fail(`prop "${p.type}" has data not matching its schema`, p)
  }
}
for (const a of block.actors) {
  if (!catalog.actors[a.type]) fail("unknown actor type:", a.type)
}
const occupied = new Set<string>()
/** The daises: what sits on one is the one spawn let share its cell */
const daises = new Set(
  block.props.filter((p) => p.type === "clear-dais").map((p) =>
    `${p.i}.${p.j}`
  ),
)
for (const s of [...block.actors, ...block.items, ...block.props]) {
  const key = `${s.i}.${s.j}`
  const sits = s.type === "clear-dais" && daises.has(key)
  if (occupied.has(key) && !sits) fail("overlapping spawns at", key, s)
  occupied.add(key)
  const x = s.i - BI, y = s.j - BJ
  const cell = catalog.cells[block.field[y][x]]
  if (!cell?.canEnter && block.field[y][x] !== "k" && s.type !== "sign") {
    fail("a spawn on a cell that can't be entered:", s)
  }
}

await Deno.writeTextFile(
  new URL(`../static/map/block_${BI}.${BJ}.json`, import.meta.url),
  JSON.stringify(block, null, 2) + "\n",
)
console.log(
  `generated block_${BI}.${BJ}.json (goals map: ${rings.length} rings: ` +
    rings.map((r) => sigName(r.signature)).join(", ") +
    `; ${bells.length} bells: ` +
    bells.map((b) => sigName(b.signature)).join(", ") +
    `; ${pairs.length} pairs: ` +
    pairs.map((p) => `${sigName(p.signature)} ${p.want}`).join(", ") +
    `; ${clears.length} daises: ` +
    clears.map((c) => `${sigName(c.signature)} ${c.sits}`).join(", ") +
    `; ${gazes.length} statues: ` +
    gazes.map((g) => sigName(g.signature)).join(", ") +
    `; ${patrols.length} patrols: ` +
    patrols.map((p) => sigName(p.signature)).join(", ") +
    `; ${odds.length} odd ones)`,
)

// ---------------------------------------------------------------------
// the GOALS portal room on the start island (block_-10000.-10000)
//
// To the left of the DEBUG room (tools/generate_debug_map.ts), the same
// shape: a walled room with the portal, and a passage with a red cell, a
// "G" label and a sign. It opens on the DEBUG room's bottom row, which is
// walked along from the DEBUG passage (a sign there points the way).

const startPath = new URL(
  "../static/map/block_-10000.-10000.json",
  import.meta.url,
)
const start = JSON.parse(await Deno.readTextFile(startPath)) as BlockJson
const sgrid = start.field.map((row) => [...row])
const carve = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cell: string,
) => {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) sgrid[y][x] = cell
  }
}
carve(14, 23, 18, 27, "3") // the room ring
carve(15, 24, 17, 26, "6") // the room floor
carve(19, 23, 22, 27, "0") // the passage
carve(23, 27, 23, 27, "0") // the opening onto the DEBUG room
carve(22, 27, 22, 27, "r") // the red marker cell
start.field = sgrid.map((row) => row.join(""))

const local = (i: number, j: number) => ({ i: start.i + i, j: start.j + j })
const additions: Spawn[] = [
  {
    ...local(16, 25),
    type: "portal",
    data: { i: BI + ARRIVAL.i, j: BJ + ARRIVAL.j },
  },
  { ...local(22, 27), type: "r_white" },
  { ...local(21, 27), type: "g" },
  {
    ...local(19, 23),
    type: "sign",
    data: {
      text: "GOALS MAP: EVERY RING, BELL, PAIR, DAIS, STATUE, PATROL AND ODD " +
        "ONE, AND A RESET",
    },
  },
  {
    ...local(32, 27),
    type: "sign",
    data: { text: "GOALS MAP: WEST, ALONG THE FOOT OF THE DEBUG ROOM" },
  },
]
for (const add of additions) {
  const index = start.props.findIndex((p) => p.i === add.i && p.j === add.j)
  if (index >= 0) {
    start.props[index] = add
  } else {
    start.props.push(add)
  }
}
await Deno.writeTextFile(startPath, JSON.stringify(start, null, 2) + "\n")
console.log("linked the goals map from the start island")
