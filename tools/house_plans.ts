// The house plans shared by the town generators (tools/generate_wilds.ts
// for the villages, tools/generate_city.ts for the cities).
//
// A plan is drawn in its own frame: the front door on the bottom wall,
// the house reaching up (away from the street) from it. Its rooms are
// rects (walls inclusive) that touch along shared wall lines, and a
// doorway is cut in a shared wall at each listed gap cell. `layPlan`
// turns a plan to face a street (and mirrors it), and hands back the
// cells it takes in world coordinates; the generators then check the
// ground, write the walls and floors their own way, and furnish the
// rooms.

export type RoomKind =
  | "kitchen"
  | "dining"
  | "bedroom"
  | "bathroom"
  // the rooms of the odd houses (growPlan): no one lives like this
  | "dormitory"
  | "privies"
  | "library"
  | "candlelit"
  | "empty"

/** The kinds of room only an odd house has */
export const ODD_KINDS: RoomKind[] = [
  "dormitory",
  "privies",
  "library",
  "candlelit",
  "empty",
]

export type PlanRoom = {
  x0: number
  y0: number
  x1: number
  y1: number
  kind: RoomKind
}

export type HousePlan = {
  name: string
  rooms: PlanRoom[]
  door: [number, number]
  gaps: [number, number][]
}

/** The plans, big ones first: an L-shaped cottage with the bathroom
 * out back, the farmhouse with its wing, the longhouse, and the rare
 * manor with its two wings and a hall in the middle */
export const PLANS: HousePlan[] = [
  {
    name: "cottage",
    rooms: [
      { x0: 0, y0: 4, x1: 8, y1: 10, kind: "kitchen" },
      { x0: 0, y0: 0, x1: 8, y1: 4, kind: "bedroom" },
      { x0: 8, y0: 0, x1: 12, y1: 4, kind: "bathroom" },
    ],
    door: [4, 10],
    gaps: [[4, 4], [8, 2]],
  },
  {
    name: "farmhouse",
    rooms: [
      { x0: 0, y0: 4, x1: 10, y1: 10, kind: "dining" },
      { x0: 0, y0: 0, x1: 5, y1: 4, kind: "kitchen" },
      { x0: 5, y0: 0, x1: 10, y1: 4, kind: "bedroom" },
      { x0: 10, y0: 5, x1: 14, y1: 10, kind: "bathroom" },
    ],
    door: [5, 10],
    gaps: [[2, 4], [8, 4], [10, 7]],
  },
  {
    name: "longhouse",
    rooms: [
      { x0: 6, y0: 4, x1: 12, y1: 10, kind: "dining" },
      { x0: 0, y0: 4, x1: 6, y1: 10, kind: "kitchen" },
      { x0: 12, y0: 4, x1: 18, y1: 10, kind: "bedroom" },
      { x0: 7, y0: 0, x1: 11, y1: 4, kind: "bathroom" },
    ],
    door: [9, 10],
    gaps: [[6, 7], [12, 7], [9, 4]],
  },
  {
    name: "manor",
    rooms: [
      { x0: 4, y0: 6, x1: 10, y1: 12, kind: "dining" },
      { x0: 4, y0: 0, x1: 10, y1: 6, kind: "kitchen" },
      { x0: 0, y0: 0, x1: 4, y1: 12, kind: "bedroom" },
      { x0: 10, y0: 0, x1: 14, y1: 12, kind: "bathroom" },
    ],
    door: [7, 12],
    gaps: [[7, 6], [4, 9], [10, 9]],
  },
]

/** The two-room hut: the last resort where no other plan finds room */
export const HUT: HousePlan = {
  name: "hut",
  rooms: [
    { x0: 0, y0: 4, x1: 8, y1: 9, kind: "kitchen" },
    { x0: 0, y0: 0, x1: 8, y1: 4, kind: "bedroom" },
  ],
  door: [4, 9],
  gaps: [[4, 4]],
}

export const cellKey = (x: number, y: number) => `${x},${y}`

/** A plan laid in the world: its rooms as world rects (walls
 * inclusive), the cells of its floors and walls, its doorways (the
 * front door among them), the cells kept clear of furniture (either
 * side of every doorway), and the box around it all */
export type LaidPlan = {
  rooms: (PlanRoom & { keep: Set<string> })[]
  floor: Set<string>
  walls: Set<string>
  gaps: Set<string>
  keep: Set<string>
  bounds: { x0: number; y0: number; x1: number; y1: number }
}

/**
 * Lays `plan` with its front door on the world cell `door`, the house
 * reaching away from the street along `inward`, mirrored when `flip`
 * is -1. Throws if the plan's gaps leave a room shut off (a plan is a
 * constant, so that is a bug in it, not in the ground).
 */
export function layPlan(
  plan: HousePlan,
  door: [number, number],
  inward: [number, number],
  flip: 1 | -1,
): LaidPlan {
  const [nx, ny] = inward
  const rx = -ny * flip, ry = nx * flip
  const tf = (px: number, py: number): [number, number] => {
    const u = px - plan.door[0], v = py - plan.door[1]
    return [door[0] + u * rx - v * nx, door[1] + u * ry - v * ny]
  }
  const keep = new Set<string>()
  const rooms = plan.rooms.map((r) => {
    const [ax, ay] = tf(r.x0, r.y0), [bx, by] = tf(r.x1, r.y1)
    return {
      x0: Math.min(ax, bx),
      y0: Math.min(ay, by),
      x1: Math.max(ax, bx),
      y1: Math.max(ay, by),
      kind: r.kind,
      keep,
    }
  })
  // a room's inside is floor, its border wall (a wall two rooms share
  // stays a wall between them), the doorways floor again
  const floor = new Set<string>(), walls = new Set<string>()
  for (const r of rooms) {
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const edge = x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1
        ;(edge ? walls : floor).add(cellKey(x, y))
      }
    }
  }
  for (const k of floor) walls.delete(k)
  const gaps = new Set<string>()
  const open = (x: number, y: number) => {
    walls.delete(cellKey(x, y))
    floor.add(cellKey(x, y))
    gaps.add(cellKey(x, y))
    // the cells either side of a doorway (and one step on) stay
    // clear of furniture, so the way through is open
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (floor.has(cellKey(x + dx, y + dy))) {
        keep.add(cellKey(x + dx, y + dy))
        keep.add(cellKey(x + 2 * dx, y + 2 * dy))
      }
    }
  }
  for (const [gx, gy] of plan.gaps) open(...tf(gx, gy))
  open(door[0], door[1])
  // every room reachable from the door
  const seen = new Set<string>([cellKey(...door)])
  const queue: [number, number][] = [door]
  for (let q = 0; q < queue.length; q++) {
    const [x, y] = queue[q]
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = cellKey(x + dx, y + dy)
      if (floor.has(k) && !seen.has(k)) {
        seen.add(k)
        queue.push([x + dx, y + dy])
      }
    }
  }
  if (seen.size !== floor.size) {
    throw new Error(`the ${plan.name} plan has a room shut off`)
  }
  return {
    rooms,
    floor,
    walls,
    gaps,
    keep,
    bounds: {
      x0: Math.min(...rooms.map((r) => r.x0)),
      y0: Math.min(...rooms.map((r) => r.y0)),
      x1: Math.max(...rooms.map((r) => r.x1)),
      y1: Math.max(...rooms.map((r) => r.y1)),
    },
  }
}

/** The cells a laid plan takes, each as [x, y] */
export function cellsOf(laid: LaidPlan): [number, number][] {
  return [...laid.floor, ...laid.walls].map((k) => {
    const [x, y] = k.split(",").map(Number)
    return [x, y]
  })
}

// ---------------------------------------------------------------------
// the odd houses: plans grown room by room, as no builder would

export type GrowStyle = "snake" | "spiral" | "warren" | "grid"
export const GROW_STYLES: GrowStyle[] = ["snake", "spiral", "warren", "grid"]

/**
 * Grows a plan of about `rooms` rooms (fewer if the growing gets
 * stuck). From the front room, each new room is set against a wall
 * of a room that is there, sharing a stretch of it 3 cells or more,
 * and a doorway is cut in that stretch:
 *
 * - snake: each room against the last, so they wind off in a line
 * - spiral: the snake turning the same way every room
 * - warren: against any room, so it clumps and branches
 * - grid: rooms of a size in rows and columns, a doorway between
 *   every two neighbors, so the ways round loop
 *
 * Nothing goes below the front room's bottom wall, where the door is.
 * With `limits`, nothing reaches deeper than `depth` cells up from the
 * door's wall, or farther than `halfWidth` cells to either side of
 * the door (a city block only has so much room behind the street).
 */
export function growPlan(
  rng: () => number,
  rooms: number,
  style: GrowStyle,
  limits?: { depth: number; halfWidth: number },
): HousePlan {
  const ri = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))
  const pick = () => ODD_KINDS[Math.floor(rng() * ODD_KINDS.length)]
  if (style === "grid") {
    const cols = Math.max(2, Math.min(5, Math.round(Math.sqrt(rooms))))
    const rows = Math.max(2, Math.ceil(rooms / cols))
    const w = 6, h = 6
    const kind = pick()
    if (limits) {
      // as many rows as fit the depth, the rest of the rooms as columns
      const rowsIn = Math.max(1, Math.min(rows, Math.floor(limits.depth / h)))
      const colsIn = Math.max(
        2,
        Math.min(
          Math.ceil(rooms / rowsIn),
          Math.floor(2 * limits.halfWidth / w),
        ),
      )
      return growGrid(rowsIn, colsIn, w, h, kind)
    }
    return growGrid(rows, cols, w, h, kind)
  }
  const first: PlanRoom = {
    x0: 0,
    y0: 0,
    x1: ri(5, 8),
    y1: ri(5, 8),
    kind: pick(),
  }
  const out: PlanRoom[] = [first]
  const gaps: [number, number][] = []
  let turn = ri(0, 3)
  for (let tries = 0; out.length < rooms && tries < rooms * 40; tries++) {
    // boxed in for long, a snake or spiral grows from any room instead
    const parent = style === "warren" || tries > rooms * 20
      ? out[Math.floor(rng() * out.length)]
      : out[out.length - 1]
    // 0 north, 1 east, 2 south, 3 west (a spiral turns on, blocked or not)
    const side = style === "spiral" ? turn++ % 4 : ri(0, 3)
    if (parent === first && side === 2) continue
    const [lo, hi] = style === "warren"
      ? [4, 6]
      : style === "snake"
      ? [4, 9]
      : [5, 7]
    const nw = ri(lo, hi), nh = ri(lo, hi)
    let r: PlanRoom
    if (side === 0 || side === 2) {
      const off = ri(-(nw - 3), parent.x1 - parent.x0 - 3)
      const x0 = parent.x0 + off
      r = side === 0
        ? { x0, y0: parent.y0 - nh, x1: x0 + nw, y1: parent.y0, kind: pick() }
        : { x0, y0: parent.y1, x1: x0 + nw, y1: parent.y1 + nh, kind: pick() }
    } else {
      const off = ri(-(nh - 3), parent.y1 - parent.y0 - 3)
      const y0 = parent.y0 + off
      r = side === 1
        ? { x0: parent.x1, y0, x1: parent.x1 + nw, y1: y0 + nh, kind: pick() }
        : { x0: parent.x0 - nw, y0, x1: parent.x0, y1: y0 + nh, kind: pick() }
    }
    if (r.y1 > first.y1) continue
    if (
      limits && (first.y1 - r.y0 > limits.depth ||
        Math.abs(r.x0 - (first.x1 >> 1)) > limits.halfWidth ||
        Math.abs(r.x1 - (first.x1 >> 1)) > limits.halfWidth)
    ) continue
    // against the rooms there, a room may share a wall line, no more
    const fits = out.every((o) => {
      const ix0 = Math.max(o.x0, r.x0), ix1 = Math.min(o.x1, r.x1)
      const iy0 = Math.max(o.y0, r.y0), iy1 = Math.min(o.y1, r.y1)
      return ix0 > ix1 || iy0 > iy1 || ix0 === ix1 || iy0 === iy1
    })
    if (!fits) continue
    // the doorway in the shared stretch, off both rooms' corners
    if (side === 0 || side === 2) {
      const gx = ri(
        Math.max(parent.x0, r.x0) + 1,
        Math.min(parent.x1, r.x1) - 1,
      )
      gaps.push([gx, side === 0 ? parent.y0 : parent.y1])
    } else {
      const gy = ri(
        Math.max(parent.y0, r.y0) + 1,
        Math.min(parent.y1, r.y1) - 1,
      )
      gaps.push([side === 1 ? parent.x1 : parent.x0, gy])
    }
    out.push(r)
  }
  return {
    name: style,
    rooms: out,
    door: [first.x1 >> 1, first.y1],
    gaps,
  }
}

/** The grid plan: rooms of a size in rows and columns, a doorway
 * between every two neighbors, the door under the middle column */
function growGrid(
  rows: number,
  cols: number,
  w: number,
  h: number,
  kind: RoomKind,
): HousePlan {
  const out: PlanRoom[] = []
  const gaps: [number, number][] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = c * w, y0 = r * h
      out.push({ x0, y0, x1: x0 + w, y1: y0 + h, kind })
      if (c > 0) gaps.push([x0, y0 + (h >> 1)])
      if (r > 0) gaps.push([x0 + (w >> 1), y0])
    }
  }
  return {
    name: "grid",
    rooms: out,
    door: [(cols >> 1) * w + (w >> 1), rows * h],
    gaps,
  }
}
