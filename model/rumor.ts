// Rumors (docs/playtest-2026-10-21.md, plan 6): the folk talk of the
// places of the island (the castle, the four corners, the landmarks, the
// cave) and each tells which way the place lies from where they stand,
// and how far. The nearer you get, the plainer they say it, so asking
// along the way leads you there. The places are listed by
// tools/generate_wilds.ts in static/map/rumors.json.
import { seed } from "../util/random.ts"

export type Rumor = { topic: string; i: number; j: number }

let rumors: Rumor[] = []

/** Sets the places talked of (tests), or loads them from the map */
export function setRumors(list: Rumor[]) {
  rumors = list
}

/** Loads the places talked of; without them, nobody talks of them */
export async function loadRumors(url = "map/rumors.json") {
  try {
    const res = await fetch(url)
    if (res.ok) rumors = await res.json()
  } catch {
    // no rumors
  }
}

/** Too far to have heard of it: another land altogether */
export const HEARD_OF = 2000

const DIRS8 = [
  "EAST",
  "SOUTH-EAST",
  "SOUTH",
  "SOUTH-WEST",
  "WEST",
  "NORTH-WEST",
  "NORTH",
  "NORTH-EAST",
]

/** The way from (i, j) to (ti, tj) in the eight winds */
export function wayTo(i: number, j: number, ti: number, tj: number): string {
  const a = Math.atan2(tj - j, ti - i)
  return DIRS8[(Math.round(a / (Math.PI / 4)) + 8) % 8]
}

/** What one says of the place from (i, j): plainer the nearer it is */
export function tell(rumor: Rumor, i: number, j: number): string {
  const d = Math.round(Math.hypot(rumor.i - i, rumor.j - j))
  const way = wayTo(i, j, rumor.i, rumor.j)
  const t = rumor.topic
  if (d > 400) return `THEY SAY ${t} LIES FAR AWAY, TO THE ${way}`
  if (d > 120) {
    return `${t}? ABOUT ${Math.round(d / 50) * 50} STEPS ${way} OF HERE`
  }
  if (d > 30) return `${t} IS NEAR NOW: ${Math.round(d / 10) * 10} STEPS ${way}`
  return `${t} IS RIGHT HERE, JUST ${way}!`
}

/**
 * The place this one talks of (each person their own place, by who they
 * are), standing at (i, j); null if they know of none
 */
export function placeOf(id: string, i: number, j: number): Rumor | null {
  const near = rumors.filter((r) => Math.hypot(r.i - i, r.j - j) < HEARD_OF)
  if (near.length === 0) return null
  return near[seed(`rumor.${id}`).randomInt(near.length)]
}

/**
 * The rumor this one tells (each person their own place, by who they
 * are), as said from (i, j); null if they know of none
 */
export function rumorOf(id: string, i: number, j: number): string | null {
  const r = placeOf(id, i, j)
  return r ? tell(r, i, j) : null
}
