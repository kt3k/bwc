// Checks that every pixel of every sprite under static/ uses a color of
// the vscode-pixeledit palette (docs/art-guide.md), and that the colors
// written as data (cell noise in the catalog, `#rrggbb` in the page HTML)
// are palette colors too. Colors in TypeScript are checked by the type
// checker instead (`PaletteColor` in util/palette.ts). Fails with the list
// of offending files and colors.
//
// Usage: deno -A tools/check_palette.ts
import { isPaletteColor, PALETTE } from "../util/palette.ts"

const IGNORED = new Set(["static/actor/lena.png"]) // a source sheet, not used by the game

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Decodes an 8-bit non-interlaced PNG into RGBA pixels */
async function decodePng(
  bytes: Uint8Array,
): Promise<{ w: number; h: number; rgba: Uint8Array }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let pos = 8
  let w = 0, h = 0, depth = 0, type = 0
  let palette: Uint8Array | null = null
  let trns: Uint8Array | null = null
  const idat: Uint8Array[] = []
  while (pos < bytes.length) {
    const len = view.getUint32(pos)
    const name = new TextDecoder().decode(bytes.subarray(pos + 4, pos + 8))
    const data = bytes.subarray(pos + 8, pos + 8 + len)
    if (name === "IHDR") {
      w = view.getUint32(pos + 8)
      h = view.getUint32(pos + 12)
      depth = data[8]
      type = data[9]
    } else if (name === "PLTE") palette = data
    else if (name === "tRNS") trns = data
    else if (name === "IDAT") idat.push(data)
    pos += 12 + len
  }
  if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`)
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]
  if (!channels) throw new Error(`unsupported color type ${type}`)
  const zipped = new Blob(idat.map((c) => c.slice())).stream().pipeThrough(
    new DecompressionStream("deflate"),
  )
  const raw = new Uint8Array(await new Response(zipped).arrayBuffer())
  const stride = w * channels
  const rgba = new Uint8Array(w * h * 4)
  let prev = new Uint8Array(stride)
  let p = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[p++]
    const line = raw.slice(p, p + stride)
    p += stride
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      if (filter === 1) line[i] = (line[i] + a) & 255
      else if (filter === 2) line[i] = (line[i] + b) & 255
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255
      else if (filter === 4) line[i] = (line[i] + paeth(a, b, c)) & 255
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      const px = line.subarray(x * channels, (x + 1) * channels)
      switch (type) {
        case 6:
          rgba.set(px, o)
          break
        case 2:
          rgba.set([px[0], px[1], px[2], 255], o)
          break
        case 0:
          rgba.set([px[0], px[0], px[0], 255], o)
          break
        case 4:
          rgba.set([px[0], px[0], px[0], px[1]], o)
          break
        case 3: {
          const i = px[0]
          rgba.set([
            palette![i * 3],
            palette![i * 3 + 1],
            palette![i * 3 + 2],
            trns && i < trns.length ? trns[i] : 255,
          ], o)
          break
        }
      }
    }
    prev = line
  }
  return { w, h, rgba }
}

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
  console.error(`${offenders.length} files use colors outside the palette:`)
  for (const o of offenders) console.error("  " + o)
  Deno.exit(1)
}
console.log(
  `ok: ${files} sprites, the catalog noise and the page use only palette colors`,
)
