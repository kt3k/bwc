// The break effects lab (static/effects.html): try the patterns of
// model/break-fx.ts with their parameters, side by side with presets.
//
// The page keeps to the art rules too: the stages are drawn at whole
// pixels in palette colors (scaled up by whole numbers, pixelated), and
// the controls are plain boxes in palette colors (no native sliders or
// selects, whose look the browser picks). Text goes through the ink
// filters, which snap its edges to one palette color.
import {
  BreakRun,
  CELL,
  type PaletteName,
  type ParamSpec,
  type Pattern,
  PATTERNS,
  PRESETS,
  type Recipe,
  recipe,
  seeded,
  type SpriteData,
} from "../model/break-fx.ts"
import type { Dir } from "../model/types.ts"
import { isPaletteColor, Palette } from "../util/palette.ts"

const COLS = 7
const ROWS = 5
const W = COLS * CELL
const H = ROWS * CELL
/** The broken thing's cell */
const TI = 3
const TJ = 2

const SPRITES = [
  "crate",
  "jar",
  "barrel",
  "chest",
  "egg_wall",
  "nest_jar_4",
  "packed_box",
  "bell_stone",
  "clock",
  "lone_window",
  "pinata",
  "moon_shell",
  "self_statue",
  "balloon_rock_2",
]
const FLOORS = [
  "floor0",
  "floor2",
  "forest",
  "cobble",
  "planks",
  "sand",
  "ice",
  "water",
  "floor_black",
]
const DIR_LABEL: Record<Dir, string> = {
  up: "上へ",
  down: "下へ",
  left: "左へ",
  right: "右へ",
}
const SLOWS = [1, 2, 4, 8]

type State = {
  recipe: Recipe
  dir: Dir
  sprite: string
  floor: string
  zoom: number
  slow: number
  auto: boolean
  /** 0: a new random each time; otherwise the same break every time */
  seed: number
}

// ---------------------------------------------------------------------
// assets

const images = new Map<string, HTMLImageElement>()
function image(src: string): Promise<HTMLImageElement> {
  const cached = images.get(src)
  if (cached) return Promise.resolve(cached)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      images.set(src, img)
      resolve(img)
    }
    img.onerror = reject
    img.src = src
  })
}

const spriteData = new Map<string, SpriteData>()
/** The sprite's pixels as palette colors */
async function loadSprite(name: string): Promise<SpriteData> {
  const cached = spriteData.get(name)
  if (cached) return cached
  const img = await image(`./prop/${name}.png`)
  const c = document.createElement("canvas")
  c.width = img.width
  c.height = img.height
  const g = c.getContext("2d")!
  g.drawImage(img, 0, 0)
  const d = g.getImageData(0, 0, img.width, img.height).data
  const px: SpriteData["px"] = []
  for (let k = 0; k < img.width * img.height; k++) {
    if (d[k * 4 + 3] === 0) {
      px.push(null)
      continue
    }
    const hex = "#" +
      [0, 1, 2].map((o) => d[k * 4 + o].toString(16).padStart(2, "0")).join("")
    px.push(isPaletteColor(hex) ? hex : Palette.white)
  }
  const data = { w: img.width, h: img.height, px }
  spriteData.set(name, data)
  return data
}

// ---------------------------------------------------------------------
// a stage: the floor, the player, the thing, and the break

class Stage {
  readonly canvas = document.createElement("canvas")
  #g: CanvasRenderingContext2D
  #run: BreakRun | null = null
  #lastMotion: BreakRun["motion"] | null = null
  #idle = 0
  #after = 0
  #tick = 0
  paused = false
  frame = 0
  constructor(public state: () => State, zoom: number) {
    this.canvas.width = W
    this.canvas.height = H
    this.canvas.className = "stage"
    this.setZoom(zoom)
    this.#g = this.canvas.getContext("2d")!
    this.#g.imageSmoothingEnabled = false
    this.canvas.addEventListener("click", () => this.trigger())
  }
  setZoom(zoom: number) {
    this.canvas.style.width = `${W * zoom}px`
    this.canvas.style.height = `${H * zoom}px`
  }
  async trigger() {
    const s = this.state()
    const sprite = await loadSprite(s.sprite)
    this.#run = new BreakRun(s.recipe, {
      x: TI * CELL,
      y: TJ * CELL,
      dir: s.dir,
      sprite,
      rand: s.seed ? seeded(s.seed) : Math.random,
    })
    this.#after = 0
    this.frame = 0
  }
  reset() {
    this.#lastMotion = this.#run?.motion ?? this.#lastMotion
    this.#run = null
    this.#idle = 0
    this.frame = 0
  }
  /** One display frame (60 a second); the world moves every `slow` */
  tick() {
    if (this.paused) return
    if (++this.#tick % this.state().slow !== 0) return
    this.advance()
  }
  /** One frame of the world */
  advance() {
    const run = this.#run
    if (run) {
      run.step()
      this.frame++
      if (run.done && ++this.#after > 40) this.reset()
    } else if (this.state().auto && ++this.#idle > 30) {
      this.trigger()
    }
  }
  draw() {
    const s = this.state()
    const g = this.#g
    const run = this.#run
    const [sx, sy] = run?.shakeOffset ?? [0, 0]
    g.fillStyle = Palette.black
    g.fillRect(0, 0, W, H)
    const floor = images.get(`./cell/${s.floor}.png`)
    if (!floor) {
      image(`./cell/${s.floor}.png`)
      return
    }
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        g.drawImage(floor, i * CELL + sx, j * CELL + sy)
      }
    }
    // the player, pushing from the cell before
    const back =
      { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] }[s.dir]
    const me = images.get(`./actor/kimi/${s.dir}0.png`)
    if (me) {
      g.drawImage(me, (TI + back[0]) * CELL + sx, (TJ + back[1]) * CELL + sy)
    } else image(`./actor/kimi/${s.dir}0.png`)
    const sprite = images.get(`./prop/${s.sprite}.png`)
    if (!sprite) {
      image(`./prop/${s.sprite}.png`)
      return
    }
    if (!run || run.spriteVisible) {
      g.drawImage(
        sprite,
        TI * CELL - Math.floor((sprite.width - CELL) / 2) + sx,
        TJ * CELL - (sprite.height - CELL) + sy,
      )
    }
    run?.draw({
      rect(x, y, w, h, color) {
        g.fillStyle = color
        g.fillRect(x + sx, y + sy, w, h)
      },
    })
  }
  get running(): boolean {
    return !!this.#run
  }
  /** How much moved in the last break, as one line */
  get motion(): string {
    const m = this.#run?.motion ?? this.#lastMotion
    if (!m) return "動き: -"
    return `変化 計 ${m.changed}px / 最大 ${m.maxChanged}px/frame` +
      ` · 急に出た ${m.appeared}px · 急に消えた ${m.vanished}px`
  }
}

// ---------------------------------------------------------------------
// controls (plain boxes in palette colors)

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  e.append(...children)
  return e
}

/** Text snapped to one palette color by an ink filter */
const ink = (text: string, cls = "ink-white") => el("span", `t ${cls}`, text)

/** A row of choices; the chosen one is lit */
function chips<T>(
  options: readonly T[],
  label: (o: T) => string,
  get: () => T,
  set: (o: T) => void,
): HTMLElement {
  const row = el("div", "chips")
  const render = () => {
    row.replaceChildren(
      ...options.map((o) => {
        const chip = el(
          "button",
          o === get() ? "chip on" : "chip",
          ink(label(o), o === get() ? "ink-black" : "ink-white"),
        )
        chip.addEventListener("click", () => {
          set(o)
          render()
        })
        return chip
      }),
    )
  }
  render()
  return row
}

/** A slider: a track, dragged or clicked; − and + nudge by a step */
function slider(
  spec: { min: number; max: number; step: number },
  get: () => number,
  set: (v: number) => void,
): HTMLElement {
  const track = el("div", "track")
  const fill = el("div", "fill")
  track.append(fill)
  const value = ink("", "ink-light")
  const snap = (v: number) => {
    const k = Math.round((v - spec.min) / spec.step)
    const out = spec.min +
      Math.max(0, Math.min(Math.round((spec.max - spec.min) / spec.step), k)) *
        spec.step
    return Number(out.toFixed(4))
  }
  const render = () => {
    const v = get()
    fill.style.width = `${
      Math.round(((v - spec.min) / (spec.max - spec.min)) * 100)
    }%`
    value.textContent = String(v)
  }
  const fromEvent = (e: PointerEvent) => {
    const r = track.getBoundingClientRect()
    set(
      snap(spec.min + ((e.clientX - r.left) / r.width) * (spec.max - spec.min)),
    )
    render()
  }
  track.addEventListener("pointerdown", (e) => {
    track.setPointerCapture(e.pointerId)
    fromEvent(e)
  })
  track.addEventListener("pointermove", (e) => {
    if (track.hasPointerCapture(e.pointerId)) fromEvent(e)
  })
  const nudge = (d: number) => {
    const b = el("button", "chip small", ink(d < 0 ? "−" : "+"))
    b.addEventListener("click", () => {
      set(snap(get() + d * spec.step))
      render()
    })
    return b
  }
  render()
  return el("div", "slider", nudge(-1), track, nudge(1), value)
}

/** A palette swatch that opens the whole palette to choose from */
function colorPicker(get: () => PaletteName, set: (c: PaletteName) => void) {
  const swatch = el("button", "swatch")
  const name = ink("", "ink-light")
  const grid = el("div", "palette hidden")
  const render = () => {
    swatch.style.background = Palette[get()]
    name.textContent = get()
  }
  for (const key of Object.keys(Palette) as PaletteName[]) {
    const b = el("button", "swatch small")
    b.style.background = Palette[key]
    b.title = key
    b.addEventListener("click", () => {
      set(key)
      grid.classList.add("hidden")
      render()
    })
    grid.append(b)
  }
  swatch.addEventListener("click", () => grid.classList.toggle("hidden"))
  render()
  return el("div", "", el("div", "slider", swatch, name), grid)
}

function paramControl(
  spec: ParamSpec,
  get: () => number | string,
  set: (v: number | string) => void,
): HTMLElement {
  const control = spec.type === "num"
    ? slider(spec, () => Number(get()), set)
    : spec.type === "color"
    ? colorPicker(() => get() as PaletteName, set)
    : chips(spec.options, (o) => o, () => String(get()), set)
  return el("div", "param", ink(spec.label, "ink-mid"), control)
}

// ---------------------------------------------------------------------
// the page

const DEFAULT: State = {
  recipe: structuredClone(PRESETS[1].recipe),
  dir: "up",
  sprite: "crate",
  floor: "floor0",
  zoom: 5,
  slow: 1,
  auto: true,
  seed: 0,
}

/** The state from the URL hash (the whole setting can be shared) */
function loadState(): State {
  try {
    const raw = decodeURIComponent(location.hash.slice(1))
    if (!raw) return structuredClone(DEFAULT)
    const s = JSON.parse(raw) as State
    // settings added since keep their defaults; patterns gone are dropped
    const base = recipe({})
    s.recipe.rate ??= 1
    for (const id of Object.keys(s.recipe.layers)) {
      if (!(id in base.layers)) delete s.recipe.layers[id]
    }
    for (const [id, layer] of Object.entries(base.layers)) {
      const saved = s.recipe.layers[id]
      s.recipe.layers[id] = saved
        ? { on: saved.on, params: { ...layer.params, ...saved.params } }
        : layer
    }
    return { ...structuredClone(DEFAULT), ...s }
  } catch {
    return structuredClone(DEFAULT)
  }
}

const state = loadState()
let saveTimer = 0
function changed() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    history.replaceState(
      null,
      "",
      "#" + encodeURIComponent(JSON.stringify(state)),
    )
    json.textContent = JSON.stringify(state.recipe, null, 1)
  }, 200)
}

const main = new Stage(() => state, state.zoom)
/** The JSON of the recipe (text in a palette color) */
const json = el("span", "ink-light")

function controlsPanel(): HTMLElement {
  const frame = ink("FRAME 0", "ink-light")
  const play = el("button", "chip", ink("▶ 割る"))
  play.addEventListener("click", () => main.trigger())
  const pause = el("button", "chip", ink("一時停止"))
  pause.addEventListener("click", () => {
    main.paused = !main.paused
    pause.replaceChildren(ink(main.paused ? "再開" : "一時停止"))
  })
  const stepB = el("button", "chip", ink("1 コマ進む"))
  stepB.addEventListener("click", () => {
    main.paused = true
    pause.replaceChildren(ink("再開"))
    if (!main.running) main.trigger()
    else main.advance()
  })
  const motion = ink("", "ink-light")
  setInterval(() => {
    frame.textContent = `FRAME ${main.frame}`
    motion.textContent = main.motion
  }, 50)
  const row = (label: string, control: HTMLElement) =>
    el("div", "param", ink(label, "ink-mid"), control)
  return el(
    "div",
    "panel",
    el("div", "chips", play, pause, stepB, frame),
    motion,
    ink(
      "急に出た / 消えた = 前 (次) の frame の 1px 以内に何もない画素。0 に近いほど「ない物が急に現れる・消える」が少ない",
      "ink-mid",
    ),
    row(
      "自動でくり返す",
      chips([true, false], (o) => o ? "ON" : "OFF", () => state.auto, (o) => {
        state.auto = o
        changed()
      }),
    ),
    row(
      "スロー (1 コマを何回描くか)",
      chips(SLOWS, (o) => `1/${o}`, () => state.slow, (o) => {
        state.slow = o
        changed()
      }),
    ),
    row(
      "押す向き",
      chips(
        ["up", "down", "left", "right"] as Dir[],
        (o) => DIR_LABEL[o],
        () => state.dir,
        (o) => {
          state.dir = o
          changed()
        },
      ),
    ),
    row(
      "壊れる物",
      chips(SPRITES, (o) => o, () => state.sprite, (o) => {
        state.sprite = o
        changed()
      }),
    ),
    row(
      "床",
      chips(FLOORS, (o) => o, () => state.floor, (o) => {
        state.floor = o
        changed()
      }),
    ),
    row(
      "拡大",
      chips([3, 4, 5, 6], (o) => `${o}x`, () => state.zoom, (o) => {
        state.zoom = o
        main.setZoom(o)
        changed()
      }),
    ),
    row(
      "乱数",
      chips(
        [0, 1, 2, 3],
        (o) => o ? `固定 ${o}` : "毎回",
        () => state.seed,
        (o) => {
          state.seed = o
          changed()
        },
      ),
    ),
  )
}

function globalPanel(): HTMLElement {
  const r = () => state.recipe
  const num = (
    label: string,
    spec: { min: number; max: number; step: number },
    key: "stop" | "shake" | "shakeAmp" | "vanish" | "rate",
  ) =>
    el(
      "div",
      "param",
      ink(label, "ink-mid"),
      slider(spec, () => r()[key], (v) => {
        r()[key] = v
        changed()
      }),
    )
  return el(
    "div",
    "panel",
    ink("全体", "ink-white"),
    num(
      "コマ落とし (何 frame に 1 回動かすか。1 = 60fps、2 = 30、4 = 15)",
      { min: 1, max: 4, step: 1 },
      "rate",
    ),
    num("ヒットストップ (止まる frame)", { min: 0, max: 20, step: 1 }, "stop"),
    num("揺れ (frame)", { min: 0, max: 30, step: 1 }, "shake"),
    num("揺れ幅 (px)", { min: 1, max: 3, step: 1 }, "shakeAmp"),
    num("絵を自分で描く効果がないとき、絵が消える frame", {
      min: 0,
      max: 30,
      step: 1,
    }, "vanish"),
  )
}

function layerCard(pattern: Pattern): HTMLElement {
  const layer = () => state.recipe.layers[pattern.id]
  const body = el("div", "params")
  const head = el("div", "chips")
  const renderHead = () => {
    const on = layer().on
    const toggle = el(
      "button",
      on ? "chip on" : "chip",
      ink(on ? "ON" : "OFF", on ? "ink-black" : "ink-white"),
    )
    toggle.addEventListener("click", () => {
      layer().on = !layer().on
      card.classList.toggle("off", !layer().on)
      renderHead()
      changed()
    })
    head.replaceChildren(
      toggle,
      ink(pattern.name),
      pattern.ownsSprite ? ink("絵を描く", "ink-mid") : "",
    )
  }
  const renderBody = () => {
    body.replaceChildren(
      ...pattern.params.map((spec) =>
        paramControl(spec, () => layer().params[spec.key], (v) => {
          layer().params[spec.key] = v
          changed()
        })
      ),
    )
  }
  renderHead()
  renderBody()
  const card = el(
    "div",
    layer().on ? "card" : "card off",
    head,
    el("p", "note", ink(pattern.note, "ink-light")),
    body,
  )
  return card
}

function gallery(rebuild: () => void): HTMLElement {
  const wrap = el("div", "gallery")
  for (const preset of PRESETS) {
    const own: State = {
      ...DEFAULT,
      recipe: preset.recipe,
      zoom: 2,
      auto: true,
      slow: 1,
    }
    const stage = new Stage(
      () => ({
        ...own,
        dir: state.dir,
        sprite: state.sprite,
        floor: state.floor,
      }),
      2,
    )
    stages.push(stage)
    const use = el("button", "chip", ink("これを編集"))
    use.addEventListener("click", () => {
      state.recipe = structuredClone(preset.recipe)
      rebuild()
      changed()
      main.trigger()
    })
    const motion = ink("", "ink-mid")
    setInterval(() => motion.textContent = stage.motion, 250)
    wrap.append(
      el(
        "div",
        "tile",
        stage.canvas,
        ink(preset.name),
        el("p", "note", ink(preset.note, "ink-light")),
        el("p", "note", motion),
        use,
      ),
    )
  }
  return wrap
}

const stages: Stage[] = [main]

function build() {
  const layers = el(
    "div",
    "layers",
    ...PATTERNS.filter((pt) => pt.group !== "nes").map(layerCard),
    el(
      "details",
      "older",
      el(
        "summary",
        "",
        ink("前の候補 (NES 風、動きが多い) を開く", "ink-mid"),
      ),
      el(
        "div",
        "layers",
        ...PATTERNS.filter((pt) => pt.group === "nes").map(layerCard),
      ),
    ),
  )
  const editor = document.getElementById("editor")!
  editor.replaceChildren(
    el(
      "div",
      "left",
      el("div", "stage-wrap", main.canvas),
      controlsPanel(),
      globalPanel(),
    ),
    layers,
  )
}

function copyButton() {
  const b = el("button", "chip", ink("JSON をコピー"))
  b.addEventListener(
    "click",
    () => navigator.clipboard?.writeText(JSON.stringify(state.recipe, null, 1)),
  )
  return b
}

document.getElementById("gallery")!.append(gallery(build))
build()
document.getElementById("export")!.append(
  el(
    "div",
    "chips",
    copyButton(),
    ink("URL にも今の設定が入る (そのまま共有できる)", "ink-mid"),
  ),
  el("pre", "json", json),
)
json.textContent = JSON.stringify(state.recipe, null, 1)

// the loop: 60 frames a second, every stage
let last = performance.now()
let acc = 0
function loop(now: number) {
  acc += now - last
  last = now
  let n = 0
  while (acc >= 1000 / 60 && n++ < 4) {
    acc -= 1000 / 60
    for (const s of stages) s.tick()
  }
  if (acc > 100) acc = 0
  for (const s of stages) s.draw()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
main.trigger()
