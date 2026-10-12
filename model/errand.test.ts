import { assert, assertEquals } from "@std/assert"
import { nextLetter, PostBoxPushed } from "./errand.ts"
import type { Prop } from "./prop.ts"
import type { IActor, IField, PushedEvent } from "./types.ts"
import * as signal from "../util/signals.ts"

const field = { effects: { add: () => {} } } as unknown as IField
const me = { id: "main" } as IActor
const bump: PushedEvent = { type: "pushed", dir: "up", peakAt: 0, pusher: me }
const post = (town: string, routes: { town: string; reward: number }[]) =>
  ({ i: 0, j: 0, data: { town, routes } }) as unknown as Prop

Deno.test("the post: take a letter, deliver it, get paid and the next", () => {
  signal.letter.update(null)
  signal.deliveries.update(0)
  signal.coinCount.update(0)
  const ashford = post("ASHFORD", [{ town: "OAKMERE", reward: 20 }])
  const oakmere = post("OAKMERE", [{ town: "ASHFORD", reward: 20 }])
  const hayward = post("HAYWARD", [{ town: "ASHFORD", reward: 9 }])
  const box = new PostBoxPushed()

  // a letter for OAKMERE
  box.onPushed(bump, ashford, field)
  assertEquals(signal.letter.get(), {
    to: "OAKMERE",
    from: "ASHFORD",
    reward: 20,
  })
  // the wrong town keeps it and pays nothing
  box.onPushed(bump, hayward, field)
  assertEquals(signal.letter.get()?.to, "OAKMERE")
  assertEquals(signal.coinCount.get(), 0)
  // delivered: paid, counted, and the next letter handed over
  box.onPushed(bump, oakmere, field)
  assertEquals(signal.coinCount.get(), 20)
  assertEquals(signal.deliveries.get(), 1)
  assertEquals(signal.letter.get()?.from, "OAKMERE")
  signal.letter.update(null)
  signal.coinCount.update(0)
})

Deno.test("the next letter goes round the routes", () => {
  const routes = [{ town: "A", reward: 1 }, { town: "B", reward: 2 }]
  const towns = new Set(
    [0, 1, 2, 3, 4, 5].map((n) => nextLetter("X", routes, n)?.to),
  )
  assert(towns.has("A") && towns.has("B"))
  assertEquals(nextLetter("X", [], 0), null)
})
