// Imports wall cells from the FF5 tilesets of kt3k/ff5study
// (materials/rom_extract/tilesets, 16x16 tiles) and fits them to
// docs/art-guide.md: the terrain is grayscale, so each tile's colors get
// the 5 tones (black, gray4, gray3, gray2, white) by their brightness in
// the tile, from its darkest to its brightest, which keeps the drawing
// whatever the original colors were.
//
// Usage: deno -A tools/import_ff5_walls.ts [path/to/ff5study]
import { Palette } from "../util/palette.ts"
import { decodePng, encodePng } from "./png.ts"

const root = Deno.args[0] ?? new URL("../../ff5study", import.meta.url).pathname
const tilesets = `${root}/materials/rom_extract/tilesets`
const out = new URL("../static/cell/", import.meta.url).pathname

type Wall = {
  /** static/cell/<name>.png */
  name: string
  /** the tileset and the tile (column, row) in it */
  from: string
  tile: [number, number]
  /** the darkest and the brightest tone used (0 black .. 4 white) */
  tones?: [number, number]
}

export const WALLS: Wall[] = [
  // the castle's big pale bricks, the mortar dark
  { name: "wall_castle", from: "00_castle_exterior_1", tile: [9, 10] },
  // the castle's parapet: crenels over a dripping cornice
  { name: "wall_battlement", from: "00_castle_exterior_1", tile: [9, 6] },
  // dressed stone, darker and rougher
  { name: "wall_masonry", from: "07_cave_1", tile: [3, 11], tones: [0, 3] },
  // the mossy rock face of the caves
  { name: "wall_rock", from: "07_cave_1", tile: [4, 3], tones: [0, 3] },
  // a library's shelves of books
  { name: "wall_bookshelf", from: "21_library", tile: [3, 2] },
  // planks standing on end: wooden houses and sheds
  { name: "wall_planks", from: "06_town_interior", tile: [13, 9] },
  // carved sandstone of the desert pyramid
  { name: "wall_sandstone", from: "19_desert_pyramid", tile: [1, 2] },
  // the forest's dense canopy, a wall of leaves
  { name: "wall_canopy", from: "12_forest_1", tile: [4, 9], tones: [0, 3] },
]

const TONES = [
  Palette.black,
  Palette.gray4,
  Palette.gray3,
  Palette.gray2,
  Palette.white,
].map((hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)))

/**
 * The 16x16 tile turned to grays: its darkest color to the darkest tone,
 * its brightest to the brightest, the colors between spread evenly by
 * brightness (each color stays one tone, so the drawing keeps its shapes)
 */
export function grayTile(
  rgba: Uint8Array,
  w: number,
  [tx, ty]: [number, number],
  [lo, hi]: [number, number] = [0, 4],
): Uint8Array {
  const lum: number[] = []
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const p = ((ty * 16 + y) * w + tx * 16 + x) * 4
      lum.push(0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2])
    }
  }
  const min = Math.min(...lum), max = Math.max(...lum)
  const tile = new Uint8Array(16 * 16 * 4)
  lum.forEach((l, k) => {
    const t = max > min ? (l - min) / (max - min) : 0
    tile.set([...TONES[lo + Math.round(t * (hi - lo))], 255], k * 4)
  })
  return tile
}

if (import.meta.main) {
  for (const wall of WALLS) {
    const { w, rgba } = await decodePng(
      await Deno.readFile(`${tilesets}/${wall.from}.png`),
    )
    const tile = grayTile(rgba, w, wall.tile, wall.tones)
    await Deno.writeFile(
      `${out}${wall.name}.png`,
      await encodePng(16, 16, tile),
    )
    console.log(`${wall.name} <- ${wall.from} ${wall.tile}`)
  }
}
