// The game feel requests shared by the game objects: a hit-stop (the
// world holds still for a few frames when something breaks), a screen
// shake (the view jitters by 1px) and white noise (the screen's white
// noise, game/draw-layer.ts, drawn every frame for a while, as when a
// goal is done). The game loop reads and winds them down
// (game/game-screen.ts).

export const juice = {
  /** Frames the world holds still (the screen is still drawn) */
  freeze: 0,
  /** Frames the view jitters */
  shake: 0,
  /** Frames the white noise is drawn over the screen */
  noise: 0,
}

/** Holds the world still for the given frames */
export function hitStop(frames: number) {
  juice.freeze = Math.max(juice.freeze, frames)
}

/**
 * One frame of the world: steps it, unless it is held still by a hit
 * stop (then a frame of the hold is used up instead; nothing moves and
 * the input waits). Returns true if the world was stepped
 */
export function stepWorld(step: () => void): boolean {
  if (juice.freeze > 0) {
    juice.freeze--
    return false
  }
  step()
  return true
}

/** Jitters the view for the given frames */
export function shake(frames: number) {
  juice.shake = Math.max(juice.shake, frames)
}

/** The view offset of the shake for this frame: 1px, alternating */
export function shakeOffset(): { x: number; y: number } {
  if (juice.shake <= 0) return { x: 0, y: 0 }
  const k = juice.shake % 4
  return {
    x: k === 0 ? 1 : k === 2 ? -1 : 0,
    y: k === 1 ? 1 : k === 3 ? -1 : 0,
  }
}

/**
 * Draws the white noise over the screen for the given frames (from this
 * one on): it stops at once when they are up
 */
export function whiteNoise(frames: number) {
  juice.noise = Math.max(juice.noise, frames)
}
