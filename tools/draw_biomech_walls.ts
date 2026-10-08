// Draws the biomechanical wall cells, in the spirit of H. R. Giger: bone,
// ribs and vertebrae grown together with hoses and ducts. Walls keep to
// the two wall colors of docs/art-guide.md (gray2 for the bone and
// metal, black for the void and the grooves), so the strangeness is all
// in the shapes.
//
// Each tile is drawn on a 16x16 torus (every shape wraps around the
// edges), so the cells tile without seams.
//
// Usage: deno -A tools/draw_biomech_walls.ts [--sheet file.png]
import { Palette } from "../util/palette.ts"
import { encodePng } from "./png.ts"

const N = 16
/** true = bone (gray2), false = void (black) */
type Tile = boolean[]

const at = (x: number, y: number) => ((y % N + N) % N) * N + ((x % N + N) % N)
const blank = (): Tile => Array(N * N).fill(false)

/** Wrapped distance along one axis */
const wd = (a: number, b: number) => {
  const d = Math.abs(a - b) % N
  return Math.min(d, N - d)
}

/** Grooves: bone pixels next to void on the given side turn void (a cut) */
function groove(t: Tile, where: (x: number, y: number) => boolean) {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) if (where(x, y)) t[at(x, y)] = false
  }
}

// ---------------------------------------------------------------------
// the walls

/** Ribs: a spine up the middle, thin ribs curving out and down from it */
function ribs(): Tile {
  const t = blank()
  for (let y = 0; y < N; y++) {
    // the spine: vertebrae, a dark disc between each two
    for (let x = 6; x <= 9; x++) t[at(x, y)] = y % 4 !== 3
    // the knobs of the vertebrae
    if (y % 4 === 1) t[at(5, y)] = t[at(10, y)] = true
  }
  for (let y0 = 0; y0 < N; y0 += 8) {
    for (let dx = 1; dx <= 6; dx++) {
      // falling steeply as it goes out: a rib
      const y = y0 + 1 + Math.round((dx * dx) / 6)
      for (const x of [5 - dx, 10 + dx]) {
        t[at(x, y)] = true
        // thicker near the spine
        if (dx <= 2) t[at(x, y - 1)] = true
      }
    }
  }
  return t
}

/** Vertebrae: a column of big bones, their processes reaching sideways */
function vertebrae(): Tile {
  const t = blank()
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // the body: a rounded block
      const bx = (x - 7.5) / 5.2, by = (y - 6) / 4.6
      if (bx * bx + by * by <= 1) t[at(x, y)] = true
      // the transverse processes: wings out to both edges, tapering
      if (y >= 5 && y <= 7 && Math.abs(x - 7.5) > 4) {
        const reach = Math.abs(x - 7.5)
        if (y === 6 || reach < 7) t[at(x, y)] = true
      }
      // the spinous process below, pointing down to the next one
      if (y >= 11 && y <= 14 && Math.abs(x - 7.5) <= 15 - y - 0.5) {
        t[at(x, y)] = true
      }
    }
  }
  // the foramen: a dark hole in the body, and a groove across it
  groove(t, (x, y) => (Math.abs(x - 7.5) < 1.6 && Math.abs(y - 5.5) < 1.6))
  groove(t, (x, y) => y === 9 && Math.abs(x - 7.5) < 4)
  return t
}

/** Hoses: two ribbed ducts running up, one thick and one thin */
function hoses(): Tile {
  const t = blank()
  for (let y = 0; y < N; y++) {
    // the thick hose, swaying a little (one full sway per tile)
    const sway = Math.round(Math.sin((y / N) * Math.PI * 2) * 1)
    for (let x = 1 + sway; x <= 7 + sway; x++) t[at(x, y)] = true
    // ribbing: a dark ring every 2 rows, short of the hose's edges
    if (y % 2 === 0) {
      for (let x = 2 + sway; x <= 6 + sway; x++) t[at(x, y)] = false
    }
    // the thin hose
    for (let x = 10; x <= 13; x++) t[at(x, y)] = true
    if (y % 3 === 0) {
      t[at(11, y)] = false
      t[at(12, y)] = false
    }
  }
  // a cable looping between them
  for (let y = 3; y <= 12; y++) {
    const x = 8 + Math.round(Math.sin((y / 9) * Math.PI) * 1.5)
    t[at(x, y)] = true
  }
  return t
}

/** Skulls: long heads lying in a brick bond, ribbed on top, eyeless */
function skulls(): Tile {
  const t = blank()
  const head = (cx: number, cy: number) => {
    for (let x = -8; x <= 7; x++) {
      // a long teardrop: narrow at the back (left), full at the face
      const u = (x + 0.5) / 8
      const half = 3.6 * Math.sqrt(Math.max(0, 1 - u * u)) *
        (x < 0 ? 1 + x / 14 : 1)
      for (let y = -4; y <= 4; y++) {
        if (Math.abs(y + 0.5) <= half) t[at(cx + x, cy + y)] = true
      }
      // the ribbing over the crown
      if (x > -6 && x < 4 && x % 2 === 0) {
        t[at(cx + x, cy - 2)] = false
        t[at(cx + x, cy - 1)] = false
      }
    }
    // the dark socket at the front, and the slit of the mouth
    for (const [x, y] of [[4, 0], [5, 0], [5, 1], [2, 2], [3, 2], [4, 2]]) {
      t[at(cx + x, cy + y)] = false
    }
  }
  head(8, 3)
  head(0, 11)
  return t
}

/** Hive: a resin of fused cells, each with a dark opening */
function hive(): Tile {
  const t = blank()
  const seeds = [[3, 3], [11, 2], [7, 8], [14, 10], [2, 12], [9, 14]]
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const ds = seeds.map(([sx, sy]) => Math.hypot(wd(x, sx), wd(y, sy)))
        .sort((a, b) => a - b)
      // the walls between the cells are bone; the openings are void
      const wall = ds[1] - ds[0] < 1.6
      const hole = ds[0] < 1.6
      t[at(x, y)] = !hole && (wall || ds[0] > 2.4)
      // a groove ring inside each cell
      if (!wall && ds[0] >= 2.4 && ds[0] < 3.1) t[at(x, y)] = false
    }
  }
  return t
}

/** Sinew: thin strands stretched over a dark cavity, wavering */
function sinew(): Tile {
  const t = blank()
  for (let y = 0; y < N; y++) {
    for (
      const [base, amp, phase] of [[1, 1, 0], [5, 1.5, 3], [9, 1, 7], [
        13,
        1.5,
        11,
      ]]
    ) {
      const x = base +
        Math.round(Math.sin(((y + phase) / N) * Math.PI * 2) * amp)
      t[at(x, y)] = true
    }
  }
  // a ligament across, knotted where it meets the strands
  for (let x = 0; x < N; x++) t[at(x, 9)] = true
  for (const x of [1, 5, 9, 13]) {
    t[at(x - 1, 8)] = t[at(x, 8)] = t[at(x + 1, 8)] = true
    t[at(x - 1, 10)] = t[at(x, 10)] = t[at(x + 1, 10)] = true
  }
  return t
}

export const BIOMECH = [
  { name: "wall_bio_ribs", char: "A", draw: ribs, note: "肋骨と背骨" },
  { name: "wall_bio_vertebrae", char: "B", draw: vertebrae, note: "椎骨の柱" },
  { name: "wall_bio_hoses", char: "C", draw: hoses, note: "蛇腹の管" },
  { name: "wall_bio_skulls", char: "D", draw: skulls, note: "長い頭蓋" },
  { name: "wall_bio_hive", char: "E", draw: hive, note: "樹脂の巣" },
  { name: "wall_bio_sinew", char: "F", draw: sinew, note: "張った腱" },
]

const rgb = (hex: string) =>
  [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16))
const BONE = rgb(Palette.gray2)
const VOID = rgb(Palette.black)

function pixels(t: Tile): Uint8Array {
  const rgba = new Uint8Array(N * N * 4)
  t.forEach((bone, k) => rgba.set([...(bone ? BONE : VOID), 255], k * 4))
  return rgba
}

if (import.meta.main) {
  for (const wall of BIOMECH) {
    await Deno.writeFile(
      new URL(`../static/cell/${wall.name}.png`, import.meta.url),
      await encodePng(N, N, pixels(wall.draw())),
    )
    console.log(`${wall.char} ${wall.name}`)
  }
  // --sheet: each wall tiled 3x3, side by side, 4x (to judge the seams)
  const sheetAt = Deno.args.indexOf("--sheet")
  if (sheetAt >= 0) {
    const Z = 4, T = 3, GAP = 8
    const w = BIOMECH.length * (N * T * Z + GAP), h = N * T * Z
    const out = new Uint8Array(w * h * 4)
    BIOMECH.forEach((wall, n) => {
      const t = wall.draw()
      for (let y = 0; y < N * T * Z; y++) {
        for (let x = 0; x < N * T * Z; x++) {
          const c = t[at(Math.floor(x / Z), Math.floor(y / Z))] ? BONE : VOID
          out.set([...c, 255], (y * w + n * (N * T * Z + GAP) + x) * 4)
        }
      }
    })
    await Deno.writeFile(Deno.args[sheetAt + 1], await encodePng(w, h, out))
  }
}
