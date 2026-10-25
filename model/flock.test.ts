// The birds over a goal (model/flock.ts): one flock per goal while it
// isn't done, wheeling round it at FLOCK_RADIUS, gone once it is done or
// its prop is gone from the field
import { assert, assertEquals } from "@std/assert"
import { CELL_SIZE } from "../util/constants.ts"
import { circleBirds, Flock, FLOCK_RADIUS, FLOCK_ROUND } from "./flock.ts"
import type { IField, IProp } from "./types.ts"

/** A field with one prop at (100, 50), and the effects added to it */
function fieldWith(prop: IProp) {
  const effects: Flock[] = []
  let there = true
  const field = {
    props: {
      get: (i: number, j: number) =>
        there && i === 100 && j === 50 ? prop : undefined,
    },
    effects: { add: (e: Flock) => void effects.push(e) },
  } as unknown as IField
  return { field, effects, unload: () => there = false }
}

const prop = { i: 100, j: 50 } as IProp

Deno.test("flock: one per goal while it isn't done", () => {
  let done = false
  const { field, effects } = fieldWith(prop)
  circleBirds(prop, field, () => done)
  circleBirds(prop, field, () => done)
  assertEquals(effects.length, 1)
  // done: the flock is gone, and none comes again (the goal's step calls
  // it no more)
  done = true
  effects[0].step(field)
  assert(effects[0].finished)
})

Deno.test("flock: the birds wheel round the goal, wide", () => {
  const { field } = fieldWith(prop)
  const flock = new Flock(prop, () => false)
  const cx = 100.5 * CELL_SIZE, cy = 50.5 * CELL_SIZE
  const seen = new Set<string>()
  for (let t = 0; t < FLOCK_ROUND; t += 30) {
    const { x, y } = flock.bird(1)
    const d = Math.hypot((x - cx) / CELL_SIZE, (y - cy) / CELL_SIZE / 0.8)
    assert(Math.abs(d - FLOCK_RADIUS) < 0.3, `${d}`)
    seen.add(`${Math.sign(x - cx)},${Math.sign(y - cy)}`)
    for (let k = 0; k < 30; k++) flock.step(field)
  }
  // all round
  assertEquals(seen.size >= 4, true)
  // each bird a few pixels, in the palette's gray
  assert([...flock.boxes()].length >= 3 * 4)
})

Deno.test("flock: gone with its prop (the place unloaded)", () => {
  const { field, unload } = fieldWith(prop)
  const flock = new Flock(prop, () => false)
  flock.step(field)
  assert(!flock.finished)
  unload()
  flock.step(field)
  assert(flock.finished)
})
