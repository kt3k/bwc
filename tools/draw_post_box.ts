// Draws the post box of the errands (model/errand.ts): a round-topped
// box on a post, a slot for the letters, an envelope pinned on its face.
// In the grays (docs/art-guide.md).
//
// Usage: deno -A tools/draw_post_box.ts
import { picture, write } from "./draw_waystones.ts"

const POST_BOX = [
  "................",
  ".....KKKKKK.....",
  "....K122223K....",
  "...K12222233K...",
  "...K1KKKKKK3K...",
  "...K12222233K...",
  "...K1KKKKK23K...",
  "...K1KWWWK23K...",
  "...K1KW1WK23K...",
  "...K1KKKKK23K...",
  "...K12222233K...",
  "...KKKKKKKKKK...",
  "......K23K......",
  "......K23K......",
  ".....KK33KK.....",
  ".....KKKKKK.....",
]

if (import.meta.main) {
  await write("prop/post_box.png", picture(POST_BOX))
}
