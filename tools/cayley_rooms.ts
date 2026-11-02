// The Cayley rooms of the CAYLEY map (tools/generate_cayley_map.ts,
// ideas/groups.md), laid out: which groups, with which levers, and where
// each group's gates stand so the room is a picture of its Cayley graph.
// No drawing and no files here, so the tests can lay the rooms again.
//
// A gate stands at the bottom of a 3x3 block of wall, its one-cell alcove
// above it, the way to it below. Two gates stand at least 4 cells apart
// across or down, so a cell of floor runs between any two blocks.
//
// The layouts (`Layout`), each from the cosets g<a> of the first lever a
// (the gates its pulls go round: g, ga, ga², ...), drawn as rings:
//
// - "ring": one ring (a cyclic group, one lever)
// - "concentric": two rings, one inside the other (a coset of index 2).
//   The second lever b crosses straight out: the gate of g·b stands at the
//   angle of g. So a turns the outer ring the same way as the inner one
//   where b commutes with a (Zn x Z2), the other way where b a b⁻¹ = a⁻¹
//   (Dn, Dic3, Q8 ...)
// - "offset": the same two rings side by side, the second up and to the
//   right, like the two squares of a cube drawn in perspective (Z2 x Z2 as
//   four corners, Q8)
// - "row", "grid": the rings in a row, or in a grid (the generic layout,
//   for any group and any levers)
// - "star": four triangles, a middle one and three round it, each tied to
//   a corner of the middle one by b, the picture of A4 (a truncated
//   tetrahedron seen from above)
// - "cube": every lever of order 2, the gates at the corners of a cube
//   (Z2³), or of two cubes side by side (Z2⁴)
import {
  ALL_GROUPS,
  asciiName,
  type CayleyGroup,
  elementOrder,
  evalWord,
  groupByKey,
  inverse,
  isAbelian,
  mul,
  pickTarget,
  shortestWords,
} from "../model/cayley.ts"

export type Layout =
  | "ring"
  | "concentric"
  | "offset"
  | "row"
  | "grid"
  | "star"
  | "cube"

export type RoomSpec = {
  /** The group's key ("8.3") */
  key: string
  /** The levers' generators (element indices); kt3k/group's by default */
  gens?: number[]
  layout?: Layout
  /** The room's own name when a group has more than one room */
  suffix?: string
  /** A line for the name sign */
  note?: string
}

/** The first element of the order, for the levers of a room */
const ofOrder = (g: CayleyGroup, n: number) =>
  [...Array(g.order).keys()].find((x) => elementOrder(g, x) === n)!

/**
 * The rooms: every group of order 1 to 20, and Z6 twice (one lever of
 * order 6, or two of orders 3 and 2: the same group, Z6 = Z3 x Z2)
 */
export const ROOM_SPECS: readonly RoomSpec[] = ALL_GROUPS.flatMap(
  (g): RoomSpec[] => {
    const special: Record<string, RoomSpec[]> = {
      "4.2": [{ key: g.key, layout: "offset", note: "FOUR CORNERS" }],
      "6.1": [{
        key: g.key,
        layout: "concentric",
        note:
          "TWO TRIANGLES: A TURNS THE OUTER ONE THE OTHER WAY ROUND. LOOK AT THE Z3xZ2 ROOM",
      }],
      "6.2": [
        { key: g.key, layout: "ring", note: "ONE RING OF SIX" },
        {
          key: g.key,
          suffix: "z3xz2",
          gens: [ofOrder(g, 3), ofOrder(g, 2)],
          layout: "concentric",
          note:
            "THE SAME GROUP AS Z6 (Z6 = Z3xZ2), ITS LEVERS OF ORDER 3 AND 2: TWO TRIANGLES, BOTH TURNED THE SAME WAY. B THEN A IS A SINGLE LEVER OF ORDER 6",
        },
      ],
      "8.2": [{
        key: g.key,
        layout: "concentric",
        note: "TWO SQUARES, BOTH TURNED THE SAME WAY. LOOK AT D4",
      }],
      "8.3": [{
        key: g.key,
        layout: "concentric",
        note: "TWO SQUARES: A TURNS THE OUTER ONE THE OTHER WAY ROUND",
      }],
      "8.4": [{
        key: g.key,
        layout: "offset",
        note: "TWO SQUARES LIKE A CUBE'S CORNERS. EVERY LEVER HAS ORDER 4",
      }],
      "8.5": [{ key: g.key, layout: "cube", note: "THE CORNERS OF A CUBE" }],
      "12.3": [{
        key: g.key,
        layout: "star",
        note: "FOUR TRIANGLES, A TRUNCATED TETRAHEDRON SEEN FROM ABOVE",
      }],
      "16.14": [{ key: g.key, layout: "cube", note: "TWO CUBES: A TESSERACT" }],
    }
    return special[g.key] ?? [{ key: g.key }]
  },
)

/** A room laid out */
export type Room = {
  /** The room's id, its goal id ("cayley-8-3") */
  id: string
  group: CayleyGroup
  gens: number[]
  layout: Layout
  /** The gate of each element: its alcove's cell, relative (x, y) */
  cells: [number, number][]
  /** The target's element, null for the trivial group */
  target: number | null
  /** The shortest word to it, lever indices */
  solution: number[]
  note?: string
}

export const PREFIX = "cayley-"
export const LEVER_NAMES = "abcd"

/** The levers' generators: the given ones, or kt3k/group's, longest first */
function gensOf(g: CayleyGroup, spec: RoomSpec): number[] {
  if (spec.gens) return spec.gens
  return [...g.gens].sort((x, y) => elementOrder(g, y) - elementOrder(g, x))
}

// ---------------------------------------------------------------------
// the cosets of the first lever, as rings

type Ring = {
  /** The gates in the ring's order (each a pull of a from the last) */
  els: number[]
  /** The angle index of each gate (0 .. m - 1, clockwise) */
  at: Map<number, number>
}

/**
 * The cosets g<a>, found from e by the other levers in turn. A coset
 * reached by b from a coset already found has its gates at the angles of
 * the gates they came from (g·b at the angle of g) when b normalizes <a>,
 * else in the order of a from where it was entered
 */
function cosetRings(g: CayleyGroup, gens: number[]): Ring[] {
  const [a, ...others] = gens
  const m = a === undefined ? 1 : elementOrder(g, a)
  const ringFrom = (rep: number) => {
    const els = [rep]
    while (els.length < m) els.push(mul(g, els[els.length - 1], a))
    return els
  }
  const ringOf = new Map<number, number>()
  const rings: Ring[] = []
  const add = (els: number[], at: Map<number, number>) => {
    els.forEach((x) => ringOf.set(x, rings.length))
    rings.push({ els, at })
  }
  const first = ringFrom(0)
  add(first, new Map(first.map((x, k) => [x, k])))
  for (let r = 0; r < rings.length; r++) {
    for (const b of others) {
      for (const x of rings[r].els) {
        const y = mul(g, x, b)
        if (ringOf.has(y)) continue
        const els = ringFrom(y)
        const bInv = inverse(g, b)
        // straight across: every gate of the new ring comes from this one
        const from = els.map((z) => mul(g, z, bInv))
        const straight = from.every((z) => ringOf.get(z) === r)
        const at = new Map(
          els.map((z, k) => [z, straight ? rings[r].at.get(from[k])! : k]),
        )
        add(els, at)
      }
    }
  }
  if (ringOf.size !== g.order) {
    throw new Error(`${g.key}: the levers don't reach every gate`)
  }
  return rings
}

/** The first angle of a ring of m: a flat top for 2, 4 and 8 */
const startAngle = (m: number) =>
  m === 2 ? -Math.PI / 2 : m === 4 ? -Math.PI / 4 : m === 8 ? -Math.PI / 8 : 0

/**
 * From this many gates a ring is the edge of a rectangle of gates 4 cells
 * apart (a corner or two left out for an odd count), which packs them
 * closer than a circle
 */
const BIG_RING = 7

/**
 * The ring of m gates round a rectangle, clockwise from the top left, its
 * half-size 1 (the gates 4 cells apart at the scale of `latticeHalf`)
 */
function latticeRing(m: number): { points: [number, number][]; half: number } {
  let w = 2, h = 2
  while (2 * (w + h) - 4 < m) {
    if (w === h) w++
    else h++
  }
  const edge: [number, number][] = []
  for (let x = 0; x < w; x++) edge.push([x, 0])
  for (let y = 1; y < h; y++) edge.push([w - 1, y])
  for (let x = w - 2; x >= 0; x--) edge.push([x, h - 1])
  for (let y = h - 2; y > 0; y--) edge.push([0, y])
  // the corners left out: the bottom right first, then the top left ...
  const out = [[w - 1, h - 1], [0, 0], [w - 1, 0], [0, h - 1]]
    .slice(0, edge.length - m).map(String)
  const half = (4 * (Math.max(w, h) - 1)) / 2
  const points = edge.filter((p) => !out.includes(String(p))).map((
    [x, y],
  ) =>
    [(4 * x - 2 * (w - 1)) / half, (4 * y - 2 * (h - 1)) / half] as [
      number,
      number,
    ]
  )
  return { points, half }
}

/** The point of the angle index k of a ring of m, radius r, round (cx, cy) */
function ringPoint(
  m: number,
  k: number,
  r: number,
  cx = 0,
  cy = 0,
  turn = 0,
): [number, number] {
  if (m === 1) return [cx, cy]
  if (m >= BIG_RING && turn === 0) {
    const [x, y] = latticeRing(m).points[k]
    return [cx + x * r, cy + y * r]
  }
  const angle = startAngle(m) + turn + (2 * Math.PI * k) / m
  return [cx + r * Math.sin(angle), cy - r * Math.cos(angle)]
}

/** Two gates are far enough apart: a cell of floor between their blocks */
const apart = (p: [number, number], q: [number, number]) =>
  Math.abs(p[0] - q[0]) >= 4 || Math.abs(p[1] - q[1]) >= 4

/** The points rounded, if every two are apart */
function fits(points: [number, number][]): [number, number][] | null {
  const cells = points.map(([x, y]) =>
    [Math.round(x), Math.round(y)] as [number, number]
  )
  for (let p = 0; p < cells.length; p++) {
    for (let q = 0; q < p; q++) if (!apart(cells[p], cells[q])) return null
  }
  return cells
}

/** The first of the sizes that fits (sizes in the order to try) */
function first(
  sizes: Iterable<number[]>,
  place: (...size: number[]) => [number, number][],
): [number, number][] {
  for (const size of sizes) {
    const cells = fits(place(...size))
    if (cells) return cells
  }
  throw new Error("no size fits")
}

function* steps(from: number, to: number, by = 0.5) {
  for (let x = from; x <= to + 1e-9; x += by) yield x
}

/** The gates' cells of the room (relative, any origin) */
function layOut(
  g: CayleyGroup,
  gens: number[],
  layout: Layout,
): [number, number][] {
  const n = g.order
  if (layout === "cube") {
    // every element a^i b^j c^k ..., each lever of order 2 a corner's step
    const vectors: [number, number][] = [[8, 0], [0, 8], [4, -4], [15, 0]]
    const points: [number, number][] = Array(n)
    for (let bits = 0; bits < 1 << gens.length; bits++) {
      const word = gens.filter((_, k) => bits & (1 << k))
      const p = vectors.slice(0, gens.length).reduce<[number, number]>(
        (acc, v, k) => bits & (1 << k) ? [acc[0] + v[0], acc[1] + v[1]] : acc,
        [0, 0],
      )
      points[evalWord(g, word)] = p
    }
    return fits(points)!
  }
  const rings = cosetRings(g, gens)
  const m = rings[0].els.length
  const c = rings.length
  const place = (
    centers: [number, number][],
    radii: number[],
    turns: number[] = [],
  ) => {
    const points: [number, number][] = Array(n)
    rings.forEach((ring, r) => {
      for (const x of ring.els) {
        points[x] = ringPoint(
          m,
          ring.at.get(x)!,
          radii[r],
          centers[r][0],
          centers[r][1],
          turns[r] ?? 0,
        )
      }
    })
    return points
  }
  const radius = (r: number) => Array(c).fill(r)
  switch (layout) {
    case "ring":
      return first(
        [...steps(0, 30, 0.25)].map((r) => [r]),
        (r) => place([[0, 0]], [r]),
      )
    case "concentric": {
      const sizes: number[][] = []
      for (const outer of steps(4, 30)) {
        // the inner ring as large as fits
        for (const inner of [...steps(0, outer - 4)].reverse()) {
          sizes.push([inner, outer])
        }
      }
      return first(
        sizes,
        (inner, outer) => place([[0, 0], [0, 0]], [inner, outer]),
      )
    }
    case "offset": {
      const sizes: number[][] = []
      for (const total of steps(4, 40)) {
        for (const r of steps(0, total)) sizes.push([r, total - r])
      }
      return first(sizes, (r, o) =>
        m === 2
          // a pair: the second pair under the first (four corners)
          ? place([[0, 0], [0, o]], radius(r))
          : place([[0, 0], [o, -o]], radius(r)))
    }
    case "row":
    case "grid": {
      const cols = layout === "row" ? c : Math.ceil(Math.sqrt(c))
      return first(
        [...steps(0, 20)].map((r) => [r]),
        (r) =>
          place(
            rings.map((_, k) => {
              const d = 2 * r + 5
              return [(k % cols) * d, Math.floor(k / cols) * d]
            }),
            radius(r),
          ),
      )
    }
    case "star": {
      // the middle ring, and a ring beyond each of its gates, entered at
      // the gate that faces the middle
      const sizes: number[][] = []
      for (const total of steps(4, 40)) {
        for (const r of steps(0, total / 2)) sizes.push([r, total])
      }
      const middle = rings[0]
      return first(sizes, (r, d) => {
        const points: [number, number][] = Array(n)
        for (const x of middle.els) {
          points[x] = ringPoint(m, middle.at.get(x)!, r)
        }
        for (const ring of rings.slice(1)) {
          // the gate of the middle ring this one is tied to
          const tie = gens.slice(1).flatMap((b) =>
            middle.els.filter((x) =>
              ring.els.includes(mul(g, x, b))
            )
          )[0]
          const k = middle.at.get(tie)!
          const [cx, cy] = ringPoint(m, k, d)
          const entry = ring.els.find((z) =>
            gens.slice(1).some((b) => mul(g, tie, b) === z)
          )!
          const turn = (2 * Math.PI * k) / m + Math.PI
          const e = ring.els.indexOf(entry)
          ring.els.forEach((z, j) => {
            points[z] = ringPoint(m, (j - e + m) % m, r, cx, cy, turn)
          })
        }
        return points
      })
    }
  }
  throw new Error(`unknown layout ${layout}`)
}

/** The default layout: a ring, two rings one inside the other, or a grid */
function defaultLayout(g: CayleyGroup, gens: number[]): Layout {
  if (gens.length <= 1) return "ring"
  const c = g.order / elementOrder(g, gens[0])
  if (c === 2) return "concentric"
  if (c === 3) return "row"
  return "grid"
}

/** Lays out the room of the spec */
export function layRoom(spec: RoomSpec): Room {
  const g = groupByKey(spec.key)
  if (!g) throw new Error(`no group ${spec.key}`)
  const gens = gensOf(g, spec)
  const layout = spec.layout ?? defaultLayout(g, gens)
  const raw = layOut(g, gens, layout)
  const x0 = Math.min(...raw.map(([x]) => x))
  const y0 = Math.min(...raw.map(([, y]) => y))
  const cells = raw.map(([x, y]) => [x - x0, y - y0] as [number, number])
  const target = pickTarget(g, gens)
  const solution = target === null
    ? []
    : shortestWords(g, gens)[target] as number[]
  return {
    id: `${PREFIX}${spec.key.replace(".", "-")}${
      spec.suffix ? `-${spec.suffix}` : ""
    }`,
    group: g,
    gens,
    layout,
    cells,
    target,
    solution,
    note: spec.note,
  }
}

/** Every room, laid out */
export const ROOMS: readonly Room[] = ROOM_SPECS.map(layRoom)

// ---------------------------------------------------------------------
// the signs

const word = (w: number[]) =>
  w.map((k) => LEVER_NAMES[k].toUpperCase()).join(" ")

/** The name sign: the group, its GAP id, the gates and levers */
export function nameText(room: Room): string {
  const g = room.group
  const names = g.names.map(asciiName).join(" = ")
  const levers = room.gens.map((x, k) => {
    const ord = elementOrder(g, x)
    return `${LEVER_NAMES[k].toUpperCase()} OF ORDER ${ord}`
  })
  return [
    `${names}: ${
      asciiName(g.desc)
    } OF ORDER ${g.order}, GAP SMALLGROUP (${g.order},${g.id}).`,
    `${g.order} GATE${g.order === 1 ? "" : "S"}`,
    levers.length
      ? `, ${levers.length} LEVER${levers.length === 1 ? "" : "S"}: ${
        levers.join(", ")
      }.`
      : ", NO LEVER.",
    isAbelian(g) ? " IT COMMUTES." : " IT DOES NOT COMMUTE.",
    room.note ? ` ${room.note}` : "",
  ].join("")
}

export const RULE_TEXT =
  "ONE GATE IS OPEN. EACH LEVER MOVES THE OPEN GATE ALONG ITS OWN PATH. OPEN THE GATE WITH THE DIAMOND: THE RING IS WHERE IT BEGAN"
export const TRIVIAL_RULE_TEXT =
  "ONE GATE, ALWAYS OPEN: THE GROUP OF ONE ELEMENT. NO LEVER, NOTHING TO DO"

/** The debug sign: a solution, and whether the order of the pulls matters */
export function debugText(room: Room): string {
  if (room.target === null) return "DEBUG: THE TRIVIAL GROUP, NO TARGET"
  const g = room.group
  const s = room.solution
  const reversed = evalWord(g, [...s].reverse().map((k) => room.gens[k]))
  const order = reversed !== room.target
    ? ` (${word([...s].reverse())} OPENS ANOTHER GATE: THE ORDER MATTERS)`
    : isAbelian(g)
    ? " IN ANY ORDER"
    : ""
  return `DEBUG: SOLUTION ${word(s)}${order}`
}
