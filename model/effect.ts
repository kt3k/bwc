import { Palette, type PaletteColor } from "../util/palette.ts"
import { CELL_SIZE } from "../util/constants.ts"
import type { Dir, IColorBox, IField, IFinishable, IStepper } from "./types.ts"

export class EffectLine0 implements IColorBox, IFinishable, IStepper {
  #startX: number
  #startY: number
  #dir: Dir
  #length: number
  #speed: number
  #duration: number
  #x: number
  #y: number
  #tipX: number
  #tipY: number
  #w: number = 1
  #h: number = 1
  #tipStop = false
  constructor(
    startX: number,
    startY: number,
    dir: Dir,
    public readonly color: PaletteColor,
    length: number,
    duration: number,
    speed: number = 1,
  ) {
    this.#x = this.#tipX = this.#startX = startX
    this.#y = this.#tipY = this.#startY = startY
    this.#dir = dir
    this.#length = length
    this.#speed = speed
    this.#duration = duration
  }

  step(_field: IField): void {
    switch (this.#dir) {
      case "up":
        if (!this.#tipStop) this.#tipY -= this.#speed
        this.#h = Math.min(Math.abs(this.#tipY - this.#startY), this.#length)
        this.#y = this.#tipY
        break
      case "down":
        if (!this.#tipStop) this.#tipY += this.#speed
        this.#h = Math.min(Math.abs(this.#tipY - this.#startY), this.#length)
        this.#y = this.#tipY - this.#h
        break
      case "left":
        if (!this.#tipStop) this.#tipX -= this.#speed
        this.#w = Math.min(Math.abs(this.#tipX - this.#startX), this.#length)
        this.#x = this.#tipX
        break
      case "right":
        if (!this.#tipStop) this.#tipX += this.#speed
        this.#w = Math.min(Math.abs(this.#tipX - this.#startX), this.#length)
        this.#x = this.#tipX - this.#w
        break
    }
    this.#duration--
    if (this.#duration * this.#speed < this.#length) {
      this.#tipStop = true
      this.#length = this.#duration * this.#speed
    }
  }
  get x(): number {
    return Math.round(this.#x)
  }
  get y(): number {
    return Math.round(this.#y)
  }
  get w(): number {
    return Math.round(this.#w)
  }
  get h(): number {
    return Math.round(this.#h)
  }
  get finished(): boolean {
    return this.#duration <= 0
  }
}

export function linePattern0(
  dirs: readonly Dir[],
  i: number,
  j: number,
  baseSpeed: number,
  p0: number,
  dist: number,
  color: PaletteColor,
): EffectLine0[] {
  const baseX = i * CELL_SIZE
  const baseY = j * CELL_SIZE
  const effects: EffectLine0[] = []
  for (const dir of dirs) {
    for (const k of Array(5).keys()) {
      let dx = 0, dy = 0, offsetX = 0, offsetY = 0
      switch (dir) {
        case "up":
          dx = 4
          break
        case "down":
          dx = 4
          offsetY = CELL_SIZE
          break
        case "left":
          dy = 4
          break
        case "right":
          dy = 4
          offsetX = CELL_SIZE
          break
      }
      const speed = baseSpeed + (2 - Math.abs(k - 2)) * p0
      effects.push(
        new EffectLine0(
          offsetX + baseX + Math.min(dx * k, CELL_SIZE - 1),
          offsetY + baseY + Math.min(dy * k, CELL_SIZE - 1),
          dir,
          color,
          CELL_SIZE,
          16 * dist / speed,
          speed,
        ),
      )
    }
  }
  return effects
}

export class EffectLine1 implements IColorBox, IFinishable, IStepper {
  #x: number
  #y: number
  #w: number
  #h: number
  #dir: Dir
  #speed: number
  #duration: number
  #delay: number

  constructor(
    x: number,
    y: number,
    dir: Dir,
    duration: number,
    public readonly color: PaletteColor,
    width: number = 1,
    speed: number = 1,
    delay: number = 0,
  ) {
    this.#x = x
    this.#y = y
    this.#dir = dir
    this.#duration = duration
    this.#delay = delay
    this.#speed = speed
    this.#w = 1
    this.#h = 1
    switch (this.#dir) {
      case "up":
      case "down":
        this.#h = width
        this.#w = CELL_SIZE
        break
      case "left":
      case "right":
        this.#w = width
        this.#h = CELL_SIZE
        break
    }
  }

  step(_field: IField): void {
    if (this.#delay > 0) {
      this.#delay--
      return
    }
    switch (this.#dir) {
      case "up":
        this.#y -= this.#speed
        break
      case "down":
        this.#y += this.#speed
        break
      case "left":
        this.#x -= this.#speed
        break
      case "right":
        this.#x += this.#speed
        break
    }
    this.#duration--
  }

  get x(): number {
    if (this.#delay > 0) {
      return 0
    }
    return Math.round(this.#x)
  }
  get y(): number {
    if (this.#delay > 0) {
      return 0
    }
    return Math.round(this.#y)
  }
  get w(): number {
    if (this.#delay > 0) {
      return 0
    }
    return Math.round(this.#w)
  }
  get h(): number {
    if (this.#delay > 0) {
      return 0
    }
    return Math.round(this.#h)
  }
  get finished(): boolean {
    return this.#duration <= 0
  }
}

/** Digits for the count popup: 3x5, drawn doubled (6x10) */
const DIGITS: Record<string, string[]> = {
  "0": ["xxx", "x.x", "x.x", "x.x", "xxx"],
  "1": [".x.", "xx.", ".x.", ".x.", "xxx"],
  "2": ["xxx", "..x", "xxx", "x..", "xxx"],
  "3": ["xxx", "..x", ".xx", "..x", "xxx"],
  "4": ["x.x", "x.x", "xxx", "..x", "..x"],
  "5": ["xxx", "x..", "xxx", "..x", "xxx"],
  "6": ["xxx", "x..", "xxx", "x.x", "xxx"],
  "7": ["xxx", "..x", ".x.", ".x.", ".x."],
  "8": ["xxx", "x.x", "xxx", "x.x", "xxx"],
  "9": ["xxx", "x.x", "xxx", "..x", "xxx"],
}
/** The multiplication sign, at full size: bold strokes so the outline
 * doesn't fill it into a checkerboard */
const TIMES = [
  "xx...xx",
  ".xx.xx.",
  "..xxx..",
  ".xx.xx.",
  "xx...xx",
]

/** One block of the count popup: rises, holds, then vanishes at once */
export class EffectPopupPixel implements IColorBox, IFinishable, IStepper {
  #frame = 0
  #x: number
  #y: number
  constructor(
    x: number,
    y: number,
    readonly w: number,
    readonly h: number,
    readonly color: PaletteColor,
  ) {
    this.#x = x
    this.#y = y
  }
  /** Frames rising (1px every 2 frames), then frames holding still */
  static readonly RISE = 16
  static readonly HOLD = 34
  step(_field: IField): void {
    this.#frame++
  }
  get x(): number {
    return this.#x
  }
  get y(): number {
    return this.#y -
      Math.floor(Math.min(this.#frame, EffectPopupPixel.RISE) / 2)
  }
  get finished(): boolean {
    return this.#frame >= EffectPopupPixel.RISE + EffectPopupPixel.HOLD
  }
}

/**
 * "xN" over the cell (i, j), shown when several items are picked up at
 * once. White pixels in a 1px black outline, so it reads on any floor;
 * the outline comes first so the white is drawn over it.
 */
export function countPopup(
  i: number,
  j: number,
  count: number,
): EffectPopupPixel[] {
  const pixels: [number, number][] = []
  TIMES.forEach((row, y) =>
    [...row].forEach((c, x) => c === "x" && pixels.push([x, y + 4]))
  )
  let left = TIMES[0].length + 2
  for (const digit of String(count)) {
    DIGITS[digit].forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== "x") return
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          pixels.push([left + x * 2 + dx, y * 2 + dy])
        }
      })
    )
    left += 8
  }
  const width = left - 2
  const x0 = i * CELL_SIZE + Math.floor((CELL_SIZE - width) / 2)
  const y0 = j * CELL_SIZE - 12
  return [
    ...pixels.map(([x, y]) =>
      new EffectPopupPixel(x0 + x - 1, y0 + y - 1, 3, 3, Palette.black)
    ),
    ...pixels.map(([x, y]) =>
      new EffectPopupPixel(x0 + x, y0 + y, 1, 1, Palette.white)
    ),
  ]
}
