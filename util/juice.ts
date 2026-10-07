// The game feel requests shared by the game objects: a hit-stop (the
// world holds still for a few frames when something breaks) and a
// screen shake (the view jitters by 1px). The game loop reads and winds
// them down (game/game-screen.ts).

export const juice = {
  /** Frames the world holds still (the screen is still drawn) */
  freeze: 0,
  /** Frames the view jitters */
  shake: 0,
}

/** Holds the world still for the given frames */
export function hitStop(frames: number) {
  juice.freeze = Math.max(juice.freeze, frames)
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
