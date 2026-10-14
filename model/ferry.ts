// The ferries (ideas/wilds-roaming-todo.md, 10): every river and canal of
// the WILDS runs on to the sea, so a boat can carry you down it. Boats lie
// moored at landings along the waters; bump one from the bank and you get
// in, are rowed down to the next landing and stepped off on its bank. The
// landing at the river's mouth rows you back up to its first one.
//
// Each boat knows its way (worked out by tools/generate_wilds.ts): `path`,
// the cells from its own cell to the next landing's boat as runs of
// "u", "d", "l", "r" and a count ("d12r3"), `land` the step from there onto
// the bank, and `to` the name of where it goes.
import { DOWN, LEFT, opposite, RIGHT, UP } from "../util/dir.ts"
import { Palette } from "../util/palette.ts"
import * as signal from "../util/signals.ts"
import type { Actor } from "./actor.ts"
import type { Prop, PushedDelegate } from "./prop.ts"
import type { Dir, IField, PushedEvent } from "./types.ts"

type FerryData = { to?: string; path?: string; land?: string }

const DIR_OF: Record<string, Dir> = { u: UP, d: DOWN, l: LEFT, r: RIGHT }
const LETTER_OF: Record<Dir, string> = {
  up: "u",
  down: "d",
  left: "l",
  right: "r",
}

/** The steps of a path written as runs ("d12r3" is 12 down, 3 right) */
export function parsePath(path: string): Dir[] {
  const dirs: Dir[] = []
  for (const [, c, n] of path.matchAll(/([udlr])(\d+)/g)) {
    for (let k = 0; k < Number(n); k++) dirs.push(DIR_OF[c])
  }
  return dirs
}

/** Writes the steps as runs (the other way of parsePath) */
export function writePath(dirs: Dir[]): string {
  let out = ""
  for (let k = 0; k < dirs.length;) {
    let n = 1
    while (dirs[k + n] === dirs[k]) n++
    out += `${LETTER_OF[dirs[k]]}${n}`
    k += n
  }
  return out
}

/** The speed of the ride: a long one goes faster */
export const rideSpeed = (steps: number): 4 | 8 => steps > 60 ? 8 : 4

/**
 * Rows the player from the bank into the boat, along the steps and off
 * onto the far bank: the player shows as the rowboat on the way, and the
 * boat at the landing is gone until the ride is over.
 */
export function ride(
  me: Actor,
  prop: Prop,
  field: IField,
  steps: Dir[],
  land: Dir,
) {
  const boat = field.spawnActor("rowboat", me.i, me.j, me.dir) as
    | Actor
    | null
  // only for its images: it never stays on the field
  if (boat) field.actors.remove(boat)
  me.enqueueActions(
    { type: "add-buff", buff: "riding" },
    {
      type: "call",
      fn: () => {
        me.skin = boat
        me.speed = rideSpeed(steps.length)
        prop.showStage(1)
        signal.playSound("blipSelect")
      },
    },
  )
  steps.forEach((dir, k) => {
    me.enqueueActions({ type: "drift", dir })
    if (k % 3 === 2) {
      // the wake behind the boat
      me.enqueueActions({
        type: "line-pattern-0",
        dirs: [opposite(dir)],
        baseSpeed: 1,
        p0: 0.7,
        dist: 1,
        color: Palette.white,
      })
    }
  })
  me.enqueueActions(
    {
      type: "call",
      fn: () => {
        me.skin = null
        me.speed = me.baseSpeed
      },
    },
    { type: "drift", dir: land },
    {
      type: "call",
      fn: () => {
        delete me.buff.riding
        prop.showStage(0)
      },
    },
  )
}

export class FerryPushed implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    const me = event.pusher as Actor | undefined
    if (me?.id !== "main" || me.buff.riding) return
    const { to, path, land } = (prop.data ?? {}) as FerryData
    const say = (text: string) =>
      signal.speech.update({
        i: prop.i,
        j: prop.j,
        text,
        below: event.dir === "down",
      })
    if (!to || !path || !land || !DIR_OF[land]) {
      say("A BOAT, TIED UP. IT GOES NOWHERE")
      return
    }
    say(`THE FERRY TO ${to}. IN YOU GET`)
    ride(me, prop, field, [event.dir, ...parsePath(path)], DIR_OF[land])
  }
}
