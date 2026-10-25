// The chain of trades (ideas/goal-types.md, 連鎖させる; 欲しがる者に渡す is
// its first link): two or three travellers sitting still on the open
// land of the WILDS (`chain-wanter`), each with a picture of what they
// want in a bubble over their head: a jar, a sack, a wheel or a cask
// (actors pushed as a stone is, or rolling as a boulder does). In front
// of each lies a mat (`chain-mat`). Bring the thing wanted to rest on
// the mat and they take it ("THANK YOU. TAKE THIS") and put down on the
// mat what they have: the thing the next one wants. The last one gives
// the reward, a little way off, once (where: rewardCell, model/glyph.ts,
// from the cell by them the map gives). Anything else on the mat does
// nothing ("THAT IS NOT WHAT I WANT"). No new rule: the mat is a ring's
// gap that takes only the one thing. tools/chains.ts makes the chains
// and tools/generate_wilds.ts places them.
//
// The reward is an unreadable letter (model/glyph.ts), each chain its
// own: the letter's id is "chain.<id>.reward". Each link given is kept
// with the collected item ids ("chain.<id>.link<k>"), a complete chain
// too ("chain.<id>", the goal done), and the first thing given, a spawn
// of the map (it doesn't come back with the place, see goneActorKey):
// they last in the save (written as soon as a link is given). A thing
// laid by one is no spawn: whoever has given their link and whose next
// has not lays it again on their mat when their place is loaded again,
// and when it is gone (sunk, crushed, carried off) once their mat is
// out of sight, as a spawn of the map comes back.
import { CELL_SIZE } from "../util/constants.ts"
import { DIRS } from "../util/dir.ts"
import { Palette } from "../util/palette.ts"
import { saveProgress } from "../util/save.ts"
import * as signal from "../util/signals.ts"
import { goneActorKey } from "./actor.ts"
import { celebrateGoal } from "./celebrate.ts"
import { linePattern0 } from "./effect.ts"
import { glyphOf, glyphType, layGlyph, rewardCell } from "./glyph.ts"
import { Item } from "./item.ts"
import { circleBirds } from "./flock.ts"
import type { Prop } from "./prop.ts"
import type { Dir, IActor, IField } from "./types.ts"

/** The collected-id key of a complete chain */
export const chainKey = (id: string) => `chain.${id}`
/** The collected-id key of the k-th link of a chain given */
export const linkKey = (id: string, k: number) => `chain.${id}.link${k}`
/** true if the collected id records a complete chain (not a link, nor its reward) */
export const isChainKey = (key: string) =>
  key.startsWith("chain.") && !key.endsWith(".reward") &&
  !/\.link\d+$/.test(key)
/**
 * The collected-id key (and the item id) of a chain's reward: the id of
 * its unreadable letter
 */
export const chainRewardKey = (id: string) => `chain.${id}.reward`
/** The item type of a chain's reward: its unreadable letter */
export const chainRewardType = (id: string) =>
  glyphType(glyphOf(chainRewardKey(id)))

/** What the travellers want and give (the actor types) */
export const GOODS = ["jar", "sack", "wheel", "cask"] as const
export type Goods = typeof GOODS[number]
const isGoods = (type: string): type is Goods =>
  (GOODS as readonly string[]).includes(type)

/** The faces, in the order of the stages */
const FACES: readonly Dir[] = ["up", "down", "left", "right"]
/**
 * The stage of one facing `dir`: wanting a thing (its bubble over their
 * head), or content (null: no bubble)
 */
export const wanterStage = (dir: Dir, want: Goods | null) =>
  FACES.indexOf(dir) * (GOODS.length + 1) +
  (want ? GOODS.indexOf(want) : GOODS.length)

type WanterData = {
  id?: string
  /** Which link of the chain they are (0: the first) */
  k?: number
  /** How many links the chain has */
  n?: number
  /** What they want */
  want?: Goods
  /** What they give: what the next one wants (none: the last) */
  gives?: Goods
  /** The way they face: their mat is the next cell that way */
  dir?: Dir
  /**
   * The last one only: the cell by them the reward is reached from
   * (world cell); it comes up a little way off (rewardCell)
   */
  reward?: [number, number]
}

/** true if the k-th link of the chain was given */
export const isGiven = (id: string, k: number) =>
  Item.isCollected(linkKey(id, k))
/** true if the chain of the id is complete */
export const isComplete = (id: string) => Item.isCollected(chainKey(id))

/** At rest in its cell (not passing through it, nor still moving in) */
const atRest = (actor: IActor) =>
  actor.x === actor.i * CELL_SIZE && actor.y === actor.j * CELL_SIZE

/** The thing last told it isn't wanted, per one */
const told = new WeakMap<Prop, IActor>()
/** The thing each one laid this load (null: none yet) */
const laidBy = new WeakMap<Prop, IActor | null>()
/** The things laid (no spawns of the map: no gone key for them) */
const laid = new WeakSet<IActor>()

/** The cell in front of them: their mat */
function matOf(prop: Prop, dir: Dir): [number, number] {
  const [dx, dy] = dir === "up"
    ? [0, -1]
    : dir === "down"
    ? [0, 1]
    : dir === "left"
    ? [-1, 0]
    : [1, 0]
  return [prop.i + dx, prop.j + dy]
}

/**
 * How far from the player (cells, either way) a mat is out of sight:
 * past the half of the screen
 */
export const OUT_OF_SIGHT = 15

/**
 * One who wants a thing: they wait for it on their mat, then take it and
 * lay what they give there (the last one: the reward)
 */
export function stepChainWanter(prop: Prop, field: IField) {
  const data = (prop.data ?? {}) as WanterData
  const { id, k, n, want, dir = "down" } = data
  if (!id || k === undefined || !n || !want) return
  const last = k === n - 1
  if (isGiven(id, k)) {
    prop.showStage(wanterStage(dir, null))
    if (field.time % 30 !== 0) return
    if (last) layReward(field, prop, data)
    else if (!isGiven(id, k + 1)) keepLaid(prop, field, data)
    return
  }
  prop.showStage(wanterStage(dir, want))
  // birds wheel over a chain not yet complete (model/flock.ts)
  if (last) circleBirds(prop, field, () => isComplete(id))
  const [mi, mj] = matOf(prop, dir)
  for (const actor of field.actors.get(mi, mj)) {
    if (!atRest(actor) || actor.id === "main") continue
    if (actor.type === want && (k === 0 || isGiven(id, k - 1))) {
      give(prop, field, actor, data)
      return
    }
    if (
      (isGoods(actor.type) || actor.type === "stone" ||
        actor.type === "boulder") && told.get(prop) !== actor
    ) {
      told.set(prop, actor)
      signal.message.update({ text: "THAT IS NOT WHAT I WANT" })
    }
  }
}

/** They take the thing, and give theirs (the last one: the reward) */
function give(prop: Prop, field: IField, actor: IActor, data: WanterData) {
  const id = data.id!, k = data.k!, dir = data.dir ?? "down"
  Item.collect(linkKey(id, k))
  if (!laid.has(actor)) Item.collect(goneActorKey(actor.id))
  field.actors.remove(actor)
  prop.showStage(wanterStage(dir, null))
  if (k === data.n! - 1) {
    Item.collect(chainKey(id))
    saveProgress()
    // the hit stop, the lines, and the letter coming up (model/celebrate.ts)
    const rewardId = chainRewardKey(id)
    const at = data.reward &&
      (rewardCell(field, prop.i, prop.j, data.reward, rewardId) ??
        data.reward)
    celebrateGoal(
      field,
      prop.i,
      prop.j,
      "EVERYONE HAS WHAT THEY WANTED",
      at && { i: at[0], j: at[1], id: rewardId },
    )
    return
  }
  saveProgress()
  const [mi, mj] = matOf(prop, dir)
  lay(prop, field, data, mi, mj)
  signal.playSound("pickupCoin")
  signal.message.update({ text: "THANK YOU. TAKE THIS" })
  for (const effect of linePattern0(DIRS, mi, mj, 1, 0.7, 2, Palette.white)) {
    field.effects.add(effect)
  }
}

/** Lays what they give on their mat */
function lay(
  prop: Prop,
  field: IField,
  data: WanterData,
  i: number,
  j: number,
) {
  if (!data.gives) return
  const thing = field.spawnActor(data.gives, i, j, "down")
  laidBy.set(prop, thing)
  if (thing) laid.add(thing)
}

/**
 * What they gave, kept on their mat till the next one has it: laid again
 * when their place is loaded again, or when it is gone and their mat is
 * out of sight (as the map's spawns come back), the mat free
 */
function keepLaid(prop: Prop, field: IField, data: WanterData) {
  const thing = laidBy.get(prop)
  if (thing && field.actors.get(thing.i, thing.j).includes(thing)) return
  const [mi, mj] = matOf(prop, data.dir ?? "down")
  if (thing !== undefined) {
    const me = field.me
    const far = !me ||
      Math.max(Math.abs(me.i - mi), Math.abs(me.j - mj)) > OUT_OF_SIGHT
    if (!far) return
  }
  if (field.actors.get(mi, mj).length > 0) return
  lay(prop, field, data, mi, mj)
}

/**
 * The reward by the last one, laid again (their place loaded again)
 * unless it was taken: it just lies there
 */
function layReward(field: IField, prop: Prop, data: WanterData) {
  if (!data.id || !data.reward) return
  const id = chainRewardKey(data.id)
  const at = rewardCell(field, prop.i, prop.j, data.reward, id)
  if (at) layGlyph(field, at[0], at[1], id)
}
