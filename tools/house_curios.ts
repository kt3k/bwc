// The curios of the houses (docs/playtest-2026-10-21.md, plan 3): houses
// built to the same plan all looked alike, so each house gets one thing
// of its own, its curio: something odd in a corner (a clock, a statue, a
// moon shell), a creature that lives there (a cat, a snail, a cloud
// indoors), or a small treasure lying about. The curios go round a list
// so that houses side by side differ.

/** Where a curio goes: a prop or a creature in a corner, an item anywhere */
type Curio = { list: "props" | "actors" | "items"; type: string }

export const CURIOS: Curio[] = [
  { list: "props", type: "clock" },
  { list: "actors", type: "cat" },
  { list: "items", type: "scroll" },
  { list: "props", type: "moon-shell" },
  { list: "actors", type: "snail" },
  { list: "items", type: "feather" },
  { list: "props", type: "self-statue" },
  { list: "actors", type: "book" },
  { list: "items", type: "gem" },
  { list: "props", type: "drawer-tower" },
  { list: "actors", type: "cloud" },
  { list: "items", type: "star" },
  { list: "props", type: "nest-jar-2" },
  { list: "actors", type: "piggy" },
  { list: "items", type: "sock" },
  { list: "props", type: "packed-box" },
  { list: "actors", type: "fluff" },
  { list: "items", type: "gear" },
  { list: "props", type: "lone-window" },
  { list: "actors", type: "spore" },
  { list: "items", type: "button" },
]

type Rect = { x0: number; y0: number; x1: number; y1: number }

/**
 * Puts the curio of the n-th house in one of its rooms: a prop or a
 * creature in a free corner (out of the way through), an item on any free
 * floor. `put` returns false where the cell is taken. Returns the curio's
 * type, or null where nothing fitted.
 */
export function putCurio(
  n: number,
  rooms: (Rect & { keep?: Set<string> })[],
  cellKey: (x: number, y: number) => string,
  put: (list: Curio["list"], x: number, y: number, type: string) => boolean,
): string | null {
  const curio = CURIOS[n % CURIOS.length]
  for (const r of [...rooms].reverse()) {
    const free = (x: number, y: number) =>
      x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1 &&
      !r.keep?.has(cellKey(x, y))
    const corners: [number, number][] = [
      [r.x1 - 1, r.y1 - 1],
      [r.x0 + 1, r.y1 - 1],
      [r.x1 - 1, r.y0 + 1],
      [r.x0 + 1, r.y0 + 1],
    ]
    const cells: [number, number][] = curio.list === "items"
      ? [...corners, [(r.x0 + r.x1) >> 1, (r.y0 + r.y1) >> 1]]
      : corners
    for (const [x, y] of cells) {
      if (free(x, y) && put(curio.list, x, y, curio.type)) return curio.type
    }
  }
  return null
}
