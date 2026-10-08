// The break effects lab (static/effects.html): patterns for the moment a
// thing breaks, each driven by a few parameters, to study and compare
// them. Every pattern keeps to the art rules (docs/art-guide.md):
//
// - palette colors only, no alpha, no gradients
// - no sub-pixel drawing: positions may move by fractions internally,
//   but every rect is drawn at whole pixels (`Painter` rounds nothing;
//   the patterns hand it integers, and the tests check that)
// - no rotation or scaling of sprites (that would resample them)
//
// A pattern is created for one break (a cell, a push direction, the
// sprite of the thing) and is then stepped a frame at a time and drawn.
import { Palette, type PaletteColor } from "../util/palette.ts"
import type { Dir } from "./types.ts"

export const CELL = 16

/** Where the effects are drawn: whole pixels in palette colors */
export interface Painter {
  rect(x: number, y: number, w: number, h: number, color: PaletteColor): void
}

/** The sprite of the broken thing, pixel by pixel (null = transparent) */
export type SpriteData = {
  w: number
  h: number
  px: (PaletteColor | null)[]
}

/** One break: the cell's top-left pixel, the push and the sprite */
export type FxContext = {
  x: number
  y: number
  dir: Dir
  sprite: SpriteData
  /** 0..1 random numbers */
  rand: () => number
}

export type ParamSpec =
  | {
    key: string
    label: string
    type: "num"
    min: number
    max: number
    step: number
    value: number
  }
  | { key: string; label: string; type: "color"; value: PaletteName }
  | {
    key: string
    label: string
    type: "select"
    options: readonly string[]
    value: string
  }

export type PaletteName = keyof typeof Palette
export type Params = Record<string, number | string>

export interface FxInstance {
  step(): void
  draw(p: Painter): void
  readonly done: boolean
}

export type Pattern = {
  id: string
  name: string
  /** What it looks like and what to try */
  note: string
  /** It draws the sprite itself (wiped, shattered, flashed...) */
  ownsSprite?: boolean
  params: ParamSpec[]
  create(p: Params, ctx: FxContext): FxInstance
}

// ---------------------------------------------------------------------
// helpers

const num = (p: Params, k: string) => Number(p[k])
const color = (p: Params, k: string): PaletteColor =>
  Palette[p[k] as PaletteName] ?? Palette.white
const DELAY: ParamSpec = {
  key: "delay",
  label: "開始の遅れ (frame)",
  type: "num",
  min: 0,
  max: 60,
  step: 1,
  value: 0,
}

/** The unit vector of a push direction */
export function dirVec(dir: Dir): [number, number] {
  return dir === "up"
    ? [0, -1]
    : dir === "down"
    ? [0, 1]
    : dir === "left"
    ? [-1, 0]
    : [1, 0]
}

/** Wraps an instance so it starts `delay` frames late */
function delayed(delay: number, inner: FxInstance): FxInstance {
  let wait = delay
  return {
    step() {
      if (wait > 0) wait--
      else inner.step()
    },
    draw(p) {
      if (wait <= 0) inner.draw(p)
    },
    get done() {
      return wait <= 0 && inner.done
    },
  }
}

/** The sprite's pixels within a box, drawn at an offset */
function drawSpritePart(
  p: Painter,
  s: SpriteData,
  sx: number,
  sy: number,
  w: number,
  h: number,
  dx: number,
  dy: number,
  map?: (c: PaletteColor, x: number, y: number) => PaletteColor | null,
) {
  for (let y = sy; y < sy + h && y < s.h; y++) {
    for (let x = sx; x < sx + w && x < s.w; x++) {
      const c = s.px[y * s.w + x]
      if (!c) continue
      const out = map ? map(c, x, y) : c
      if (out) p.rect(dx + x - sx, dy + y - sy, 1, 1, out)
    }
  }
}

/** The sprite at the cell (its top-left, standing on the cell's bottom) */
function spriteOrigin(ctx: FxContext): [number, number] {
  return [
    ctx.x - Math.floor((ctx.sprite.w - CELL) / 2),
    ctx.y - (ctx.sprite.h - CELL),
  ]
}

/** The gray ramp, light to dark, for inverting a gray sprite */
const RAMP: PaletteColor[] = [
  Palette.white,
  Palette.gray1,
  Palette.gray2,
  Palette.gray3,
  Palette.gray4,
  Palette.black,
]
/** The palette color at the other end of the gray ramp (others: white) */
export function invert(c: PaletteColor): PaletteColor {
  const k = RAMP.indexOf(c)
  return k < 0 ? Palette.white : RAMP[RAMP.length - 1 - k]
}

// ---------------------------------------------------------------------
// the patterns

/** The game's line-pattern-1: bars sweeping through the cell */
const sweep: Pattern = {
  id: "sweep",
  name: "スイープ線 (現行)",
  note:
    "いま木箱などが割れる時に出ている線。押した向きに、セル幅の帯が数本ずつ遅れて流れる。本数・間隔・太さ・速さで印象が大きく変わる。",
  params: [
    DELAY,
    {
      key: "count",
      label: "本数",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: 4,
    },
    {
      key: "gap",
      label: "間隔 (frame)",
      type: "num",
      min: 1,
      max: 12,
      step: 1,
      value: 4,
    },
    {
      key: "width",
      label: "太さ (px)",
      type: "num",
      min: 1,
      max: 6,
      step: 1,
      value: 2,
    },
    {
      key: "speed",
      label: "速さ (px/frame)",
      type: "num",
      min: 1,
      max: 4,
      step: 1,
      value: 1,
    },
    {
      key: "life",
      label: "寿命 (frame)",
      type: "num",
      min: 4,
      max: 40,
      step: 1,
      value: 16,
    },
    { key: "color", label: "色", type: "color", value: "gray4" },
    {
      key: "span",
      label: "帯の長さ",
      type: "select",
      options: ["cell", "half", "dotted"],
      value: "cell",
    },
  ],
  create(p, ctx) {
    const [vx, vy] = dirVec(ctx.dir)
    // where the bars start: the edge the push comes from
    const ox = ctx.dir === "left" ? ctx.x + CELL : ctx.x
    const oy = ctx.dir === "up" ? ctx.y + CELL : ctx.y
    const count = num(p, "count"), gap = num(p, "gap")
    const width = num(p, "width"), speed = num(p, "speed")
    const life = num(p, "life"), c = color(p, "color")
    const span = String(p.span)
    let t = 0
    return delayed(num(p, "delay"), {
      step() {
        t++
      },
      draw(painter) {
        for (let n = 0; n < count; n++) {
          const age = t - n * gap
          if (age < 0 || age >= life) continue
          const d = age * speed
          const bx = ox + vx * d, by = oy + vy * d
          const len = span === "half" ? CELL / 2 : CELL
          const off = span === "half" ? CELL / 4 : 0
          for (let k = 0; k < len; k++) {
            if (span === "dotted" && k % 2 === 1) continue
            if (vx === 0) painter.rect(bx + off + k, by, 1, width, c)
            else painter.rect(bx, by + off + k, width, 1, c)
          }
        }
      },
      get done() {
        return t >= (count - 1) * gap + life
      },
    })
  },
}

/** The game's MotionBreak: the sprite wiped away a line at a time */
const wipe: Pattern = {
  id: "wipe",
  name: "ワイプ (現行)",
  note:
    "いま壊れる物の絵が消える方法。押した向きに 1 行ずつ消える。消す順番を変えると「崩れる」「溶ける」「割れる」が変わる。",
  ownsSprite: true,
  params: [
    DELAY,
    {
      key: "lines",
      label: "1 frame に消す行",
      type: "num",
      min: 1,
      max: 4,
      step: 1,
      value: 1,
    },
    {
      key: "order",
      label: "消す順",
      type: "select",
      options: [
        "sweep",
        "reverse",
        "center-out",
        "edges-in",
        "interleave",
        "random",
      ],
      value: "sweep",
    },
    { key: "edge", label: "消える行の縁の色", type: "color", value: "black" },
    {
      key: "edgeOn",
      label: "縁を描く",
      type: "select",
      options: ["off", "on"],
      value: "off",
    },
  ],
  create(p, ctx) {
    const s = ctx.sprite
    const along = ctx.dir === "up" || ctx.dir === "down" ? s.h : s.w
    // the order the lines go in, as line indices from the near side
    let order = [...Array(along).keys()]
    switch (p.order) {
      case "reverse":
        order.reverse()
        break
      case "center-out": {
        const mid = (along - 1) / 2
        order.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))
        break
      }
      case "edges-in": {
        const mid = (along - 1) / 2
        order.sort((a, b) => Math.abs(b - mid) - Math.abs(a - mid))
        break
      }
      case "interleave":
        order = [
          ...order.filter((k) => k % 2 === 0),
          ...order.filter((k) => k % 2 === 1),
        ]
        break
      case "random":
        for (let k = order.length - 1; k > 0; k--) {
          const m = Math.floor(ctx.rand() * (k + 1))
          ;[order[k], order[m]] = [order[m], order[k]]
        }
    }
    // a line index from the near side to a sprite row / column
    const toLine = (k: number) =>
      ctx.dir === "up" || ctx.dir === "left" ? along - 1 - k : k
    const gone = new Set<number>()
    const lines = num(p, "lines")
    const edge = p.edgeOn === "on" ? color(p, "edge") : null
    let last: number[] = []
    let n = 0
    const [sx, sy] = spriteOrigin(ctx)
    return delayed(num(p, "delay"), {
      step() {
        last = []
        for (let k = 0; k < lines && n < order.length; k++, n++) {
          const line = toLine(order[n])
          gone.add(line)
          last.push(line)
        }
      },
      draw(painter) {
        if (n >= order.length) return
        const vertical = ctx.dir === "up" || ctx.dir === "down"
        drawSpritePart(painter, s, 0, 0, s.w, s.h, sx, sy, (c, x, y) => {
          const line = vertical ? y : x
          if (gone.has(line)) {
            return edge && last.includes(line) ? edge : null
          }
          return c
        })
      },
      get done() {
        return n >= order.length
      },
    })
  },
}

// ---------------------------------------------------------------------
// NES-like patterns: a few small sprites (8x8, 3 colors each), animated
// in 2 to 4 frames held for several frames, moving by whole pixels.
// When more than 8 sprites are out, they may flicker (half of them on
// even frames, half on odd), as the NES shows them

/** A bitmap: "1" "2" "3" are the sprite's three colors, "." is clear */
type Bitmap = readonly string[]

/** Draws a bitmap at (x, y), mirrored if asked (the NES flips, never rotates) */
function drawBitmap(
  p: Painter,
  rows: Bitmap,
  x: number,
  y: number,
  colors: readonly PaletteColor[],
  flipH = false,
  flipV = false,
) {
  const h = rows.length, w = rows[0].length
  for (let dy = 0; dy < h; dy++) {
    const row = rows[flipV ? h - 1 - dy : dy]
    for (let dx = 0; dx < w; dx++) {
      const ch = row[flipH ? w - 1 - dx : dx]
      if (ch === ".") continue
      p.rect(x + dx, y + dy, 1, 1, colors[Number(ch) - 1])
    }
  }
}

/** The three colors of a pattern (params c1 c2 c3) */
const colors3 = (p: Params): PaletteColor[] => [
  color(p, "c1"),
  color(p, "c2"),
  color(p, "c3"),
]
const COLORS = (
  c1: PaletteName,
  c2: PaletteName,
  c3: PaletteName,
): ParamSpec[] => [
  { key: "c1", label: "色 1 (明)", type: "color", value: c1 },
  { key: "c2", label: "色 2 (中)", type: "color", value: c2 },
  { key: "c3", label: "色 3 (暗・縁)", type: "color", value: c3 },
]
const FLICKER: ParamSpec = {
  key: "flicker",
  label: "8 個を超えたらちらつく",
  type: "select",
  options: ["on", "off"],
  value: "on",
}
/** With flicker on and more than 8 sprites, half of them each frame */
const shown = (p: Params, k: number, count: number, t: number) =>
  p.flicker !== "on" || count <= 8 || (k + t) % 2 === 0

const PUFF: Bitmap[] = [
  [
    "................",
    "................",
    "................",
    "................",
    "................",
    "......3333......",
    ".....311113.....",
    "....31111123....",
    "....31111223....",
    "....31112223....",
    ".....322223.....",
    "......3333......",
    "................",
    "................",
    "................",
    "................",
  ],
  [
    "................",
    ".....333..333...",
    "....31113311113.",
    "...311111111123.",
    "..3111111111223.",
    "..31111112222233",
    "...311112222223.",
    "..31111122222223",
    ".311111222222223",
    ".311112222222223",
    ".31122222222223.",
    "..322223322223..",
    "...3333..3333...",
    "................",
    "................",
    "................",
  ],
  [
    "..333......333..",
    ".31113....31123.",
    ".31123....31223.",
    "..333......333..",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "..333......333..",
    ".31113....31123.",
    ".31223....32223.",
    "..333......333..",
    "................",
  ],
]
const ORB: Bitmap[] = [
  [
    "..3333..",
    ".311113.",
    "31111213",
    "31111213",
    "31112213",
    "31122213",
    ".322223.",
    "..3333..",
  ],
  [
    "........",
    "...33...",
    "..3113..",
    ".311213.",
    ".312213.",
    "..3223..",
    "...33...",
    "........",
  ],
]
const STAR: Bitmap[] = [
  [
    "...1....",
    "...2....",
    "...2....",
    "1223221.",
    "...2....",
    "...2....",
    "...1....",
    "........",
  ],
  [
    "1.....1.",
    ".2...2..",
    "..2.2...",
    "...3....",
    "..2.2...",
    ".2...2..",
    "1.....1.",
    "........",
  ],
]
const CHIP: Bitmap = [".33.", "3123", "3223", ".33."]
const BRICK: Bitmap = [
  "33333333",
  "21112111",
  "21112111",
  "33333333",
  "11211121",
  "11211121",
  "33333333",
  "21112111",
]
const DUST: Bitmap[] = [
  [
    "........",
    "........",
    "........",
    "...11...",
    "..1221..",
    ".122221.",
    ".122221.",
    "..3333..",
  ],
  [
    "........",
    "........",
    "..1..1..",
    ".1.11.1.",
    "..1221..",
    ".1.22.1.",
    "..1..1..",
    "........",
  ],
]

/** The brick (Super Mario): four pieces of the thing fly off in arcs */
const brick: Pattern = {
  id: "brick",
  name: "レンガ割り (4 つの破片)",
  note:
    "マリオのレンガ。絵を 4 つに割った破片が、上の 2 つは高く、下の 2 つは低く、左右に放物線で飛ぶ。破片は数フレームごとに左右反転して回って見える。",
  ownsSprite: true,
  params: [
    DELAY,
    {
      key: "vx",
      label: "横の速さ (px/frame)",
      type: "num",
      min: 0,
      max: 3,
      step: 0.5,
      value: 1,
    },
    {
      key: "vyTop",
      label: "上の破片の跳ね (px/frame)",
      type: "num",
      min: 1,
      max: 8,
      step: 0.5,
      value: 5,
    },
    {
      key: "vyLow",
      label: "下の破片の跳ね (px/frame)",
      type: "num",
      min: 0,
      max: 8,
      step: 0.5,
      value: 3,
    },
    {
      key: "gravity",
      label: "重力 (px/frame²)",
      type: "num",
      min: 0.125,
      max: 1,
      step: 0.125,
      value: 0.375,
    },
    {
      key: "bias",
      label: "押した向きへの偏り (px/frame)",
      type: "num",
      min: 0,
      max: 2,
      step: 0.5,
      value: 0,
    },
    {
      key: "spin",
      label: "反転して回す (frame ごと、0 で回さない)",
      type: "num",
      min: 0,
      max: 8,
      step: 1,
      value: 4,
    },
    {
      key: "life",
      label: "寿命 (frame)",
      type: "num",
      min: 8,
      max: 60,
      step: 1,
      value: 32,
    },
    {
      key: "look",
      label: "破片の絵",
      type: "select",
      options: ["sprite", "brick"],
      value: "sprite",
    },
    ...COLORS("gray2", "gray3", "black"),
  ],
  create(p, ctx) {
    const s = ctx.sprite
    const [ox, oy] = spriteOrigin(ctx)
    const hw = Math.ceil(s.w / 2), hh = Math.ceil(s.h / 2)
    const [bx] = dirVec(ctx.dir)
    const bias = num(p, "bias") * bx
    const pieces = [0, 1, 2, 3].map((k) => {
      const right = k % 2 === 1, low = k >= 2
      return {
        sx: right ? hw : 0,
        sy: low ? hh : 0,
        x: ox + (right ? hw : 0),
        y: oy + (low ? hh : 0),
        vx: (right ? 1 : -1) * num(p, "vx") + bias,
        vy: -num(p, low ? "vyLow" : "vyTop"),
        right,
      }
    })
    const g = num(p, "gravity"), life = num(p, "life"), spin = num(p, "spin")
    const cs = colors3(p)
    let t = 0
    return delayed(num(p, "delay"), {
      step() {
        t++
        for (const q of pieces) {
          q.x += q.vx
          q.y += q.vy
          q.vy += g
        }
      },
      draw(painter) {
        if (t >= life) return
        const flip = spin > 0 && Math.floor(t / spin) % 2 === 1
        for (const q of pieces) {
          const x = Math.round(q.x), y = Math.round(q.y)
          if (p.look === "brick") {
            drawBitmap(painter, BRICK, x, y, cs, flip !== q.right)
          } else if (flip) {
            // the piece mirrored: drawn column by column, right to left
            for (let dx = 0; dx < hw; dx++) {
              drawSpritePart(
                painter,
                s,
                q.sx + hw - 1 - dx,
                q.sy,
                1,
                hh,
                x + dx,
                y,
              )
            }
          } else {
            drawSpritePart(painter, s, q.sx, q.sy, hw, hh, x, y)
          }
        }
      },
      get done() {
        return t >= life
      },
    })
  },
}

/** The puff (Zelda): the thing goes up in a 3-frame cloud */
const poof: Pattern = {
  id: "poof",
  name: "煙でポン (3 コマ)",
  note:
    "ゼルダで敵が消える時の煙。小さな煙 → 大きな煙 → 散った煙の 3 コマを、それぞれ数フレームずつ止めて見せる。コマを止める長さで重さが変わる。",
  params: [
    DELAY,
    {
      key: "hold",
      label: "1 コマの長さ (frame)",
      type: "num",
      min: 1,
      max: 12,
      step: 1,
      value: 6,
    },
    {
      key: "frames",
      label: "コマ数",
      type: "num",
      min: 1,
      max: 3,
      step: 1,
      value: 3,
    },
    ...COLORS("white", "gray2", "gray4"),
  ],
  create(p, ctx) {
    const hold = num(p, "hold"), frames = num(p, "frames")
    const cs = colors3(p)
    let t = 0
    return delayed(num(p, "delay"), {
      step() {
        t++
      },
      draw(painter) {
        const k = Math.floor(t / hold)
        if (k >= frames) return
        // with fewer frames, the later ones are skipped
        const frame = frames === 1 ? 1 : frames === 2 ? [0, 2][k] : k
        drawBitmap(painter, PUFF[frame], ctx.x, ctx.y, cs)
      },
      get done() {
        return t >= hold * frames
      },
    })
  },
}

/** The explosion (Mega Man): orbs flying out in 8 directions, pulsing */
const orbs: Pattern = {
  id: "orbs",
  name: "玉が八方に (爆発)",
  note:
    "ロックマンがやられた時のように、8x8 の玉が 8 方向へ一定の速さで飛ぶ。玉は 2 コマで脈打つ。内側にもう一周 (半分の速さ) 足すと 16 個になり、ちらつく。",
  params: [
    DELAY,
    {
      key: "speed",
      label: "速さ (px/frame)",
      type: "num",
      min: 0.5,
      max: 3,
      step: 0.5,
      value: 1.5,
    },
    {
      key: "rings",
      label: "周の数",
      type: "select",
      options: ["1", "2"],
      value: "1",
    },
    {
      key: "pulse",
      label: "脈打つ間隔 (frame)",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: 4,
    },
    {
      key: "life",
      label: "寿命 (frame)",
      type: "num",
      min: 8,
      max: 60,
      step: 1,
      value: 30,
    },
    FLICKER,
    ...COLORS("white", "gray2", "gray4"),
  ],
  create(p, ctx) {
    const cx = ctx.x + CELL / 2 - 4, cy = ctx.y + CELL / 2 - 4
    const list: { vx: number; vy: number }[] = []
    const speed = num(p, "speed")
    for (let ring = 0; ring < Number(p.rings); ring++) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        // 8 directions at the same speed on each axis (as on the NES)
        const v = speed / (ring + 1)
        list.push({
          vx: Math.round(Math.cos(a)) * v,
          vy: Math.round(Math.sin(a)) * v,
        })
      }
    }
    const life = num(p, "life"), pulse = num(p, "pulse")
    const cs = colors3(p)
    let t = 0
    return delayed(num(p, "delay"), {
      step() {
        t++
      },
      draw(painter) {
        if (t >= life) return
        const frame = Math.floor(t / pulse) % 2
        list.forEach((o, k) => {
          if (!shown(p, k, list.length, t)) return
          drawBitmap(
            painter,
            ORB[frame],
            cx + Math.round(o.vx * t),
            cy + Math.round(o.vy * t),
            cs,
          )
        })
      },
      get done() {
        return t >= life
      },
    })
  },
}

/** The hit spark: one star where the blow landed, switching shape */
const star: Pattern = {
  id: "star",
  name: "当たりの星",
  note:
    "当たった所 (押した側の縁) に 8x8 の星を 1 つ。十字と × を交互に出す。小さいが「当たった」が一番伝わる。",
  params: [
    DELAY,
    {
      key: "swap",
      label: "形を替える間隔 (frame)",
      type: "num",
      min: 1,
      max: 6,
      step: 1,
      value: 2,
    },
    {
      key: "life",
      label: "寿命 (frame)",
      type: "num",
      min: 2,
      max: 24,
      step: 1,
      value: 8,
    },
    {
      key: "at",
      label: "出る所",
      type: "select",
      options: ["edge", "center"],
      value: "edge",
    },
    ...COLORS("white", "gray2", "gray4"),
  ],
  create(p, ctx) {
    const [vx, vy] = dirVec(ctx.dir)
    // the edge the blow came from, at the cell's middle
    const x = ctx.x + 4 + (p.at === "edge" ? -vx * 8 : 0)
    const y = ctx.y + 4 + (p.at === "edge" ? -vy * 8 : 0)
    const swap = num(p, "swap"), life = num(p, "life")
    const cs = colors3(p)
    let t = 0
    return delayed(num(p, "delay"), {
      step() {
        t++
      },
      draw(painter) {
        if (t >= life) return
        drawBitmap(painter, STAR[Math.floor(t / swap) % 2], x, y, cs)
      },
      get done() {
        return t >= life
      },
    })
  },
}

/** The palette swap: the thing redrawn in other colors, a few times */
const palette: Pattern = {
  id: "palette",
  name: "パレット点滅",
  note:
    "NES は色を差し替えて光らせる。白で塗る・グレーを反転する・白と反転を交互にする。差し替えの間隔と回数で、軽い当たりから大きな被弾まで。",
  ownsSprite: true,
  params: [
    DELAY,
    {
      key: "mode",
      label: "差し替え方",
      type: "select",
      options: ["white", "invert", "white-invert", "black"],
      value: "white",
    },
    {
      key: "period",
      label: "差し替える長さ (frame)",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: 2,
    },
    {
      key: "times",
      label: "回数",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: 2,
    },
    {
      key: "after",
      label: "後に絵を残す",
      type: "select",
      options: ["no", "yes"],
      value: "no",
    },
  ],
  create(p, ctx) {
    const s = ctx.sprite
    const [ox, oy] = spriteOrigin(ctx)
    const period = num(p, "period"), times = num(p, "times")
    const total = period * 2 * times
    const white = (c: PaletteColor) => c === Palette.black ? c : Palette.white
    const black = (c: PaletteColor) =>
      c === Palette.black ? Palette.gray4 : Palette.black
    let t = 0
    return delayed(num(p, "delay"), {
      step() {
        t++
      },
      draw(painter) {
        if (t >= total) {
          if (p.after === "yes") {
            drawSpritePart(painter, s, 0, 0, s.w, s.h, ox, oy)
          }
          return
        }
        const k = Math.floor(t / period)
        if (k % 2 === 1) {
          drawSpritePart(painter, s, 0, 0, s.w, s.h, ox, oy)
          return
        }
        const map = p.mode === "invert"
          ? invert
          : p.mode === "black"
          ? black
          : p.mode === "white-invert" && (k / 2) % 2 === 1
          ? invert
          : white
        drawSpritePart(painter, s, 0, 0, s.w, s.h, ox, oy, map)
      },
      get done() {
        return t >= total
      },
    })
  },
}

/** Blinking out: drawn on some frames only, then gone */
const blink: Pattern = {
  id: "blink",
  name: "点滅して消える",
  note:
    "絵を数フレームおきに出したり消したりして、最後に消す。消える物の定番。",
  ownsSprite: true,
  params: [
    DELAY,
    {
      key: "on",
      label: "見える (frame)",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: 2,
    },
    {
      key: "off",
      label: "消える (frame)",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: 2,
    },
    {
      key: "frames",
      label: "点滅の長さ (frame)",
      type: "num",
      min: 4,
      max: 90,
      step: 2,
      value: 32,
    },
    {
      key: "speedup",
      label: "最後に速くなる",
      type: "select",
      options: ["no", "yes"],
      value: "no",
    },
  ],
  create(p, ctx) {
    const s = ctx.sprite
    const [ox, oy] = spriteOrigin(ctx)
    const frames = num(p, "frames")
    let t = 0
    return delayed(num(p, "delay"), {
      step() {
        t++
      },
      draw(painter) {
        if (t >= frames) return
        const fast = p.speedup === "yes" && t > frames / 2
        const on = fast ? 1 : num(p, "on"), off = fast ? 1 : num(p, "off")
        if (t % (on + off) < on) {
          drawSpritePart(painter, s, 0, 0, s.w, s.h, ox, oy)
        }
      },
      get done() {
        return t >= frames
      },
    })
  },
}

/** Chips: a handful of small pieces bouncing once, then blinking out */
const chips: Pattern = {
  id: "chips",
  name: "かけら (はねて点滅)",
  note:
    "4x4 のかけらが決まった向きに飛び、床で 1 回はねて、点滅して消える。数は 8 個まで。向きは左右対称で、乱数は使わない (NES 風)。",
  params: [
    DELAY,
    {
      key: "count",
      label: "数",
      type: "select",
      options: ["2", "4", "6", "8"],
      value: "4",
    },
    {
      key: "vx",
      label: "横の速さ (px/frame)",
      type: "num",
      min: 0.5,
      max: 3,
      step: 0.5,
      value: 1,
    },
    {
      key: "vy",
      label: "跳ね (px/frame)",
      type: "num",
      min: 1,
      max: 6,
      step: 0.5,
      value: 3,
    },
    {
      key: "gravity",
      label: "重力 (px/frame²)",
      type: "num",
      min: 0.125,
      max: 1,
      step: 0.125,
      value: 0.375,
    },
    {
      key: "bounce",
      label: "床ではねる",
      type: "select",
      options: ["yes", "no"],
      value: "yes",
    },
    {
      key: "life",
      label: "寿命 (frame)",
      type: "num",
      min: 8,
      max: 60,
      step: 1,
      value: 36,
    },
    ...COLORS("gray2", "gray3", "black"),
  ],
  create(p, ctx) {
    const n = Number(p.count)
    const floor = ctx.y + CELL - 4
    const list = Array.from({ length: n }, (_, k) => {
      const side = k % 2 === 0 ? -1 : 1
      const tier = Math.floor(k / 2)
      return {
        x: ctx.x + 6 + side * 2,
        y: ctx.y + 6,
        vx: side * num(p, "vx") * (1 + tier * 0.5),
        vy: -num(p, "vy") + tier * 0.5,
        bounced: false,
      }
    })
    const g = num(p, "gravity"), life = num(p, "life")
    const cs = colors3(p)
    let t = 0
    return delayed(num(p, "delay"), {
      step() {
        t++
        for (const c of list) {
          if (c.vy === 0 && c.y >= floor) continue
          c.x += c.vx
          c.y += c.vy
          c.vy += g
          if (c.y >= floor && c.vy > 0) {
            c.y = floor
            if (p.bounce === "yes" && !c.bounced) {
              c.bounced = true
              c.vy = -Math.max(1, Math.floor(c.vy * 0.5))
            } else {
              c.vx = 0
              c.vy = 0
            }
          }
        }
      },
      draw(painter) {
        if (t >= life) return
        // the last quarter: blinking
        if (t > life * 0.75 && t % 4 < 2) return
        for (const c of list) {
          drawBitmap(painter, CHIP, Math.round(c.x), Math.round(c.y), cs)
        }
      },
      get done() {
        return t >= life
      },
    })
  },
}

/** Landing dust: two little puffs running along the ground */
const dustPuffs: Pattern = {
  id: "dust",
  name: "土ぼこり (左右へ)",
  note:
    "重い物が落ちた・崩れた時に、床の高さで左右に小さな煙が 2 つ走る。2 コマで形が変わる。",
  params: [
    DELAY,
    {
      key: "speed",
      label: "速さ (px/frame)",
      type: "num",
      min: 0.5,
      max: 2,
      step: 0.5,
      value: 1,
    },
    {
      key: "hold",
      label: "1 コマの長さ (frame)",
      type: "num",
      min: 2,
      max: 12,
      step: 1,
      value: 6,
    },
    ...COLORS("gray1", "gray2", "gray3"),
  ],
  create(p, ctx) {
    const speed = num(p, "speed"), hold = num(p, "hold")
    const cs = colors3(p)
    let t = 0
    return delayed(num(p, "delay"), {
      step() {
        t++
      },
      draw(painter) {
        const k = Math.floor(t / hold)
        if (k >= 2) return
        const d = Math.round(t * speed)
        drawBitmap(painter, DUST[k], ctx.x - 4 - d, ctx.y + 8, cs)
        drawBitmap(painter, DUST[k], ctx.x + 12 + d, ctx.y + 8, cs, true)
      },
      get done() {
        return t >= hold * 2
      },
    })
  },
}

/** What was inside: a coin pops up spinning, then sparkles away */
const coin: Pattern = {
  id: "coin",
  name: "中身が飛び出す (コイン)",
  note:
    "マリオの ? ブロックのコイン。回りながら上がって、少し落ちた所で星になって消える。回転は幅の違う 4 コマ。",
  params: [
    DELAY,
    {
      key: "vy",
      label: "飛び出す速さ (px/frame)",
      type: "num",
      min: 2,
      max: 8,
      step: 0.5,
      value: 5,
    },
    {
      key: "gravity",
      label: "重力 (px/frame²)",
      type: "num",
      min: 0.125,
      max: 1,
      step: 0.125,
      value: 0.375,
    },
    {
      key: "spin",
      label: "1 コマの長さ (frame)",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: 3,
    },
    ...COLORS("yellow1", "yellow2", "black"),
  ],
  create(p, ctx) {
    const x0 = ctx.x + 4, y0 = ctx.y + 1
    const g = num(p, "gravity"), spin = num(p, "spin")
    const cs = colors3(p)
    let y = 0, vy = -num(p, "vy"), t = 0, sparkle = -1
    return delayed(num(p, "delay"), {
      step() {
        t++
        if (sparkle >= 0) {
          sparkle++
          return
        }
        y += vy
        vy += g
        // back down a little: it turns into a sparkle
        if (vy > 0 && y > -12) sparkle = 0
      },
      draw(painter) {
        const top = y0 + Math.round(y)
        if (sparkle >= 0) {
          if (sparkle < 8) {
            drawBitmap(
              painter,
              STAR[Math.floor(sparkle / 2) % 2],
              x0,
              top + 3,
              [Palette.white, cs[0], cs[1]],
            )
          }
          return
        }
        // the coin: an upright oval, its width by the spin frame
        const half = [3.5, 2.5, 0.5, 2.5][Math.floor(t / spin) % 4]
        for (let dy = 0; dy < 14; dy++) {
          const ey = (dy + 0.5 - 7) / 7
          const w = Math.round(half * Math.sqrt(Math.max(0, 1 - ey * ey)) * 2)
          if (w <= 0) continue
          const left = x0 + 4 - Math.ceil(w / 2)
          for (let dx = 0; dx < w; dx++) {
            const edge = dx === 0 || dx === w - 1 || dy === 0 || dy === 13
            painter.rect(
              left + dx,
              top + dy,
              1,
              1,
              edge ? cs[2] : dx === 1 ? cs[0] : cs[1],
            )
          }
        }
      },
      get done() {
        return sparkle >= 8
      },
    })
  },
}

/** All the patterns, in the order they are drawn (later on top) */
export const PATTERNS: Pattern[] = [
  dustPuffs,
  palette,
  blink,
  wipe,
  brick,
  sweep,
  poof,
  chips,
  orbs,
  coin,
  star,
]

/** The settings of the whole break: each pattern's switch and params */
export type Recipe = {
  /** Frames the world holds still after the hit (the hit-stop) */
  stop: number
  /** Frames the view shakes, and by how many pixels */
  shake: number
  shakeAmp: number
  /** With no pattern owning the sprite: the frame the sprite vanishes */
  vanish: number
  /** The effects move every this many frames (1: 60 fps, 4: 15 fps) */
  rate: number
  layers: Record<string, { on: boolean; params: Params }>
}

/** The default params of a pattern */
export function defaults(pattern: Pattern): Params {
  return Object.fromEntries(pattern.params.map((s) => [s.key, s.value]))
}

/** A recipe with only the given patterns on (others at their defaults) */
export function recipe(
  on: Record<string, Params>,
  global: Partial<Omit<Recipe, "layers">> = {},
): Recipe {
  return {
    stop: 0,
    shake: 0,
    shakeAmp: 1,
    vanish: 0,
    rate: 1,
    ...global,
    layers: Object.fromEntries(
      PATTERNS.map((pt) => [pt.id, {
        on: pt.id in on,
        params: { ...defaults(pt), ...(on[pt.id] ?? {}) },
      }]),
    ),
  }
}

/** Starting points to compare: the game's current one, and NES-like ones */
export const PRESETS: { name: string; note: string; recipe: Recipe }[] = [
  {
    name: "現行: 木箱",
    note: "いまのゲームの木箱・壺: スイープ線 + ワイプ (比べる用)",
    recipe: recipe({ sweep: {}, wipe: {} }),
  },
  {
    name: "レンガ割り",
    note: "マリオ: 当たりの星と、4 つに割れて放物線で飛ぶ破片",
    recipe: recipe({ star: { life: 4 }, brick: {} }, { stop: 2 }),
  },
  {
    name: "煙でポン",
    note: "ゼルダ: 白く光ってから、3 コマの煙で消える",
    recipe: recipe({
      palette: { mode: "white", period: 2, times: 1 },
      poof: { delay: 4 },
    }),
  },
  {
    name: "爆発",
    note: "ロックマン: 白黒反転して、8 方向に玉が飛ぶ (16 個でちらつく)",
    recipe: recipe(
      {
        palette: { mode: "white-invert", period: 2, times: 2 },
        orbs: { delay: 8, rings: "2" },
      },
      { stop: 4, shake: 8 },
    ),
  },
  {
    name: "壺が割れる",
    note: "星 → 煙 → かけらが左右にはねて点滅して消える",
    recipe: recipe({
      star: { life: 6 },
      poof: { hold: 4, frames: 2 },
      chips: { delay: 2, count: "4" },
    }, { stop: 2 }),
  },
  {
    name: "中身が出る",
    note: "煙の中からコインが回りながら飛び出す",
    recipe: recipe({ poof: { hold: 5 }, coin: { delay: 3 } }),
  },
  {
    name: "点滅して消える",
    note: "当たると点滅し、最後は速くなって消える",
    recipe: recipe({ blink: { frames: 40, speedup: "yes" } }),
  },
  {
    name: "被弾",
    note: "反転を 3 回、当たった所に星",
    recipe: recipe({
      palette: { mode: "invert", period: 3, times: 3, after: "yes" },
      star: {},
    }, { stop: 3 }),
  },
  {
    name: "重い物が崩れる",
    note: "長めの止めと揺れ、破片は重く低く、床に土ぼこり",
    recipe: recipe(
      {
        brick: { vyTop: 3, vyLow: 1.5, gravity: 0.5, vx: 0.5 },
        dust: { delay: 2 },
      },
      { stop: 6, shake: 12, shakeAmp: 2 },
    ),
  },
  {
    name: "15 fps のレンガ",
    note: "同じレンガ割りを 4 フレームに 1 回だけ動かす (カクカク感)",
    recipe: recipe({ star: { life: 4 }, brick: {} }, { stop: 2, rate: 4 }),
  },
]

/**
 * One break played out: the patterns of a recipe, the hit-stop and the
 * shake, stepped together. `spriteVisible` tells whether the sprite is
 * drawn as is (no pattern owns it, and it hasn't vanished yet).
 */
export class BreakRun {
  readonly layers: FxInstance[]
  readonly ownsSprite: boolean
  frame = 0
  #stop: number
  #shake: number
  #tick = 0
  #recipe: Recipe
  constructor(r: Recipe, ctx: FxContext) {
    this.#recipe = r
    const on = PATTERNS.filter((pt) => r.layers[pt.id]?.on)
    this.layers = on.map((pt) => pt.create(r.layers[pt.id].params, ctx))
    this.ownsSprite = on.some((pt) => pt.ownsSprite)
    this.#stop = r.stop
    this.#shake = r.shake
  }
  step() {
    this.frame++
    if (this.#shake > 0) this.#shake--
    if (this.#stop > 0) {
      // the hit-stop: nothing moves
      this.#stop--
      return
    }
    // a lower frame rate: the effects move every `rate` frames only
    if (this.#tick++ % Math.max(1, this.#recipe.rate ?? 1) !== 0) return
    for (const l of this.layers) l.step()
  }
  draw(p: Painter) {
    for (const l of this.layers) l.draw(p)
  }
  get spriteVisible(): boolean {
    return !this.ownsSprite && this.frame < this.#recipe.vanish
  }
  /** The view offset of the shake this frame (whole pixels) */
  get shakeOffset(): [number, number] {
    if (this.#shake <= 0) return [0, 0]
    const a = this.#recipe.shakeAmp
    const k = this.#shake % 4
    return [k === 0 ? a : k === 2 ? -a : 0, k === 1 ? a : k === 3 ? -a : 0]
  }
  get done(): boolean {
    return this.#stop <= 0 && this.#shake <= 0 &&
      this.layers.every((l) => l.done)
  }
}

/** A seeded 0..1 random source (mulberry32) */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
