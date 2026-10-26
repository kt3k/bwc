// The birds over a goal (model/flock.ts): one flock per goal while it
// isn't done, wheeling round it at FLOCK_RADIUS; once it is done they fly
// off out of the screen and are gone; gone at once when its prop is gone
// from the field
import { assert, assertEquals } from "@std/assert"
import { CELL_SIZE } from "../util/constants.ts"
import {
  circleBirds,
  Flock,
  FLOCK_RADIUS,
  FLOCK_ROUND,
  FLY_AWAY_FRAMES,
} from "./flock.ts"
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
  // done: the flock flies off (and none comes again: the goal's step
  // calls it no more), then is gone
  done = true
  effects[0].step(field)
  assert(effects[0].leaving)
  assert(!effects[0].finished)
  for (let k = 0; k < FLY_AWAY_FRAMES; k++) effects[0].step(field)
  assert(effects[0].finished)
})

Deno.test("flock: done, the birds fly straight away from the goal, out of the screen", () => {
  let done = false
  const { field } = fieldWith(prop)
  const flock = new Flock(prop, () => done)
  for (let k = 0; k < 100; k++) flock.step(field)
  const cx = 100.5 * CELL_SIZE, cy = 50.5 * CELL_SIZE
  const dist = (k: number) => {
    const { x, y } = flock.bird(k)
    return Math.hypot(x - cx, y - cy)
  }
  const angle = (k: number) => {
    const { x, y } = flock.bird(k)
    return Math.atan2((y - cy) / 0.8, x - cx)
  }
  done = true
  flock.step(field)
  const start = [0, 1, 2].map(dist)
  const way = [0, 1, 2].map(angle)
  let last = start
  for (let k = 1; k < FLY_AWAY_FRAMES; k++) {
    flock.step(field)
    const now = [0, 1, 2].map(dist)
    // farther every frame, the same way out
    for (let b = 0; b < 3; b++) {
      assert(now[b] >= last[b])
      assert(Math.abs(angle(b) - way[b]) < 0.05)
    }
    last = now
  }
  // well out of the screen (a screen is about 28 cells across)
  for (const d of last) assert(d / CELL_SIZE > 30, `${d / CELL_SIZE}`)
  flock.step(field)
  assert(flock.finished)
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
