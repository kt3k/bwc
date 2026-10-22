import type { Context } from "@kt3k/cell"
import * as signal from "../../util/signals.ts"
import { BLOCK_SIZE } from "../../util/constants.ts"
import type { FieldBlock } from "../../model/field-block.ts"
import { Palette, type PaletteColor } from "../../util/palette.ts"

/** The number of cells represented by one minimap pixel */
const SCALE = 4
/** The size of the minimap canvas in pixels */
const SIZE = BLOCK_SIZE / SCALE

const COLOR_FLOOR = Palette.gray2
const COLOR_WALL = Palette.gray4
const COLOR_WATER = Palette.blue3
const COLOR_ICE = Palette.white
const COLOR_PLAYER = Palette.pink3
/** A narrow way through walls or over water (a bridge, a pass) */
const COLOR_GAP = Palette.yellow1

/** The minimap ui which shows the current block and the player position */
export function Minimap({ on, query, subscribe }: Context) {
  const canvas = query<HTMLCanvasElement>("canvas")!
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext("2d")!

  // The base terrain image of the current block
  const base = document.createElement("canvas")
  base.width = SIZE
  base.height = SIZE
  const baseCtx = base.getContext("2d")!

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
          const gap = (shut(at(x - 1, y)) && shut(at(x + 1, y))) ||
            (shut(at(x, y - 1)) && shut(at(x, y + 1)))
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
    ctx.fillRect(Math.floor(li / SCALE), Math.floor(lj / SCALE), 2, 2)
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

  // Tap to toggle the minimap visibility
  on("click", () => {
    canvas.classList.toggle("hidden")
  })
}
