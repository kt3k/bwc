// Draws the sprites of the animal homes (model/den.ts): the rabbit, its
// hole (empty, and with ears showing), the bee and its hive (full, and
// robbed of its honey), the fox's den (with the glint of its hoard, and
// empty), the gate of the sheep pen (open, shut), the pen's fence and the
// honeycomb. The animals and their homes are in the grays
// (docs/art-guide.md); the honeycomb, an item, is honey colored.
//
// Usage: deno -A tools/draw_dens.ts (then deno task item-ring
// static/item/honey.png)
import { Palette, type PaletteColor } from "../util/palette.ts"
import { picture, write } from "./draw_waystones.ts"
import { decodePng } from "./png.ts"

type Px = PaletteColor | null

const flipRows = (rows: string[]) => rows.map((r) => [...r].reverse().join(""))
/** One pixel up (a hop), the last row empty */
const hop = (rows: string[]) => [...rows.slice(1), "................"]

// the rabbit: pale, long eared, a white scut
const RABBIT_RIGHT = [
  "................",
  "...........K.K..",
  "..........K1K1K.",
  "..........K1K1K.",
  "..........K1K1K.",
  ".........K11111K",
  ".........K1K111K",
  "...KKKKKK111112K",
  "..K11111111111K.",
  ".K1111111111KK..",
  "KW1111111111K...",
  "KW2111111112K...",
  ".K2211111122K...",
  "..KK2KKKK2KK....",
  "...KK....KK.....",
  "................",
]
const RABBIT_DOWN = [
  "................",
  "....K......K....",
  "...K1K....K1K...",
  "...K1K....K1K...",
  "...K12K..K21K...",
  "....K1KKKK1K....",
  "...K11111111K...",
  "..K1K111111K1K..",
  "..K1111KK1111K..",
  "...K11111111K...",
  "..K1111111111K..",
  ".K111111111111K.",
  ".K211111111112K.",
  "..K2211111122K..",
  "...KK2K..K2KK...",
  "....KK....KK....",
]
const RABBIT_UP = RABBIT_DOWN.map((r, y) =>
  y === 7
    ? "..K1111111111K.."
    : y === 8
    ? "..K1111111111K.."
    : y === 12
    ? ".K21111WW11112K."
    : r
)

// the bee: a striped body, a white wing over it
const BEE_RIGHT = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......KK.KK.....",
  ".....KWWKWWK....",
  "......KKKKK.....",
  "....KK1K1K1KK...",
  "...K1K1K1K1KWK..",
  "....KK1K1K1KK...",
  "......KKKKK.....",
  "................",
  "................",
  "................",
  "................",
]
const BEE_FLAP = BEE_RIGHT.map((r, y) =>
  y === 5
    ? "................"
    : y === 6
    ? "......KK.KK....."
    : y === 7
    ? ".....KWKKKWK...."
    : r
)

// the rabbit hole: a ring of dug earth round a black hole
const HOLE = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".....KKKKKK.....",
  "...KK222222KK...",
  "..K23KKKKKK32K..",
  ".K23KKKKKKKK32K.",
  ".K33KKKKKKKK33K.",
  "..KK33333333KK..",
  "....KKKKKKKK....",
]
const HOLE_EARS = HOLE.map((r, y) =>
  y === 6
    ? "......K..K......"
    : y === 7
    ? ".....K1KK1K....."
    : y === 8
    ? ".....K1KK1K....."
    : y === 9
    ? ".....K1KK1K....."
    : y === 10
    ? "...KKK1KK1KKK..."
    : r
)

// the fox's den: a mound of rock with a low arch, the hoard glinting in
// the dark of it
const DEN = [
  "................",
  "................",
  ".....KKKKK......",
  "....K11222KK....",
  "...K1222223KK...",
  "..K12222223332K.",
  "..K1222KKKK3332K",
  ".K122KKKKKKK332K",
  ".K12KKKKKKKKK33K",
  "K122KKKKKKKKKK3K",
  "K12KKKKKKKKKKK3K",
  "K12KKKKKWKKKKK3K",
  "K22KKKKW1WKKKK3K",
  "K23KKKKKWKKWKK3K",
  ".K33KKKKKKKKK33K",
  "..KKKKKKKKKKKKK.",
]
const DEN_EMPTY = DEN.map((r) => r.replaceAll("W", "K").replace("K1K", "KKK"))

// the hive: a straw skep on a stump, a dark way in at its foot
const HIVE = [
  ".......KK.......",
  "......K22K......",
  ".....K1222K.....",
  "....KKKKKKKK....",
  "...K11112222K...",
  "...KKKKKKKKKK...",
  "..K1111122222K..",
  "..KKKKKKKKKKKK..",
  ".K11111122222K..",
  ".KKKKKKKKKKKKKK.",
  ".K1111KKK22222K.",
  ".K111K...K2222K.",
  ".KKKKKKKKKKKKKK.",
  "..K3333333333K..",
  "...K33K33K33K...",
  "....KKKKKKKK....",
]
// robbed: the comb taken, its straw sagging gray
const HIVE_EMPTY = HIVE.map((r, y) =>
  y > 1 && y < 12 ? r.replaceAll("1", "3") : r
)

// the pen gate: nothing while open (a gap in the fence); shut, its rails
// close the gap like the fence's own, a brace across
const GATE_OPEN = Array(16).fill("................")

// the fence of the pen, over the meadow: posts and two rails
const RAILS: Record<number, string> = {
  4: ".KK..........KK.",
  5: "K12KKKKKKKKKK12K",
  6: "K121111111111K2K",
  7: "K12KKKKKKKKKK12K",
  8: "K12K........K12K",
  9: "K12KKKKKKKKKK12K",
  10: "K121111111111K2K",
  11: "K12KKKKKKKKKK12K",
  12: "K12K........K12K",
  13: "K22K........K22K",
  14: "KKKK........KKKK",
}

// the honeycomb: a hexagon of golden cells
const HONEY = [
  "................",
  "................",
  ".....KKKKKK.....",
  "....KBBBBBBK....",
  "...KBYKBYKBBK...",
  "..KBYYKYYKYYBK..",
  "..KBKKBKKBKKBK..",
  "..KBYKBYKBYKBK..",
  "..KBYYKYYKYYBK..",
  "..KBKKBKKBKKBK..",
  "...KBKBYKBKBK...",
  "....KBBBBBBK....",
  ".....KKKKKK.....",
  "................",
  "................",
  "................",
]
const HONEY_INK: Record<string, Px> = {
  ".": null,
  K: Palette.black,
  B: Palette.brown2,
  Y: Palette.brown1,
}

for (const phase of [0, 1] as const) {
  const v = (rows: string[]) => phase === 0 ? rows : hop(rows)
  await write(`actor/rabbit/right${phase}.png`, picture(v(RABBIT_RIGHT)))
  await write(
    `actor/rabbit/left${phase}.png`,
    picture(v(flipRows(RABBIT_RIGHT))),
  )
  await write(`actor/rabbit/down${phase}.png`, picture(v(RABBIT_DOWN)))
  await write(`actor/rabbit/up${phase}.png`, picture(v(RABBIT_UP)))
  const bee = phase === 0 ? BEE_RIGHT : BEE_FLAP
  await write(`actor/bee/right${phase}.png`, picture(bee))
  await write(`actor/bee/down${phase}.png`, picture(bee))
  await write(`actor/bee/left${phase}.png`, picture(flipRows(bee)))
  await write(`actor/bee/up${phase}.png`, picture(flipRows(bee)))
}
await write("prop/rabbit_hole.png", picture(HOLE))
await write("prop/rabbit_hole_ears.png", picture(HOLE_EARS))
await write("prop/fox_den.png", picture(DEN))
await write("prop/fox_den_empty.png", picture(DEN_EMPTY))
await write("prop/beehive.png", picture(HIVE))
await write("prop/beehive_empty.png", picture(HIVE_EMPTY))
await write("prop/pen_gate_open.png", picture(GATE_OPEN))
await write(
  "prop/pen_gate_shut.png",
  picture(
    [...Array(16).keys()].map((y) =>
      y === 8 || y === 12 ? "K12K11111111K12K" : RAILS[y] ?? "................"
    ),
  ),
)
await write(
  "item/honey.png",
  HONEY.flatMap((r) => [...r].map((c) => HONEY_INK[c])),
)

// the fence cell: the meadow's floor with the posts and rails over it
{
  const root = new URL("../static/", import.meta.url).pathname
  const { rgba } = await decodePng(
    await Deno.readFile(`${root}cell/floor5.png`),
  )
  const hex = (n: number) => n.toString(16).padStart(2, "0")
  const floor: Px[] = [...Array(256).keys()].map((k) =>
    `#${hex(rgba[k * 4])}${hex(rgba[k * 4 + 1])}${
      hex(rgba[k * 4 + 2])
    }` as PaletteColor
  )
  const rails = picture(
    [...Array(16).keys()].map((y) => RAILS[y] ?? "................"),
  )
  await write("cell/fence.png", floor.map((c, k) => rails[k] ?? c))
}
