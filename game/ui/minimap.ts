import type { Context } from "@kt3k/cell"
import * as signal from "../../util/signals.ts"
import { BLOCK_SIZE } from "../../util/constants.ts"
import type { FieldBlock } from "../../model/field-block.ts"
import { floorN } from "../../util/math.ts"
import { Palette, type PaletteColor } from "../../util/palette.ts"

/** The number of cells represented by one minimap pixel (small) */
const SMALL = 4
/**
 * How far the map reaches from the player, every way (cells). The blocks
 * within it are always loaded (game/field.ts, BlockLoadScope), and the map
 * follows the player instead of showing the block they're in, so nothing
 * tells where one block ends and the next one begins
 */
const REACH = BLOCK_SIZE / 2

const COLOR_FLOOR = Palette.gray2
const COLOR_WALL = Palette.gray4
const COLOR_WATER = Palette.blue3
const COLOR_ICE = Palette.white
const COLOR_PLAYER = Palette.pink3
/** A narrow way through walls or over water (a bridge, a pass) */
const COLOR_GAP = Palette.yellow1

/** The minimap ui: the land around the player, the player in the middle */
export function Minimap({ el, on, query, subscribe }: Context) {
  const canvas = query<HTMLCanvasElement>("canvas")!
  const ctx = canvas.getContext("2d")!

  // The base terrain image around the player
  const base = document.createElement("canvas")
  const baseCtx = base.getContext("2d")!

  /** Tapped open: a cell a pixel, over the middle of the screen */
  let big = false
  let SCALE = SMALL
  let SIZE = 2 * REACH / SCALE
  const resize = () => {
    SCALE = big ? 1 : SMALL
    SIZE = 2 * REACH / SCALE
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

  let blockAt: ((i: number, j: number) => FieldBlock | undefined) | null = null
  let playerPos: { i: number; j: number } | null = null
  /** The world cell at the top left of the map (on the SCALE grid) */
  let origin: { i: number; j: number } | null = null

  /** The block last looked at, for the cells next to it */
  let last: FieldBlock | undefined
  const cellAt = (i: number, j: number) => {
    if (
      !last || i < last.i || j < last.j || i >= last.i + BLOCK_SIZE ||
      j >= last.j + BLOCK_SIZE
    ) {
      last = blockAt?.(i, j)
    }
    return last?.getCell(i, j)
  }

  /** What a pixel of the minimap shows, from its SCALE x SCALE cells */
  type Kind = "floor" | "wall" | "water" | "ice"
  const kindAt = (x: number, y: number): Kind => {
    let water = 0, ice = false, through = false
    for (let dy = 0; dy < SCALE; dy++) {
      for (let dx = 0; dx < SCALE; dx++) {
        const cell = cellAt(
          origin!.i + x * SCALE + dx,
          origin!.j + y * SCALE + dy,
        )
        // not loaded (yet): shown as a wall
        if (!cell) continue
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
    last = undefined
    if (!blockAt || !origin) {
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
    if (!origin || !playerPos) {
      return
    }
    const li = playerPos.i - origin.i
    const lj = playerPos.j - origin.j
    ctx.fillStyle = COLOR_PLAYER
    const dot = big ? 4 : 2
    ctx.fillRect(
      Math.floor(li / SCALE) - (big ? 1 : 0),
      Math.floor(lj / SCALE) - (big ? 1 : 0),
      dot,
      dot,
    )
  }

  /** The map's top left for the player there, on the SCALE grid */
  const originFor = ({ i, j }: { i: number; j: number }) => ({
    i: floorN(i, SCALE) - REACH,
    j: floorN(j, SCALE) - REACH,
  })

  /** Draws the land again (moved on, or more of it loaded) */
  const refresh = () => {
    if (playerPos) origin = originFor(playerPos)
    renderBase()
    render()
  }

  subscribe(signal.fieldBlocks, (v) => {
    blockAt = v?.blockAt ?? null
    refresh()
  })

  subscribe(signal.centerGrid, ({ i, j }) => {
    playerPos = { i, j }
    const next = originFor(playerPos)
    if (!origin || next.i !== origin.i || next.j !== origin.j) refresh()
    else render()
  })

  // Tap to open the map big (a cell a pixel), tap again to close it
  on("click", () => {
    big = !big
    resize()
    refresh()
  })
}
