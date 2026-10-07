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

/** The opaque pixels of the sprite */
function pixelsOf(s: SpriteData): { x: number; y: number; c: PaletteColor }[] {
  const out: { x: number; y: number; c: PaletteColor }[] = []
  s.px.forEach((c, k) => {
    if (c) out.push({ x: k % s.w, y: Math.floor(k / s.w), c })
  })
  return out
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

/** The 4x4 Bayer matrix (0..15) */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

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

/** The game's linePattern0: streaks shooting from the cell edges */
const streaks: Pattern = {
  id: "streaks",
  name: "流れ線 (現行のバネ・滑り)",
  note:
    "セルの縁から細い線が飛ぶ。真ん中の線ほど速い (p0)。押した向き・逆・四方を選べる。",
  params: [
    DELAY,
    {
      key: "lines",
      label: "1 辺の線の数",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: 5,
    },
    {
      key: "base",
      label: "基本の速さ",
      type: "num",
      min: 0.5,
      max: 4,
      step: 0.1,
      value: 1,
    },
    {
      key: "p0",
      label: "中央の加速 (p0)",
      type: "num",
      min: 0,
      max: 2,
      step: 0.1,
      value: 0.7,
    },
    {
      key: "dist",
      label: "飛ぶ距離 (セル)",
      type: "num",
      min: 1,
      max: 6,
      step: 1,
      value: 3,
    },
    {
      key: "len",
      label: "線の長さ (px)",
      type: "num",
      min: 2,
      max: 16,
      step: 1,
      value: 16,
    },
    { key: "color", label: "色", type: "color", value: "white" },
    {
      key: "dirs",
      label: "向き",
      type: "select",
      options: ["push", "back", "sides", "all"],
      value: "all",
    },
  ],
  create(p, ctx) {
    const all: Dir[] = ["up", "down", "left", "right"]
    const back = {
      up: "down",
      down: "up",
      left: "right",
      right: "left",
    } as const
    const dirs: Dir[] = p.dirs === "push"
      ? [ctx.dir]
      : p.dirs === "back"
      ? [back[ctx.dir]]
      : p.dirs === "sides"
      ? (ctx.dir === "up" || ctx.dir === "down"
        ? ["left", "right"]
        : ["up", "down"])
      : all
    const lines = num(p, "lines"), base = num(p, "base"), p0 = num(p, "p0")
    const dist = num(p, "dist") * CELL, len = num(p, "len")
    const c = color(p, "color")
    type Line = {
      x: number
      y: number
      vx: number
      vy: number
      d: number
      speed: number
    }
    const list: Line[] = []
    for (const dir of dirs) {
      const [vx, vy] = dirVec(dir)
      for (let k = 0; k < lines; k++) {
        const across = lines === 1
          ? CELL / 2
          : Math.round((k * (CELL - 1)) / (lines - 1))
        const mid = (lines - 1) / 2
        const speed = base + (mid - Math.abs(k - mid)) * p0
        const x = ctx.x + (vx === 0 ? across : vx > 0 ? CELL : 0)
        const y = ctx.y + (vy === 0 ? across : vy > 0 ? CELL : 0)
        list.push({ x, y, vx, vy, d: 0, speed })
      }
    }
    return delayed(num(p, "delay"), {
      step() {
        for (const l of list) l.d = Math.min(dist, l.d + l.speed)
      },
      draw(painter) {
        for (const l of list) {
          if (l.d >= dist) continue
          const head = Math.round(l.d)
          const tail = Math.max(0, head - len)
          for (let k = tail; k < head; k++) {
            painter.rect(
              l.x + l.vx * k - (l.vx < 0 ? 1 : 0),
              l.y + l.vy * k - (l.vy < 0 ? 1 : 0),
              1,
              1,
              c,
            )
          }
        }
      },
      get done() {
        return list.every((l) => l.d >= dist)
      },
    })
  },
}

/** Chips thrown up and out, falling under gravity */
const debris: Pattern = {
  id: "debris",
  name: "破片",
  note:
    "小さな四角が飛び上がって重力で落ち、床で止まって少し残り、一度に消える。色は絵の色を拾うか、3 色を指定する。",
  params: [
    DELAY,
    {
      key: "count",
      label: "数",
      type: "num",
      min: 1,
      max: 60,
      step: 1,
      value: 12,
    },
    {
      key: "speed",
      label: "初速",
      type: "num",
      min: 0.2,
      max: 4,
      step: 0.1,
      value: 1.5,
    },
    {
      key: "up",
      label: "上向きの勢い",
      type: "num",
      min: 0,
      max: 5,
      step: 0.1,
      value: 2.2,
    },
    {
      key: "bias",
      label: "押した向きへの偏り",
      type: "num",
      min: 0,
      max: 3,
      step: 0.1,
      value: 0,
    },
    {
      key: "gravity",
      label: "重力",
      type: "num",
      min: 0,
      max: 1,
      step: 0.05,
      value: 0.35,
    },
    {
      key: "size",
      label: "大きさ (px)",
      type: "num",
      min: 1,
      max: 4,
      step: 1,
      value: 2,
    },
    {
      key: "floor",
      label: "床までの落差 (px)",
      type: "num",
      min: 0,
      max: 16,
      step: 1,
      value: 6,
    },
    {
      key: "bounce",
      label: "跳ね返り回数",
      type: "num",
      min: 0,
      max: 3,
      step: 1,
      value: 0,
    },
    {
      key: "life",
      label: "寿命 (frame)",
      type: "num",
      min: 10,
      max: 120,
      step: 1,
      value: 40,
    },
    {
      key: "end",
      label: "消え方",
      type: "select",
      options: ["at-once", "blink", "shrink"],
      value: "at-once",
    },
    {
      key: "colors",
      label: "色の取り方",
      type: "select",
      options: ["sprite", "pick"],
      value: "sprite",
    },
    { key: "c1", label: "色 1", type: "color", value: "white" },
    { key: "c2", label: "色 2", type: "color", value: "gray2" },
    { key: "c3", label: "色 3", type: "color", value: "gray3" },
  ],
  create(p, ctx) {
    const cx = ctx.x + CELL / 2, cy = ctx.y + CELL / 2
    const [bx, by] = dirVec(ctx.dir)
    const bias = num(p, "bias"), g = num(p, "gravity")
    const size = num(p, "size"), life = num(p, "life")
    const spriteColors = pixelsOf(ctx.sprite).map((q) => q.c)
    const picks = [color(p, "c1"), color(p, "c2"), color(p, "c3")]
    const count = num(p, "count")
    const chips = Array.from({ length: count }, (_, n) => {
      const a = (n / count) * Math.PI * 2 + ctx.rand() * 0.6
      const speed = num(p, "speed") * (0.5 + ctx.rand())
      return {
        x: cx + Math.cos(a) * 3,
        y: cy + Math.sin(a) * 3,
        vx: Math.cos(a) * speed + bx * bias,
        vy: Math.sin(a) * speed - num(p, "up") + by * bias,
        floor: cy + num(p, "floor") + Math.floor(ctx.rand() * 3),
        bounces: num(p, "bounce"),
        c: p.colors === "sprite" && spriteColors.length > 0
          ? spriteColors[Math.floor(ctx.rand() * spriteColors.length)]
          : picks[n % 3],
        life: Math.floor(life * (0.7 + ctx.rand() * 0.3)),
        age: 0,
      }
    })
    return delayed(num(p, "delay"), {
      step() {
        for (const ch of chips) {
          ch.age++
          if (ch.y >= ch.floor && ch.vy === 0) continue
          ch.x += ch.vx
          ch.y += ch.vy
          ch.vy += g
          if (ch.y >= ch.floor && ch.vy > 0) {
            ch.y = ch.floor
            if (ch.bounces > 0) {
              ch.bounces--
              ch.vy = -ch.vy * 0.45
              ch.vx *= 0.6
            } else {
              ch.vy = 0
              ch.vx = 0
            }
          }
        }
      },
      draw(painter) {
        for (const ch of chips) {
          if (ch.age >= ch.life) continue
          const left = ch.life - ch.age
          if (p.end === "blink" && left < 16 && left % 4 < 2) continue
          const s = p.end === "shrink" && left < 12
            ? Math.max(1, size - 1)
            : size
          painter.rect(Math.round(ch.x), Math.round(ch.y), s, s, ch.c)
        }
      },
      get done() {
        return chips.every((ch) => ch.age >= ch.life)
      },
    })
  },
}

/** The sprite cut into tiles that fly apart (no rotation) */
const shatter: Pattern = {
  id: "shatter",
  name: "割れ飛ぶ (絵を分割)",
  note:
    "絵をマス目に切って、それぞれが外へ飛んで落ちる。回転はしない (ドットが崩れるため)。分割数と重力で「陶器」「ガラス」「岩」になる。",
  ownsSprite: true,
  params: [
    DELAY,
    {
      key: "grid",
      label: "分割 (N×N)",
      type: "num",
      min: 2,
      max: 8,
      step: 1,
      value: 4,
    },
    {
      key: "speed",
      label: "初速",
      type: "num",
      min: 0,
      max: 4,
      step: 0.1,
      value: 1.2,
    },
    {
      key: "up",
      label: "上向きの勢い",
      type: "num",
      min: 0,
      max: 5,
      step: 0.1,
      value: 1.8,
    },
    {
      key: "bias",
      label: "押した向きへの偏り",
      type: "num",
      min: 0,
      max: 3,
      step: 0.1,
      value: 0.8,
    },
    {
      key: "gravity",
      label: "重力",
      type: "num",
      min: 0,
      max: 1,
      step: 0.05,
      value: 0.3,
    },
    {
      key: "life",
      label: "寿命 (frame)",
      type: "num",
      min: 8,
      max: 90,
      step: 1,
      value: 30,
    },
    {
      key: "end",
      label: "消え方",
      type: "select",
      options: ["at-once", "blink", "fall-off"],
      value: "blink",
    },
  ],
  create(p, ctx) {
    const s = ctx.sprite
    const n = num(p, "grid")
    const tw = Math.ceil(s.w / n), th = Math.ceil(s.h / n)
    const [ox, oy] = spriteOrigin(ctx)
    const [bx, by] = dirVec(ctx.dir)
    const pieces: {
      sx: number
      sy: number
      x: number
      y: number
      vx: number
      vy: number
    }[] = []
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        const sx = gx * tw, sy = gy * th
        // outward from the middle
        const dx = sx + tw / 2 - s.w / 2, dy = sy + th / 2 - s.h / 2
        const d = Math.hypot(dx, dy) || 1
        const v = num(p, "speed") * (0.6 + ctx.rand() * 0.8)
        pieces.push({
          sx,
          sy,
          x: ox + sx,
          y: oy + sy,
          vx: (dx / d) * v + bx * num(p, "bias"),
          vy: (dy / d) * v - num(p, "up") * (0.5 + ctx.rand()) +
            by * num(p, "bias"),
        })
      }
    }
    const life = num(p, "life"), g = num(p, "gravity")
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
        const left = life - t
        if (p.end === "blink" && left < 12 && left % 4 < 2) return
        for (const q of pieces) {
          if (p.end === "fall-off" && q.y > oy + s.h + 8) continue
          drawSpritePart(
            painter,
            s,
            q.sx,
            q.sy,
            tw,
            th,
            Math.round(q.x),
            Math.round(q.y),
          )
        }
      },
      get done() {
        return t >= life
      },
    })
  },
}

/** Every pixel of the sprite flies off on its own */
const pixels: Pattern = {
  id: "pixels",
  name: "ドット崩壊",
  note:
    "絵の 1 ドットずつがばらばらに飛び散る。全部同時か、押した側から順に崩すかを選べる。",
  ownsSprite: true,
  params: [
    DELAY,
    {
      key: "speed",
      label: "初速",
      type: "num",
      min: 0,
      max: 3,
      step: 0.1,
      value: 0.8,
    },
    {
      key: "up",
      label: "上向きの勢い",
      type: "num",
      min: 0,
      max: 4,
      step: 0.1,
      value: 1.2,
    },
    {
      key: "gravity",
      label: "重力",
      type: "num",
      min: 0,
      max: 0.6,
      step: 0.02,
      value: 0.12,
    },
    {
      key: "stagger",
      label: "押した側からの時間差 (frame/行)",
      type: "num",
      min: 0,
      max: 3,
      step: 0.25,
      value: 0,
    },
    {
      key: "life",
      label: "寿命 (frame)",
      type: "num",
      min: 8,
      max: 90,
      step: 1,
      value: 36,
    },
    {
      key: "thin",
      label: "間引き (1/N を残す)",
      type: "num",
      min: 1,
      max: 4,
      step: 1,
      value: 1,
    },
  ],
  create(p, ctx) {
    const [ox, oy] = spriteOrigin(ctx)
    const s = ctx.sprite
    const [bx, by] = dirVec(ctx.dir)
    const thin = num(p, "thin")
    const list = pixelsOf(s).filter((_, k) => k % thin === 0).map((q) => {
      const dx = q.x - s.w / 2, dy = q.y - s.h / 2
      const d = Math.hypot(dx, dy) || 1
      const v = num(p, "speed") * (0.4 + ctx.rand())
      // rows from the side the push comes from
      const fromNear = bx > 0
        ? q.x
        : bx < 0
        ? s.w - 1 - q.x
        : by > 0
        ? q.y
        : s.h - 1 - q.y
      return {
        x: ox + q.x,
        y: oy + q.y,
        vx: (dx / d) * v,
        vy: (dy / d) * v - num(p, "up") * ctx.rand(),
        c: q.c,
        start: Math.floor(fromNear * num(p, "stagger")),
      }
    })
    const g = num(p, "gravity"), life = num(p, "life")
    let t = 0
    return delayed(num(p, "delay"), {
      step() {
        t++
        for (const q of list) {
          if (t < q.start) continue
          q.x += q.vx
          q.y += q.vy
          q.vy += g
        }
      },
      draw(painter) {
        for (const q of list) {
          if (t - q.start >= life) continue
          painter.rect(Math.round(q.x), Math.round(q.y), 1, 1, q.c)
        }
      },
      get done() {
        return list.every((q) => t - q.start >= life)
      },
    })
  },
}

/** Rings growing out of the cell: square, diamond or circle */
const ring: Pattern = {
  id: "ring",
  name: "衝撃の輪",
  note:
    "セルの中心から輪が広がる。四角・ひし形・円 (ドットで描いた円)。破線にすると軽く、太くすると重くなる。",
  params: [
    DELAY,
    {
      key: "shape",
      label: "形",
      type: "select",
      options: ["square", "diamond", "circle"],
      value: "circle",
    },
    {
      key: "count",
      label: "輪の数",
      type: "num",
      min: 1,
      max: 4,
      step: 1,
      value: 1,
    },
    {
      key: "gap",
      label: "輪の間隔 (frame)",
      type: "num",
      min: 1,
      max: 12,
      step: 1,
      value: 4,
    },
    {
      key: "speed",
      label: "広がる速さ (px/frame)",
      type: "num",
      min: 0.5,
      max: 4,
      step: 0.5,
      value: 1.5,
    },
    {
      key: "start",
      label: "初めの半径 (px)",
      type: "num",
      min: 0,
      max: 12,
      step: 1,
      value: 4,
    },
    {
      key: "max",
      label: "最大の半径 (px)",
      type: "num",
      min: 6,
      max: 40,
      step: 1,
      value: 20,
    },
    {
      key: "thick",
      label: "太さ (px)",
      type: "num",
      min: 1,
      max: 3,
      step: 1,
      value: 1,
    },
    {
      key: "dash",
      label: "破線",
      type: "select",
      options: ["solid", "dashed", "dotted"],
      value: "solid",
    },
    { key: "color", label: "色", type: "color", value: "white" },
  ],
  create(p, ctx) {
    const cx = ctx.x + CELL / 2, cy = ctx.y + CELL / 2
    const count = num(p, "count"), gap = num(p, "gap")
    const speed = num(p, "speed"), r0 = num(p, "start"), rmax = num(p, "max")
    const thick = num(p, "thick"), c = color(p, "color")
    const dash = String(p.dash)
    let t = 0
    const radius = (n: number) => r0 + (t - n * gap) * speed
    const keep = (k: number) =>
      dash === "solid" || (dash === "dashed" ? k % 4 < 2 : k % 2 === 0)
    return delayed(num(p, "delay"), {
      step() {
        t++
      },
      draw(painter) {
        for (let n = 0; n < count; n++) {
          if (t < n * gap) continue
          const r = Math.round(radius(n))
          if (r > rmax) continue
          for (let w = 0; w < thick; w++) {
            const rr = r - w
            if (rr < 0) continue
            const pts: [number, number][] = []
            if (p.shape === "square") {
              for (let k = -rr; k <= rr; k++) {
                pts.push([k, -rr], [k, rr], [-rr, k], [rr, k])
              }
            } else if (p.shape === "diamond") {
              for (let k = 0; k <= rr; k++) {
                pts.push([k, rr - k], [-k, rr - k], [k, k - rr], [-k, k - rr])
              }
            } else {
              // midpoint circle
              let x = rr, y = 0, err = 1 - rr
              while (x >= y) {
                pts.push([x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [
                  y,
                  -x,
                ], [x, -y])
                y++
                if (err < 0) err += 2 * y + 1
                else {
                  x--
                  err += 2 * (y - x) + 1
                }
              }
            }
            pts.forEach(([dx, dy], k) => {
              if (keep(k)) painter.rect(cx + dx, cy + dy, 1, 1, c)
            })
          }
        }
      },
      get done() {
        return radius(count - 1) > rmax
      },
    })
  },
}

/** The sprite dissolves through an ordered dither (no alpha) */
const dissolve: Pattern = {
  id: "dissolve",
  name: "ディザで消える",
  note:
    "半透明を使わずに「薄れる」を表す。4x4 の Bayer 行列の順にドットが抜けていく。ノイズ順・縞順も試せる。",
  ownsSprite: true,
  params: [
    DELAY,
    {
      key: "frames",
      label: "消えるまで (frame)",
      type: "num",
      min: 4,
      max: 60,
      step: 1,
      value: 16,
    },
    {
      key: "order",
      label: "抜ける順",
      type: "select",
      options: ["bayer", "noise", "rows", "checker"],
      value: "bayer",
    },
    {
      key: "hold",
      label: "消える前の静止 (frame)",
      type: "num",
      min: 0,
      max: 30,
      step: 1,
      value: 0,
    },
  ],
  create(p, ctx) {
    const s = ctx.sprite
    const [ox, oy] = spriteOrigin(ctx)
    const frames = num(p, "frames"), hold = num(p, "hold")
    const noise = s.px.map(() => Math.floor(ctx.rand() * 16))
    const rank = (x: number, y: number) => {
      switch (p.order) {
        case "noise":
          return noise[y * s.w + x]
        case "rows":
          return ((y % 4) * 4 + (x % 4) % 1) % 16
        case "checker":
          return (x + y) % 2 === 0 ? 4 : 12
        default:
          return BAYER[(y % 4) * 4 + (x % 4)]
      }
    }
    let t = 0
    return delayed(num(p, "delay"), {
      step() {
        t++
      },
      draw(painter) {
        const level = Math.floor(((t - hold) / frames) * 16)
        drawSpritePart(
          painter,
          s,
          0,
          0,
          s.w,
          s.h,
          ox,
          oy,
          (c, x, y) => rank(x, y) < level ? null : c,
        )
      },
      get done() {
        return t >= hold + frames
      },
    })
  },
}

/** The sprite's shape flashes in one color (or inverted), then goes */
const flash: Pattern = {
  id: "flash",
  name: "フラッシュ",
  note:
    "当たった瞬間に絵の形を 1 色で塗る・グレーを反転する。点滅回数を増やすと NES の被弾表現になる。",
  ownsSprite: true,
  params: [
    DELAY,
    {
      key: "mode",
      label: "塗り方",
      type: "select",
      options: ["fill", "invert", "outline"],
      value: "fill",
    },
    { key: "color", label: "色", type: "color", value: "white" },
    {
      key: "on",
      label: "点灯 (frame)",
      type: "num",
      min: 1,
      max: 8,
      step: 1,
      value: 2,
    },
    {
      key: "off",
      label: "元の絵 (frame)",
      type: "num",
      min: 0,
      max: 8,
      step: 1,
      value: 2,
    },
    {
      key: "times",
      label: "回数",
      type: "num",
      min: 1,
      max: 6,
      step: 1,
      value: 1,
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
    const on = num(p, "on"), off = num(p, "off"), times = num(p, "times")
    const period = on + off
    const total = period * times
    const c = color(p, "color")
    const opaque = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < s.w && y < s.h && !!s.px[y * s.w + x]
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
        const lit = t % period < on
        if (!lit) {
          drawSpritePart(painter, s, 0, 0, s.w, s.h, ox, oy)
          return
        }
        if (p.mode === "invert") {
          drawSpritePart(painter, s, 0, 0, s.w, s.h, ox, oy, invert)
        } else if (p.mode === "outline") {
          drawSpritePart(
            painter,
            s,
            0,
            0,
            s.w,
            s.h,
            ox,
            oy,
            (orig, x, y) =>
              [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
                  !opaque(x + dx, y + dy)
                )
                ? c
                : orig,
          )
        } else {
          drawSpritePart(painter, s, 0, 0, s.w, s.h, ox, oy, () => c)
        }
      },
      get done() {
        return t >= total
      },
    })
  },
}

/** Little crosses twinkling around the cell */
const sparks: Pattern = {
  id: "sparks",
  name: "きらめき",
  note: "十字や × の小さな光がまわりに出て、点滅して消える。",
  params: [
    DELAY,
    {
      key: "count",
      label: "数",
      type: "num",
      min: 1,
      max: 16,
      step: 1,
      value: 5,
    },
    {
      key: "radius",
      label: "出る距離 (px)",
      type: "num",
      min: 2,
      max: 24,
      step: 1,
      value: 12,
    },
    {
      key: "shape",
      label: "形",
      type: "select",
      options: ["plus", "cross", "dot", "star"],
      value: "plus",
    },
    {
      key: "size",
      label: "腕の長さ (px)",
      type: "num",
      min: 1,
      max: 4,
      step: 1,
      value: 2,
    },
    {
      key: "life",
      label: "寿命 (frame)",
      type: "num",
      min: 4,
      max: 60,
      step: 1,
      value: 20,
    },
    {
      key: "spread",
      label: "出る時間のばらつき (frame)",
      type: "num",
      min: 0,
      max: 30,
      step: 1,
      value: 8,
    },
    { key: "color", label: "色", type: "color", value: "white" },
    { key: "core", label: "芯の色", type: "color", value: "yellow1" },
  ],
  create(p, ctx) {
    const cx = ctx.x + CELL / 2, cy = ctx.y + CELL / 2
    const list = Array.from({ length: num(p, "count") }, () => {
      const a = ctx.rand() * Math.PI * 2
      const r = num(p, "radius") * (0.4 + ctx.rand() * 0.6)
      return {
        x: Math.round(cx + Math.cos(a) * r),
        y: Math.round(cy + Math.sin(a) * r),
        start: Math.floor(ctx.rand() * (num(p, "spread") + 1)),
      }
    })
    const life = num(p, "life"), size = num(p, "size")
    const c = color(p, "color"), core = color(p, "core")
    let t = 0
    return delayed(num(p, "delay"), {
      step() {
        t++
      },
      draw(painter) {
        for (const sp of list) {
          const age = t - sp.start
          if (age < 0 || age >= life) continue
          // grows, then shrinks
          const arm = Math.max(0, Math.min(size, Math.min(age, life - 1 - age)))
          painter.rect(sp.x, sp.y, 1, 1, core)
          for (let k = 1; k <= arm; k++) {
            const plus = [[k, 0], [-k, 0], [0, k], [0, -k]]
            const cross = [[k, k], [-k, k], [k, -k], [-k, -k]]
            const arms = p.shape === "plus"
              ? plus
              : p.shape === "cross"
              ? cross
              : p.shape === "star"
              ? (k === 1 ? [...plus, ...cross] : plus)
              : []
            for (const [dx, dy] of arms) {
              painter.rect(sp.x + dx, sp.y + dy, 1, 1, c)
            }
          }
        }
      },
      get done() {
        return list.every((sp) => t - sp.start >= life)
      },
    })
  },
}

/** Puffs of dust rising and thinning out by dithering */
const dust: Pattern = {
  id: "dust",
  name: "土ぼこり",
  note:
    "床の近くから小さな煙が上がり、ふくらみながらディザで薄れて消える。重い物の着地や崩れ落ちに。",
  params: [
    DELAY,
    {
      key: "count",
      label: "数",
      type: "num",
      min: 1,
      max: 12,
      step: 1,
      value: 4,
    },
    {
      key: "size",
      label: "初めの大きさ (px)",
      type: "num",
      min: 1,
      max: 6,
      step: 1,
      value: 2,
    },
    {
      key: "grow",
      label: "ふくらみ (px)",
      type: "num",
      min: 0,
      max: 6,
      step: 1,
      value: 3,
    },
    {
      key: "rise",
      label: "上る速さ",
      type: "num",
      min: 0,
      max: 1.5,
      step: 0.05,
      value: 0.3,
    },
    {
      key: "drift",
      label: "横に流れる",
      type: "num",
      min: 0,
      max: 1.5,
      step: 0.05,
      value: 0.4,
    },
    {
      key: "life",
      label: "寿命 (frame)",
      type: "num",
      min: 8,
      max: 80,
      step: 1,
      value: 30,
    },
    { key: "color", label: "色", type: "color", value: "gray1" },
  ],
  create(p, ctx) {
    const count = num(p, "count")
    const list = Array.from({ length: count }, (_, n) => {
      const side = n % 2 === 0 ? -1 : 1
      return {
        x: ctx.x + CELL / 2 + side * (2 + ctx.rand() * 6),
        y: ctx.y + CELL - 3 - ctx.rand() * 3,
        vx: side * num(p, "drift") * (0.5 + ctx.rand()),
        seed: Math.floor(ctx.rand() * 16),
      }
    })
    const life = num(p, "life"), c = color(p, "color")
    const size = num(p, "size"), grow = num(p, "grow"), rise = num(p, "rise")
    let t = 0
    return delayed(num(p, "delay"), {
      step() {
        t++
        for (const d of list) {
          d.x += d.vx
          d.y -= rise
          d.vx *= 0.94
        }
      },
      draw(painter) {
        if (t >= life) return
        const r = size + Math.floor((t / life) * grow)
        // thinner as it ages: the Bayer level rises
        const level = Math.floor((t / life) * 16)
        for (const d of list) {
          const x0 = Math.round(d.x) - Math.floor(r / 2)
          const y0 = Math.round(d.y) - Math.floor(r / 2)
          for (let y = 0; y < r; y++) {
            for (let x = 0; x < r; x++) {
              // round puffs: corners off
              if (
                r > 2 && (x === 0 || x === r - 1) && (y === 0 || y === r - 1)
              ) continue
              const gx = x0 + x, gy = y0 + y
              if (BAYER[((gy + d.seed) & 3) * 4 + (gx & 3)] < level) continue
              painter.rect(gx, gy, 1, 1, c)
            }
          }
        }
      },
      get done() {
        return t >= life
      },
    })
  },
}

/** Cracks run over the sprite before it goes */
const cracks: Pattern = {
  id: "cracks",
  name: "ひび",
  note:
    "当たった側からひびが伸びて、伸びきったら絵が消える (後に続く効果は「開始の遅れ」で合わせる)。ためと解放の「ため」。",
  ownsSprite: true,
  params: [
    DELAY,
    {
      key: "count",
      label: "ひびの本数",
      type: "num",
      min: 1,
      max: 6,
      step: 1,
      value: 3,
    },
    {
      key: "speed",
      label: "伸びる速さ (px/frame)",
      type: "num",
      min: 0.25,
      max: 4,
      step: 0.25,
      value: 1,
    },
    {
      key: "length",
      label: "長さ (px)",
      type: "num",
      min: 4,
      max: 24,
      step: 1,
      value: 12,
    },
    {
      key: "wiggle",
      label: "くねり",
      type: "num",
      min: 0,
      max: 1,
      step: 0.05,
      value: 0.4,
    },
    {
      key: "hold",
      label: "伸びきって止まる (frame)",
      type: "num",
      min: 0,
      max: 30,
      step: 1,
      value: 4,
    },
    { key: "color", label: "色", type: "color", value: "black" },
  ],
  create(p, ctx) {
    const s = ctx.sprite
    const [ox, oy] = spriteOrigin(ctx)
    const [vx, vy] = dirVec(ctx.dir)
    const length = num(p, "length")
    // each crack is a path of pixels from the hit side, into the push
    const paths: [number, number][][] = []
    for (let n = 0; n < num(p, "count"); n++) {
      let x = vx === 0 ? Math.floor(ctx.rand() * s.w) : vx > 0 ? 0 : s.w - 1
      let y = vy === 0 ? Math.floor(ctx.rand() * s.h) : vy > 0 ? 0 : s.h - 1
      const path: [number, number][] = []
      for (let k = 0; k < length; k++) {
        path.push([x, y])
        if (ctx.rand() < num(p, "wiggle")) {
          // a step aside
          if (vx === 0) x += ctx.rand() < 0.5 ? -1 : 1
          else y += ctx.rand() < 0.5 ? -1 : 1
        } else {
          x += vx
          y += vy
        }
        if (x < 0 || y < 0 || x >= s.w || y >= s.h) break
      }
      paths.push(path)
    }
    const c = color(p, "color"), speed = num(p, "speed")
    const longest = Math.max(...paths.map((q) => q.length))
    const total = Math.ceil(longest / speed) + num(p, "hold")
    let t = 0
    return delayed(num(p, "delay"), {
      step() {
        t++
      },
      draw(painter) {
        if (t >= total) return
        drawSpritePart(painter, s, 0, 0, s.w, s.h, ox, oy)
        const shown = Math.floor(t * speed)
        for (const path of paths) {
          for (const [x, y] of path.slice(0, shown)) {
            if (s.px[y * s.w + x]) painter.rect(ox + x, oy + y, 1, 1, c)
          }
        }
      },
      get done() {
        return t >= total
      },
    })
  },
}

/** All the patterns, in the order they are drawn (later on top) */
export const PATTERNS: Pattern[] = [
  dust,
  ring,
  cracks,
  flash,
  wipe,
  dissolve,
  shatter,
  pixels,
  sweep,
  streaks,
  debris,
  sparks,
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
    ...global,
    layers: Object.fromEntries(
      PATTERNS.map((pt) => [pt.id, {
        on: pt.id in on,
        params: { ...defaults(pt), ...(on[pt.id] ?? {}) },
      }]),
    ),
  }
}

/** Starting points to compare */
export const PRESETS: { name: string; note: string; recipe: Recipe }[] = [
  {
    name: "現行: 木箱",
    note: "いまのゲームの木箱・壺: スイープ線 + ワイプ",
    recipe: recipe({ sweep: {}, wipe: {} }, { stop: 0 }),
  },
  {
    name: "現行: ODDITIES",
    note:
      "壊れる物 (ODDITIES) の crunch: 線 + ワイプ + 破片 + 白い閃き + ヒットストップ + 揺れ",
    recipe: recipe(
      { sweep: {}, wipe: {}, debris: {} },
      { stop: 3, shake: 6 },
    ),
  },
  {
    name: "陶器",
    note: "4x4 に割れて飛び、破片と土ぼこり",
    recipe: recipe(
      {
        flash: { on: 2, off: 0, times: 1 },
        shatter: { delay: 2, grid: 4, end: "blink" },
        debris: { delay: 2, count: 8 },
        dust: { delay: 6 },
      },
      { stop: 4, shake: 6 },
    ),
  },
  {
    name: "ガラス",
    note: "細かく割れて、きらめきが残る",
    recipe: recipe(
      {
        shatter: { grid: 8, speed: 1.6, up: 1.2, gravity: 0.4, life: 24 },
        sparks: { count: 6, delay: 2, shape: "star", core: "cyan1" },
        ring: {
          shape: "diamond",
          speed: 2,
          max: 14,
          dash: "dotted",
          color: "cyan1",
        },
      },
      { stop: 2, shake: 2 },
    ),
  },
  {
    name: "ひび → 割れる",
    note: "ひびが伸びるため → 一気に崩れる",
    recipe: recipe(
      {
        cracks: { speed: 0.75, hold: 6 },
        shatter: { delay: 22, grid: 3, speed: 1.8 },
        debris: { delay: 22, count: 16 },
      },
      { stop: 0, shake: 0 },
    ),
  },
  {
    name: "爆発",
    note: "白く光って輪が広がり、破片が四方に",
    recipe: recipe(
      {
        flash: { on: 2, off: 2, times: 2, mode: "fill" },
        ring: { delay: 4, count: 2, speed: 2, max: 24, thick: 2 },
        pixels: { delay: 4, speed: 2, up: 1.5, gravity: 0.15 },
        debris: {
          delay: 4,
          count: 20,
          speed: 2.5,
          colors: "pick",
          c1: "white",
          c2: "yellow1",
          c3: "orange2",
        },
      },
      { stop: 6, shake: 12, shakeAmp: 2 },
    ),
  },
  {
    name: "砂になる",
    note: "押した側から 1 ドットずつ崩れ落ちる",
    recipe: recipe(
      {
        pixels: { speed: 0.2, up: 0.3, gravity: 0.2, stagger: 1.5, life: 40 },
        dust: { delay: 10, count: 3 },
      },
    ),
  },
  {
    name: "消える (ディザ)",
    note: "半透明なしで薄れて消える + 煙",
    recipe: recipe({ dissolve: { frames: 20 }, dust: { count: 5, grow: 4 } }),
  },
  {
    name: "NES の被弾",
    note: "反転して点滅、四方に線",
    recipe: recipe(
      {
        flash: { mode: "invert", on: 2, off: 2, times: 3 },
        streaks: { delay: 12, dirs: "all", len: 6, dist: 2 },
      },
      { stop: 2 },
    ),
  },
  {
    name: "重い岩",
    note: "大きめに割れ、跳ねて止まる破片、長い揺れ",
    recipe: recipe(
      {
        shatter: {
          grid: 2,
          speed: 0.8,
          up: 1.2,
          gravity: 0.35,
          life: 36,
          end: "fall-off",
        },
        debris: {
          count: 10,
          size: 3,
          bounce: 2,
          floor: 8,
          life: 60,
          end: "blink",
        },
        dust: { count: 6, grow: 4, life: 40 },
      },
      { stop: 8, shake: 16, shakeAmp: 2 },
    ),
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
