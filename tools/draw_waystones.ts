// Draws the sprites of the waystones (model/waystone.ts): the waystone
// itself (dormant and awake), the standing stones of its circle, the
// waygates of the hall on the START island (dormant and awake) and the
// rune floor of the circles. All in the grays (docs/art-guide.md): the
// mystery is in the shapes and in the white of what wakes.
//
// Usage: deno -A tools/draw_waystones.ts
import { Palette, type PaletteColor } from "../util/palette.ts"
import { encodePng } from "./png.ts"

const root = new URL("../static/", import.meta.url).pathname
const N = 16

const INK: Record<string, PaletteColor | null> = {
  ".": null,
  K: Palette.black,
  "4": Palette.gray4,
  "3": Palette.gray3,
  "2": Palette.gray2,
  "1": Palette.gray1,
  W: Palette.white,
}

/** A 16x16 picture from 16 rows of 16 ink characters */
function picture(rows: string[]): (PaletteColor | null)[] {
  if (rows.length !== N) throw new Error(`${rows.length} rows`)
  return rows.flatMap((row, y) => {
    if (row.length !== N) throw new Error(`row ${y} is ${row.length} wide`)
    return [...row].map((c) => {
      if (!(c in INK)) throw new Error(`unknown ink ${c}`)
      return INK[c]
    })
  })
}

async function write(path: string, px: (PaletteColor | null)[]) {
  const rgba = new Uint8Array(N * N * 4)
  px.forEach((c, k) => {
    if (!c) return
    rgba.set(
      [...[1, 3, 5].map((s) => parseInt(c.slice(s, s + 2), 16)), 255],
      k * 4,
    )
  })
  await Deno.writeFile(root + path, await encodePng(N, N, rgba))
  console.log(path)
}

// the waystone: a tall obelisk on a plinth, a crescent moon carved near
// its top and runes down its face. Awake, they and the tip burn white
const STELE = [
  ".......KK.......",
  "......K12K......",
  "......K12K......",
  ".....K1223K.....",
  ".....K1rr3K.....",
  ".....K12r3K.....",
  ".....K1rr3K.....",
  ".....K1223K.....",
  ".....K12r3K.....",
  ".....K1223K.....",
  ".....K12r3K.....",
  ".....K1223K.....",
  "....KK1223KK....",
  "...K11222333K...",
  "..K1122223333K..",
  "..KKKKKKKKKKKK..",
]
const dormant = STELE.map((r) => r.replaceAll("r", "4"))
const awake = STELE.map((r, y) =>
  r.replaceAll("r", "W").replace(y <= 2 ? "12" : "@", "W2")
)

// a standing stone of the circle: rough, leaning a little, unmarked
const MONOLITH = [
  "................",
  "......KKK.......",
  ".....K122K......",
  "....K12223K.....",
  "....K12223K.....",
  "....K122233K....",
  "...K1222233K....",
  "...K1222333K....",
  "...K1222333K....",
  "...K12223333K...",
  "...K12233333K...",
  "...K12233343K...",
  "..KK12233333KK..",
  "..K1122233333K..",
  "..K22223333333K.",
  "...KKKKKKKKKKKK.",
]

// the waygate: a round dais set in the floor, a ring of runes. Awake,
// its middle opens: a white spiral in the dark
function waygate(open: boolean): (PaletteColor | null)[] {
  const px: (PaletteColor | null)[] = Array(N * N).fill(null)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - 8, dy = y + 0.5 - 8
      const d = Math.hypot(dx, dy)
      const a = Math.atan2(dy, dx)
      let c: PaletteColor | null = null
      if (d <= 7.5) c = Palette.black
      if (d <= 6.6) c = Palette.gray2
      if (d <= 6.6 && d > 5.4) {
        // the rune ring: notches every 45 degrees
        const k = Math.round((a / (Math.PI / 4)) * 2)
        if (k % 2 === 0) c = open ? Palette.white : Palette.gray4
        else c = Palette.gray3
      }
      if (d <= 4.4) c = open ? Palette.black : Palette.gray3
      if (d <= 4.4 && open) {
        // the spiral: two arms winding in
        const arm = ((a + d * 0.9) % Math.PI + Math.PI) % Math.PI
        if (arm < 0.7) c = Palette.white
        else if (arm < 1.1) c = Palette.gray4
      }
      if (!open && d <= 1.5) c = Palette.gray4
      px[y * N + x] = c
    }
  }
  return px
}

// the rune floor: dark stone, carved with rings joined corner to corner,
// so the tiles knit into one lattice of circles
function runes(): (PaletteColor | null)[] {
  const px: (PaletteColor | null)[] = Array(N * N).fill(Palette.gray4)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8)
      // the ring round the middle
      if (Math.abs(d - 4.6) < 0.6) px[y * N + x] = Palette.gray3
      // the spokes out to the corners (they meet the next tiles' spokes)
      if ((x === y || x === N - 1 - y) && d > 5.4) {
        px[y * N + x] = Palette.gray3
      }
    }
  }
  // a dot in the middle of each ring
  for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) {
    px[y * N + x] = Palette.black
  }
  return px
}

if (import.meta.main) {
  await write("prop/waystone.png", picture(dormant))
  await write("prop/waystone_awake.png", picture(awake))
  await write("prop/monolith.png", picture(MONOLITH))
  await write("prop/waygate.png", waygate(false))
  await write("prop/waygate_awake.png", waygate(true))
  await write("cell/runes.png", runes())
}
