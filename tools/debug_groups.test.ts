// The GROUPS area of the debug map (tools/generate_debug_map.ts,
// ideas/groups.md): every group's door can be opened with its levers,
// the groups are the ones the signs say (by how many states their
// levers reach), every lever moves only stones of its own bay, and the
// patrol and the boulders are where their levers are
import { assert, assertEquals } from "@std/assert"
import {
  type Arrangement,
  type Cycles,
  identity,
  isIdentity,
  placesOf,
  pull,
  same,
} from "../model/group.ts"

// deno-lint-ignore no-explicit-any
type Spawn = { i: number; j: number; type: string; dir?: string; data?: any }
const block = JSON.parse(
  await Deno.readTextFile(
    new URL("../static/map/block_10000.-10000.json", import.meta.url),
  ),
) as { props: Spawn[]; actors: Spawn[] }

const inGroup = (type: string, group: string) =>
  block.props.filter((p) => p.type === type && p.data?.group === group)
const leversOf = (group: string): Cycles[] =>
  inGroup("group-lever", group).map((p) => p.data.cycles as Cycles)

/** All the arrangements the levers reach from e */
function closure(levers: readonly Cycles[]): number[][] {
  const n = Math.max(...levers.map(placesOf))
  const seen = new Map<string, number[]>([[String(identity(n)), identity(n)]])
  const queue = [identity(n)]
  while (queue.length) {
    const arr = queue.shift()!
    for (const lever of levers) {
      const next = pull(arr, lever)
      if (!seen.has(String(next))) {
        seen.set(String(next), next)
        queue.push(next)
      }
    }
  }
  return [...seen.values()]
}

/** The groups of the area by their bay, and how many states each has */
const ORDERS: Record<string, number> = {
  "groups-s3": 6,
  "groups-s4": 24,
  "groups-z4": 4,
  "groups-d4": 8,
  "groups-bell": 6,
  "groups-z4-dial": 4,
  "groups-z2xz2": 4,
  "groups-clock": 6,
  "groups-words": 6,
  "groups-odd-s3": 6,
  "groups-odd-d3": 6,
  "groups-odd-z6": 6,
}

Deno.test("debug groups: each bay's levers make the group its signs name", () => {
  for (const [group, order] of Object.entries(ORDERS)) {
    const levers = leversOf(group)
    assert(levers.length > 0, group)
    assertEquals(closure(levers).length, order, group)
  }
})

Deno.test("debug groups: every door's target is reached, and is not e", () => {
  const doors = block.props.filter((p) =>
    p.type === "group-door" && p.data.group.startsWith("groups-")
  )
  assertEquals(doors.length, 8)
  for (const door of doors) {
    const target = door.data.target as Arrangement
    assert(!isIdentity(target), door.data.group)
    assert(
      closure(leversOf(door.data.group)).some((arr) => same(arr, target)),
      door.data.group,
    )
    // its letter comes up behind it, in the vault
    assertEquals(door.data.reward, [door.i, door.j - 1])
  }
})

Deno.test("debug groups: the stones of a bay are at the places its levers move", () => {
  for (const group of Object.keys(ORDERS)) {
    const stones = inGroup("group-stone", group)
    if (stones.length === 0) continue
    const n = Math.max(...leversOf(group).map(placesOf))
    assertEquals(
      stones.map((s) => s.data.place).sort((a, b) => a - b),
      identity(n),
      group,
    )
  }
})

Deno.test("debug groups: the patrol walks between its two levers, the boulders sit at their lanes", () => {
  const patrols = block.actors.filter((a) => a.type === "patrol" && a.i > 10100)
  assertEquals(patrols.length, 1)
  const [patrol] = patrols
  assertEquals(patrol.dir, "right")
  const ends = inGroup("group-lever", "groups-clock").filter((l) =>
    l.j === patrol.j
  )
  assertEquals(ends.length, 2)
  assert(ends.every((l) => l.data.name === "a"))
  // the boulders: one at the left end of each lane, its flat levers on
  // the way
  const flats = inGroup("group-lever", "groups-words")
  assert(flats.every((l) => l.data.over === true))
  const boulders = block.actors.filter((a) =>
    a.type === "boulder" && a.i > 10100
  )
  assertEquals(boulders.length, 3)
  const words = boulders.map((b) =>
    flats.filter((l) => l.j === b.j && l.i > b.i).sort((x, y) => x.i - y.i)
      .map((l) => l.data.name).join("")
  )
  assertEquals(words, ["ab", "ba", "b"])
})
