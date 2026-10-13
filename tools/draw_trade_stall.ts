// Draws the trade stall (model/trade.ts): a striped awning on two poles
// over a counter stacked with crates. In the grays (docs/art-guide.md).
//
// Usage: deno -A tools/draw_trade_stall.ts
import { picture, write } from "./draw_waystones.ts"

const STALL = [
  "................",
  "KKKKKKKKKKKKKKKK",
  "K1133113311331K.",
  "K1133113311331K.",
  "KKKKKKKKKKKKKKK.",
  ".K3K.......K3K..",
  ".K3K.......K3K..",
  ".K3KKKKKKKKK3K..",
  ".K3K2K12K12K3K..",
  ".K3KKKKKKKKK3K..",
  "KKKKKKKKKKKKKKK.",
  "K122222222222K..",
  "K1KK2KK2KK2K3K..",
  "K122222222233K..",
  "K333333333333K..",
  "KKKKKKKKKKKKKK..",
]

if (import.meta.main) {
  await write("prop/trade_stall.png", picture(STALL))
}
