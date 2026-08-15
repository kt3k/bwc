import type { IProp } from "../model/types.ts"
import type { RectScope } from "../util/rect-scope.ts"
import { CELL_SIZE } from "../util/constants.ts"

/** The length of a full day-night cycle in frames (5 min at 60 fps) */
export const DAY_CYCLE = 18000

/**
 * Returns the darkness of the night (0 = day, 0.75 = midnight) for the
 * given field time. The first half of the cycle is day, the second half
 * is night, with smooth transitions.
 */
export function nightDarknessAt(time: number): number {
  const phase = (time % DAY_CYCLE) / DAY_CYCLE
  return Math.round(Math.max(0, -Math.sin(2 * Math.PI * phase)) * 75) / 100
}

/** The radius of the light around a lantern in pixels */
const LANTERN_RADIUS = 44
/** The radius of the dim light around the player in pixels */
const PLAYER_RADIUS = 30

/**
 * Draws the night darkness overlay, punching light holes around the
 * lanterns in view and a dim one around the screen center (the player).
 */
export function drawNight(
  ctx: CanvasRenderingContext2D,
  size: number,
  props: Iterable<IProp>,
  viewScope: RectScope,
  darkness: number,
) {
  ctx.clearRect(0, 0, size, size)
  if (darkness <= 0) {
    return
  }
  ctx.fillStyle = `rgba(0, 0, 0, ${darkness})`
  ctx.fillRect(0, 0, size, size)

  ctx.globalCompositeOperation = "destination-out"

  const punch = (x: number, y: number, radius: number, strength: number) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, `rgba(0, 0, 0, ${strength})`)
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)")
    ctx.fillStyle = gradient
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }

  for (const prop of props) {
    if (prop.type !== "lantern") {
      continue
    }
    punch(
      prop.x - viewScope.left + CELL_SIZE / 2,
      prop.y - viewScope.top + CELL_SIZE / 2,
      LANTERN_RADIUS,
      1,
    )
  }

  // A dim light around the player (the screen center)
  punch(size / 2, size / 2, PLAYER_RADIUS, 0.6)

  ctx.globalCompositeOperation = "source-over"
}
