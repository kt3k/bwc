// The world map viewer (static/maps.html): every block at once, to see
// how the whole world fits together. Drag to pan, wheel or pinch to
// zoom, hover for the cell details, double click to play from that
// cell.
//
// Rendering the whole world at full size would be a canvas of tens of
// thousands of pixels square, so it draws at two levels of detail:
//
// - overview: each block is baked once into a 200x200 bitmap, one pixel
//   per cell (the most common color of the cell sprite, entities as
//   marker pixels). Zoomed out, only these few small bitmaps are scaled
//   up and drawn, which is cheap whatever the zoom
// - detail: zoomed in, the visible area is drawn from 32x32-cell chunks
//   rendered with the real sprites. Only chunks in view are built, a
//   few at a time (the overview shows through until they are ready),
//   and kept in an LRU cache
//
// Nothing is drawn unless the view or the data changed.
import { Palette, type PaletteColor } from "../util/palette.ts"

type Spawn = {
  i: number
  j: number
  type: string
  data?: Record<string, unknown>
}
type Room = { id: string; i: number; j: number; w: number; h: number }
type BlockJson = {
  i: number
  j: number
  name?: string
  catalogs: string[]
  field: string[]
  actors: Spawn[]
  items: Spawn[]
  props: Spawn[]
  rooms?: Room[]
}
type IndexEntry = { id: string; i: number; j: number; name?: string }
type CatalogJson = {
  cells: Record<string, { canEnter: boolean; src: string }>
  items: Record<string, { src: string }>
  actors: Record<string, { src: string }>
  props: Record<string, { src: string; canEnter: boolean }>
}

const SIZE = 200
const CELL = 16
const CHUNK = 32
/** From this many screen pixels per cell on, the sprites are drawn */
const DETAIL_SCALE = 6
const MAX_CHUNKS = 96
const BUILDS_PER_FRAME = 3
/** Blocks this far out are islands outside the world (START, ZOO...) */
const ISLAND = 10000

// ---------------------------------------------------------------------
// images

const images = new Map<string, Promise<ImageBitmap | null>>()
const loaded = new Map<string, ImageBitmap | null>()
const dominant = new Map<string, PaletteColor>()

function loadImage(href: string): Promise<ImageBitmap | null> {
  let p = images.get(href)
  if (!p) {
    p = fetch(href)
      .then((res) => res.ok ? res.blob() : Promise.reject(res.status))
      .then((blob) => createImageBitmap(blob))
      .catch(() => null)
      .then((bmp) => {
        loaded.set(href, bmp)
        if (bmp) dominant.set(href, mostCommonColor(bmp))
        return bmp
      })
    images.set(href, p)
  }
  return p
}

/** The most frequent opaque color of a sprite (a palette color) */
function mostCommonColor(bmp: ImageBitmap): PaletteColor {
  const c = new OffscreenCanvas(bmp.width, bmp.height)
  const g = c.getContext("2d")!
  g.drawImage(bmp, 0, 0)
  const data = g.getImageData(0, 0, bmp.width, bmp.height).data
  const counts = new Map<string, number>()
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] < 128) continue
    const hex = "#" +
      [data[p], data[p + 1], data[p + 2]]
        .map((v) => v.toString(16).padStart(2, "0")).join("")
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  let best = Palette.gray4 as string
  let n = 0
  for (const [hex, count] of counts) {
    if (count > n) {
      n = count
      best = hex
    }
  }
  return best as PaletteColor
}

const rgb = (hex: string) =>
  [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16))

// ---------------------------------------------------------------------
// catalogs

type Defs = {
  cells: Map<string, { href: string; canEnter: boolean }>
  items: Map<string, string>
  actors: Map<string, string>
  props: Map<string, { href: string; canEnter: boolean }>
}
const catalogs = new Map<string, Promise<CatalogJson>>()
const defsCache = new Map<string, Promise<Defs>>()

function loadDefs(blockUrl: string, refs: string[]): Promise<Defs> {
  const urls = refs.map((r) => new URL(r, blockUrl).href)
  const key = urls.join("|")
  let p = defsCache.get(key)
  if (!p) {
    p = Promise.all(urls.map((url) => {
      let c = catalogs.get(url)
      if (!c) {
        c = fetch(url).then((r) => r.json())
        catalogs.set(url, c)
      }
      return c.then((json) => ({ url, json }))
    })).then((list) => {
      const defs: Defs = {
        cells: new Map(),
        items: new Map(),
        actors: new Map(),
        props: new Map(),
      }
      // Later catalogs override earlier ones, as in the game
      for (const { url, json } of list) {
        const abs = (src: string) => new URL(src, url).href
        for (const [k, v] of Object.entries(json.cells ?? {})) {
          defs.cells.set(k, { href: abs(v.src), canEnter: v.canEnter })
        }
        for (const [k, v] of Object.entries(json.items ?? {})) {
          defs.items.set(k, abs(v.src))
        }
        for (const [k, v] of Object.entries(json.actors ?? {})) {
          defs.actors.set(k, abs(v.src) + "down0.png")
        }
        for (const [k, v] of Object.entries(json.props ?? {})) {
          defs.props.set(k, { href: abs(v.src), canEnter: v.canEnter })
        }
      }
      return defs
    })
    defsCache.set(key, p)
  }
  return p
}

// ---------------------------------------------------------------------
// blocks

const show = { grid: true, rooms: true, props: true, actors: true, items: true }

class Block {
  readonly entry: IndexEntry
  json?: BlockJson
  defs?: Defs
  overview?: OffscreenCanvas
  /** spawns by world cell "i.j" */
  readonly at = new Map<string, { kind: string; spawn: Spawn }[]>()

  constructor(entry: IndexEntry) {
    this.entry = entry
  }

  get url() {
    return new URL(`map/block_${this.entry.id}.json`, location.href).href
  }

  async load() {
    const json = await fetch(this.url).then((r) => r.json()) as BlockJson
    const defs = await loadDefs(this.url, json.catalogs)
    for (
      const [kind, list] of [
        ["prop", json.props],
        ["actor", json.actors],
        ["item", json.items],
      ] as const
    ) {
      for (const spawn of list) {
        const key = `${spawn.i}.${spawn.j}`
        const arr = this.at.get(key) ?? []
        arr.push({ kind, spawn })
        this.at.set(key, arr)
      }
    }
    // The cell sprites decide the overview colors
    const used = new Set(json.field.join(""))
    await Promise.all(
      [...used].map((c) => defs.cells.get(c)).filter((d) => d).map((d) =>
        loadImage(d!.href)
      ),
    )
    this.json = json
    this.defs = defs
    this.bakeOverview()
  }

  /** One pixel per cell: the cell color, entities as marker pixels */
  bakeOverview() {
    const json = this.json!
    const defs = this.defs!
    const canvas = new OffscreenCanvas(SIZE, SIZE)
    const g = canvas.getContext("2d")!
    const img = g.createImageData(SIZE, SIZE)
    const colorOf = new Map<string, number[]>()
    for (let y = 0; y < SIZE; y++) {
      const row = json.field[y] ?? ""
      for (let x = 0; x < SIZE; x++) {
        const c = row[x]
        let col = colorOf.get(c)
        if (!col) {
          const def = defs.cells.get(c)
          // Walls in black, so the walkable shapes read at a glance
          col = rgb(
            def && (def.canEnter || def.href.includes("water"))
              ? dominant.get(def.href) ?? Palette.gray4
              : Palette.black,
          )
          colorOf.set(c, col)
        }
        img.data.set([...col, 255], (y * SIZE + x) * 4)
      }
    }
    const mark = (list: Spawn[], color: PaletteColor) => {
      const col = [...rgb(color), 255]
      for (const s of list) {
        const x = s.i - json.i
        const y = s.j - json.j
        if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) {
          img.data.set(col, (y * SIZE + x) * 4)
        }
      }
    }
    if (show.items) mark(json.items, Palette.yellow1)
    if (show.props) {
      mark(json.props.filter((p) => !isPortal(p)), Palette.brown2)
      mark(json.props.filter(isPortal), Palette.blue2)
    }
    if (show.actors) mark(json.actors, Palette.pink2)
    g.putImageData(img, 0, 0)
    this.overview = canvas
  }

  cell(i: number, j: number): string | undefined {
    return this.json?.field[j - this.entry.j]?.[i - this.entry.i]
  }

  room(i: number, j: number): Room | undefined {
    let best: Room | undefined
    for (const r of this.json?.rooms ?? []) {
      if (i >= r.i && j >= r.j && i < r.i + r.w && j < r.j + r.h) {
        if (!best || r.w * r.h < best.w * best.h) best = r
      }
    }
    return best
  }
}

const isPortal = (p: Spawn) =>
  p.type === "portal" || p.type === "portal-out" || p.type === "reset-portal"

// ---------------------------------------------------------------------
// detail chunks (LRU)

const chunks = new Map<string, OffscreenCanvas>()
const building = new Set<string>()

function chunkKey(block: Block, cx: number, cy: number) {
  return `${block.entry.id}:${cx}:${cy}`
}

async function buildChunk(block: Block, cx: number, cy: number) {
  const json = block.json!
  const defs = block.defs!
  const x0 = cx * CHUNK
  const y0 = cy * CHUNK
  const hrefs = new Set<string>()
  const inChunk = (s: Spawn) => {
    const x = s.i - json.i - x0
    const y = s.j - json.j - y0
    return x >= 0 && y >= 0 && x < CHUNK && y < CHUNK
  }
  for (let y = y0; y < y0 + CHUNK; y++) {
    for (let x = x0; x < x0 + CHUNK; x++) {
      const def = defs.cells.get(json.field[y]?.[x])
      if (def) hrefs.add(def.href)
    }
  }
  const layers: [Spawn[], (t: string) => string | undefined][] = []
  if (show.items) {
    layers.push([json.items.filter(inChunk), (t) => defs.items.get(t)])
  }
  if (show.props) {
    layers.push([json.props.filter(inChunk), (t) => defs.props.get(t)?.href])
  }
  if (show.actors) {
    layers.push([json.actors.filter(inChunk), (t) => defs.actors.get(t)])
  }
  for (const [list, href] of layers) {
    for (const s of list) {
      const h = href(s.type)
      if (h) hrefs.add(h)
    }
  }
  await Promise.all([...hrefs].map(loadImage))
  const canvas = new OffscreenCanvas(CHUNK * CELL, CHUNK * CELL)
  const g = canvas.getContext("2d")!
  g.imageSmoothingEnabled = false
  for (let y = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++) {
      const def = defs.cells.get(json.field[y0 + y]?.[x0 + x])
      const bmp = def && loaded.get(def.href)
      if (bmp) g.drawImage(bmp, x * CELL, y * CELL)
    }
  }
  for (const [list, href] of layers) {
    for (const s of list) {
      const h = href(s.type)
      const bmp = h && loaded.get(h)
      if (bmp) {
        g.drawImage(
          bmp,
          (s.i - json.i - x0) * CELL,
          (s.j - json.j - y0) * CELL,
        )
      }
    }
  }
  return canvas
}

function clearChunks() {
  chunks.clear()
}

// ---------------------------------------------------------------------
// view

const canvas = document.querySelector<HTMLCanvasElement>("#map")!
const ctx = canvas.getContext("2d")!
const labelLayer = document.querySelector<HTMLElement>("#labels")!
const info = document.querySelector<HTMLElement>("#info")!
const status = document.querySelector<HTMLElement>("#status")!

const blocks: Block[] = []
const byId = new Map<string, Block>()
/** The view: the center (in cells) and the device pixels per cell */
const view = { cx: 0, cy: 0, s: 1 }
let dirty = false
let dpr = 1

function requestDraw() {
  if (!dirty) {
    dirty = true
    requestAnimationFrame(frame)
  }
}

function resize() {
  dpr = Math.max(1, Math.round(globalThis.devicePixelRatio || 1))
  canvas.width = innerWidth * dpr
  canvas.height = innerHeight * dpr
  canvas.style.width = `${innerWidth}px`
  canvas.style.height = `${innerHeight}px`
  requestDraw()
}

const toScreenX = (i: number) =>
  Math.round((i - view.cx) * view.s + canvas.width / 2)
const toScreenY = (j: number) =>
  Math.round((j - view.cy) * view.s + canvas.height / 2)
const toCellI = (px: number) => (px - canvas.width / 2) / view.s + view.cx
const toCellJ = (py: number) => (py - canvas.height / 2) / view.s + view.cy

function visibleBlocks() {
  const i0 = toCellI(0), i1 = toCellI(canvas.width)
  const j0 = toCellJ(0), j1 = toCellJ(canvas.height)
  return blocks.filter((b) =>
    b.entry.i + SIZE > i0 && b.entry.i < i1 && b.entry.j + SIZE > j0 &&
    b.entry.j < j1
  )
}

function frame() {
  dirty = false
  draw()
}

function draw() {
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = Palette.black
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const vis = visibleBlocks()
  // 1. overviews (cheap at any zoom)
  for (const b of vis) {
    const x = toScreenX(b.entry.i), y = toScreenY(b.entry.j)
    const w = toScreenX(b.entry.i + SIZE) - x
    const h = toScreenY(b.entry.j + SIZE) - y
    if (b.overview) {
      ctx.drawImage(b.overview, x, y, w, h)
    } else {
      ctx.fillStyle = Palette.gray4
      ctx.fillRect(x, y, w, h)
    }
  }
  // 2. detail chunks when zoomed in
  let pending = 0
  if (view.s >= DETAIL_SCALE) {
    const wanted: [Block, number, number][] = []
    for (const b of vis) {
      if (!b.json) continue
      const ci0 = Math.max(0, Math.floor((toCellI(0) - b.entry.i) / CHUNK))
      const ci1 = Math.min(
        SIZE / CHUNK,
        Math.ceil((toCellI(canvas.width) - b.entry.i) / CHUNK),
      )
      const cj0 = Math.max(0, Math.floor((toCellJ(0) - b.entry.j) / CHUNK))
      const cj1 = Math.min(
        SIZE / CHUNK,
        Math.ceil((toCellJ(canvas.height) - b.entry.j) / CHUNK),
      )
      for (let cy = cj0; cy < cj1; cy++) {
        for (let cx = ci0; cx < ci1; cx++) wanted.push([b, cx, cy])
      }
    }
    let started = 0
    for (const [b, cx, cy] of wanted) {
      const key = chunkKey(b, cx, cy)
      const chunk = chunks.get(key)
      const i = b.entry.i + cx * CHUNK, j = b.entry.j + cy * CHUNK
      const n = Math.min(CHUNK, SIZE - cx * CHUNK)
      const m = Math.min(CHUNK, SIZE - cy * CHUNK)
      if (chunk) {
        // touch for the LRU order
        chunks.delete(key)
        chunks.set(key, chunk)
        const x = toScreenX(i), y = toScreenY(j)
        ctx.drawImage(
          chunk,
          0,
          0,
          n * CELL,
          m * CELL,
          x,
          y,
          toScreenX(i + n) - x,
          toScreenY(j + m) - y,
        )
      } else {
        pending++
        if (!building.has(key) && started < BUILDS_PER_FRAME) {
          started++
          building.add(key)
          buildChunk(b, cx, cy).then((c) => {
            building.delete(key)
            chunks.set(key, c)
            while (chunks.size > MAX_CHUNKS) {
              chunks.delete(chunks.keys().next().value!)
            }
            requestDraw()
          })
        }
      }
    }
  }
  // 3. block borders
  if (show.grid) {
    ctx.fillStyle = Palette.gray3
    for (const b of vis) {
      const x = toScreenX(b.entry.i), y = toScreenY(b.entry.j)
      const x1 = toScreenX(b.entry.i + SIZE), y1 = toScreenY(b.entry.j + SIZE)
      ctx.fillRect(x, y, x1 - x, dpr)
      ctx.fillRect(x, y, dpr, y1 - y)
    }
  }
  updateLabels(vis)
  const loadedCount = blocks.filter((b) => b.json).length
  status.textContent = `${loadedCount}/${blocks.length} BLOCKS` +
    ` ZOOM ${(view.s / dpr).toFixed(2)}PX/CELL` +
    (view.s >= DETAIL_SCALE
      ? ` CHUNKS ${chunks.size}${pending ? ` (+${pending})` : ""}`
      : " OVERVIEW")
  saveHash()
}

// ---------------------------------------------------------------------
// labels (DOM pixel text: crisp, palette-colored)

const labels = new Map<string, HTMLElement>()

function label(key: string, text: string, cls: string) {
  let el = labels.get(key)
  if (!el) {
    el = document.createElement("div")
    el.className = `label pixel-text ${cls}`
    el.textContent = text
    labelLayer.appendChild(el)
    labels.set(key, el)
  }
  return el
}

function updateLabels(vis: Block[]) {
  const seen = new Set<string>()
  const place = (el: HTMLElement, key: string, px: number, py: number) => {
    el.style.transform = `translate(${Math.round(px / dpr)}px, ${
      Math.round(py / dpr)
    }px)`
    el.hidden = false
    seen.add(key)
  }
  for (const b of vis) {
    const key = `b:${b.entry.id}`
    const text = b.entry.name ? `${b.entry.name} ${b.entry.id}` : b.entry.id
    place(
      label(key, text, "ink-white"),
      key,
      toScreenX(b.entry.i) + 4 * dpr,
      toScreenY(b.entry.j) + 4 * dpr,
    )
    if (!show.rooms || view.s < 1.5 * dpr) continue
    for (const r of b.json?.rooms ?? []) {
      const rk = `r:${b.entry.id}:${r.id}`
      place(
        label(rk, r.id, "pixel-text-sm ink-light"),
        rk,
        toScreenX(r.i) + 2 * dpr,
        toScreenY(r.j) + 2 * dpr,
      )
    }
  }
  for (const [key, el] of labels) {
    if (!seen.has(key)) el.hidden = true
  }
}

// ---------------------------------------------------------------------
// input

let drag: { x: number; y: number; cx: number; cy: number } | null = null
/** The fingers (or other pointers) currently down on the map */
const pointers = new Map<number, { x: number; y: number }>()
/** A two-finger pinch: the starting spread and scale, and the cell
 * between the fingers, which stays under their midpoint */
let pinch: { d0: number; s0: number; i: number; j: number } | null = null

function pinchPoints() {
  const [a, b] = [...pointers.values()]
  return {
    d: Math.hypot(a.x - b.x, a.y - b.y),
    mx: (a.x + b.x) / 2 * dpr,
    my: (a.y + b.y) / 2 * dpr,
  }
}

canvas.addEventListener("pointerdown", (e) => {
  try {
    canvas.setPointerCapture(e.pointerId)
  } catch {
    // a pointer that cannot be captured still pans and pinches
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 2) {
    const { d, mx, my } = pinchPoints()
    pinch = { d0: Math.max(1, d), s0: view.s, i: toCellI(mx), j: toCellJ(my) }
    drag = null
  } else if (pointers.size === 1) {
    drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }
  } else {
    drag = null
  }
})
canvas.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId)
  if (p) {
    p.x = e.clientX
    p.y = e.clientY
  }
  if (pinch && pointers.size === 2) {
    const { d, mx, my } = pinchPoints()
    const s = Math.min(64 * dpr, Math.max(0.1, pinch.s0 * (d / pinch.d0)))
    view.s = s
    // the cell the pinch began on follows the fingers' midpoint
    view.cx = pinch.i - (mx - canvas.width / 2) / s
    view.cy = pinch.j - (my - canvas.height / 2) / s
    requestDraw()
    return
  }
  if (drag) {
    view.cx = drag.cx - (e.clientX - drag.x) * dpr / view.s
    view.cy = drag.cy - (e.clientY - drag.y) * dpr / view.s
    requestDraw()
  }
  showInfo(e.clientX * dpr, e.clientY * dpr)
})
const liftPointer = (e: PointerEvent) => {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinch = null
  if (pointers.size === 1) {
    // the finger that stays goes on panning from where it is
    const [p] = pointers.values()
    drag = { x: p.x, y: p.y, cx: view.cx, cy: view.cy }
  } else {
    drag = null
  }
}
canvas.addEventListener("pointerup", liftPointer)
canvas.addEventListener("pointercancel", liftPointer)
canvas.addEventListener("wheel", (e) => {
  e.preventDefault()
  const px = e.clientX * dpr, py = e.clientY * dpr
  const i = toCellI(px), j = toCellJ(py)
  const s = Math.min(
    64 * dpr,
    Math.max(0.1, view.s * Math.exp(-e.deltaY / 400)),
  )
  view.s = s
  // keep the cell under the cursor in place
  view.cx = i - (px - canvas.width / 2) / s
  view.cy = j - (py - canvas.height / 2) / s
  requestDraw()
}, { passive: false })
canvas.addEventListener("dblclick", (e) => {
  const i = Math.floor(toCellI(e.clientX * dpr))
  const j = Math.floor(toCellJ(e.clientY * dpr))
  globalThis.open(`./#${i},${j}`, "_blank")
})

function blockAt(i: number, j: number) {
  const bi = Math.floor(i / SIZE) * SIZE
  const bj = Math.floor(j / SIZE) * SIZE
  return byId.get(`${bi}.${bj}`)
}

function showInfo(px: number, py: number) {
  const i = Math.floor(toCellI(px))
  const j = Math.floor(toCellJ(py))
  const b = blockAt(i, j)
  const lines = [`WORLD ${i},${j}`]
  if (b) {
    const room = b.room(i, j)
    lines.push(
      `${b.entry.name ?? b.entry.id}${room ? `-${room.id}` : ""} ${
        i - b.entry.i
      },${j - b.entry.j}`,
    )
    const c = b.cell(i, j)
    if (c !== undefined) {
      const def = b.defs?.cells.get(c)
      const file = def?.href.split("/").pop()
      lines.push(`CELL ${c} ${file ?? "?"}${def?.canEnter ? "" : " (BLOCKS)"}`)
    }
    for (const { kind, spawn } of b.at.get(`${i}.${j}`) ?? []) {
      const data = spawn.data ? " " + JSON.stringify(spawn.data) : ""
      lines.push(`${kind.toUpperCase()} ${spawn.type}${data}`)
    }
  } else {
    lines.push("NO BLOCK")
  }
  lines.push("DOUBLE CLICK: PLAY FROM HERE")
  info.textContent = lines.join("\n")
}

// ---------------------------------------------------------------------
// toolbar

function fit(list: Block[]) {
  if (list.length === 0) return
  const i0 = Math.min(...list.map((b) => b.entry.i))
  const j0 = Math.min(...list.map((b) => b.entry.j))
  const i1 = Math.max(...list.map((b) => b.entry.i + SIZE))
  const j1 = Math.max(...list.map((b) => b.entry.j + SIZE))
  view.cx = (i0 + i1) / 2
  view.cy = (j0 + j1) / 2
  view.s = Math.min(canvas.width / (i1 - i0), canvas.height / (j1 - j0)) *
    0.95
  requestDraw()
}

function buildToolbar() {
  const bar = document.querySelector<HTMLElement>("#places")!
  const add = (text: string, list: () => Block[]) => {
    const btn = document.createElement("button")
    const span = document.createElement("span")
    span.className = "pixel-text pixel-text-sm ink-white"
    span.textContent = text
    btn.appendChild(span)
    btn.onclick = () => fit(list())
    bar.appendChild(btn)
  }
  add("WORLD", () => blocks.filter((b) => Math.abs(b.entry.i) < ISLAND))
  // one button per named map (a map may span several blocks)
  const named = new Map<string, Block[]>()
  for (const b of blocks) {
    if (Math.abs(b.entry.i) >= ISLAND || b.entry.name) {
      const name = b.entry.name ?? b.entry.id
      named.set(name, [...(named.get(name) ?? []), b])
    }
  }
  for (const [name, list] of named) add(name, () => list)
  for (const key of Object.keys(show) as (keyof typeof show)[]) {
    const input = document.querySelector<HTMLInputElement>(`#show-${key}`)!
    input.checked = show[key]
    input.onchange = () => {
      show[key] = input.checked
      if (key === "props" || key === "actors" || key === "items") {
        for (const b of blocks) if (b.json) b.bakeOverview()
        clearChunks()
      }
      requestDraw()
    }
  }
}

// ---------------------------------------------------------------------
// view in the url hash (#cx,cy,zoom), to share or reload a spot

let hashTimer = 0
function saveHash() {
  clearTimeout(hashTimer)
  hashTimer = setTimeout(() => {
    history.replaceState(
      null,
      "",
      `#${Math.round(view.cx)},${Math.round(view.cy)},${
        (view.s / dpr).toFixed(2)
      }`,
    )
  }, 300)
}

function loadHash(): boolean {
  const m = location.hash.match(/^#(-?\d+),(-?\d+),([\d.]+)$/)
  if (!m) return false
  view.cx = Number(m[1])
  view.cy = Number(m[2])
  view.s = Number(m[3]) * dpr
  return true
}

// ---------------------------------------------------------------------
// start

async function main() {
  resize()
  addEventListener("resize", resize)
  const index = await fetch("map/index.json").then((r) =>
    r.json()
  ) as IndexEntry[]
  for (const entry of index) {
    if (entry.id === "not_found") continue
    const b = new Block(entry)
    blocks.push(b)
    byId.set(entry.id, b)
  }
  buildToolbar()
  if (!loadHash()) fit(blocks.filter((b) => Math.abs(b.entry.i) < ISLAND))
  addEventListener("hashchange", () => {
    if (loadHash()) requestDraw()
  })
  // Load the blocks nearest to the view first
  const order = [...blocks].sort((a, b) => {
    const d = (x: Block) =>
      Math.hypot(
        x.entry.i + SIZE / 2 - view.cx,
        x.entry.j + SIZE / 2 - view.cy,
      )
    return d(a) - d(b)
  })
  for (const b of order) {
    b.load().then(requestDraw)
  }
  requestDraw()
}

main()
