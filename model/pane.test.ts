import { assertEquals } from "@std/assert"
import { PanePushed, wholePanes } from "./pane.ts"
import { Item } from "./item.ts"
import type { Prop } from "./prop.ts"
import type { IActor, IField, PushedEvent } from "./types.ts"
import * as signal from "../util/signals.ts"

const field = { effects: { add: () => {} } } as unknown as IField
const me = { id: "main" } as IActor
const bump: PushedEvent = { type: "pushed", dir: "up", peakAt: 0, pusher: me }
const frame = (shard: string) =>
  ({ i: 0, j: 0, data: { shard }, showStage: () => {} }) as unknown as Prop

Deno.test("the panes: a frame takes its piece, all four pay once more", () => {
  Item.deserializeCollected([])
  signal.coinCount.update(0)
  signal.shards.update(["shard-sea"])
  const box = new PanePushed()
  // without its piece, nothing
  box.onPushed(bump, frame("shard-snow"), field)
  assertEquals(wholePanes(), 0)
  // with it: whole, the piece used, 25 coins
  box.onPushed(bump, frame("shard-sea"), field)
  assertEquals(wholePanes(), 1)
  assertEquals(signal.shards.get(), [])
  assertEquals(signal.coinCount.get(), 25)
  // the other three, the last one pays 100 more
  signal.shards.update(["shard-snow", "shard-town", "shard-sky"])
  for (const s of ["shard-snow", "shard-town", "shard-sky"]) {
    box.onPushed(bump, frame(s), field)
  }
  assertEquals(wholePanes(), 4)
  assertEquals(signal.coinCount.get(), 25 * 4 + 100)
  Item.deserializeCollected([])
  signal.coinCount.update(0)
})
