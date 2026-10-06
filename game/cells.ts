// The cell catalog viewer (static/cells.html): every cell of the catalog
// on one page, each as a patch drawn by the game's own drawCell (so the
// noise, the variants, the flips and the base edge of the walls show as
// in the game), its image as is, its properties, and the maps that use
// it.
import { type CellDefinition, loadCatalog } from "../model/catalog.ts"
import { drawCell } from "../model/cell-decor.ts"
import { variantKey } from "../model/cell-decor.ts"
import { CanvasWrapper } from "../util/canvas-wrapper.ts"
import { CELL_SIZE } from "../util/constants.ts"

/** The patch drawn for each cell, in cells */
const PATCH_W = 8
const PATCH_H = 4
/** On screen, a patch pixel is this many pixels */
const ZOOM = 3

type MapEntry = { id: string; name?: string }

async function loadBitmap(href: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(href)
    if (!res.ok) return null
    return await createImageBitmap(await res.blob())
  } catch {
    return null
  }
}

function text(cls: string, s: string): HTMLSpanElement {
  const span = document.createElement("span")
  span.className = `pixel-text ${cls}`
  span.textContent = s.toUpperCase()
  return span
}

/** The properties of a cell, as short tags */
function tags(cell: CellDefinition): string[] {
  const t = [cell.canEnter ? "walk" : "block"]
  if (cell.water) t.push("water")
  if (cell.slippery) t.push("slippery")
  if (cell.conveyor) t.push(`conveyor ${cell.conveyor}`)
  if (cell.diggable) t.push("diggable")
  if (cell.casts) t.push("casts")
  if (cell.flip) t.push(`flip ${cell.flip}`)
  if (cell.variants?.length) t.push(`${cell.variants.length} variants`)
  if (cell.noise) t.push(`noise ${cell.noise}`)
  if (cell.noisePatches === false) t.push("even noise")
  return t
}

/**
 * A patch of the cell drawn as in the game. A wall that casts gets a row
 * of plain floor below it, to show its base edge.
 */
function patch(
  cell: CellDefinition,
  floor: CellDefinition | undefined,
  imgMap: Record<string, ImageBitmap>,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = PATCH_W * CELL_SIZE
  canvas.height = PATCH_H * CELL_SIZE
  canvas.style.width = `${canvas.width * ZOOM}px`
  canvas.style.height = `${canvas.height * ZOOM}px`
  const wrapper = new CanvasWrapper(canvas)
  const below = cell.casts && floor ? PATCH_H - 1 : PATCH_H
  for (let j = 0; j < PATCH_H; j++) {
    for (let i = 0; i < PATCH_W; i++) {
      const c = j < below ? cell : floor!
      const south = j + 1 < below ? cell : floor
      drawCell(wrapper, i, j, c, imgMap, south)
    }
  }
  return canvas
}

async function main() {
  const base = new URL("catalog/base.json", location.href).href
  const catalog = await loadCatalog(base, ["base.json"])
  const cells = Object.values(catalog.cells)
  const imgMap: Record<string, ImageBitmap> = {}
  await Promise.all(cells.map(async (def) => {
    const bmp = await loadBitmap(def.href)
    if (bmp) imgMap[def.name] = bmp
    await Promise.all((def.variants ?? []).map(async (v, k) => {
      const vb = await loadBitmap(v.href)
      if (vb) imgMap[variantKey(def.name, k)] = vb
    }))
  }))
  const floor = catalog.cells["0"]

  const list = document.getElementById("cells")!
  document.getElementById("count")!.textContent = `${cells.length} CELLS`
  const usage = new Map<string, HTMLElement>()
  for (const cell of cells) {
    const card = document.createElement("div")
    card.className = "card"
    card.id = `cell-${cell.name}`

    const head = document.createElement("div")
    head.className = "row"
    head.append(
      text("ink-white", `"${cell.name}"`),
      text("ink-light", cell.src.split("/").pop() ?? ""),
    )
    const img = imgMap[cell.name]
    if (img) {
      const plain = document.createElement("canvas")
      plain.width = img.width
      plain.height = img.height
      plain.style.width = `${img.width * 4}px`
      plain.style.height = `${img.height * 4}px`
      plain.getContext("2d")!.drawImage(img, 0, 0)
      plain.className = "plain"
      head.append(plain)
    }
    card.append(head, patch(cell, floor, imgMap))

    const props = document.createElement("div")
    props.className = "tags"
    for (const t of tags(cell)) props.append(text("pixel-text-sm ink-light", t))
    card.append(props)

    const used = text("pixel-text-sm ink-mid", "USED IN ...")
    usage.set(cell.name, used)
    card.append(used)
    list.append(card)
  }

  // the maps that use each cell (all blocks of the map index)
  const index = await (await fetch("map/index.json")).json() as MapEntry[]
  const uses = new Map<string, Map<string, number>>()
  await Promise.all(index.map(async (entry) => {
    const res = await fetch(`map/block_${entry.id}.json`)
    if (!res.ok) return
    const block = await res.json() as { field: string[] }
    const name = entry.name ?? entry.id
    for (const row of block.field) {
      for (const c of row) {
        const byMap = uses.get(c) ?? new Map<string, number>()
        byMap.set(name, (byMap.get(name) ?? 0) + 1)
        uses.set(c, byMap)
      }
    }
  }))
  for (const [name, el] of usage) {
    const byMap = uses.get(name)
    el.textContent = byMap
      ? "USED IN " + [...byMap].sort((a, b) => b[1] - a[1]).map(([m]) => m)
        .join(" ").toUpperCase()
      : "NOT USED IN ANY MAP"
  }
}

main()
