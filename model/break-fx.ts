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
  /**
   * current: what the game does now; calm: few moves, nothing out of
   * nothing; nes: the earlier NES-like candidates (lots of motion)
   */
  group: "current" | "calm" | "nes"
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
  group: "current",
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
  group: "current",
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
    {
      key: "slow",
      label: "減速 (0 = 一定、大きいほど後半がゆっくり)",
      type: "num",
      min: 0,
      max: 4,
      step: 0.5,
      value: 0,
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
    const slow = num(p, "slow")
    let last: number[] = []
    let n = 0
    let t = 0
    const [sx, sy] = spriteOrigin(ctx)
    // the line k goes at this frame: evenly, or slower and slower
    const at = (k: number) => (k + slow * k * k / along) / lines
    return delayed(num(p, "delay"), {
      step() {
        last = []
        t++
        for (; n < order.length && at(n) < t; n++) {
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
  group: "nes",
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
  group: "nes",
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
  group: "nes",
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
  group: "nes",
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
  group: "nes",
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
  group: "nes",
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
  group: "nes",
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
  group: "nes",
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
  group: "nes",
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

// ---------------------------------------------------------------------
// Calm patterns: few moves, and nothing out of nothing. They only use
// the pixels of the thing itself (and the lines the push already draws):
// they shift, cut, drop or turn them into lines, and things leave by
// going past an edge (the floor line of the cell) instead of popping out

/** One pixel of the thing, at an absolute position */
type Px = { x: number; y: number; c: PaletteColor }

/** The sprite's pixels where it stands on the cell */
function spritePixels(ctx: FxContext): Px[] {
  const [sx, sy] = spriteOrigin(ctx)
  const out: Px[] = []
  const s = ctx.sprite
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const c = s.px[y * s.w + x]
      if (c) out.push({ x: sx + x, y: sy + y, c })
    }
  }
  return out
}

function drawPx(p: Painter, list: Iterable<Px>) {
  for (const q of list) p.rect(q.x, q.y, 1, 1, q.c)
}

/**
 * The push as two axes: `along` grows in the push direction, `cross` runs
 * across it; `at` turns them back into x, y
 */
function axes(dir: Dir) {
  const [vx, vy] = dirVec(dir)
  const horizontal = vx !== 0
  return {
    vx,
    vy,
    along: (q: { x: number; y: number }) => q.x * vx + q.y * vy,
    cross: (q: { x: number; y: number }) => horizontal ? q.y : q.x,
    at: (a: number, c: number): [number, number] =>
      horizontal ? [a * vx, c] : [c, a * vy],
    /** Moves a pixel across the push by d */
    shiftCross(q: Px, d: number) {
      if (horizontal) q.y += d
      else q.x += d
    },
  }
}

/** The least and the most of the numbers (0, 0 for none) */
const range = (xs: number[]): [number, number] =>
  xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 0]

/** How a calm pattern ends, after it has done its move */
const ENDS = ["sink", "wipe", "wipe-far", "stay", "cut"] as const
const END_LABEL = "最後 (sink: 床へ沈む / wipe: 手前から 1 行ずつ / " +
  "wipe-far: 奥から / stay: しばらく残る / cut: その場で消える)"
function endParams(
  end: (typeof ENDS)[number],
  hold: number,
  rate: number,
): ParamSpec[] {
  return [
    {
      key: "hold",
      label: "最後の前に止める (frame)",
      type: "num",
      min: 0,
      max: 60,
      step: 1,
      value: hold,
    },
    { key: "end", label: END_LABEL, type: "select", options: ENDS, value: end },
    {
      key: "endRate",
      label: "最後の速さ (何 frame で 1 段)",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: rate,
    },
  ]
}

/** The floor line of the cell: pixels at or below it are not drawn */
const floorY = (ctx: FxContext) => ctx.y + CELL

/** The end of a calm pattern, played on the pixels it left */
function finisher(p: Params, ctx: FxContext, px: Px[]): FxInstance {
  const rate = num(p, "endRate")
  const ax = axes(ctx.dir)
  let list = px.slice()
  let t = 0
  let stay = 60
  return {
    step() {
      if (p.end === "cut") {
        list = []
        return
      }
      if (p.end === "stay") {
        if (--stay <= 0) list = []
        return
      }
      if (t++ % rate !== 0 || list.length === 0) return
      if (p.end === "sink") {
        // the whole thing goes 1px down; what passes the floor line is gone
        const fy = floorY(ctx)
        list = list.map((q) => ({ ...q, y: q.y + 1 })).filter((q) => q.y < fy)
      } else {
        // one line off, from the near side (wipe) or the far side
        const as = list.map(ax.along)
        const a = p.end === "wipe-far" ? Math.max(...as) : Math.min(...as)
        list = list.filter((q) => ax.along(q) !== a)
      }
    },
    draw(painter) {
      drawPx(painter, list)
    },
    get done() {
      return list.length === 0
    },
  }
}

/**
 * A calm pattern's run: its own move (`main`), then a hold, then the end.
 * `main.pixels` are the pixels it leaves for the end.
 */
function withEnd(
  p: Params,
  ctx: FxContext,
  main: FxInstance & { pixels(): Px[] },
): FxInstance {
  let hold = num(p, "hold")
  let end: FxInstance | null = null
  return delayed(num(p, "delay"), {
    step() {
      if (!main.done) main.step()
      else if (hold > 0) hold--
      else {
        end ??= finisher(p, ctx, main.pixels())
        end.step()
      }
    },
    draw(painter) {
      if (end) end.draw(painter)
      else main.draw(painter)
    },
    get done() {
      return !!end?.done
    },
  })
}

/** A frame counter that ticks every `rate` frames */
function every(rate: number) {
  let t = 0
  return () => t++ % Math.max(1, rate) === 0
}

/** 1. The top part slides along the push on a crack, and holds there */
const slip: Pattern = {
  id: "slip",
  group: "calm",
  name: "ずれて割れる",
  ownsSprite: true,
  note:
    "割れ目を境に、片側だけが押した向きへ数 px ずれて止まる。左右に押すと上半分が、上下に押すと右半分がずれる。新しい物は出ない。",
  params: [
    DELAY,
    {
      key: "cut",
      label: "割れ目の位置",
      type: "select",
      options: ["1/3", "1/2", "2/3"],
      value: "1/2",
    },
    {
      key: "shift",
      label: "ずれる幅 (px)",
      type: "num",
      min: 1,
      max: 4,
      step: 1,
      value: 2,
    },
    {
      key: "rate",
      label: "ずれる速さ (何 frame で 1px)",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: 3,
    },
    ...endParams("wipe", 12, 2),
  ],
  create(p, ctx) {
    const ax = axes(ctx.dir)
    const px = spritePixels(ctx)
    const horizontal = ax.vx !== 0
    const [lo, hi] = range(px.map((q) => horizontal ? q.y : q.x))
    const ratio = { "1/3": 1 / 3, "1/2": 1 / 2, "2/3": 2 / 3 }[
      String(p.cut)
    ] ?? 0.5
    const split = lo + Math.round((hi - lo + 1) * ratio)
    // left/right: the rows above the crack; up/down: the right columns
    const moving = px.filter((q) => horizontal ? q.y < split : q.x >= split)
    const shift = num(p, "shift")
    const tick = every(num(p, "rate"))
    let moved = 0
    return withEnd(p, ctx, {
      step() {
        if (!tick() || moved >= shift) return
        moved++
        for (const q of moving) {
          q.x += ax.vx
          q.y += ax.vy
        }
      },
      draw(painter) {
        drawPx(painter, px)
      },
      get done() {
        return moved >= shift
      },
      pixels: () => px,
    })
  },
}

/** 2. Rows drop out one by one, the top coming down: it is crushed */
const crush: Pattern = {
  id: "crush",
  group: "calm",
  name: "潰れる",
  ownsSprite: true,
  note:
    "1 行ずつ抜けて、上の部分が 1px ずつ下りてくる。下の行は床に着いたまま。重い物、上から押される物に。",
  params: [
    DELAY,
    {
      key: "row",
      label: "抜ける行",
      type: "select",
      options: ["top", "middle", "bottom"],
      value: "middle",
    },
    {
      key: "rate",
      label: "速さ (何 frame で 1 行)",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: 2,
    },
    {
      key: "keep",
      label: "残る高さ (px)",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: 3,
    },
    ...endParams("sink", 8, 3),
  ],
  create(p, ctx) {
    let px = spritePixels(ctx)
    const tick = every(num(p, "rate"))
    const keep = num(p, "keep")
    const rows = () => [...new Set(px.map((q) => q.y))].sort((a, b) => a - b)
    return withEnd(p, ctx, {
      step() {
        const ys = rows()
        if (!tick() || ys.length <= keep) return
        // the outline rows (top and bottom) stay; one inside goes
        const k = p.row === "top"
          ? 1
          : p.row === "bottom"
          ? ys.length - 2
          : Math.floor(ys.length / 2)
        const gone = ys[Math.max(0, Math.min(ys.length - 1, k))]
        px = px.filter((q) => q.y !== gone)
        for (const q of px) if (q.y < gone) q.y++
      },
      draw(painter) {
        drawPx(painter, px)
      },
      get done() {
        return rows().length <= keep
      },
      pixels: () => px,
    })
  },
}

/** 3 and 4. It sinks into the floor, all at once or a column at a time */
const sink: Pattern = {
  id: "sink",
  group: "calm",
  name: "沈む (列ごとにずり落ちる)",
  ownsSprite: true,
  note:
    "床の線の下へ 1px ずつ沈んでいく。消えるのではなく、マスの下端の向こうへ出ていく。列の遅れを付けると、列ごとにずり落ちて崩れる。",
  params: [
    DELAY,
    {
      key: "rate",
      label: "速さ (何 frame で 1px)",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: 2,
    },
    {
      key: "stagger",
      label: "列ごとの遅れ (frame、0 = 一緒に)",
      type: "num",
      min: 0,
      max: 8,
      step: 1,
      value: 0,
    },
    {
      key: "order",
      label: "先に落ちる列",
      type: "select",
      options: ["push", "center", "edges", "random"],
      value: "push",
    },
  ],
  create(p, ctx) {
    const px = spritePixels(ctx)
    const ax = axes(ctx.dir)
    const rate = num(p, "rate")
    const stagger = num(p, "stagger")
    const fy = floorY(ctx)
    const cols = [...new Set(px.map((q) => q.x))].sort((a, b) => a - b)
    const mid = (cols[0] + cols[cols.length - 1]) / 2
    const rank = new Map<number, number>()
    const order = cols.slice()
    switch (p.order) {
      case "push":
        // from the near side; pushed up or down: left to right
        if (ax.vx < 0) order.reverse()
        break
      case "center":
        order.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))
        break
      case "edges":
        order.sort((a, b) => Math.abs(b - mid) - Math.abs(a - mid))
        break
      case "random":
        for (let k = order.length - 1; k > 0; k--) {
          const m = Math.floor(ctx.rand() * (k + 1))
          ;[order[k], order[m]] = [order[m], order[k]]
        }
    }
    order.forEach((x, k) => rank.set(x, k))
    let t = 0
    const drop = (q: Px) =>
      Math.max(0, Math.floor((t - rank.get(q.x)! * stagger) / rate))
    const shown = () =>
      px.filter((q) => q.y + drop(q) < fy).map((q) => ({
        ...q,
        y: q.y + drop(q),
      }))
    return delayed(num(p, "delay"), {
      step() {
        t++
      },
      draw(painter) {
        drawPx(painter, shown())
      },
      get done() {
        return shown().length === 0
      },
    })
  },
}

/** 5. It slides on a few pixels with the push, then goes */
const nudge: Pattern = {
  id: "nudge",
  group: "calm",
  name: "押し出されて崩れる",
  ownsSprite: true,
  note:
    "押した向きに数 px 滑って止まり、それから崩れる (初期値は奥の端から 1 行ずつ)。押した手応えが残る。",
  params: [
    DELAY,
    {
      key: "dist",
      label: "滑る距離 (px)",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: 3,
    },
    {
      key: "rate",
      label: "滑る速さ (何 frame で 1px)",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: 1,
    },
    ...endParams("wipe-far", 6, 1),
  ],
  create(p, ctx) {
    const ax = axes(ctx.dir)
    const px = spritePixels(ctx)
    const dist = num(p, "dist")
    const tick = every(num(p, "rate"))
    let moved = 0
    return withEnd(p, ctx, {
      step() {
        if (!tick() || moved >= dist) return
        moved++
        for (const q of px) {
          q.x += ax.vx
          q.y += ax.vy
        }
      },
      draw(painter) {
        drawPx(painter, px)
      },
      get done() {
        return moved >= dist
      },
      pixels: () => px,
    })
  },
}

/** 6. Wiped a line at a time, each line going on as a line */
const unravel: Pattern = {
  id: "unravel",
  group: "calm",
  name: "消える行が線になる",
  ownsSprite: true,
  note:
    "ワイプで消える行が、そのまま 1px の線になって押した向きへ流れ、端から縮んで終わる。いまのワイプとスイープ線が 1 つの動きになる。",
  params: [
    DELAY,
    {
      key: "every",
      label: "1 行を消す間隔 (frame)",
      type: "num",
      min: 1,
      max: 6,
      step: 1,
      value: 2,
    },
    {
      key: "nth",
      label: "線にする行 (n 行に 1 本、他はただ消える)",
      type: "num",
      min: 1,
      max: 4,
      step: 1,
      value: 2,
    },
    {
      key: "speed",
      label: "線の速さ (px/frame)",
      type: "num",
      min: 1,
      max: 4,
      step: 1,
      value: 1,
    },
    {
      key: "travel",
      label: "縮み始めるまでの距離 (px)",
      type: "num",
      min: 0,
      max: 32,
      step: 1,
      value: 10,
    },
    {
      key: "shrink",
      label: "縮む速さ (両端から px/frame)",
      type: "num",
      min: 1,
      max: 4,
      step: 1,
      value: 1,
    },
    {
      key: "tone",
      label: "線の色",
      type: "select",
      options: ["own", "one"],
      value: "one",
    },
    {
      key: "color",
      label: "線の色 (one のとき)",
      type: "color",
      value: "gray4",
    },
  ],
  create(p, ctx) {
    const ax = axes(ctx.dir)
    let px = spritePixels(ctx)
    const lines = [...new Set(px.map(ax.along))].sort((a, b) => a - b)
    const tick = every(num(p, "every"))
    const nth = num(p, "nth"), speed = num(p, "speed")
    const travel = num(p, "travel"), shrink = num(p, "shrink")
    const one = p.tone === "one" ? color(p, "color") : null
    type Bar = { px: Px[]; moved: number }
    let bars: Bar[] = []
    let n = 0
    return delayed(num(p, "delay"), {
      step() {
        for (const b of bars) {
          if (b.moved >= travel) {
            // shrinks from both ends toward its middle
            for (let k = 0; k < shrink && b.px.length > 0; k++) {
              b.px.sort((a, c) => ax.cross(a) - ax.cross(c))
              b.px.pop()
              b.px.shift()
            }
          }
          for (const q of b.px) {
            q.x += ax.vx * speed
            q.y += ax.vy * speed
          }
          b.moved += speed
        }
        bars = bars.filter((b) => b.px.length > 0)
        if (n < lines.length && tick()) {
          const a = lines[n]
          const line = px.filter((q) => ax.along(q) === a)
          px = px.filter((q) => ax.along(q) !== a)
          if (n % nth === 0) {
            bars.push({
              px: line.map((q) => ({ ...q, c: one ?? q.c })),
              moved: 0,
            })
          }
          n++
        }
      },
      draw(painter) {
        drawPx(painter, px)
        for (const b of bars) drawPx(painter, b.px)
      },
      get done() {
        return n >= lines.length && bars.length === 0
      },
    })
  },
}

/** 7. The push's lines run on through the thing and cut it */
const pierce: Pattern = {
  id: "pierce",
  group: "calm",
  name: "押した線が貫く",
  ownsSprite: true,
  note:
    "押した時の線 (linePattern0) がそのまま伸びて物を通り抜け、線が通った所だけ絵が切れる。動くのは線だけ。切れた絵はそのあと沈む。",
  params: [
    DELAY,
    {
      key: "count",
      label: "線の本数",
      type: "num",
      min: 1,
      max: 5,
      step: 1,
      value: 3,
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
      key: "band",
      label: "切る幅 (px)",
      type: "num",
      min: 1,
      max: 2,
      step: 1,
      value: 1,
    },
    {
      key: "stagger",
      label: "外側の線の遅れ (frame)",
      type: "num",
      min: 0,
      max: 6,
      step: 1,
      value: 2,
    },
    {
      key: "over",
      label: "向こうへ抜ける長さ (px)",
      type: "num",
      min: 0,
      max: 16,
      step: 1,
      value: 6,
    },
    { key: "color", label: "線の色", type: "color", value: "white" },
    ...endParams("sink", 10, 2),
  ],
  create(p, ctx) {
    const ax = axes(ctx.dir)
    let px = spritePixels(ctx)
    const [a0, a1] = range(px.map(ax.along))
    const [c0, c1] = range(px.map(ax.cross))
    const count = num(p, "count"), speed = num(p, "speed")
    const band = num(p, "band"), over = num(p, "over")
    const stagger = num(p, "stagger"), c = color(p, "color")
    const mid = (count - 1) / 2
    // each line: where it runs across, its tip and its tail (along)
    const lines = Array.from({ length: count }, (_, k) => ({
      cross: c0 + Math.round((k + 1) * (c1 - c0) / (count + 1)),
      wait: Math.round(Math.abs(k - mid) * stagger),
      tip: a0 - 1,
      tail: a0 - 1,
    }))
    const end = a1 + over
    return withEnd(p, ctx, {
      step() {
        for (const l of lines) {
          if (l.wait > 0) {
            l.wait--
            continue
          }
          if (l.tip < end) l.tip = Math.min(end, l.tip + speed)
          else l.tail = Math.min(l.tip, l.tail + speed)
          // the tail is at most a cell behind the tip, as EffectLine0
          l.tail = Math.max(l.tail, l.tip - CELL)
          px = px.filter((q) => {
            const d = ax.cross(q) - l.cross
            return !(d >= 0 && d < band && ax.along(q) <= l.tip)
          })
        }
      },
      draw(painter) {
        drawPx(painter, px)
        for (const l of lines) {
          for (let a = l.tail + 1; a <= l.tip; a++) {
            for (let k = 0; k < band; k++) {
              const [x, y] = ax.at(a, l.cross + k)
              painter.rect(x, y, 1, 1, c)
            }
          }
        }
      },
      get done() {
        return lines.every((l) => l.tip >= end && l.tail >= l.tip)
      },
      pixels: () => px,
    })
  },
}

/** 8. A crack runs through it, then the halves part a pixel or two */
const crack: Pattern = {
  id: "crack",
  group: "calm",
  name: "割れ目が走る",
  ownsSprite: true,
  note:
    "1px の割れ目が、押した側から向こうへ線の先端のように伸びる。走り切ったら、割れ目をはさんだ 2 つの半分が 1px ずつ開く。",
  params: [
    DELAY,
    {
      key: "rate",
      label: "割れ目の速さ (何 frame で 1px)",
      type: "num",
      min: 1,
      max: 4,
      step: 1,
      value: 1,
    },
    {
      key: "jag",
      label: "ギザギザ (0 = まっすぐ)",
      type: "num",
      min: 0,
      max: 1,
      step: 0.25,
      value: 0.5,
    },
    { key: "color", label: "割れ目の色", type: "color", value: "black" },
    {
      key: "open",
      label: "開く幅 (片側 px)",
      type: "num",
      min: 0,
      max: 3,
      step: 1,
      value: 1,
    },
    {
      key: "openRate",
      label: "開く速さ (何 frame で 1px)",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: 4,
    },
    ...endParams("sink", 10, 2),
  ],
  create(p, ctx) {
    const ax = axes(ctx.dir)
    const px = spritePixels(ctx)
    const [a0, a1] = range(px.map(ax.along))
    const [c0, c1] = range(px.map(ax.cross))
    const jag = num(p, "jag")
    // the crack's cross position at each along, from the near side
    const path: number[] = []
    let cc = Math.round((c0 + c1) / 2)
    for (let a = a0; a <= a1; a++) {
      if (ctx.rand() < jag) cc += ctx.rand() < 0.5 ? -1 : 1
      cc = Math.max(c0 + 2, Math.min(c1 - 2, cc))
      path.push(cc)
    }
    const onCrack = (q: Px) => path[ax.along(q) - a0] === ax.cross(q)
    const cut = px.filter((q) => !onCrack(q))
    const crackColor = color(p, "color")
    const grow = every(num(p, "rate"))
    const opening = every(num(p, "openRate"))
    const open = num(p, "open")
    let reach = 0
    let opened = 0
    return withEnd(p, ctx, {
      step() {
        if (reach < path.length) {
          if (grow()) reach++
          return
        }
        if (opened >= open || !opening()) return
        opened++
        for (const q of cut) {
          ax.shiftCross(q, ax.cross(q) < path[ax.along(q) - a0] ? -1 : 1)
        }
      },
      draw(painter) {
        if (opened > 0) {
          drawPx(painter, cut)
          return
        }
        // the crack is drawn on the thing only (over its own pixels)
        drawPx(
          painter,
          px.map((q) =>
            onCrack(q) && ax.along(q) - a0 < reach ? { ...q, c: crackColor } : q
          ),
        )
      },
      get done() {
        return reach >= path.length && opened >= open
      },
      pixels: () => opened > 0 ? cut : px,
    })
  },
}

/** 9. Its pixels come loose and fall like sand into a heap */
const sift: Pattern = {
  id: "sift",
  group: "calm",
  name: "砂になる",
  ownsSprite: true,
  note:
    "絵のピクセルが上から順にほどけて、1px ずつ落ちて床に山を作る。新しいピクセルは 1 つも出ない。山はそのあと沈む (stay にすると、がれきの山が残る)。",
  params: [
    DELAY,
    {
      key: "from",
      label: "ほどける順",
      type: "select",
      options: ["top", "push", "random"],
      value: "top",
    },
    {
      key: "spread",
      label: "ほどけ終わるまで (frame)",
      type: "num",
      min: 0,
      max: 40,
      step: 1,
      value: 16,
    },
    {
      key: "rate",
      label: "落ちる速さ (何 frame で 1px)",
      type: "num",
      min: 1,
      max: 4,
      step: 1,
      value: 1,
    },
    {
      key: "slide",
      label: "斜めに崩れて山になる",
      type: "select",
      options: ["yes", "no"],
      value: "yes",
    },
    ...endParams("sink", 16, 3),
  ],
  create(p, ctx) {
    const ax = axes(ctx.dir)
    const px = spritePixels(ctx)
    const fy = floorY(ctx)
    const spread = num(p, "spread")
    const [y0, y1] = range(px.map((q) => q.y))
    const [a0, a1] = range(px.map(ax.along))
    const loose = new Map<Px, number>()
    for (const q of px) {
      const k = p.from === "random"
        ? ctx.rand()
        : p.from === "push"
        ? (ax.along(q) - a0) / Math.max(1, a1 - a0)
        : (q.y - y0) / Math.max(1, y1 - y0)
      loose.set(q, Math.round(k * spread + ctx.rand() * 3))
    }
    const key = (x: number, y: number) => `${x},${y}`
    const taken = new Set(px.map((q) => key(q.x, q.y)))
    const free = (x: number, y: number) => y < fy && !taken.has(key(x, y))
    const tick = every(num(p, "rate"))
    let t = 0
    let still = false
    return withEnd(p, ctx, {
      step() {
        if (!tick()) return
        t++
        let moved = false
        // the bottom ones first, so a column falls together
        for (const q of px.slice().sort((a, b) => b.y - a.y)) {
          if (t < loose.get(q)!) continue
          let to: [number, number] | null = null
          if (free(q.x, q.y + 1)) to = [q.x, q.y + 1]
          else if (p.slide === "yes") {
            const s = ctx.rand() < 0.5 ? 1 : -1
            for (const d of [s, -s]) {
              if (free(q.x + d, q.y + 1) && free(q.x + d, q.y)) {
                to = [q.x + d, q.y + 1]
                break
              }
            }
          }
          if (!to) continue
          taken.delete(key(q.x, q.y))
          ;[q.x, q.y] = to
          taken.add(key(q.x, q.y))
          moved = true
        }
        still = !moved && t > spread + 3
      },
      draw(painter) {
        drawPx(painter, px)
      },
      get done() {
        return still
      },
      pixels: () => px,
    })
  },
}

/** The palette color one shade darker (or lighter) in its own hue */
export function shade(c: PaletteColor, darker: boolean): PaletteColor {
  const name = (Object.keys(Palette) as PaletteName[]).find((k) =>
    Palette[k] === c
  )
  if (!name) return c
  if (name === "white") return darker ? Palette.gray1 : c
  if (name === "black") return darker ? c : Palette.gray4
  const m = name.match(/^([a-z]+)(\d)$/)
  if (!m) return c
  const k = Number(m[2]) + (darker ? 1 : -1)
  if (k > 4) return Palette.black
  if (k < 1) return Palette.white
  return Palette[`${m[1]}${k}` as PaletteName] ?? c
}

/** 11. The colors step down their own ramp, as the NES fades out */
const dim: Pattern = {
  id: "dim",
  group: "calm",
  name: "色を段階的に落とす",
  ownsSprite: true,
  note:
    "数 frame ごとに、絵の色をパレットの同じ色相で 1 段ずつ暗く (明るく) する。NES のフェードアウトのやり方。パレットの色しか使わないが、「フェードを使わない」に当たるかは要判断。",
  params: [
    DELAY,
    {
      key: "toward",
      label: "向き",
      type: "select",
      options: ["dark", "light"],
      value: "dark",
    },
    {
      key: "period",
      label: "1 段の長さ (frame)",
      type: "num",
      min: 1,
      max: 12,
      step: 1,
      value: 4,
    },
    {
      key: "steps",
      label: "段数",
      type: "num",
      min: 1,
      max: 5,
      step: 1,
      value: 5,
    },
    ...endParams("sink", 4, 2),
  ],
  create(p, ctx) {
    const px = spritePixels(ctx)
    const tick = every(num(p, "period"))
    const steps = num(p, "steps")
    const darker = p.toward !== "light"
    let n = 0
    let first = true
    return withEnd(p, ctx, {
      step() {
        // the first frame holds the colors as they are
        if (!tick() || first) {
          first = false
          return
        }
        if (n >= steps) return
        n++
        for (const q of px) q.c = shade(q.c, darker)
      },
      draw(painter) {
        drawPx(painter, px)
      },
      get done() {
        return n >= steps
      },
      pixels: () => px,
    })
  },
}

/** All the patterns, in the order they are drawn (later on top) */
export const PATTERNS: Pattern[] = [
  dustPuffs,
  palette,
  blink,
  wipe,
  slip,
  crush,
  sink,
  nudge,
  unravel,
  pierce,
  crack,
  sift,
  dim,
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

/** Starting points to compare: the game's current one, and calm ones */
export const PRESETS: { name: string; note: string; recipe: Recipe }[] = [
  {
    name: "現行: 木箱",
    note: "いまのゲームの木箱・壺: スイープ線 + ワイプ (比べる用)",
    recipe: recipe({ sweep: {}, wipe: {} }),
  },
  {
    name: "ずれて割れる",
    note: "上半分が 2px ずれて止まり、手前から 1 行ずつ消える",
    recipe: recipe({ slip: {} }, { stop: 2 }),
  },
  {
    name: "潰れる",
    note: "1 行ずつ抜けて低くなり、残りが床へ沈む",
    recipe: recipe({ crush: {} }, { stop: 3 }),
  },
  {
    name: "沈む",
    note: "そのまま床の線の下へ沈んでいく",
    recipe: recipe({ sink: { rate: 2 } }),
  },
  {
    name: "列ごとにずり落ちる",
    note: "押した側の列から順に遅れて沈む",
    recipe: recipe({ sink: { rate: 1, stagger: 2, order: "push" } }),
  },
  {
    name: "押し出されて崩れる",
    note: "3px 滑って止まり、奥の端から 1 行ずつ消える",
    recipe: recipe({ nudge: {} }),
  },
  {
    name: "消える行が線になる",
    note: "ワイプで消える行が線になって流れ、縮んで終わる",
    recipe: recipe({ unravel: {} }),
  },
  {
    name: "押した線が貫く",
    note: "押した線が物を通り抜けて切り、切れた絵が沈む",
    recipe: recipe({ pierce: {} }, { stop: 2 }),
  },
  {
    name: "割れ目が走る",
    note: "割れ目が伸びて、2 つに 1px ずつ開き、沈む",
    recipe: recipe({ crack: {} }, { stop: 2 }),
  },
  {
    name: "砂になる",
    note: "上からほどけて落ち、床に山を作ってから沈む",
    recipe: recipe({ sift: {} }),
  },
  {
    name: "がれきが残る",
    note: "潰れて低くなった物が、そのまましばらく残る",
    recipe: recipe({ crush: { keep: 4, end: "stay" } }, { stop: 3 }),
  },
  {
    name: "色を落とす",
    note: "同じ色相で 1 段ずつ暗くなり、黒くなって沈む (要判断)",
    recipe: recipe({ dim: {} }),
  },
  {
    name: "止め + 揺れ + 減速ワイプ",
    note: "新しい物を足さず、時間の配分だけで重さを出す",
    recipe: recipe({ wipe: { slow: 2 } }, { stop: 6, shake: 6 }),
  },
]

/** The pixels on screen in one frame: "x,y" to color */
export type Frame = Map<string, PaletteColor>

/** A painter that records the pixels it is given */
export function capture(frame: Frame): Painter {
  return {
    rect(x, y, w, h, c) {
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) frame.set(`${i},${j}`, c)
      }
    },
  }
}

/**
 * How much moves on screen: pixels that changed, and pixels that came
 * out of nothing (no pixel of the frame before within 1px) or went into
 * nothing (no pixel of the next frame within 1px)
 */
export class MotionMeter {
  frames = 0
  changed = 0
  maxChanged = 0
  appeared = 0
  vanished = 0
  #prev: Frame
  constructor(first: Frame) {
    this.#prev = first
  }
  add(cur: Frame) {
    const prev = this.#prev
    const near = (f: Frame, key: string) => {
      const [x, y] = key.split(",").map(Number)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (f.has(`${x + dx},${y + dy}`)) return true
        }
      }
      return false
    }
    let changed = 0
    for (const [k, c] of cur) {
      if (prev.get(k) !== c) changed++
      if (!prev.has(k) && !near(prev, k)) this.appeared++
    }
    for (const k of prev.keys()) {
      if (!cur.has(k)) changed++
      if (!cur.has(k) && !near(cur, k)) this.vanished++
    }
    this.frames++
    this.changed += changed
    this.maxChanged = Math.max(this.maxChanged, changed)
    this.#prev = cur
  }
}

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
  /** How much moved on screen so far (the thing and the effects) */
  readonly motion: MotionMeter
  #ctx: FxContext
  constructor(r: Recipe, ctx: FxContext) {
    this.#recipe = r
    this.#ctx = ctx
    const on = PATTERNS.filter((pt) => r.layers[pt.id]?.on)
    this.layers = on.map((pt) => pt.create(r.layers[pt.id].params, ctx))
    this.ownsSprite = on.some((pt) => pt.ownsSprite)
    this.#stop = r.stop
    this.#shake = r.shake
    // the thing standing there, before the break
    const first: Frame = new Map()
    drawPx(capture(first), spritePixels(ctx))
    this.motion = new MotionMeter(first)
  }
  /** This frame's pixels (the thing as is, and the effects; no shake) */
  frameNow(): Frame {
    const f: Frame = new Map()
    const p = capture(f)
    if (this.spriteVisible) drawPx(p, spritePixels(this.#ctx))
    this.draw(p)
    return f
  }
  step() {
    this.#step()
    this.motion.add(this.frameNow())
  }
  #step() {
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
