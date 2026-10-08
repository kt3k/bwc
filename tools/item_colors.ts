// The effect color of each item: the color used most in its sprite, not
// counting the frame every item shares (the gray2 ring outside and the
// black outline, docs/art-guide.md). The lines that burst out when an
// item is picked up are drawn in it (model/item.ts).
//
// This script writes the colors into the catalog (`color` of each item);
// `deno task check-palette` checks that they are up to date.
//
// Usage: deno -A tools/item_colors.ts
import { Palette, type PaletteColor } from "../util/palette.ts"
import { decodePng } from "./png.ts"

const hex = (rgba: Uint8Array, k: number) =>
  "#" + [0, 1, 2].map((o) => rgba[k * 4 + o].toString(16).padStart(2, "0"))
    .join("")

/** The color used most in the item sprite, the ring and outline aside */
export function mainColor(w: number, h: number, rgba: Uint8Array): string {
  const opaque = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && rgba[(y * w + x) * 4 + 3] > 0
  const counts = new Map<string, number>()
  const all = new Map<string, number>()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!opaque(x, y)) continue
      const c = hex(rgba, y * w + x)
      all.set(c, (all.get(c) ?? 0) + 1)
      // the ring: a gray2 pixel touching the outside
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [
        -1,
        1,
      ], [-1, -1]].some(([dx, dy]) => !opaque(x + dx, y + dy))
      if (c === Palette.black || (c === Palette.gray2 && edge)) continue
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
  }
  const pick = counts.size > 0 ? counts : all
  // the most used; a tie goes to the one first in the palette
  const order = Object.values(Palette) as string[]
  return [...pick].sort((a, b) =>
    b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0])
  )[0][0]
}

/** The effect colors of the catalog's items, by type */
export async function itemColors(): Promise<Record<string, PaletteColor>> {
  const catalog = JSON.parse(
    await Deno.readTextFile(
      new URL("../static/catalog/base.json", import.meta.url),
    ),
  ) as { items: Record<string, { src: string }> }
  const out: Record<string, PaletteColor> = {}
  for (const [type, item] of Object.entries(catalog.items)) {
    const path = new URL(
      item.src.replace("../", "../static/"),
      import.meta.url,
    )
    const { w, h, rgba } = await decodePng(await Deno.readFile(path))
    out[type] = mainColor(w, h, rgba) as PaletteColor
  }
  return out
}

if (import.meta.main) {
  const path = new URL("../static/catalog/base.json", import.meta.url)
  const catalog = JSON.parse(await Deno.readTextFile(path))
  const colors = await itemColors()
  for (const [type, color] of Object.entries(colors)) {
    catalog.items[type].color = color
    console.log(`${type} ${color}`)
  }
  await Deno.writeTextFile(path, JSON.stringify(catalog, null, 2) + "\n")
}
