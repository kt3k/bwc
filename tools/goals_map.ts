// The GOALS debug map (block_10400.-10000), laid out: a bay for every
// signature of the missing ring (tools/rings.ts) and for every family of
// the odd one out (tools/odd_ones.ts), a room to watch Odradek in, and a
// reset that undoes the goals of this map only (model/goal-reset.ts).
// tools/generate_goals_map.ts draws the rings and writes the block; this
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
// - ODD ONES: bays of 13x13, ODD_COLS to a row, the arrangement in the
//   middle, the way in and the signs as for the rings
// - ODRADEK: a room with corners, beside the odd ones
//
// The goal ids all start with PREFIX ("goals-<signature>",
// "goals-<family>"), which is how the reset tells this map's goals from
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

/** The top of the odd ones' section, after `rings` ring bays */
export const oddsY = (rings: number) =>
  RINGS_Y + 2 + Math.ceil(rings / RING_COLS) * RING_PITCH_Y + 1

/** The top left wall cell of the n-th odd one bay */
export function oddBay(rings: number, n: number): { x: number; y: number } {
  return {
    x: 3 + (n % ODD_COLS) * ODD_PITCH_X,
    y: oddsY(rings) + 2 + Math.floor(n / ODD_COLS) * ODD_PITCH_Y,
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

export type Spawn = { i: number; j: number; type: string; data?: unknown }
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

/** Lays out the map: the rings (in bay order) and the odd ones */
export function buildGoalsMap(
  rings: readonly GoalRing[],
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
  const width = 3 + RING_COLS * RING_PITCH_X + 3
  const ODDS_Y = oddsY(rings.length)
  const height = ODDS_Y + 2 + Math.max(oddRows, 2) * ODD_PITCH_Y
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
    `GOALS MAP: A RING FOR EVERY SIGNATURE (${rings.length}) AND AN ODD ONE ` +
      `FOR EVERY FAMILY (${odds.length}). GOALS DONE HERE COUNT, GIVE ` +
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
    const { x, y } = oddBay(rings.length, n)
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
    const x1 = width - 1
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
  const { x, y } = ringBay(n)
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
