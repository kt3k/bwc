// The unreadable letters (読めない文字, ideas/goal-types.md ご褒美): the
// reward of the goals. A letter is a small clay tablet with a sign on it
// in a script nobody can read (after the Voynich manuscript and Linear
// A). What they do is not decided yet: for now they are picked up, kept
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
  let h = 0x811c9dc5
  for (let k = 0; k < id.length; k++) {
    h ^= id.charCodeAt(k)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) % GLYPH_COUNT
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
