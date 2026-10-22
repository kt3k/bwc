import type { Context } from "@kt3k/cell"
import * as signal from "../../util/signals.ts"
import { BLOCK_SIZE } from "../../util/constants.ts"
import type { FieldBlock } from "../../model/field-block.ts"
import { Palette, type PaletteColor } from "../../util/palette.ts"

/** The number of cells represented by one minimap pixel (small) */
const SMALL = 4

const COLOR_FLOOR = Palette.gray2
const COLOR_WALL = Palette.gray4
const COLOR_WATER = Palette.blue3
const COLOR_ICE = Palette.white
const COLOR_PLAYER = Palette.pink3
/** A narrow way through walls or over water (a bridge, a pass) */
const COLOR_GAP = Palette.yellow1

/** The minimap ui which shows the current block and the player position */
export function Minimap({ el, on, query, subscribe }: Context) {
  const canvas = query<HTMLCanvasElement>("canvas")!
  const ctx = canvas.getContext("2d")!

  // The base terrain image of the current block
  const base = document.createElement("canvas")
  const baseCtx = base.getContext("2d")!

  /** Tapped open: a cell a pixel, over the middle of the screen */
  let big = false
  let SCALE = SMALL
  let SIZE = BLOCK_SIZE / SCALE
  const resize = () => {
    SCALE = big ? 1 : SMALL
    SIZE = BLOCK_SIZE / SCALE
    for (const c of [canvas, base]) {
      c.width = SIZE
      c.height = SIZE
    }
    el.style.right = big ? "50%" : ""
    el.style.top = big ? "40px" : ""
    el.style.transform = big ? "translateX(50%)" : ""
    el.style.zIndex = big ? "20" : ""
  }
  resize()

  let block: FieldBlock | null = null
  let playerPos: { i: number; j: number } | null = null

  /** What a pixel of the minimap shows, from its SCALE x SCALE cells */
  type Kind = "floor" | "wall" | "water" | "ice"
  const kindAt = (x: number, y: number): Kind => {
    let water = 0, ice = false, through = false
    for (let dy = 0; dy < SCALE; dy++) {
      for (let dx = 0; dx < SCALE; dx++) {
        const cell = block!.getCell(x * SCALE + dx, y * SCALE + dy)
        if (cell.slippery) ice = true
        // a way through anywhere in it (a bush pushes flat) shows as floor:
        // the gaps in the walls of rock and wood stay visible
        if (cell.canEnter || cell.flattens) through = true
        else if (cell.name === "w") water++
      }
    }
    if (ice) return "ice"
    if (through) return "floor"
    return water * 2 >= SCALE * SCALE ? "water" : "wall"
  }

  const renderBase = () => {
    baseCtx.clearRect(0, 0, SIZE, SIZE)
    if (!block) {
      return
    }
    const kinds: Kind[] = []
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) kinds.push(kindAt(x, y))
    }
    const at = (x: number, y: number): Kind | null =>
      x < 0 || y < 0 || x >= SIZE || y >= SIZE ? null : kinds[y * SIZE + x]
    const shut = (k: Kind | null) => k === "wall" || k === "water"
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const kind = at(x, y)!
        let color: PaletteColor = COLOR_WALL
        if (kind === "ice") color = COLOR_ICE
        else if (kind === "water") color = COLOR_WATER
        else if (kind === "floor") {
          // a narrow way between walls or water: a gap, shown bright
          // (opened big, every cell shows: no need)
          const gap = !big && (
            (shut(at(x - 1, y)) && shut(at(x + 1, y))) ||
            (shut(at(x, y - 1)) && shut(at(x, y + 1)))
          )
          color = gap ? COLOR_GAP : COLOR_FLOOR
        }
        baseCtx.fillStyle = color
        baseCtx.fillRect(x, y, 1, 1)
      }
    }
  }

  const render = () => {
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.drawImage(base, 0, 0)
    if (!block || !playerPos) {
      return
    }
    const li = playerPos.i - block.i
    const lj = playerPos.j - block.j
    if (li < 0 || li >= BLOCK_SIZE || lj < 0 || lj >= BLOCK_SIZE) {
      return
    }
    ctx.fillStyle = COLOR_PLAYER
    const dot = big ? 4 : 2
    ctx.fillRect(
      Math.floor(li / SCALE) - (big ? 1 : 0),
      Math.floor(lj / SCALE) - (big ? 1 : 0),
      dot,
      dot,
    )
  }

  subscribe(signal.currentBlock, (b) => {
    block = b
    renderBase()
    render()
  })

  subscribe(signal.centerGrid, ({ i, j }) => {
    playerPos = { i, j }
    render()
  })

  // Tap to open the map big (a cell a pixel), tap again to close it
  on("click", () => {
    big = !big
    resize()
    renderBase()
    render()
  })
}
