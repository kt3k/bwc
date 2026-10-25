// The GOALS debug map (block_10400.-10000), laid out: a bay for every
// signature of the missing ring (tools/rings.ts), of the bell out of
// reach (tools/bells.ts), of the pair (tools/pairs.ts), of the dais to
// clear (tools/clears.ts), of the statue's gaze (tools/gazes.ts), of
// the patrol's way (tools/patrols.ts), a few stray sheep (tools/folds.ts)
// and for every family of the odd one out
// (tools/odd_ones.ts), a room to watch Odradek in, and a reset that
// undoes the goals of this map only (model/goal-reset.ts).
// tools/generate_goals_map.ts draws the rings and bells and writes the block; this
// module is the layout alone (no drawing, no files), so the tests can
// read the block back.
//
// Layout (local cells, top to bottom):
//
// - the entrance (rows 1-7): the title, where the player lands, the
//   portal back to the START island, the reset and the signs
// - RINGS: bays of 15x13 (the 13x11 ring patch in walls, the walls shared
//   with the neighbours), RING_COLS to a row, the way in at the bottom
//   middle (where tools/rings.ts has the player come from), the two signs
//   in the bottom wall either side of it: the signature and the pushes,
//   and the solution. A walkway of 2 rows under each row of bays
// - BELLS: bays as the rings', the 13x11 bell patch in walls
// - PAIRS: bays as the rings', in a column of their own east of the
//   rings and bells (from PAIRS_X), a pair for every signature and kind
//   wanted
// - DAISES: bays as the rings', under the pairs, a dais for every
//   signature and what sits on it
// - STATUES: bays as the rings', under the daises, a statue for every
//   signature
// - PATROLS: bays as the rings', in a third column (from PATROLS_X,
//   PATROL_COLS to a row), a patrol's lane for every signature
// - FOLDS: bays as the rings', under the patrols, two stray sheep of
//   each length of herding (short, middling, long)
// - ODD ONES: bays of 13x13, ODD_COLS to a row, the arrangement in the
//   middle, the way in and the signs as for the rings
// - ODRADEK: a room with corners, beside the odd ones
//
// The goal ids all start with PREFIX ("goals-<signature>" for a ring and
// for a bell, a statue and a patrol's beacon, "goals-<signature>-<kind>"
// for a pair and a dais,
// "goals-<family>"),
// which is how the reset tells this map's goals from
// the WILDS' (whose ids are their cells, "<x>.<y>").
import {
  type Layout,
  parse,
  type Ring,
  RING_H,
  RING_W,
  sigName,
} from "./rings.ts"
import type { Arrangement } from "./odd_ones.ts"
import type { Bell } from "./bells.ts"
import type { Pair } from "./pairs.ts"
import type { Clear } from "./clears.ts"
import type { Gaze } from "./gazes.ts"
import type { Patrol } from "./patrols.ts"
import type { Fold, FoldLayout } from "./folds.ts"
import { alikeType, unlikeType } from "../model/odd-families.ts"

export const SIZE = 200
export const BI = 10400
export const BJ = -10000
/** Where the player lands (local cells) */
export const ARRIVAL = { i: 2, j: 4 }
/** The start position of the game (see game/game-screen.ts) */
export const START = { i: -9964, j: -9981 }
/** A floor cell in the hall of waystones (the first Odradek's home) */
export const HALL = { i: -9978, j: -9969 }
/** The goal ids of this map start with this */
export const PREFIX = "goals-"

/** The ring id of a signature, e.g. "goals-roll+sink" */
export const ringId = (sig: string) => `${PREFIX}${sig}`
/** The bell id of a signature, e.g. "goals-roll+sink" */
export const bellId = (sig: string) => `${PREFIX}${sig}`
/** The pair id of a signature and kind, e.g. "goals-push+bush-stone" */
export const pairId = (sig: string, want: string) => `${PREFIX}${sig}-${want}`
/** The dais id of a signature and what sits, e.g. "goals-roll+bush-boulder" */
export const clearId = (sig: string, sits: string) => `${PREFIX}${sig}-${sits}`
/** The statue id of a signature, e.g. "goals-push+sink" */
export const gazeId = (sig: string) => `${PREFIX}${sig}`
/** The beacon id of a signature, e.g. "goals-push+sink" */
export const beaconId = (sig: string) => `${PREFIX}${sig}`
/** The fold id of the n-th fold, e.g. "goals-fold-1" */
export const foldId = (n: number) => `${PREFIX}fold-${n + 1}`
/** The odd one's id of a family, e.g. "goals-tulip" */
export const oddId = (family: string) => `${PREFIX}${family}`

export const RING_COLS = 5
/** A ring bay: the patch and its walls (shared with the neighbours) */
export const RING_PITCH_X = RING_W + 1
export const RING_PITCH_Y = RING_H + 2 + 2
export const RINGS_Y = 8
export const ODD_COLS = 4
/** An odd one bay's floor (square) */
export const ODD_IN = 11
export const ODD_PITCH_X = ODD_IN + 1
export const ODD_PITCH_Y = ODD_IN + 2 + 2

/** The top left wall cell of the n-th ring bay */
export function ringBay(n: number): { x: number; y: number } {
  return {
    x: 3 + (n % RING_COLS) * RING_PITCH_X,
    y: RINGS_Y + 2 + Math.floor(n / RING_COLS) * RING_PITCH_Y,
  }
}

/** The top of the bells' section, after `rings` ring bays */
export const bellsY = (rings: number) =>
  RINGS_Y + 2 + Math.ceil(rings / RING_COLS) * RING_PITCH_Y + 1

/** The top left wall cell of the n-th bell bay (as a ring bay) */
export function bellBay(rings: number, n: number): { x: number; y: number } {
  return {
    x: 3 + (n % RING_COLS) * RING_PITCH_X,
    y: bellsY(rings) + 2 + Math.floor(n / RING_COLS) * RING_PITCH_Y,
  }
}

/** The left of the pairs' column, east of the rings and bells */
export const PAIRS_X = 3 + RING_COLS * RING_PITCH_X + 4

/** The top left wall cell of the n-th pair bay (as a ring bay) */
export function pairBay(n: number): { x: number; y: number } {
  return {
    x: PAIRS_X + (n % RING_COLS) * RING_PITCH_X,
    y: RINGS_Y + 2 + Math.floor(n / RING_COLS) * RING_PITCH_Y,
  }
}

/** The top of the daises' section, under `pairs` pair bays */
export const clearsY = (pairs: number) =>
  RINGS_Y + 2 + Math.ceil(pairs / RING_COLS) * RING_PITCH_Y + 1

/** The top left wall cell of the n-th dais bay (as a ring bay) */
export function clearBay(pairs: number, n: number): { x: number; y: number } {
  return {
    x: PAIRS_X + (n % RING_COLS) * RING_PITCH_X,
    y: clearsY(pairs) + 2 + Math.floor(n / RING_COLS) * RING_PITCH_Y,
  }
}

/** The top of the statues' section, under the pairs and daises */
export const gazesY = (pairs: number, clears: number) =>
  clearsY(pairs) + 2 + Math.ceil(clears / RING_COLS) * RING_PITCH_Y + 1

/** The top left wall cell of the n-th statue bay (as a ring bay) */
export function gazeBay(
  pairs: number,
  clears: number,
  n: number,
): { x: number; y: number } {
  return {
    x: PAIRS_X + (n % RING_COLS) * RING_PITCH_X,
    y: gazesY(pairs, clears) + 2 + Math.floor(n / RING_COLS) * RING_PITCH_Y,
  }
}

/** The left of the patrols' column, east of the pairs' */
export const PATROLS_X = PAIRS_X + RING_COLS * RING_PITCH_X + 4
export const PATROL_COLS = 3

/** The top left wall cell of the n-th patrol bay (as a ring bay) */
export function patrolBay(n: number): { x: number; y: number } {
  return {
    x: PATROLS_X + (n % PATROL_COLS) * RING_PITCH_X,
    y: RINGS_Y + 2 + Math.floor(n / PATROL_COLS) * RING_PITCH_Y,
  }
}

/** The top of the folds' section, under `patrols` patrol bays */
export const foldsY = (patrols: number) =>
  RINGS_Y + 2 + Math.ceil(patrols / PATROL_COLS) * RING_PITCH_Y + 1

/** The top left wall cell of the n-th fold bay (as a ring bay) */
export function foldBay(patrols: number, n: number): { x: number; y: number } {
  return {
    x: PATROLS_X + (n % PATROL_COLS) * RING_PITCH_X,
    y: foldsY(patrols) + 2 + Math.floor(n / PATROL_COLS) * RING_PITCH_Y,
  }
}

/** The top of the odd ones' section, after the ring and bell bays */
export const oddsY = (rings: number, bells: number) =>
  bellsY(rings) + 2 + Math.ceil(bells / RING_COLS) * RING_PITCH_Y + 1

/** The top left wall cell of the n-th odd one bay */
export function oddBay(
  rings: number,
  bells: number,
  n: number,
): { x: number; y: number } {
  return {
    x: 3 + (n % ODD_COLS) * ODD_PITCH_X,
    y: oddsY(rings, bells) + 2 + Math.floor(n / ODD_COLS) * ODD_PITCH_Y,
  }
}

/** What each family looks like (model/odd-families.ts) */
export const FAMILY_TEXT: Record<string, string> = {
  tulip: "A ROW OF TULIPS LEANING ONE WAY, ONE LEANS THE OTHER",
  toadstool: "A FAIRY RING OF TOADSTOOLS, ONE IS UPSIDE DOWN",
  stonebird: "A FLOCK OF STONE BIRDS LOOKING ONE WAY, ONE LOOKS THE OTHER",
  menhir: "A ROW OF STANDING STONES, ONE IS CRACKED",
  post: "A ROW OF POSTS, ONE LEANS",
  cairn: "A ROW OF CAIRNS OF THREE STONES, ONE HAS FOUR",
  arrowstone: "A GRID OF FLAT STONES WITH AN ARROW, ONE POINTS ASIDE",
}

/** A ring of the map: a ring and whether the WILDS have its signature */
export type GoalRing = Ring & { inWilds: boolean }
/** A bell of the map: a bell and whether the WILDS have its signature */
export type GoalBell = Bell & { inWilds: boolean }
/** A pair of the map: a pair and whether the WILDS have its signature */
export type GoalPair = Pair & { inWilds: boolean }
/** A dais of the map: a dais and whether the WILDS have its signature */
export type GoalClear = Clear & { inWilds: boolean }
/** A statue of the map: a statue and whether the WILDS have its signature */
export type GoalGaze = Gaze & { inWilds: boolean }
/** A patrol's lane of the map, and whether the WILDS have its signature */
export type GoalPatrol = Patrol & { inWilds: boolean }
/** A fold of the map, and whether it is from the WILDS' own */
export type GoalFold = Fold & { inWilds: boolean }

export type Spawn = {
  i: number
  j: number
  type: string
  data?: unknown
  /** Which way an actor faces at first */
  dir?: string
}
export type BlockJson = {
  i: number
  j: number
  name: string
  catalogs: string[]
  config: Record<string, unknown>
  actors: Spawn[]
  items: Spawn[]
  props: Spawn[]
  field: string[]
}

/** The cells of a ring patch's terrain (the ground is the meadow) */
const PATCH_CELL: Record<string, string> = {
  ".": "6",
  "#": "J",
  w: "w",
  i: "i",
  k: "k",
  o: "6",
  O: "6",
  _: "6",
  A: "6",
  P: "6",
  Y: "6",
  Z: "6",
  D: "6",
  E: "6",
  T: "6",
  J: "6",
  L: "6",
  f: "H",
  G: "6",
}
const FLOOR = "0"
const WALL = "1"

/** The odd one's place in its arrangement, in words */
function oddPlace(a: Arrangement): string {
  const [x, y] = a.cells[a.odd]
  const nth = (k: number) => `${k + 1}${["ST", "ND", "RD"][k] ?? "TH"}`
  const xs = [...new Set(a.cells.map(([cx]) => cx))].sort((p, q) => p - q)
  const ys = [...new Set(a.cells.map(([, cy]) => cy))].sort((p, q) => p - q)
  if (ys.length === 1) return `THE ${nth(xs.indexOf(x))} FROM THE LEFT`
  if (xs.length === 1) return `THE ${nth(ys.indexOf(y))} FROM THE TOP`
  if (a.family === "toadstool") {
    return `THE ${nth(a.odd)} CLOCKWISE FROM THE LEFT ONE AT THE TOP`
  }
  return `THE ${nth(xs.indexOf(x))} ACROSS, THE ${nth(ys.indexOf(y))} DOWN`
}

/**
 * Lays out the map: the rings, bells, pairs, daises, statues and patrols
 * (in bay order) and the odd ones
 */
export function buildGoalsMap(
  rings: readonly GoalRing[],
  bells: readonly GoalBell[],
  pairs: readonly GoalPair[],
  clears: readonly GoalClear[],
  gazes: readonly GoalGaze[],
  patrols: readonly GoalPatrol[],
  folds: readonly GoalFold[],
  odds: readonly Arrangement[],
): BlockJson {
  const grid: string[][] = Array.from(
    { length: SIZE },
    () => Array(SIZE).fill(WALL),
  )
  const actors: Spawn[] = []
  const items: Spawn[] = []
  const props: Spawn[] = []
  const rect = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) grid[y][x] = c
    }
  }
  const actor = (x: number, y: number, type: string, data?: unknown) =>
    actors.push({ i: BI + x, j: BJ + y, type, ...(data ? { data } : {}) })
  const prop = (x: number, y: number, type: string, data?: unknown) =>
    props.push({ i: BI + x, j: BJ + y, type, ...(data ? { data } : {}) })
  const sign = (x: number, y: number, text: string) =>
    prop(x, y, "sign", { text })
  /** Spells a word with the white letter props (A-Z only) */
  const letters = (x: number, y: number, word: string) => {
    for (const [n, ch] of [...word.toLowerCase()].entries()) {
      prop(x + n, y, `${ch}_white`)
    }
  }
  /** A bay: walls round (x0, y0)-(x1, y1), the way in at the bottom (wx) */
  const bay = (x0: number, y0: number, x1: number, y1: number, wx: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || y === y0 || y === y1
        if (edge) grid[y][x] = WALL
      }
    }
    grid[y1][wx] = FLOOR
  }
  /** A sign set in a wall (on a floor cell, so it reads as put there) */
  const wallSign = (x: number, y: number, text: string) => {
    grid[y][x] = FLOOR
    sign(x, y, text)
  }

  const oddRows = Math.ceil(odds.length / ODD_COLS)
  /** The west part: the rings, bells and odd ones */
  const west = 3 + RING_COLS * RING_PITCH_X + 3
  const width = PATROLS_X + PATROL_COLS * RING_PITCH_X + 3
  if (width >= SIZE - 1) throw new RangeError(`${width} columns: too wide`)
  const ODDS_Y = oddsY(rings.length, bells.length)
  const BELLS_Y = bellsY(rings.length)
  const height = Math.max(
    ODDS_Y + 2 + Math.max(oddRows, 2) * ODD_PITCH_Y,
    gazesY(pairs.length, clears.length) + 2 +
      Math.ceil(gazes.length / RING_COLS) * RING_PITCH_Y,
    patrolBay(patrols.length - 1).y + RING_PITCH_Y,
    foldBay(patrols.length, folds.length - 1).y + RING_PITCH_Y,
  )
  if (height >= SIZE - 1) throw new RangeError(`${height} rows: too many bays`)
  rect(1, 1, width, height, FLOOR)
  const box: [number, number, number, number] = [
    BI,
    BJ,
    BI + SIZE - 1,
    BJ + SIZE - 1,
  ]
  /** A reset, bumped from below: it puts the player back below it */
  const reset = (x: number, y: number) =>
    prop(x, y, "goal-reset", {
      prefix: PREFIX,
      box,
      to: [BI + x, BJ + y + 1],
    })

  // the entrance
  letters(2, 2, "GOALS")
  sign(
    8,
    2,
    `GOALS MAP: A RING FOR EVERY SIGNATURE (${rings.length}), A BELL FOR ` +
      `EVERY SIGNATURE (${bells.length}), A PAIR FOR EVERY SIGNATURE AND ` +
      `KIND (${pairs.length}, EAST), A DAIS TO CLEAR FOR EVERY SIGNATURE ` +
      `(${clears.length}, EAST), A STATUE FOR EVERY SIGNATURE ` +
      `(${gazes.length}, EAST), A PATROL FOR EVERY SIGNATURE ` +
      `(${patrols.length}, FAR EAST), STRAY SHEEP (${folds.length}, FAR ` +
      `EAST) AND AN ODD ONE FOR EVERY FAMILY ` +
      `(${odds.length}). GOALS DONE HERE COUNT, GIVE ` +
      "LETTERS AND LAST IN THE SAVE AS IN THE WILDS. THE RESET UNDOES THEM",
  )
  prop(ARRIVAL.i, ARRIVAL.j, "portal-out")
  prop(5, 4, "portal", { i: START.i, j: START.j })
  sign(6, 4, "PORTAL: BACK TO THE START ISLAND")
  reset(10, 4)
  sign(
    11,
    4,
    "RESET: UNDOES THE GOALS OF THIS MAP ONLY, TAKES BACK THEIR LETTERS " +
      "AND LOADS THE MAP AGAIN. THE WILDS ARE LEFT AS THEY ARE",
  )
  letters(12, 4, "RESET")
  sign(
    2,
    6,
    "EACH BAY IS ONE GOAL, ITS WAY IN AT THE BOTTOM. THE SIGNS BY THE WAY " +
      "IN NAME IT. ODRADEK LIVES IN THE ROOM IN THE SOUTH EAST",
  )

  // the rings
  letters(2, RINGS_Y, "RINGS")
  sign(
    8,
    RINGS_Y,
    "RINGS: GET A STONE OR A BOULDER INTO THE GAP. THE SIGNATURE IS THE " +
      "RULES EVERY SOLUTION USES: PUSH, ROLL, ICE, SINK, BUSH",
  )
  rings.forEach((ring, n) => {
    const { x, y } = ringBay(n)
    const px = x + 1, py = y + 1
    const sig = sigName(ring.signature)
    const id = ringId(sig)
    const wx = px + ring.start[0]
    bay(x, y, x + RING_W + 1, y + RING_H + 1, wx)
    ring.rows.forEach((row, dy) =>
      [...row].forEach((c, dx) => {
        grid[py + dy][px + dx] = PATCH_CELL[c]
        if (c === "o") {
          prop(
            px + dx,
            py + dy,
            ring.fills === "boulder" ? "ring-boulder" : "ring-stone",
          )
        } else if (c === "O") {
          prop(px + dx, py + dy, "ring-heart", { id })
        } else if (c === "_") {
          prop(px + dx, py + dy, "ring-slot", {
            id,
            kind: ring.fills,
            reward: [BI + px + ring.reward[0], BJ + py + ring.reward[1]],
          })
        }
      })
    )
    for (const t of ring.things) actor(px + t.x, py + t.y, t.kind)
    const bottom = y + RING_H + 1
    wallSign(
      wx - 2,
      bottom,
      `RING ${n + 1}: ${sig.toUpperCase()}. ${ring.pushes} PUSHES, ` +
        `${ring.fills === "boulder" ? "A BOULDER" : "A STONE"} FILLS THE GAP` +
        (ring.inWilds ? "" : ". NOT IN THE WILDS (DRAWN HERE)"),
    )
    wallSign(
      wx + 2,
      bottom,
      `SOLUTION, FROM THE CELL INSIDE THE WAY IN: ${ring.solution}`,
    )
  })

  // the bells
  letters(2, BELLS_Y, "BELLS")
  sign(
    8,
    BELLS_Y,
    "BELLS: A THING BUMPED INTO THE BELL RINGS IT, YOUR KNOCK DOESN'T. " +
      "THE SIGNATURE IS THE RULES EVERY SOLUTION USES",
  )
  bells.forEach((bell, n) => {
    const { x, y } = bellBay(rings.length, n)
    const px = x + 1, py = y + 1
    const sig = sigName(bell.signature)
    const id = bellId(sig)
    const wx = px + bell.start[0]
    bay(x, y, x + RING_W + 1, y + RING_H + 1, wx)
    bell.rows.forEach((row, dy) =>
      [...row].forEach((c, dx) => {
        grid[py + dy][px + dx] = PATCH_CELL[c]
        if (c === "A") {
          prop(px + dx, py + dy, "goal-bell", {
            id,
            reward: [BI + px + bell.reward[0], BJ + py + bell.reward[1]],
          })
        }
      })
    )
    for (const t of bell.things) actor(px + t.x, py + t.y, t.kind)
    const bottom = y + RING_H + 1
    wallSign(
      wx - 2,
      bottom,
      `BELL ${n + 1}: ${sig.toUpperCase()}. ${bell.pushes} PUSHES, ` +
        `${bell.by === "boulder" ? "A BOULDER" : "A STONE"} RINGS IT` +
        (bell.inWilds ? "" : ". NOT IN THE WILDS (DRAWN HERE)"),
    )
    wallSign(
      wx + 2,
      bottom,
      `SOLUTION, FROM THE CELL INSIDE THE WAY IN: ${bell.solution}`,
    )
  })

  // the pairs
  letters(PAIRS_X - 1, RINGS_Y, "PAIRS")
  sign(
    PAIRS_X + 5,
    RINGS_Y,
    "PAIRS: PUT THE SAME AS THE ONE PLINTH HOLDS ON THE OTHER. THE OTHER " +
      "KIND LIES NEAR TOO, THE EASIER ONE TO BRING",
  )
  pairs.forEach((pair, n) => {
    const { x, y } = pairBay(n)
    const px = x + 1, py = y + 1
    const sig = sigName(pair.signature)
    const id = pairId(sig, pair.want)
    const wx = px + pair.start[0]
    bay(x, y, x + RING_W + 1, y + RING_H + 1, wx)
    pair.rows.forEach((row, dy) =>
      [...row].forEach((c, dx) => {
        grid[py + dy][px + dx] = PATCH_CELL[c]
        if (c === "P") {
          prop(px + dx, py + dy, "pair-plinth", {
            id,
            want: pair.want,
            reward: [BI + px + pair.reward[0], BJ + py + pair.reward[1]],
          })
        } else if (c === "Y" || c === "Z") {
          prop(px + dx, py + dy, "pair-twin", { id, holds: pair.want })
        }
      })
    )
    for (const t of pair.things) actor(px + t.x, py + t.y, t.kind)
    const bottom = y + RING_H + 1
    wallSign(
      wx - 2,
      bottom,
      `PAIR ${n + 1}: ${sig.toUpperCase()}. ${pair.pushes} PUSHES, ` +
        `${pair.want === "boulder" ? "A BOULDER" : "A STONE"} MAKES THE ` +
        `PAIR, THE OTHER KIND TAKES ${pair.decoy}` +
        (pair.inWilds ? "" : ". NOT IN THE WILDS (DRAWN HERE)"),
    )
    wallSign(
      wx + 2,
      bottom,
      `SOLUTION, FROM THE CELL INSIDE THE WAY IN: ${pair.solution}`,
    )
  })

  // the daises
  const CLEARS_Y = clearsY(pairs.length)
  letters(PAIRS_X - 1, CLEARS_Y, "DAIS")
  sign(
    PAIRS_X + 4,
    CLEARS_Y,
    "DAISES: GET WHAT SITS ON THE DAIS OFF IT. A PUSH FROM THE WAY IN " +
      "ONLY JAMS IT",
  )
  clears.forEach((clear, n) => {
    const { x, y } = clearBay(pairs.length, n)
    const px = x + 1, py = y + 1
    const sig = sigName(clear.signature)
    const id = clearId(sig, clear.sits)
    const wx = px + clear.start[0]
    bay(x, y, x + RING_W + 1, y + RING_H + 1, wx)
    clear.rows.forEach((row, dy) =>
      [...row].forEach((c, dx) => {
        grid[py + dy][px + dx] = PATCH_CELL[c]
        if (c === "D") {
          prop(px + dx, py + dy, "clear-dais", {
            id,
            reward: [BI + px + clear.reward[0], BJ + py + clear.reward[1]],
          })
        }
      })
    )
    for (const t of clear.things) actor(px + t.x, py + t.y, t.kind)
    const bottom = y + RING_H + 1
    wallSign(
      wx - 2,
      bottom,
      `DAIS ${n + 1}: ${sig.toUpperCase()}. ${clear.pushes} PUSHES, ` +
        `${clear.sits === "boulder" ? "A BOULDER" : "A STONE"} SITS ON IT` +
        (clear.inWilds ? "" : ". NOT IN THE WILDS (DRAWN HERE)"),
    )
    wallSign(
      wx + 2,
      bottom,
      `SOLUTION, FROM THE CELL INSIDE THE WAY IN: ${clear.solution}`,
    )
  })

  // the statues
  const GAZES_Y = gazesY(pairs.length, clears.length)
  letters(PAIRS_X - 1, GAZES_Y, "GAZE")
  sign(
    PAIRS_X + 4,
    GAZES_Y,
    "STATUES: THE STATUE SEES STRAIGHT AHEAD. CLEAR ITS LINE TO THE " +
      "WISTERIA TRELLIS: TREES, ROCKS, BUSHES, STONES AND BOULDERS BLOCK IT, " +
      "WATER DOESN'T",
  )
  gazes.forEach((gaze, n) => {
    const { x, y } = gazeBay(pairs.length, clears.length, n)
    const px = x + 1, py = y + 1
    const sig = sigName(gaze.signature)
    const id = gazeId(sig)
    const wx = px + gaze.start[0]
    const cells = gaze.rows.join("")
    const sun = cells.indexOf("T")
    bay(x, y, x + RING_W + 1, y + RING_H + 1, wx)
    gaze.rows.forEach((row, dy) =>
      [...row].forEach((c, dx) => {
        grid[py + dy][px + dx] = PATCH_CELL[c]
        if (c === "E") {
          prop(px + dx, py + dy, "gaze-statue", {
            id,
            dir: gaze.dir,
            to: [BI + px + sun % RING_W, BJ + py + Math.floor(sun / RING_W)],
            reward: [BI + px + gaze.reward[0], BJ + py + gaze.reward[1]],
          })
        } else if (c === "T") prop(px + dx, py + dy, "gaze-sun", { id })
      })
    )
    for (const t of gaze.things) actor(px + t.x, py + t.y, t.kind)
    const bottom = y + RING_H + 1
    wallSign(
      wx - 2,
      bottom,
      `STATUE ${n + 1}: ${sig.toUpperCase()}. ${gaze.pushes} PUSHES` +
        (gaze.inWilds ? "" : ". NOT IN THE WILDS (DRAWN HERE)"),
    )
    wallSign(
      wx + 2,
      bottom,
      `SOLUTION, FROM THE CELL INSIDE THE WAY IN: ${gaze.solution}`,
    )
  })

  // the patrols
  letters(PATROLS_X - 1, RINGS_Y, "WATCH")
  sign(
    PATROLS_X + 5,
    RINGS_Y,
    "PATROLS: THE PATROL TURNS BACK AT WHAT IT BUMPS INTO. OPEN ITS WAY " +
      "TO THE BEACON: ONLY THE PATROL CAN LIGHT IT",
  )
  patrols.forEach((patrol, n) => {
    const { x, y } = patrolBay(n)
    const px = x + 1, py = y + 1
    const sig = sigName(patrol.signature)
    const id = beaconId(sig)
    const wx = px + patrol.start[0]
    bay(x, y, x + RING_W + 1, y + RING_H + 1, wx)
    patrol.rows.forEach((row, dy) =>
      [...row].forEach((c, dx) => {
        grid[py + dy][px + dx] = PATCH_CELL[c]
        if (c === "L") {
          prop(px + dx, py + dy, "patrol-beacon", {
            id,
            reward: [BI + px + patrol.reward[0], BJ + py + patrol.reward[1]],
          })
        } else if (c === "J") {
          actors.push({
            i: BI + px + dx,
            j: BJ + py + dy,
            type: "patrol",
            dir: patrol.dir,
          })
        }
      })
    )
    for (const t of patrol.things) actor(px + t.x, py + t.y, t.kind)
    const bottom = y + RING_H + 1
    wallSign(
      wx - 2,
      bottom,
      `PATROL ${n + 1}: ${sig.toUpperCase()}. ${patrol.pushes} PUSHES` +
        (patrol.inWilds ? "" : ". NOT IN THE WILDS (DRAWN HERE)"),
    )
    wallSign(
      wx + 2,
      bottom,
      `SOLUTION, FROM THE CELL INSIDE THE WAY IN: ${patrol.solution}`,
    )
  })

  // the folds
  const FOLDS_Y = foldsY(patrols.length)
  letters(PATROLS_X - 1, FOLDS_Y, "FOLD")
  sign(
    PATROLS_X + 4,
    FOLDS_Y,
    "FOLDS: HERD THE SHEEP INTO THE FOLD. IT RUNS FROM YOU WITHIN THREE " +
      "CELLS, STRAIGHT AWAY FIRST. COME AT IT FROM THE RIGHT SIDE",
  )
  folds.forEach((fold, n) => {
    const { x, y } = foldBay(patrols.length, n)
    const px = x + 1, py = y + 1
    const id = foldId(n)
    const wx = px + fold.start[0]
    bay(x, y, x + RING_W + 1, y + RING_H + 1, wx)
    fold.rows.forEach((row, dy) =>
      [...row].forEach((c, dx) => {
        grid[py + dy][px + dx] = PATCH_CELL[c]
        if (c === "G") {
          prop(px + dx, py + dy, "fold-gate", {
            id,
            i0: BI + px + fold.inside[0],
            j0: BJ + py + fold.inside[1],
            i1: BI + px + fold.inside[2],
            j1: BJ + py + fold.inside[3],
            reward: [BI + px + fold.reward[0], BJ + py + fold.reward[1]],
          })
        }
      })
    )
    actor(px + fold.sheep[0], py + fold.sheep[1], "sheep")
    const bottom = y + RING_H + 1
    wallSign(
      wx - 2,
      bottom,
      `FOLD ${n + 1}: THE SHEEP RUNS ${fold.herds} STEPS AT THE FEWEST. ` +
        `${Math.round((1 - fold.angles) * 100)}% OF THE WAYS TO COME AT ` +
        "IT LOSE IT" + (fold.inWilds ? "" : ". NOT IN THE WILDS (DRAWN HERE)"),
    )
    wallSign(
      wx + 2,
      bottom,
      "IF IT RUNS OFF OR INTO A CORNER, THE RESET PUTS IT BACK",
    )
  })

  // the odd ones
  letters(2, ODDS_Y, "ODD")
  sign(
    6,
    ODDS_Y,
    "ODD ONES: ONE OF EACH ARRANGEMENT IS NOT QUITE LIKE THE OTHERS. " +
      "BUMP IT",
  )
  reset(8, ODDS_Y)
  sign(9, ODDS_Y, "RESET: UNDOES THE GOALS OF THIS MAP ONLY")
  odds.forEach((a, n) => {
    const { x, y } = oddBay(rings.length, bells.length, n)
    const fx = x + 1, fy = y + 1
    const wx = fx + (ODD_IN >> 1)
    bay(x, y, x + ODD_IN + 1, y + ODD_IN + 1, wx)
    rect(fx, fy, fx + ODD_IN - 1, fy + ODD_IN - 1, "6")
    const ax = fx + ((ODD_IN - a.w) >> 1), ay = fy + ((ODD_IN - a.h) >> 1)
    const id = oddId(a.family)
    a.cells.forEach(([dx, dy], k) => {
      if (k === a.odd) {
        prop(ax + dx, ay + dy, unlikeType(a.family), {
          id,
          reward: [BI + ax + a.reward[0], BJ + ay + a.reward[1]],
        })
      } else prop(ax + dx, ay + dy, alikeType(a.family))
    })
    const bottom = y + ODD_IN + 1
    wallSign(
      wx - 2,
      bottom,
      `ODD ONE: ${a.family.toUpperCase()}. ${FAMILY_TEXT[a.family]}`,
    )
    wallSign(wx + 2, bottom, `THE ODD ONE: ${oddPlace(a)}`)
  })

  // Odradek's room, beside the odd ones: planks, walls and pillars, so
  // that it has corners to sit in and to scuttle off to
  {
    const x0 = 3 + ODD_COLS * ODD_PITCH_X + 2
    const y0 = ODDS_Y + 2
    const x1 = west - 1
    const y1 = y0 + 2 * ODD_PITCH_Y - 3
    const wx = (x0 + x1) >> 1
    bay(x0, y0, x1, y1, wx)
    rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, "d")
    // the pillars: four 2x2 and a wall stub from each side
    const w = x1 - x0, h = y1 - y0
    for (const [fx, fy] of [[1 / 3, 1 / 4], [2 / 3, 1 / 4], [1 / 3, 3 / 5]]) {
      const px = x0 + Math.round(w * fx), py = y0 + Math.round(h * fy)
      rect(px, py, px + 1, py + 1, WALL)
    }
    rect(x0 + 1, y0 + Math.round(h / 2), x0 + 3, y0 + Math.round(h / 2), WALL)
    rect(x1 - 3, y0 + Math.round(h / 2), x1 - 1, y0 + Math.round(h / 2), WALL)
    actor(x0 + 1, y0 + 1, "odradek")
    wallSign(
      wx - 2,
      y1,
      "ODRADEK: THIS ONE IS ALWAYS HERE. GO NEAR AND IT SCUTTLES OFF TO " +
        "ANOTHER CORNER. STAND BY IT AND FACE IT TO HEAR IT",
    )
    wallSign(
      wx + 2,
      y1,
      "ONE MORE ODRADEK TURNS UP FOR EACH GOAL DONE, HERE OR IN THE WILDS. " +
        "THE FIRST IN THE HALL OF WAYSTONES: THE PORTAL BY THE WAY IN",
    )
    prop(wx + 4, y1 + 1, "portal", { i: HALL.i, j: HALL.j })
    letters(x0 + 2, y0 - 1, "ODRADEK")
  }

  return {
    i: BI,
    j: BJ,
    name: "GOALS",
    catalogs: ["../catalog/base.json"],
    config: { showsExitButton: true },
    actors,
    items,
    props,
    field: grid.map((row) => row.join("")),
  }
}

/** The terrain char of a patch cell, back from the map's cell */
const PATCH_CHAR: Record<string, string> = {
  "6": ".",
  J: "#",
  w: "w",
  i: "i",
  k: "k",
}

/**
 * Reads the n-th ring bay of the block back into a patch (tools/rings.ts),
 * the things on it, the player coming from the way in: what the solver
 * takes. Also the ring's id
 */
export function readRingBay(
  block: BlockJson,
  n: number,
): { id: string; layout: Layout } | null {
  return readBay(block, ringBay(n))
}

/**
 * Reads the n-th fold bay of the block back (tools/folds.ts): the fold's
 * patch and its id
 */
export function readFoldBay(
  block: BlockJson,
  patrols: number,
  n: number,
): { id: string; layout: FoldLayout } | null {
  const { x, y } = foldBay(patrols, n)
  const px = x + 1, py = y + 1
  const at = (list: Spawn[], dx: number, dy: number) =>
    list.find((s) => s.i === BI + px + dx && s.j === BJ + py + dy)
  let id: string | null = null
  let sheep: [number, number] = [0, 0]
  let inside: [number, number, number, number] | null = null
  const rows: string[] = []
  for (let dy = 0; dy < RING_H; dy++) {
    let row = ""
    for (let dx = 0; dx < RING_W; dx++) {
      const p = at(block.props, dx, dy)
      if (at(block.actors, dx, dy)?.type === "sheep") sheep = [dx, dy]
      if (p?.type === "fold-gate") {
        const d = p.data as {
          id: string
          i0: number
          j0: number
          i1: number
          j1: number
        }
        id = d.id
        inside = [
          d.i0 - BI - px,
          d.j0 - BJ - py,
          d.i1 - BI - px,
          d.j1 - BJ - py,
        ]
        row += "G"
        continue
      }
      const c = block.field[py + dy][px + dx]
      row += c === "H" ? "f" : (PATCH_CHAR[c] ?? "#")
    }
    rows.push(row)
  }
  if (!id || !inside) return null
  const [x0, y0, x1, y1] = inside
  const marked = rows.map((row, ry) =>
    [...row].map((c, rx) =>
      rx >= x0 && rx <= x1 && ry >= y0 && ry <= y1 ? "P" : c
    ).join("")
  )
  return {
    id,
    layout: { rows: marked, sheep, start: [RING_W >> 1, RING_H - 1] },
  }
}

/**
 * Reads the n-th patrol bay of the block back into a patch, as
 * readRingBay does. Also the beacon's id
 */
export function readPatrolBay(
  block: BlockJson,
  n: number,
): { id: string; layout: Layout } | null {
  return readBay(block, patrolBay(n))
}

/**
 * Reads the n-th statue bay of the block back into a patch, as
 * readRingBay does. Also the statue's id
 */
export function readGazeBay(
  block: BlockJson,
  pairs: number,
  clears: number,
  n: number,
): { id: string; layout: Layout } | null {
  return readBay(block, gazeBay(pairs, clears, n))
}

/**
 * Reads the n-th dais bay of the block back into a patch, as
 * readRingBay does (the dais under its first thing). Also the dais' id
 */
export function readClearBay(
  block: BlockJson,
  pairs: number,
  n: number,
): { id: string; layout: Layout } | null {
  const bay = readBay(block, clearBay(pairs, n))
  if (!bay) return null
  const { layout } = bay
  // the thing on the dais first, and the dais under it
  const w = RING_W
  const { x, y } = clearBay(pairs, n)
  const dais = block.props.find((p) =>
    p.type === "clear-dais" && p.i - BI - x - 1 >= 0 &&
    p.i - BI - x - 1 < w && p.j - BJ - y - 1 >= 0 &&
    p.j - BJ - y - 1 < RING_H
  )!
  const dx = dais.i - BI - x - 1, dy = dais.j - BJ - y - 1
  const things = [
    ...layout.things.filter((t) => t.x === dx && t.y === dy),
    ...layout.things.filter((t) => t.x !== dx || t.y !== dy),
  ]
  const rows = layout.rows.map((row, ry) =>
    ry === dy ? row.slice(0, dx) + "D" + row.slice(dx + 1) : row
  )
  return { id: bay.id, layout: { ...layout, rows, things } }
}

/**
 * Reads the n-th pair bay of the block back into a patch, as
 * readRingBay does. Also the pair's id
 */
export function readPairBay(
  block: BlockJson,
  n: number,
): { id: string; layout: Layout } | null {
  return readBay(block, pairBay(n))
}

/**
 * Reads the n-th bell bay of the block back into a patch, as
 * readRingBay does. Also the bell's id
 */
export function readBellBay(
  block: BlockJson,
  rings: number,
  n: number,
): { id: string; layout: Layout } | null {
  return readBay(block, bellBay(rings, n))
}

function readBay(
  block: BlockJson,
  { x, y }: { x: number; y: number },
): { id: string; layout: Layout } | null {
  const px = x + 1, py = y + 1
  const at = (list: Spawn[], dx: number, dy: number) =>
    list.find((s) => s.i === BI + px + dx && s.j === BJ + py + dy)
  let id: string | null = null
  const rows: string[] = []
  for (let dy = 0; dy < RING_H; dy++) {
    let row = ""
    for (let dx = 0; dx < RING_W; dx++) {
      const p = at(block.props, dx, dy)
      const a = at(block.actors, dx, dy)
      const c = PATCH_CHAR[block.field[py + dy][px + dx]] ?? "#"
      if (p?.type === "ring-slot") {
        id = (p.data as { id: string }).id
        row += "_"
      } else if (p?.type === "goal-bell") {
        id = (p.data as { id: string }).id
        row += "A"
      } else if (p?.type === "clear-dais") {
        // (the thing on it is read as it is: readClearBay puts the dais
        // back under it)
        id = (p.data as { id: string }).id
        const a = at(block.actors, dx, dy)
        row += a?.type === "stone" ? "S" : a?.type === "boulder" ? "B" : "D"
      } else if (p?.type === "gaze-statue") {
        id = (p.data as { id: string }).id
        row += "E"
      } else if (p?.type === "gaze-sun") row += "T"
      else if (p?.type === "patrol-beacon") {
        id = (p.data as { id: string }).id
        row += "L"
      } else if (a?.type === "patrol") row += "J"
      else if (p?.type === "pair-plinth") {
        id = (p.data as { id: string }).id
        row += "P"
      } else if (p?.type === "pair-twin") {
        row += (p.data as { holds: string }).holds === "boulder" ? "Z" : "Y"
      } else if (p?.type === "ring-heart") row += "O"
      else if (p?.type === "ring-stone" || p?.type === "ring-boulder") {
        row += "o"
      } else if (a?.type === "stone") row += c === "i" ? "s" : "S"
      else if (a?.type === "boulder") row += c === "i" ? "b" : "B"
      else row += c
    }
    rows.push(row)
  }
  return id ? { id, layout: parse(rows) } : null
}
