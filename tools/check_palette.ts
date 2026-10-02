// Checks that every pixel of every sprite under static/ uses a color of
// the vscode-pixeledit palette (docs/art-guide.md), and that the colors
// written as data (cell noise in the catalog, `#rrggbb` in the page HTML)
// are palette colors too. Colors in TypeScript are checked by the type
// checker instead (`PaletteColor` in util/palette.ts). Fails with the list
// of offending files and colors. Item sprites must also keep the gray
// ring around their outline (tools/item_ring.ts).
//
// Usage: deno -A tools/check_palette.ts
import { isPaletteColor, PALETTE } from "../util/palette.ts"
import { decodePng } from "./png.ts"
import { itemRingErrors, RING_EXEMPT } from "./item_ring.ts"

const IGNORED = new Set(["static/actor/lena.png"]) // a source sheet, not used by the game

const allowed = new Set(PALETTE.map((c) => c.toLowerCase()))
const offenders: string[] = []
let files = 0
for await (const entry of walk("static")) {
  if (!entry.endsWith(".png") || IGNORED.has(entry)) continue
  files++
  const { w, h, rgba } = await decodePng(await Deno.readFile(entry))
  const bad = new Set<string>()
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] === 0) continue
    const hex = "#" +
      [0, 1, 2].map((k) => rgba[i * 4 + k].toString(16).padStart(2, "0")).join(
        "",
      )
    if (!allowed.has(hex)) bad.add(hex)
  }
  if (bad.size > 0) offenders.push(`${entry}: ${[...bad].sort().join(" ")}`)
  // items: the gray ring around the outline (tools/item_ring.ts)
  if (entry.startsWith("static/item/") && !RING_EXEMPT.has(entry)) {
    const errors = itemRingErrors(w, h, rgba)
    if (errors.length > 0) {
      offenders.push(
        `${entry}: not ringed in gray2 at ${
          errors.join(" ")
        } (deno task item-ring ${entry})`,
      )
    }
  }
}

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const e of Deno.readDir(dir)) {
    const path = `${dir}/${e.name}`
    if (e.isDirectory) yield* walk(path)
    else yield path
  }
}

// Cell noise colors in the catalog: "color=count[:shape]&..."
const catalog = JSON.parse(await Deno.readTextFile("static/catalog/base.json"))
for (const [name, cell] of Object.entries(catalog.cells)) {
  const noise = (cell as { noise?: string }).noise
  if (!noise) continue
  const bad = [...new URLSearchParams(noise).keys()].filter((c) =>
    !isPaletteColor(c)
  )
  if (bad.length > 0) {
    offenders.push(`static/catalog/base.json cell "${name}" noise: ${bad}`)
  }
}

// Hex colors written in the pages (inline styles, filters, classes)
for (const page of ["static/index.html"]) {
  const html = await Deno.readTextFile(page)
  const bad = new Set(
    (html.match(/#[0-9a-fA-F]{6}\b/g) ?? []).filter((c) => !isPaletteColor(c)),
  )
  if (bad.size > 0) offenders.push(`${page}: ${[...bad].sort().join(" ")}`)
}

if (offenders.length > 0) {
  console.error(`${offenders.length} files break the color rules:`)
  for (const o of offenders) console.error("  " + o)
  Deno.exit(1)
}
console.log(
  `ok: ${files} sprites, the catalog noise and the page use only palette colors, the items are ringed`,
)
