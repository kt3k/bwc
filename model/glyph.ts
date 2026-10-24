// The unreadable letters (読めない文字, ideas/goal-types.md ご褒美): the
// reward of the goals. A letter is a small slab of black stone, like the
// Rosetta Stone, with a sign carved on it in pale gray, in a script
// nobody can read (after the Voynich manuscript and Linear A). What they do is not decided yet: for now they are picked up, kept
// and counted (the counter under the minimap). They have nothing to do
// with the signs.
//
// Every letter has an id, given by what gives it (a whole ring gives
// "ring.<id>.reward"), and its sign is drawn from the id: one of
// GLYPH_COUNT signs (tools/draw_glyphs.ts), each an item of the catalog
// ("glyph-<n>"). More letters than signs cycle the signs. A letter is
// given once: once taken, its id is among the collected item ids and it
// doesn't come back. The letters held (their ids and signs) are kept in
// the save (signal.glyphs).
import { DIRS } from "../util/dir.ts"
import { Palette } from "../util/palette.ts"
import * as signal from "../util/signals.ts"
import { linePattern0 } from "./effect.ts"
import { GlyphReveal, REVEAL_FRAMES } from "./goal-fx.ts"
import { Item } from "./item.ts"
import type { IActor, IField, IItem } from "./types.ts"

/** How many signs there are (tools/draw_glyphs.ts draws them) */
export const GLYPH_COUNT = 24

/** The item type of the n-th sign */
export const glyphType = (n: number) => `glyph-${n}`

/** The sign of an item type ("glyph-<n>"), or null if it isn't a letter */
export function glyphOfType(type: string): number | null {
  const m = /^glyph-(\d+)$/.exec(type)
  return m ? Number(m[1]) : null
}

/**
 * The sign of the letter of the given id: a hash of the id (FNV-1a, then
 * mixed so that the low bits spread too), so that letters given by
 * different goals mostly differ (the 50 rings in the maps today show
 * every sign)
 */
export function glyphOf(id: string): number {
  return hash(id) % GLYPH_COUNT
}

/** A hash of the string (FNV-1a, then mixed so the low bits spread too) */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/**
 * How far from the goal its letter comes up (cells, counted as a king
 * moves): this far if it can, nearer if nothing fits
 */
export const REWARD_DIST = [3, 4] as const

/**
 * The letter's place is chosen only with the player at most this far
 * from the goal (cells), when everything round the goal is loaded and
 * awake
 */
const REWARD_ME_NEAR = 12

/** The cells chosen so far, per field and letter id */
const rewardCells = new WeakMap<IField, Map<string, [number, number]>>()

/**
 * Where the letter `id` of the goal at the cell (gi, gj) comes up: a
 * cell REWARD_DIST away from the goal, on the same screen, that is free
 * (walkable land, not water, no prop on it) and reached by walking from
 * `near` (the cell by the goal the map gives, which can be walked to)
 * within the square round the goal, and with no prop round it either
 * (so it is not right by the ring or the arrangement). Which one of
 * those is drawn from the id, so a goal's letter always comes up in the
 * same place: done, and laid again once its place is loaded again. If
 * nothing fits, a free cell nearer, and at last `near` itself. Only the
 * terrain and the props count (not the things that move about), and
 * once chosen it is kept for the field. null while the place round the
 * goal isn't all loaded yet (ask again later)
 */
export function rewardCell(
  field: IField,
  gi: number,
  gj: number,
  near: readonly [number, number],
  id: string,
): [number, number] | null {
  let chosen = rewardCells.get(field)
  if (!chosen) rewardCells.set(field, chosen = new Map())
  const known = chosen.get(id)
  if (known) return known
  const dist = (i: number, j: number) =>
    Math.max(Math.abs(i - gi), Math.abs(j - gj))
  // the player near: the props round the goal are all awake then
  const me = field.me as IActor | undefined
  if (me && dist(me.i, me.j) > REWARD_ME_NEAR) return null
  const R = Math.max(REWARD_DIST[1], dist(near[0], near[1])) + 1
  for (let j = gj - R; j <= gj + R; j++) {
    for (let i = gi - R; i <= gi + R; i++) {
      if (field.isCellLoaded && !field.isCellLoaded(i, j)) return null
    }
  }
  const free = (i: number, j: number) =>
    dist(i, j) <= R && !(i === gi && j === gj) &&
    field.canEnterStatic(i, j) && !field.isWater(i, j) &&
    !field.props.get(i, j)
  const open = (i: number, j: number) => {
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (field.props.get(i + di, j + dj)) return false
      }
    }
    return true
  }
  // the cells walked to from `near`, round the goal
  const reached: [number, number][] = []
  const seen = new Set([`${near[0]},${near[1]}`])
  const queue: [number, number][] = [[near[0], near[1]]]
  while (queue.length) {
    const [i, j] = queue.shift()!
    if (free(i, j)) reached.push([i, j])
    else if (i !== near[0] || j !== near[1]) continue
    for (const [di, dj] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const ni = i + di, nj = j + dj
      const key = `${ni},${nj}`
      if (seen.has(key) || !free(ni, nj)) continue
      seen.add(key)
      queue.push([ni, nj])
    }
  }
  const [d0, d1] = REWARD_DIST
  const tiers: ((i: number, j: number) => boolean)[] = [
    (i, j) => dist(i, j) >= d0 && dist(i, j) <= d1 && open(i, j),
    (i, j) => dist(i, j) >= d0 && dist(i, j) <= d1,
    (i, j) => dist(i, j) >= 2 && dist(i, j) < d0 && open(i, j),
    (i, j) => dist(i, j) >= 2 && dist(i, j) < d0,
  ]
  const rank = ([i, j]: [number, number]) => hash(`${id}/${i - gi},${j - gj}`)
  let cell: [number, number] = [near[0], near[1]]
  for (const tier of tiers) {
    const fits = reached.filter(([i, j]) => tier(i, j))
    if (fits.length === 0) continue
    cell = fits.reduce((a, b) => rank(b) < rank(a) ? b : a)
    break
  }
  chosen.set(id, cell)
  return cell
}

/** true if the letter of the id has been taken */
export const hasGlyph = (id: string) =>
  signal.glyphs.get().some((g) => g.id === id)

/**
 * Gives the letter of the id: lays it at (i, j), unless it was already
 * taken or lies there now. Returns the letter laid, or null. Any goal
 * can give letters this way (a whole ring does, model/ring.ts)
 */
export function layGlyph(
  field: IField,
  i: number,
  j: number,
  id: string,
): IItem | null {
  if (Item.isCollected(id) || hasGlyph(id)) return null
  if (field.peekItems(i, j).some((item) => item.id === id)) return null
  return field.spawnItem(glyphType(glyphOf(id)), i, j, id)
}

/**
 * Gives the letter of the id as the reward of a goal just done: it is
 * laid at (i, j) as layGlyph does, but comes up out of the ground slowly
 * (model/goal-fx.ts) and can't be picked up until it has. Only for the
 * moment the goal is done: a letter laid again later (its place loaded
 * again, not taken yet) just lies there (layGlyph)
 */
export function revealGlyph(
  field: IField,
  i: number,
  j: number,
  id: string,
): IItem | null {
  const item = layGlyph(field, i, j, id)
  if (!item) return null
  item.startReveal?.(REVEAL_FRAMES)
  field.effects.add(
    new GlyphReveal(i, j, field.time, () => signal.playSound("bell", 12)),
  )
  return item
}

/**
 * Records the letter as taken (once per id): it is kept with the
 * collected item ids and in the letters held
 */
export function recordGlyph(id: string, glyph: number) {
  Item.collect(id)
  if (hasGlyph(id)) return
  signal.glyphs.update([...signal.glyphs.get(), { id, glyph }])
}

/** Picks up a letter: the counter goes up, the sign is shown */
export function collectGlyph(actor: IActor, field: IField, item: IItem) {
  field.collectItem(item.i, item.j, item.id)
  const glyph = glyphOfType(item.def.type) ?? glyphOf(item.id)
  recordGlyph(item.id, glyph)
  for (
    const effect of linePattern0(
      DIRS,
      actor.i,
      actor.j,
      1,
      0.7,
      3,
      item.def.color ?? Palette.orange2,
    )
  ) {
    field.effects.add(effect)
  }
  signal.playSound("bell", 7)
  signal.message.update({ text: "AN UNREADABLE LETTER" })
}
