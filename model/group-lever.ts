// Puzzles run by finite groups (ideas/groups.md), after kt3k/group's
// switch: "the switch moves from state g to g·x when you press x, so
// starting from e the state is always the product of the buttons
// pressed". Here the state is an arrangement of tokens on places, and a
// button is a lever.
//
// The parts, as few as could be:
//
// - `group-lever`: bumped (by the player, a patrol or a rolling boulder)
//   it moves the tokens of its group along its cycles: one rule, "a
//   lever swaps / turns the stones it is tied to". A lever with
//   `over: true` lies flat in the ground: a boulder rolling over it pulls
//   it (the player's step doesn't).
// - the tokens, showing at a glance where each one is:
//   `group-stone`, a standing stone at one place showing the pattern of
//   the token that sits there; `group-moai`, a Moai whose four sides
//   (back, left, face, right) are the tokens on the four world places
//   (up, right, down, left): its facing and its mirror state (8 poses).
// - `group-mural`: a tile of the target (a pattern or a pose), or, with
//   an id, a plaque to knock on (the odd one out).
// - `group-door`: opens, for good, the first time the arrangement of its
//   group is its target (checked every frame); the goal is done then.
// - `group-bell`: rings whenever the arrangement comes back to the start
//   (e); with an id, the first ring after using every lever it names is
//   a goal.
//
// The state of a group: arrangement[place] = the token at that place,
// starting as the identity (token p at place p). A lever's cycles say
// where things go: [[0, 1, 2]] moves the thing at 0 to 1, at 1 to 2 and
// at 2 to 0. As permutations of the places this is g -> g·x (the state
// after pulling x1, x2, ... is x1·x2·...), the switch of kt3k/group.
//
// The arrangements live in memory only (a reload starts every group
// from e again); a door that has opened, and a goal done, are kept with
// the collected item ids ("group.<id>", its letter "group.<id>.reward")
// and last in the save.
import { DIRS } from "../util/dir.ts"
import { Palette } from "../util/palette.ts"
import { saveProgress } from "../util/save.ts"
import * as signal from "../util/signals.ts"
import { celebrateGoal } from "./celebrate.ts"
import { linePattern0 } from "./effect.ts"
import { glyphOf, glyphType, layGlyph } from "./glyph.ts"
import { Item } from "./item.ts"
import type { Prop, PushedDelegate } from "./prop.ts"
import type { IActor, IField, PushedEvent } from "./types.ts"
import {
  type Arrangement,
  type Cycles,
  isIdentity,
  MURAL_PLAQUE,
  poseStage,
  pull,
  same,
  tokenAt,
} from "./group.ts"

export * from "./group.ts"

// ---------------------------------------------------------------------
// the groups' states

type GroupState = {
  arr: number[]
  /** The names of the levers pulled since the last time at e */
  word: string[]
  /** How many times it came back to e */
  returns: number
  /** The word that last brought it back to e */
  lastWord: string[]
}

const states = new Map<string, GroupState>()

function stateOf(group: string): GroupState {
  let state = states.get(group)
  if (!state) {
    states.set(group, state = { arr: [], word: [], returns: 0, lastWord: [] })
  }
  return state
}

/** The arrangement of the group now */
export const arrangementOf = (group: string): Arrangement => stateOf(group).arr

/** How many times the group has come back to e, and the word that did */
export function returnsOf(group: string) {
  const { returns, lastWord } = stateOf(group)
  return { returns, lastWord }
}

/** Pulls a lever of the group; returns the new arrangement */
export function pullLever(
  group: string,
  cycles: Cycles,
  name = "",
): Arrangement {
  const state = stateOf(group)
  state.arr = pull(state.arr, cycles)
  state.word.push(name)
  if (isIdentity(state.arr)) {
    state.returns++
    state.lastWord = state.word
    state.word = []
  }
  return state.arr
}

/** Every group back to e (used by tests) */
export function resetGroupStates() {
  states.clear()
}

// ---------------------------------------------------------------------
// goals

/** The collected-id key of a group puzzle solved */
export const groupKey = (id: string) => `group.${id}`
/** true if the collected id records a group puzzle solved (not its letter) */
export const isGroupKey = (key: string) =>
  key.startsWith("group.") && !key.endsWith(".reward")
/** The collected-id key (and the item id) of its letter */
export const groupRewardKey = (id: string) => `group.${id}.reward`
/** The item type of its letter */
export const groupRewardType = (id: string) =>
  glyphType(glyphOf(groupRewardKey(id)))
/** true if the group puzzle of the id is solved */
export const isSolved = (id: string) => Item.isCollected(groupKey(id))

/** Records the goal, celebrates it at (i, j) and brings up its letter */
function solve(
  field: IField,
  prop: Prop,
  id: string,
  text: string,
  reward?: [number, number],
) {
  Item.collect(groupKey(id))
  saveProgress()
  celebrateGoal(
    field,
    prop.i,
    prop.j,
    text,
    reward && { i: reward[0], j: reward[1], id: groupRewardKey(id) },
  )
}

/** The letter of a solved puzzle, laid again (until taken) */
function layReward(field: IField, id: string, reward?: [number, number]) {
  if (reward && field.time % 30 === 0) {
    layGlyph(field, reward[0], reward[1], groupRewardKey(id))
  }
}

// ---------------------------------------------------------------------
// the props

type LeverData = {
  group?: string
  cycles?: Cycles
  /** Its name in the words (the bell's need) */
  name?: string
  /** Its look: 0 swap, 1 turn, 2 mirror, 3 flat in the ground */
  look?: number
  /** Flat in the ground: pulled by a thing rolling over it */
  over?: boolean
}
const leverOf = (prop: Prop) => (prop.data ?? {}) as LeverData

/** How many times each lever was pulled (its handle shows the parity) */
const pulls = new WeakMap<Prop, number>()

/** Pulls the lever: the tokens move, it clacks, lines go out of it */
export function pullProp(prop: Prop, field: IField) {
  const { group, cycles, name } = leverOf(prop)
  if (typeof group !== "string" || !Array.isArray(cycles)) return
  pullLever(group, cycles, name ?? "")
  pulls.set(prop, (pulls.get(prop) ?? 0) + 1)
  showLever(prop)
  signal.playSound("blipSelect")
  for (
    const effect of linePattern0(DIRS, prop.i, prop.j, 1, 0.7, 2, Palette.white)
  ) {
    field.effects.add(effect)
  }
}

function showLever(prop: Prop) {
  const look = leverOf(prop).look ?? 0
  prop.showStage(look * 2 + (pulls.get(prop) ?? 0) % 2)
}

/** The lever: anyone's bump pulls it (not a flat one: that's rolled over) */
export class GroupLeverPushed implements PushedDelegate {
  onPushed(_event: PushedEvent, prop: Prop, field: IField): void {
    if (leverOf(prop).over) return
    pullProp(prop, field)
  }
}

/** On creation: a flat lever lies open, to be walked and rolled over */
export function initGroupLever(prop: Prop) {
  if (leverOf(prop).over) prop.setOpen(true, false)
}

/** What was on a flat lever's cell last frame */
const onLever = new WeakMap<Prop, IActor | null>()

/**
 * The lever's handle; a flat lever is pulled by each thing that comes
 * onto it (a boulder rolling over), not by the player
 */
export function stepGroupLever(prop: Prop, field: IField) {
  showLever(prop)
  if (!leverOf(prop).over) return
  const thing = field.actors.get(prop.i, prop.j).find((a) => a.id !== "main") ??
    null
  if (thing && thing !== onLever.get(prop)) pullProp(prop, field)
  onLever.set(prop, thing)
}

type TokenData = { group?: string; place?: number }

/** The stage each token prop showed last, to mark a change */
const shown = new WeakMap<Prop, number>()

/** Shows the stage, with a few lines when it changes */
function showToken(prop: Prop, field: IField, stage: number) {
  const last = shown.get(prop)
  shown.set(prop, stage)
  prop.showStage(stage)
  if (last === undefined || last === stage) return
  for (
    const effect of linePattern0(DIRS, prop.i, prop.j, 1, 0.5, 2, Palette.gray2)
  ) {
    field.effects.add(effect)
  }
}

/** The standing stone: the pattern of the token at its place */
export function stepGroupStone(prop: Prop, field: IField) {
  const { group, place } = (prop.data ?? {}) as TokenData
  if (typeof group !== "string" || typeof place !== "number") return
  showToken(prop, field, tokenAt(arrangementOf(group), place))
}

/** The Moai: its pose */
export function stepGroupMoai(prop: Prop, field: IField) {
  const { group } = (prop.data ?? {}) as TokenData
  if (typeof group !== "string") return
  showToken(prop, field, poseStage(arrangementOf(group)))
}

type DoorData = {
  group?: string
  id?: string
  target?: Arrangement
  /** Where its letter comes up (behind it) */
  reward?: [number, number]
}

/** The message when a group's door opens */
export const DOOR_TEXT = "THE STONES ARE IN PLACE"

/**
 * The door: shut until its group's arrangement is the target; the first
 * time it is, the goal is done and it stays open (kept in the save)
 */
export function stepGroupDoor(prop: Prop, field: IField) {
  const { group, id, target, reward } = (prop.data ?? {}) as DoorData
  if (typeof group !== "string" || !id || !Array.isArray(target)) return
  if (isSolved(id)) {
    if (!prop.isOpen) prop.setOpen(true, false)
    prop.showStage(1)
    layReward(field, id, reward)
    return
  }
  prop.showStage(0)
  if (!same(arrangementOf(group), target)) return
  prop.setOpen(true, false)
  prop.showStage(1)
  solve(field, prop, id, DOOR_TEXT, reward)
}

type BellData = {
  group?: string
  id?: string
  /** The lever names to use, all, before a ring counts as the goal */
  need?: string[]
  reward?: [number, number]
}

/** The message when the bell's goal is done */
export const BELL_TEXT = "BACK WHERE IT BEGAN"

/** The returns each bell has rung for, and its swing left */
const rung = new WeakMap<Prop, number>()
const swing = new WeakMap<Prop, number>()

/** The bell: rings each time its group comes back to e */
export function stepGroupBell(prop: Prop, field: IField) {
  const { group, id, need, reward } = (prop.data ?? {}) as BellData
  if (typeof group !== "string") return
  const { returns, lastWord } = returnsOf(group)
  const last = rung.get(prop)
  rung.set(prop, returns)
  if (last !== undefined && returns > last) {
    swing.set(prop, 36)
    signal.playSound("bell", 7)
    for (
      const effect of linePattern0(
        DIRS,
        prop.i,
        prop.j,
        1,
        0.7,
        3,
        Palette.white,
      )
    ) {
      field.effects.add(effect)
    }
    if (
      id && !isSolved(id) &&
      (need ?? []).every((name) => lastWord.includes(name))
    ) {
      solve(field, prop, id, BELL_TEXT, reward)
    }
  }
  if (id && isSolved(id)) layReward(field, id, reward)
  const left = swing.get(prop) ?? 0
  if (left > 0) swing.set(prop, left - 1)
  // still, swung left, swung right
  prop.showStage(left === 0 ? 0 : Math.floor(left / 6) % 2 === 0 ? 1 : 2)
}

type MuralData = {
  /** The stage shown: a pattern, a pose or the plaque */
  show?: number
  /** A plaque to knock on: its puzzle's id */
  id?: string
  /** true for the odd one out */
  odd?: boolean
  reward?: [number, number]
}

/** The message when the odd one out is found */
export const ODD_TEXT = "THE ODD GROUP OUT"
export const NOT_ODD_TEXT = "NOT THIS ONE: ANOTHER ROOM IS THE SAME GROUP"

/** The mural: knocked on, a plaque tells if its room is the odd one */
export class GroupMuralPushed implements PushedDelegate {
  onPushed(event: PushedEvent, prop: Prop, field: IField): void {
    const { id, odd, reward } = (prop.data ?? {}) as MuralData
    if (!id || event.pusher?.id !== "main") return
    if (!odd) {
      signal.playSound("hitHurt")
      signal.message.update({ text: NOT_ODD_TEXT })
      return
    }
    if (isSolved(id)) return
    solve(field, prop, id, ODD_TEXT, reward)
  }
}

/** The mural's tile, or the plaque (lit once its puzzle is solved) */
export function stepGroupMural(prop: Prop, field: IField) {
  const { show, id, odd, reward } = (prop.data ?? {}) as MuralData
  if (id) {
    const lit = odd && isSolved(id)
    prop.showStage(MURAL_PLAQUE + (lit ? 1 : 0))
    if (lit) layReward(field, id, reward)
    return
  }
  prop.showStage(show ?? 0)
}
