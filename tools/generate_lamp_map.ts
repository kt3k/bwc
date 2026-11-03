// Generates the LAMPS map (block_10600.-10000), east of the GOALS map:
// the lamp grids (tools/lamp_rooms.ts, ideas/groups.md,
// docs/group-representations.md 案 1). Each room shows a permutation as
// its matrix: n x n floor lamps (`lamp-cell`), row = thing, column =
// place, exactly one lit in each row and each column (at first the
// diagonal). The levers (`group-lever`, each with its letter above it,
// A B C) permute the columns. Beside the lamps, the plaques of the target
// (`lamp-plaque`), the columns numbered under both; beside them a door
// (`group-door`) that opens on the letter the first time the lamps are
// the plaques.
//
// A room, walls included, for a grid of n (local rows from its top):
//
//   0       wall
//   1       its name on the ground (S3, A4, Z2XZ2)
//   2       the top of the door's block
//   3..n+2  the lamps, then the plaques; the door's alcove at 3, the door at 4
//   n+3     the columns' numbers, under the lamps and under the plaques
//   n+5     the levers' letters
//   n+6     the levers
//   n+8     wall, the way in at its middle
//
// and under it three signs: the group (its order, the levers' cycles,
// commuting or not), the rule, and for debugging a solution. By the
// arrival the portal back to START and a RESET of the rooms' goals (their
// ids start with "lamps-").
//
// tools/generate_debug_map.ts runs this too (deno task generate-debug).
//
// Usage: deno -A tools/generate_lamp_map.ts
import { loadCatalog } from "../model/catalog.ts"
import { isLit, LAMPS_TEXT } from "../model/lamp-grid.ts"
import { validate } from "../util/json-schema.ts"
import { START } from "./goals_map.ts"
import {
  debugText,
  LAMP_ROOMS,
  type LampRoom,
  LEVER_NAMES,
  nameText,
  PREFIX,
  RULE_TEXT,
} from "./lamp_rooms.ts"

export const SIZE = 200
export const BI = 10600
export const BJ = -10000
/** Where the player lands (local cells) */
export const ARRIVAL = { i: 2, j: 4 }

type Spawn = { i: number; j: number; type: string; data?: unknown }

/** A room placed: its walls' top left (local) and its size */
export type Placed = {
  room: LampRoom
  x: number
  y: number
  w: number
  h: number
}

/** The room's size in cells, walls included */
export const roomSize = (n: number) => ({ w: 2 * n + 10, h: n + 9 })

/** The rooms, a row of the specs a row of rooms, a walkway between */
export function placeLampRooms(): Placed[] {
  const placed: Placed[] = []
  let y = 7
  for (const row of LAMP_ROOMS) {
    let x = 2
    let rowH = 0
    for (const room of row) {
      const { w, h } = roomSize(room.n)
      placed.push({ room, x, y, w, h })
      x += w + 1
      rowH = Math.max(rowH, h)
    }
    y += rowH + 2
  }
  return placed
}

/** Builds the block: the field, the props */
export function buildLampMap() {
  const grid: string[][] = Array.from(
    { length: SIZE },
    () => Array(SIZE).fill("1"),
  )
  const props: Spawn[] = []
  const rect = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) grid[y][x] = c
    }
  }
  const prop = (i: number, j: number, type: string, data?: unknown) =>
    props.push({ i: BI + i, j: BJ + j, type, ...(data ? { data } : {}) })
  const sign = (i: number, j: number, text: string) =>
    prop(i, j, "sign", { text })
  const letters = (i: number, j: number, word: string) => {
    for (const [n, ch] of [...word.toLowerCase()].entries()) {
      prop(i + n, j, `${ch}_white`)
    }
  }

  const placed = placeLampRooms()
  const bottom = Math.max(...placed.map((p) => p.y + p.h + 1))
  const right = Math.max(...placed.map((p) => p.x + p.w), 30)
  rect(1, 1, right, bottom, "0")

  // the arrival: the title, the portal back, the reset
  letters(2, 2, "LAMPS")
  sign(
    8,
    2,
    "LAMP GRIDS: AN ORDER OF N THINGS AS N x N LAMPS. ROW = THING, COLUMN = PLACE, ONE LAMP LIT IN EACH ROW AND EACH COLUMN. THE LEVERS MOVE THE COLUMNS",
  )
  prop(ARRIVAL.i, ARRIVAL.j, "portal-out")
  prop(5, 4, "portal", { i: START.i, j: START.j })
  letters(5, 5, "START")
  prop(11, 4, "goal-reset", {
    prefix: PREFIX,
    box: [BI, BJ, BI + SIZE - 1, BJ + SIZE - 1],
    to: [BI + ARRIVAL.i, BJ + ARRIVAL.j],
  })
  sign(12, 4, "RESET: THE LAMP ROOMS BACK AS NEW, TO PLAY AGAIN")

  for (const { room, x, y, w, h } of placed) {
    const { n, id } = room
    rect(x, y, x + w - 1, y + h - 1, "1")
    rect(x + 1, y + 1, x + w - 2, y + h - 2, "0")
    const mid = x + Math.floor(w / 2)
    rect(mid - 1, y + h - 1, mid + 1, y + h - 1, "0")
    letters(x + 1, y + 1, room.title)
    // the lamps, the plaques of the target, the columns' numbers
    const lx = x + 2, px = x + n + 4, gy = y + 3
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        prop(lx + col, gy + row, "lamp-cell", { group: id, row, col })
        prop(px + col, gy + row, "lamp-plaque", {
          lit: isLit(room.goal, row, col),
        })
      }
    }
    for (let col = 0; col < n; col++) {
      prop(lx + col, gy + n, `${col + 1}_white`)
      prop(px + col, gy + n, `${col + 1}_white`)
    }
    // the door, at the bottom of a block of wall, the letter behind it
    const dx = x + 2 * n + 6, ay = y + 3
    rect(dx - 1, ay - 1, dx + 1, ay + 1, "1")
    rect(dx, ay, dx, ay + 1, "0")
    prop(dx, ay + 1, "group-door", {
      group: id,
      id,
      target: room.goal,
      reward: [BI + dx, BJ + ay],
      text: LAMPS_TEXT,
    })
    // the levers, their letters above them
    const vy = y + n + 6
    room.levers.forEach((cycles, k) => {
      const vx = mid + 2 * k - (room.levers.length - 1)
      prop(vx, vy - 1, `${LEVER_NAMES[k]}_white`)
      prop(vx, vy, "group-lever", {
        group: id,
        cycles,
        name: LEVER_NAMES[k],
        look: room.leverLooks[k],
      })
    })
    // the signs under the room
    sign(x + 1, y + h, nameText(room))
    sign(x + 2, y + h, RULE_TEXT)
    sign(x + w - 2, y + h, debugText(room))
  }
  return { grid, props, placed }
}

/** Checks the block: on the floor, nothing overlaps, every part reached */
function check(
  grid: string[][],
  props: Spawn[],
  catalog: Awaited<ReturnType<typeof loadCatalog>>,
) {
  const at = new Map<string, Spawn>()
  for (const p of props) {
    const x = p.i - BI, y = p.j - BJ
    if (x < 1 || y < 1 || x > SIZE - 2 || y > SIZE - 2) {
      throw new Error(`off the floor: ${JSON.stringify(p)}`)
    }
    if (grid[y][x] !== "0") throw new Error(`in a wall: ${JSON.stringify(p)}`)
    if (at.has(`${x}.${y}`)) throw new Error(`overlap at ${x}.${y}`)
    const def = catalog.props[p.type]
    if (!def) throw new Error(`unknown prop ${p.type}`)
    if (def.dataSchema && !validate(def.dataSchema, p.data ?? {})) {
      throw new Error(`data not matching its schema: ${JSON.stringify(p)}`)
    }
    at.set(`${x}.${y}`, p)
  }
  // the walk from the arrival, the doors shut
  const passable = (x: number, y: number) => {
    if (grid[y]?.[x] !== "0") return false
    const p = at.get(`${x}.${y}`)
    return !p || !!catalog.props[p.type].canEnter
  }
  const seen = new Set([`${ARRIVAL.i}.${ARRIVAL.j}`])
  const queue = [[ARRIVAL.i, ARRIVAL.j]]
  while (queue.length) {
    const [x, y] = queue.shift()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx}.${y + dy}`
      if (seen.has(k) || !passable(x + dx, y + dy)) continue
      seen.add(k)
      queue.push([x + dx, y + dy])
    }
  }
  const reached = (x: number, y: number) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
      seen.has(`${x + dx}.${y + dy}`)
    )
  for (const p of props) {
    const x = p.i - BI, y = p.j - BJ
    if (p.type === "group-door" && !seen.has(`${x}.${y + 1}`)) {
      throw new Error(`the way to a door is cut: ${JSON.stringify(p)}`)
    }
    if (["group-lever", "sign", "goal-reset", "portal"].includes(p.type)) {
      if (!reached(x, y)) throw new Error(`not reached: ${JSON.stringify(p)}`)
    }
  }
}

export async function generateLampMap() {
  const catalog = await loadCatalog(
    new URL("../static/catalog/base.json", import.meta.url).href,
    ["base.json"],
  )
  const { grid, props, placed } = buildLampMap()
  check(grid, props, catalog)
  const json = {
    i: BI,
    j: BJ,
    name: "LAMPS",
    catalogs: ["../catalog/base.json"],
    config: { showsExitButton: true },
    actors: [],
    items: [],
    props,
    field: grid.map((row) => row.join("")),
  }
  await Deno.writeTextFile(
    new URL(`../static/map/block_${BI}.${BJ}.json`, import.meta.url),
    JSON.stringify(json, null, 2) + "\n",
  )
  console.log(
    `generated block_${BI}.${BJ}.json (lamp grids: ${placed.length} rooms)`,
  )
}

if (import.meta.main) await generateLampMap()
