// Draws the latch gate of the shortcuts (model/shortcut.ts): a wooden
// gate in a passage, barred, its latch on the far side; and the same gate
// swung open against its post. In the grays (docs/art-guide.md).
//
// Usage: deno -A tools/draw_latch_gate.ts
import { picture, write } from "./draw_waystones.ts"

// shut: two posts, planks between them, a crossbar and the iron latch
const SHUT = [
  "................",
  ".KK..........KK.",
  "K12K........K12K",
  "K12KKKKKKKKKK12K",
  "K12K22K22K22K12K",
  "K12K23K23K23K12K",
  "K12K23K23K23K12K",
  "K12KKKKKKKKKK12K",
  "K1211111111W112K",
  "K12KKKKKKKKKK12K",
  "K12K23K23K23K12K",
  "K12K23K23K23K12K",
  "K12K33K33K33K12K",
  "K12KKKKKKKKKK12K",
  "K33K........K33K",
  ".KK..........KK.",
]
// open: the planks swung back against the left post, the way clear
const OPEN = [
  "................",
  ".KK..........KK.",
  "K12K........K12K",
  "K12KK.......K12K",
  "K12K2K......K12K",
  "K12K3K......K12K",
  "K12K3K......K12K",
  "K12K2K......K12K",
  "K12K1K......K12K",
  "K12K2K......K12K",
  "K12K3K......K12K",
  "K12K3K......K12K",
  "K12K3K......K12K",
  "K12KK.......K12K",
  "K33K........K33K",
  ".KK..........KK.",
]

if (import.meta.main) {
  await write("prop/latch_gate.png", picture(SHUT))
  await write("prop/latch_gate_open.png", picture(OPEN))
}
