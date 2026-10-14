// Imports house-interior furniture from the FF5 town-interior tileset
// of kt3k/ff5study (materials/rom_extract/tilesets/06_town_interior.png)
// and fits it to docs/art-guide.md: props are grayscale only, so each
// source color is given one of the 5 tones (white, gray2, gray3, gray4,
// black) by its brightness, with per-piece moves where two parts would
// fall into the same tone.
//
// The tileset's backgrounds (the navy key color and pure black) go
// transparent. A piece bigger than a cell is cut down to cells: the bed
// (38x55 in the sheet) keeps its left and right rails and loses the
// middle, and stands as two props (bed-head, bed-foot).
//
// Usage: deno -A tools/import_ff5_interior.ts [path/to/ff5study]
import { Palette } from "../util/palette.ts"
import { decodePng, encodePng } from "./png.ts"

const root = Deno.args[0] ?? new URL("../../ff5study", import.meta.url).pathname
const sheet = `${root}/materials/rom_extract/tilesets/06_town_interior.png`
const out = new URL("../static/prop/", import.meta.url).pathname

/** The 5 tones of the props */
const TONES = {
  W: Palette.white,
  L: Palette.gray2,
  M: Palette.gray3,
  D: Palette.gray4,
  K: Palette.black,
} as const
type Tone = keyof typeof TONES

/** The backgrounds of the tileset, always transparent */
const BG = new Set(["#000073", "#000000"])

type Copy = {
  /** the rect in the sheet */
  sx: number
  sy: number
  w: number
  h: number
  /** where it lands in the sprite */
  dx: number
  dy: number
}
type Piece = {
  /** static/prop/<name>.png */
  name: string
  w: number
  h: number
  copies: Copy[]
  /** more colors cleared to transparent (a wall behind a wall piece) */
  clear?: string[]
  /** source colors moved to another tone than their brightness gives */
  tones?: Record<string, Tone>
}

const cell = (
  name: string,
  sx: number,
  sy: number,
  more: Partial<Piece> = {},
): Piece => ({
  name,
  w: 16,
  h: 16,
  copies: [{ sx, sy, w: 16, h: 16, dx: 0, dy: 0 }],
  ...more,
})

const PIECES: Piece[] = [
  // the bed in two cells: the sheet's middle column (the pillow, the
  // boards and the posts' inner halves), the plain middle rows dropped
  cell("bed_head", 176, 135),
  cell("bed_foot", 176, 160),
  // a case of books (the body tile of the tall shelf)
  cell("bookshelf", 96, 80),
  // the framed seascape, off its white wall
  cell("painting", 112, 80),
  // four candles burning on a stand
  cell("candles", 192, 176),
  // the globe on its stand (the sphere and the top of the mount)
  cell("globe", 176, 184),
  // the wooden washtub
  cell("washtub", 144, 160),
]

/** The tone of a color by its brightness */
function toneOf(hex: string): Tone {
  const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16))
  const y = 0.299 * r + 0.587 * g + 0.114 * b
  if (y >= 200) return "W"
  if (y >= 140) return "L"
  if (y >= 85) return "M"
  if (y >= 30) return "D"
  return "K"
}

const rgb = (hex: string) =>
  [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16))

if (import.meta.main) {
  const { w: iw, rgba } = await decodePng(await Deno.readFile(sheet))
  for (const piece of PIECES) {
    const sprite = new Uint8Array(piece.w * piece.h * 4)
    const used = new Map<string, number>()
    const clear = new Set([...BG, ...(piece.clear ?? [])])
    for (const c of piece.copies) {
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const p = ((c.sy + y) * iw + c.sx + x) * 4
          const hex = "#" +
            [rgba[p], rgba[p + 1], rgba[p + 2]]
              .map((v) => v.toString(16).padStart(2, "0")).join("")
          if (clear.has(hex)) continue
          used.set(hex, (used.get(hex) ?? 0) + 1)
          const tone = piece.tones?.[hex] ?? toneOf(hex)
          const q = ((c.dy + y) * piece.w + c.dx + x) * 4
          sprite.set([...rgb(TONES[tone]), 255], q)
        }
      }
    }
    await Deno.writeFile(
      `${out}${piece.name}.png`,
      await encodePng(piece.w, piece.h, sprite),
    )
    const table = [...used].sort((a, b) => b[1] - a[1])
      .map(([hex, n]) => `${hex}:${piece.tones?.[hex] ?? toneOf(hex)}x${n}`)
      .join(" ")
    console.log(`${piece.name}: ${table}`)
  }
}
