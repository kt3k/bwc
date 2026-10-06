// Imports wall cells from the FF5 tilesets of kt3k/ff5study
// (materials/rom_extract/tilesets, 16x16 tiles) and fits them to
// docs/art-guide.md: a wall is drawn in #b9bcb9 (gray2) and black only,
// so each tile's colors are split by their brightness in the tile, the
// darker black and the lighter gray2, which keeps the drawing whatever
// the original colors were.
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
  /** where black ends: a fraction of the tile's brightness range */
  cut?: number
}

export const WALLS: Wall[] = [
  // the castle's big pale bricks, the mortar dark
  { name: "wall_castle", from: "00_castle_exterior_1", tile: [9, 10] },
  // the castle's parapet: crenels over a dripping cornice
  { name: "wall_battlement", from: "00_castle_exterior_1", tile: [9, 6] },
  // dressed stone, darker and rougher
  { name: "wall_masonry", from: "07_cave_1", tile: [3, 11] },
  // a library's shelves of books
  { name: "wall_bookshelf", from: "21_library", tile: [3, 2] },
  // planks standing on end: wooden houses and sheds
  { name: "wall_planks", from: "06_town_interior", tile: [13, 9] },
  // carved sandstone of the desert pyramid
  { name: "wall_sandstone", from: "19_desert_pyramid", tile: [1, 2] },
  // the forest's dense canopy, a wall of leaves
  { name: "wall_canopy", from: "12_forest_1", tile: [4, 9] },
]

const BLACK = [0, 0, 0]
const GRAY2 = [1, 3, 5].map((k) => parseInt(Palette.gray2.slice(k, k + 2), 16))

/**
 * The 16x16 tile in the two colors of a wall (docs/art-guide.md): the
 * darker colors black, the lighter ones gray2, split at `cut` of the way
 * from the tile's darkest color to its brightest. Each color of the tile
 * goes all one way, so the drawing keeps its shapes.
 */
export function grayTile(
  rgba: Uint8Array,
  w: number,
  [tx, ty]: [number, number],
  cut = 0.45,
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
    const t = max > min ? (l - min) / (max - min) : 1
    tile.set([...(t < cut ? BLACK : GRAY2), 255], k * 4)
  })
  return tile
}

if (import.meta.main) {
  for (const wall of WALLS) {
    const { w, rgba } = await decodePng(
      await Deno.readFile(`${tilesets}/${wall.from}.png`),
    )
    const tile = grayTile(rgba, w, wall.tile, wall.cut)
    await Deno.writeFile(
      `${out}${wall.name}.png`,
      await encodePng(16, 16, tile),
    )
    console.log(`${wall.name} <- ${wall.from} ${wall.tile}`)
  }
}
