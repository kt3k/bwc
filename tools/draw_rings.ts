// Draws the sprites of the missing ring (model/ring.ts, tools/rings.ts):
// the standing stone of a ring (also the loose stone that is pushed one
// cell at a time, the actor `stone`), the gap where one is missing (an
// empty socket in the ground) and the heart in the middle of the ring
// (asleep and awake). All in the grays (docs/art-guide.md). The rings of
// boulders use the boulder's own picture.
//
// Usage: deno -A tools/draw_rings.ts
import { Palette, type PaletteColor } from "../util/palette.ts"
import { picture, write } from "./draw_waystones.ts"

// the standing stone: upright and flat-sided (the boulder is round and
// rolls), lit from the top left, a crack down its face
const STONE = [
  "................",
  "................",
  ".....KKKKKK.....",
  "....KWWW222K....",
  "...KWW222223K...",
  "...KW2222223K...",
  "...KW2222233K...",
  "...K22224233K...",
  "...K22222433K...",
  "...K22224333K...",
  "...K22222333K...",
  "...K22233334K...",
  "..KK33333344KK..",
  "..K4444444444K..",
  "...KKKKKKKKKK...",
  "................",
]

// the gap: the socket a stone stood in, a dark hollow in the ground
// with a rim; the rim is lit on the far (bottom right) side, the
// hollow shaded under the near one
const SLOT = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "....33333333....",
  "...3KKKKKKKK3...",
  "...3K444444K2...",
  "...3K444444K2...",
  "...3K444444K2...",
  "...3K444444K2...",
  "...3K444444K2...",
  "...3KKKKKKKK2...",
  "....22222222....",
  "................",
]

/**
 * The heart: a low round stone in the middle of the ring, a ring carved
 * in its top. Awake, the carving shines white
 */
function heart(awake: boolean): (PaletteColor | null)[] {
  const px: (PaletteColor | null)[] = Array(16 * 16).fill(null)
  const at = (x: number, y: number) => {
    const dx = (x + 0.5 - 8) / 6.4, dy = (y + 0.5 - 8.5) / 5.4
    return { dx, dy, d: Math.hypot(dx, dy) }
  }
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < 16 && y < 16 && at(x, y).d <= 1
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (!inside(x, y)) continue
      const { dx, dy, d } = at(x, y)
      let c: PaletteColor = Palette.gray2
      if (dx + dy > 0.55) c = Palette.gray3
      if (dx + dy < -0.75) c = Palette.white
      // the carving
      if (Math.abs(d - 0.5) < 0.12) c = awake ? Palette.white : Palette.gray4
      if (d < 0.16) c = awake ? Palette.white : Palette.black
      // the outline: the edge of the stone
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) =>
        !inside(x + ox, y + oy)
      )
      if (edge) c = Palette.black
      px[y * 16 + x] = c
    }
  }
  return px
}

if (import.meta.main) {
  const stone = picture(STONE)
  await write("prop/ring_stone.png", stone)
  await write("prop/ring_slot.png", picture(SLOT))
  await write("prop/ring_heart.png", heart(false))
  await write("prop/ring_heart_awake.png", heart(true))
  // the loose stone: the same in every direction
  await Deno.mkdir(new URL("../static/actor/stone/", import.meta.url), {
    recursive: true,
  })
  for (const dir of ["up", "down", "left", "right"]) {
    for (const n of [0, 1]) await write(`actor/stone/${dir}${n}.png`, stone)
  }
}
