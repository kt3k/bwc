// Generates the CAYLEY map (block_10200.-10000), next to the DEBUG map
// and reached from its GROUPS area: a Cayley room for every group of
// order 1 to 20 (tools/cayley_rooms.ts, ideas/groups.md). Each room has a
// gate per element of its group, exactly one open (at first e's), and a
// lever per generator that moves the opening from the gate of g to the
// gate of g·x; the gates stand where the group's Cayley graph has them,
// so the room is a picture of the group. Behind each gate a one-cell
// alcove; the target's (a diamond on its lintel) holds the letter.
//
// The rooms are walled, the way in at the bottom middle, the levers by
// it (each with its letter above it, A B C D), and under the room three
// signs: the group (its names, its GAP SmallGroup id, its levers'
// orders), the rule, and for debugging a solution. A RESET by the
// arrival undoes the rooms' goals (their ids start with "cayley-").
//
// tools/generate_debug_map.ts runs this too (deno task generate-debug).
//
// Usage: deno -A tools/generate_cayley_map.ts
import { loadCatalog } from "../model/catalog.ts"
import { elementOrder } from "../model/cayley.ts"
import {
  debugText,
  LEVER_NAMES,
  nameText,
  PREFIX,
  type Room,
  ROOMS,
  RULE_TEXT,
  TRIVIAL_RULE_TEXT,
} from "./cayley_rooms.ts"

export const SIZE = 200
export const BI = 10200
export const BJ = -10000
/** Two blocks, one under the other: block_10200.-10000 and block_10200.-9800 */
export const HEIGHT = 2 * SIZE
/** Where the player lands (local cells) */
export const ARRIVAL = { i: 2, j: 4 }
/** Where the player lands in the GROUPS area coming back (world cells) */
export const GROUPS_RETURN = { i: 10155, j: -9995 }

type Spawn = { i: number; j: number; type: string; data?: unknown }

/** A room placed: its walls' top left (local) and its size */
export type Placed = { room: Room; x: number; y: number; w: number; h: number }

/** The room's size in cells, walls included */
export function roomSize(room: Room) {
  const W = Math.max(...room.cells.map(([x]) => x))
  const H = Math.max(...room.cells.map(([, y]) => y))
  const levers = room.gens.length
  const w = Math.max(W + 7, 2 * levers + 5, 9)
  return { w, h: H + 11, W, H }
}

/**
 * The rooms in rows, top to bottom, the walkways between them; a row that
 * would cross into the second block starts in it
 */
export function placeRooms(): Placed[] {
  const rows: Room[][] = [[]]
  let x = 2
  for (const room of ROOMS) {
    const { w } = roomSize(room)
    if (x + w > SIZE - 2) {
      rows.push([])
      x = 2
    }
    rows[rows.length - 1].push(room)
    x += w + 1
  }
  const placed: Placed[] = []
  let y = 7
  for (const row of rows) {
    const rowH = Math.max(...row.map((r) => roomSize(r).h)) + 1
    if (y < SIZE && y + rowH >= SIZE - 1) y = SIZE + 1
    let x = 2
    for (const room of row) {
      const { w, h } = roomSize(room)
      placed.push({ room, x, y, w, h })
      x += w + 1
    }
    y += rowH + 1
  }
  const bottom = Math.max(...placed.map((p) => p.y + p.h + 1))
  if (bottom > HEIGHT - 2) throw new Error(`the rooms reach row ${bottom}`)
  return placed
}

/** Builds the block: the field, the props */
export function buildCayleyMap() {
  const grid: string[][] = Array.from(
    { length: HEIGHT },
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

  const placed = placeRooms()
  const bottom = Math.max(...placed.map((p) => p.y + p.h + 1))
  const right = Math.max(...placed.map((p) => p.x + p.w))
  rect(1, 1, right, bottom, "0")

  // the arrival: the title, the portal back, the reset
  const letters = (i: number, j: number, word: string) => {
    for (const [n, ch] of [...word.toLowerCase()].entries()) {
      prop(i + n, j, `${ch}_white`)
    }
  }
  letters(2, 2, "CAYLEY")
  sign(
    9,
    2,
    "CAYLEY ROOMS: EVERY GROUP OF ORDER 1 TO 20. A GATE FOR EACH ELEMENT, ONE OPEN. A LEVER FOR EACH GENERATOR MOVES THE OPENING FROM G TO G TIMES IT",
  )
  prop(ARRIVAL.i, ARRIVAL.j, "portal-out")
  prop(5, 4, "portal", { i: GROUPS_RETURN.i, j: GROUPS_RETURN.j })
  letters(5, 5, "GROUPS")
  prop(9, 4, "goal-reset", {
    prefix: PREFIX,
    box: [BI, BJ, BI + SIZE - 1, BJ + HEIGHT - 1],
    to: [BI + ARRIVAL.i, BJ + ARRIVAL.j],
  })
  sign(10, 4, "RESET: THE CAYLEY ROOMS BACK AS NEW, TO PLAY AGAIN")

  for (const { room, x, y, w, h } of placed) {
    const { W, H } = roomSize(room)
    rect(x, y, x + w - 1, y + h - 1, "1")
    rect(x + 1, y + 1, x + w - 2, y + h - 2, "0")
    const mid = x + Math.floor(w / 2)
    rect(mid - 1, y + h - 1, mid + 1, y + h - 1, "0")
    // the gates, the layout in the middle of the room's width
    const ox = x + 3 + Math.floor((w - 7 - W) / 2), oy = y + 3
    const target = room.target
    room.cells.forEach(([cx, cy], el) => {
      const ax = ox + cx, ay = oy + cy
      rect(ax - 1, ay - 1, ax + 1, ay + 1, "1")
      rect(ax, ay, ax, ay + 1, "0")
      prop(ax, ay + 1, "cayley-gate", {
        room: room.id,
        group: room.group.key,
        el,
        alcove: [BI + ax, BJ + ay],
        mark: el === 0 ? 1 : el === target ? 2 : 0,
        ...(el === target ? { id: room.id } : {}),
      })
    })
    // the levers, their letters above them
    const ly = oy + H + 5
    room.gens.forEach((by, k) => {
      const lx = mid + 2 * k - (room.gens.length - 1)
      prop(lx, ly - 1, `${LEVER_NAMES[k]}_white`)
      prop(lx, ly, "cayley-lever", {
        room: room.id,
        group: room.group.key,
        by,
        look: elementOrder(room.group, by) === 2 ? 2 : 1,
      })
    })
    // the signs under the room
    sign(x + 1, y + h, nameText(room))
    sign(x + 2, y + h, target === null ? TRIVIAL_RULE_TEXT : RULE_TEXT)
    sign(x + w - 2, y + h, debugText(room))
  }
  return { grid, props, placed }
}

/** Checks the block: on the floor, nothing overlaps, every gate and lever reached */
function check(
  grid: string[][],
  props: Spawn[],
  catalog: Awaited<ReturnType<typeof loadCatalog>>,
) {
  const at = new Map<string, Spawn>()
  for (const p of props) {
    const x = p.i - BI, y = p.j - BJ
    if (x < 1 || y < 1 || x > SIZE - 2 || y > HEIGHT - 2) {
      throw new Error(`off the floor: ${JSON.stringify(p)}`)
    }
    if (grid[y][x] !== "0") throw new Error(`in a wall: ${JSON.stringify(p)}`)
    if (at.has(`${x}.${y}`)) throw new Error(`overlap at ${x}.${y}`)
    if (!catalog.props[p.type]) throw new Error(`unknown prop ${p.type}`)
    at.set(`${x}.${y}`, p)
  }
  // the walk from the arrival, the gates shut (props block but the
  // letters, the portals)
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
    if (p.type === "cayley-gate" && !seen.has(`${x}.${y + 1}`)) {
      throw new Error(`the way to a gate is cut: ${JSON.stringify(p)}`)
    }
    if (["cayley-lever", "sign", "goal-reset"].includes(p.type)) {
      if (!reached(x, y)) throw new Error(`not reached: ${JSON.stringify(p)}`)
    }
  }
}

export async function generateCayleyMap() {
  const catalog = await loadCatalog(
    new URL("../static/catalog/base.json", import.meta.url).href,
    ["base.json"],
  )
  const { grid, props, placed } = buildCayleyMap()
  check(grid, props, catalog)
  for (const [k, j] of [BJ, BJ + SIZE].entries()) {
    const json = {
      i: BI,
      j,
      name: "CAYLEY",
      catalogs: ["../catalog/base.json"],
      config: { showsExitButton: true },
      actors: [],
      items: [],
      props: props.filter((p) => p.j >= j && p.j < j + SIZE),
      field: grid.slice(k * SIZE, (k + 1) * SIZE).map((row) => row.join("")),
    }
    await Deno.writeTextFile(
      new URL(`../static/map/block_${BI}.${j}.json`, import.meta.url),
      JSON.stringify(json, null, 2) + "\n",
    )
  }
  console.log(
    `generated block_${BI}.${BJ}.json and block_${BI}.${
      BJ + SIZE
    }.json (cayley rooms: ${placed.length} rooms)`,
  )
}

if (import.meta.main) await generateCayleyMap()
