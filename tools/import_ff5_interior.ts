// Imports house-interior furniture from the FF5 tilesets of
// kt3k/ff5study (materials/rom_extract/tilesets: the town interior,
// the castle interior and the library) and fits it to
// docs/art-guide.md: props are grayscale only, so each
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
const tilesets = `${root}/materials/rom_extract/tilesets`
const SHEETS = {
  town: `${tilesets}/06_town_interior.png`,
  castle: `${tilesets}/01_castle_interior.png`,
  library: `${tilesets}/21_library.png`,
} as const
type Sheet = keyof typeof SHEETS
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
  /** which tileset it is cut from (town interior if not said) */
  sheet?: Sheet
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

/** The castle's dark wood, a tone up so the shapes stay readable */
const LIFT: Record<string, Tone> = {
  "#735a42": "L",
  "#8c735a": "L",
  "#5a4229": "M",
  "#4a2908": "D",
  "#391808": "D",
  "#211000": "K",
  "#100800": "K",
}

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
  // the globe, whole on its stand
  cell("globe", 176, 224, { sheet: "castle" }),
  // the wooden washtub
  cell("washtub", 144, 160),
  // a low round stool, darker than the one at the house table (its
  // dark wood lifted a tone, or it crushes to black in the grays).
  // The long dining table is drawn by hand instead
  // (tools/draw_furniture.ts): the castle's crushes even lifted
  cell("stool_round", 128, 208, { sheet: "castle", tones: LIFT }),
  // the writing desk, an open book on it and a drawer below
  cell("desk", 144, 224, { sheet: "castle" }),
  // the kitchen: the dish shelf (hung on the wall) over the counter,
  // the stove with its kettle, the big pot and the cauldron
  cell("dish_shelf", 32, 0),
  cell("counter", 32, 16),
  cell("stove", 64, 32),
  cell("kettle", 80, 16),
  cell("cauldron", 144, 192, {
    sheet: "library",
    // the shelf wood and the library green behind it
    clear: ["#005a10", "#7b5231", "#5a3921"],
  }),
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
  const sheets = new Map<Sheet, { w: number; rgba: Uint8Array }>()
  for (const name of Object.keys(SHEETS) as Sheet[]) {
    sheets.set(name, await decodePng(await Deno.readFile(SHEETS[name])))
  }
  for (const piece of PIECES) {
    const { w: iw, rgba } = sheets.get(piece.sheet ?? "town")!
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
