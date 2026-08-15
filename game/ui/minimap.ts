import type { Context } from "@kt3k/cell"
import * as signal from "../../util/signals.ts"
import { BLOCK_SIZE } from "../../util/constants.ts"
import type { FieldBlock } from "../../model/field-block.ts"

/** The number of cells represented by one minimap pixel */
const SCALE = 4
/** The size of the minimap canvas in pixels */
const SIZE = BLOCK_SIZE / SCALE

// NES palette colors (see the pixeledit palette)
const COLOR_FLOOR = "#b9bcb9"
const COLOR_WALL = "#4a4d4a"
const COLOR_WATER = "#1950c7"
const COLOR_ICE = "#ffffff"
const COLOR_PLAYER = "#9d285c"

/** The minimap ui which shows the current block and the player position */
export function Minimap({ el, on, query, subscribe }: Context) {
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

  const renderBase = () => {
    baseCtx.clearRect(0, 0, SIZE, SIZE)
    if (!block) {
      return
    }
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const cell = block.getCell(x * SCALE, y * SCALE)
        let color = COLOR_WALL
        if (cell.slippery) {
          color = COLOR_ICE
        } else if (cell.canEnter) {
          color = COLOR_FLOOR
        } else if (cell.name === "w") {
          color = COLOR_WATER
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
