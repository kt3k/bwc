import { assertEquals } from "@std/assert"
import { bestBuys, TradeStallPushed } from "./trade.ts"
import type { Prop } from "./prop.ts"
import type { IActor, IField, PushedEvent } from "./types.ts"
import * as signal from "../util/signals.ts"

const field = { effects: { add: () => {} } } as unknown as IField
const me = { id: "main" } as IActor
const bump: PushedEvent = { type: "pushed", dir: "up", peakAt: 0, pusher: me }
const stall = (
  town: string,
  good: string,
  prices: Record<string, number>,
) => ({ i: 0, j: 0, data: { town, good, cost: 5, prices } }) as unknown as Prop

Deno.test("the trade: buy cheap at home, sell dear far away", () => {
  signal.cargo.update(null)
  signal.coinCount.update(7)
  const southport = stall("SOUTHPORT", "FISH", { FURS: 40 })
  const frostreach = stall("FROSTREACH", "FURS", { FISH: 38 })
  const box = new TradeStallPushed()

  // a crate of fish for 5
  box.onPushed(bump, southport, field)
  assertEquals(signal.cargo.get(), { good: "FISH", from: "SOUTHPORT", paid: 5 })
  assertEquals(signal.coinCount.get(), 2)
  // the fish town doesn't take fish back
  box.onPushed(bump, southport, field)
  assertEquals(signal.cargo.get()?.good, "FISH")
  // sold far away
  box.onPushed(bump, frostreach, field)
  assertEquals(signal.cargo.get(), null)
  assertEquals(signal.coinCount.get(), 40)
  // too poor for a crate: nothing changes hands
  signal.coinCount.update(3)
  box.onPushed(bump, frostreach, field)
  assertEquals(signal.cargo.get(), null)
  assertEquals(signal.coinCount.get(), 3)
  signal.coinCount.update(0)
})

Deno.test("a trader names what it pays best for", () => {
  assertEquals(bestBuys({ A: 3, B: 9, C: 5 }), "B 9, C 5")
})
