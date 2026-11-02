// The Cayley rooms (ideas/groups.md, docs/group-representations.md), as
// plain data: a finite group by its Cayley table, and a room's state, one
// element of it. The room has a gate per element, exactly one open, the
// gate of the state g (at first e); a lever per generator x moves the
// opening from g to g·x (right multiplication, kt3k/group's switch: "the
// switch moves from state g to g·x when you press x"). So from e the open
// gate is always the product of the levers pulled, in order.
//
// The tables are model/cayley-groups.ts (kt3k/group's data.json).
import { CAYLEY_GROUPS } from "./cayley-groups.ts"

/** A finite group: its elements are 0 .. order - 1, e = 0 */
export type CayleyGroup = {
  /** "order.id", the GAP SmallGroup id: "8.3" is D4 */
  key: string
  order: number
  /** The GAP SmallGroup number among the groups of its order */
  id: number
  names: readonly string[]
  desc: string
  descJa: string
  /** Generators (element indices) of kt3k/group */
  gens: readonly number[]
  /** t[a * order + b] = a·b */
  t: readonly number[]
}

export const groupKeyOf = (order: number, id: number) => `${order}.${id}`

/** Every group of order 1 to 20 (54), in the order of kt3k/group */
export const ALL_GROUPS: readonly CayleyGroup[] = CAYLEY_GROUPS.map(
  ([order, id, names, desc, descJa, gens, packed]) => ({
    key: groupKeyOf(order, id),
    order,
    id,
    names,
    desc,
    descJa,
    gens,
    t: [...packed].map((c) => parseInt(c, 36)),
  }),
)

const byKey = new Map(ALL_GROUPS.map((g) => [g.key, g]))

/** The group of the key ("8.3"), or undefined */
export const groupByKey = (key: string): CayleyGroup | undefined =>
  byKey.get(key)

/** a·b */
export const mul = (g: CayleyGroup, a: number, b: number): number =>
  g.t[a * g.order + b]

/** The product of the word (element indices), from e: x1·x2·... */
export const evalWord = (g: CayleyGroup, word: readonly number[]): number =>
  word.reduce((acc, x) => mul(g, acc, x), 0)

/** The inverse of a */
export function inverse(g: CayleyGroup, a: number): number {
  for (let b = 0; b < g.order; b++) if (mul(g, a, b) === 0) return b
  throw new Error(`${g.key}: ${a} has no inverse`)
}

/** The order of a: the least k > 0 with a^k = e */
export function elementOrder(g: CayleyGroup, a: number): number {
  let x = a, k = 1
  while (x !== 0) {
    x = mul(g, x, a)
    k++
  }
  return k
}

/** true if every a·b = b·a */
export function isAbelian(g: CayleyGroup): boolean {
  for (let a = 0; a < g.order; a++) {
    for (let b = 0; b < a; b++) if (mul(g, a, b) !== mul(g, b, a)) return false
  }
  return true
}

/**
 * The group axioms checked on the table: closed, e = 0 is the identity,
 * every element has an inverse (each row and column a permutation),
 * associative. Returns the first broken law, or null
 */
export function brokenAxiom(n: number, t: readonly number[]): string | null {
  if (t.length !== n * n) return "the table is not n x n"
  if (t.some((x) => !Number.isInteger(x) || x < 0 || x >= n)) return "closure"
  for (let a = 0; a < n; a++) {
    if (t[a] !== a || t[a * n] !== a) return "identity"
  }
  for (let a = 0; a < n; a++) {
    const row = new Set<number>(), col = new Set<number>()
    for (let b = 0; b < n; b++) {
      row.add(t[a * n + b])
      col.add(t[b * n + a])
    }
    if (row.size !== n || col.size !== n) return "inverses"
  }
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      for (let c = 0; c < n; c++) {
        if (t[t[a * n + b] * n + c] !== t[a * n + t[b * n + c]]) {
          return "associativity"
        }
      }
    }
  }
  return null
}

/**
 * The shortest words in the generators (indices into `gens`) reaching
 * each element from e, pulling levers only (no inverses): words[x] is a
 * word of the least pulls, the first found in the levers' order; null for
 * an element the levers never reach
 */
export function shortestWords(
  g: CayleyGroup,
  gens: readonly number[],
): (number[] | null)[] {
  const words: (number[] | null)[] = Array(g.order).fill(null)
  words[0] = []
  const queue = [0]
  while (queue.length) {
    const x = queue.shift()!
    gens.forEach((by, k) => {
      const y = mul(g, x, by)
      if (words[y] === null) {
        words[y] = [...words[x]!, k]
        queue.push(y)
      }
    })
  }
  return words
}

/** true if the generators reach every element */
export const generates = (g: CayleyGroup, gens: readonly number[]) =>
  shortestWords(g, gens).every((w) => w !== null)

/**
 * The target of a room: an element that needs several pulls (`want`, or
 * as many as the farthest one needs if fewer) and, for a group that
 * doesn't commute, one whose shortest word pulled the other way round
 * opens another gate (so the order matters). null for the trivial group
 */
export function pickTarget(
  g: CayleyGroup,
  gens: readonly number[],
  want = 4,
): number | null {
  const words = shortestWords(g, gens) as number[][]
  const far = Math.max(...words.map((w) => w.length))
  if (far === 0) return null
  const distance = Math.min(want, far)
  const at = (d: number) =>
    words.map((w, x) => [w, x] as const).filter(([w]) => w.length === d)
  if (!isAbelian(g)) {
    // the nearest distance to the wanted one with an order that matters
    for (const d of [distance, ...words.map((_, k) => k + 1)]) {
      if (d > far) continue
      const found = at(d).find(([w, x]) =>
        evalWord(g, w.map((k) => gens[k]).reverse()) !== x
      )
      if (found) return found[1]
    }
  }
  return at(distance)[0][1]
}

// ---------------------------------------------------------------------
// the rooms' states

/** The open gate of each room (its element), in memory: a reload is e */
const states = new Map<string, number>()

/** The element of the open gate of the room now */
export const openGateOf = (room: string): number => states.get(room) ?? 0

/** Pulls the lever x of the room: the opening moves from g to g·x */
export function pullCayley(room: string, g: CayleyGroup, x: number): number {
  const next = mul(g, openGateOf(room), x)
  states.set(room, next)
  return next
}

/** Every room back to e (used by tests) */
export function resetCayleyStates() {
  states.clear()
}

/** The group's name as the signs write it (ASCII: Z2^3, Z3:Z4, D4xZ2) */
export function asciiName(name: string): string {
  const sub = "₀₁₂₃₄₅₆₇₈₉", sup = "⁰¹²³⁴⁵⁶⁷⁸⁹"
  return [...name].map((c) => {
    if (sub.includes(c)) return String(sub.indexOf(c))
    if (sup.includes(c)) return `^${sup.indexOf(c)}`
    if (c === "×") return "x"
    if (c === "⋊") return ":"
    if (c === "∘") return "o"
    return c
  }).join("").toUpperCase()
}
