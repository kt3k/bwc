// Mini puzzles: small walled rooms scattered over the map, each with a
// treasure at its goal. Three kinds, made by generate-and-test: a layout
// is drawn at random, the solver checks it (solvable, not too easy, and
// the way back out stays open), and the first that passes is kept.
//
// - ice: the floor is ice; you slide until something stops you. Reach
//   the goal (a plain floor tile among the ice)
// - boulder: a boulder rolls until it hits something when pushed. Roll it
//   onto the plate: the door to the goal stays open while it's there
// - switch: bumping the switch swaps the walls: the blue ones stand while
//   it's OFF, the red ones while it's ON. Find the way to the goal
//
// The rooms are grids of characters:
//
//   #  wall          .  floor        _  ice           E  entrance (floor)
//   G  goal (floor)  B  boulder      P  plate         D  door
//   S  switch        b  blue wall    r  red wall
//
// Moves are U D L R. The simulator here follows the game's rules
// (model/actor.ts, model/prop.ts) and is used both by the generator and
// to check answers given by others (tools/minipuzzles_eval.ts).

export type Kind = "ice" | "boulder" | "switch"
export type Puzzle = {
  kind: Kind
  rows: string[]
  /** a shortest solution (moves) */
  solution: string
}

const DIRS: Record<string, [number, number]> = {
  U: [0, -1],
  D: [0, 1],
  L: [-1, 0],
  R: [1, 0],
}

type State = {
  x: number
  y: number
  /** the boulder (boulder rooms) */
  bx: number
  by: number
  /** the switch (switch rooms) */
  on: boolean
}

function find(rows: string[], c: string): [number, number][] {
  const out: [number, number][] = []
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => ch === c && out.push([x, y]))
  )
  return out
}

/** The cell at (x, y), with the boulder and the plate kept apart */
const cell = (rows: string[], x: number, y: number) => rows[y]?.[x] ?? "#"

/** The start: the floor inside the entrance */
function start(rows: string[]): State {
  const [[ex, ey]] = find(rows, "E")
  const [bx, by] = find(rows, "B")[0] ?? [-1, -1]
  const inside = ey === 0
    ? [ex, 1]
    : ey === rows.length - 1
    ? [ex, ey - 1]
    : ex === 0
    ? [1, ey]
    : [ex - 1, ey]
  return { x: inside[0], y: inside[1], bx, by, on: false }
}

/** Whether a cell stops a mover (the player or the boulder) */
function solid(rows: string[], s: State, x: number, y: number): boolean {
  const c = cell(rows, x, y)
  if (c === "#" || c === "S") return true
  if (c === "b") return !s.on
  if (c === "r") return s.on
  if (c === "D") {
    // open while the boulder stands on a plate
    return cell(rows, s.bx, s.by) !== "P"
  }
  return false
}

/**
 * One move of the player. Returns the new state, or null when nothing
 * happens (a wall). Bumping the switch flips it; pushing the boulder
 * rolls it until it's stopped (pressing a switch it hits); walking onto
 * ice slides until something stops you or you reach a floor tile.
 */
export function step(rows: string[], s: State, move: string): State | null {
  const [dx, dy] = DIRS[move]
  const nx = s.x + dx, ny = s.y + dy
  if (cell(rows, nx, ny) === "E") return null // not out by the entrance
  if (nx === s.bx && ny === s.by) {
    // push the boulder: it rolls till something stops it
    let bx = s.bx, by = s.by
    let on = s.on
    for (;;) {
      const tx = bx + dx, ty = by + dy
      if (cell(rows, tx, ty) === "S") on = !on // it presses the switch
      if (solid(rows, s, tx, ty) || cell(rows, tx, ty) === "E") break
      bx = tx
      by = ty
    }
    if (bx === s.bx && by === s.by && on === s.on) return null
    return { ...s, bx, by, on }
  }
  if (cell(rows, nx, ny) === "S") {
    // bump the switch; not while standing where a wall would rise
    const on = !s.on
    const here = cell(rows, s.x, s.y)
    if ((here === "b" && !on) || (here === "r" && on)) return null
    return { ...s, on }
  }
  if (solid(rows, s, nx, ny)) return null
  let x = nx, y = ny
  while (cell(rows, x, y) === "_") {
    const tx = x + dx, ty = y + dy
    if (
      solid(rows, s, tx, ty) || cell(rows, tx, ty) === "E" ||
      (tx === s.bx && ty === s.by)
    ) break
    x = tx
    y = ty
  }
  return { ...s, x, y }
}

const key = (s: State) => `${s.x},${s.y},${s.bx},${s.by},${s.on ? 1 : 0}`

/** A shortest way from the state to where `goal` holds (moves), or null */
function search(
  rows: string[],
  from: State,
  goal: (s: State) => boolean,
): string | null {
  const seen = new Map<string, string>([[key(from), ""]])
  const queue: [State, string][] = [[from, ""]]
  for (let q = 0; q < queue.length; q++) {
    const [s, path] = queue[q]
    if (goal(s)) return path
    for (const m of "UDLR") {
      const n = step(rows, s, m)
      if (!n || seen.has(key(n))) continue
      seen.set(key(n), path + m)
      queue.push([n, path + m])
    }
  }
  return null
}

/**
 * Whether the goal can be reached flipping the switch (or pushing the
 * boulder) at most `max` times: the shortest solution may use more than
 * it needs when an equally short way uses fewer
 */
export function solvableWithin(
  rows: string[],
  max: number,
  what: "flips" | "pushes",
): boolean {
  const [[gx, gy]] = find(rows, "G")
  const from = start(rows)
  const seen = new Set<string>([key(from) + ",0"])
  const queue: [State, number][] = [[from, 0]]
  for (let q = 0; q < queue.length; q++) {
    const [s, used] = queue[q]
    if (s.x === gx && s.y === gy) return true
    for (const m of "UDLR") {
      const n = step(rows, s, m)
      if (!n) continue
      const counts = what === "flips"
        ? n.on !== s.on
        : n.bx !== s.bx || n.by !== s.by
      const u = used + (counts ? 1 : 0)
      if (u > max || seen.has(key(n) + "," + u)) continue
      seen.add(key(n) + "," + u)
      queue.push([n, u])
    }
  }
  return false
}

/** The shortest solution, or null when there's none */
export function solve(rows: string[]): string | null {
  const [[gx, gy]] = find(rows, "G")
  return search(rows, start(rows), (s) => s.x === gx && s.y === gy)
}

/** Plays the moves; true if they reach the goal */
export function check(rows: string[], moves: string): boolean {
  const [[gx, gy]] = find(rows, "G")
  let s = start(rows)
  for (const m of moves.toUpperCase().replace(/[^UDLR]/g, "")) {
    s = step(rows, s, m) ?? s
    if (s.x === gx && s.y === gy) return true
  }
  return false
}

/** From the goal, can the player still get back to the entrance? */
function canLeave(rows: string[], moves: string): boolean {
  let s = start(rows)
  for (const m of moves) s = step(rows, s, m) ?? s
  const home = start(rows)
  return search(rows, s, (t) => t.x === home.x && t.y === home.y) !== null
}

// ---------------------------------------------------------------------
// the generators

type Rng = { rng: () => number; randomInt: (n: number) => number }

/** A walled room with the entrance in the middle of the bottom wall */
function room(w: number, h: number, fill: string): string[][] {
  const g: string[][] = []
  for (let y = 0; y < h; y++) {
    g.push([])
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1
      g[y].push(edge ? "#" : fill)
    }
  }
  g[h - 1][w >> 1] = "E"
  g[h - 2][w >> 1] = "."
  return g
}

/** The cells just inside the entrance stay open (the way in) */
function reserved(g: string[][], x: number, y: number) {
  return y >= g.length - 3 && Math.abs(x - (g[0].length >> 1)) <= 1
}

function freeCell(g: string[][], { randomInt }: Rng, c = ".") {
  for (let n = 0; n < 200; n++) {
    const x = 1 + randomInt(g[0].length - 2), y = 1 + randomInt(g.length - 2)
    if (g[y][x] === c && !reserved(g, x, y)) return [x, y]
  }
  return null
}

function accept(
  kind: Kind,
  g: string[][],
  minMoves: number,
  extra?: (rows: string[], solution: string) => boolean,
): Puzzle | null {
  const rows = g.map((r) => r.join(""))
  const solution = solve(rows)
  if (!solution || solution.length < minMoves) return null
  if (!canLeave(rows, solution)) return null
  if (extra && !extra(rows, solution)) return null
  return { kind, rows, solution }
}

/** Ice: slide over the rink to the one floor tile among the ice */
export function iceRoom(r: Rng): Puzzle {
  for (let tries = 0; tries < 20000; tries++) {
    const g = room(11, 9, "_")
    // rocks on the ice
    const rocks = 6 + r.randomInt(6)
    for (let k = 0; k < rocks; k++) {
      const c = freeCell(g, r, "_")
      if (c) g[c[1]][c[0]] = "#"
    }
    const goal = freeCell(g, r, "_")
    if (!goal) continue
    g[goal[1]][goal[0]] = "G"
    const p = accept("ice", g, 7)
    if (p) return p
  }
  throw new Error("no ice room")
}

/**
 * Boulder: a door in a short wall closes off the goal's nook; a plate
 * holds it open while the boulder stands on it
 */
export function boulderRoom(r: Rng): Puzzle {
  for (let tries = 0; tries < 20000; tries++) {
    const g = room(11, 9, ".")
    // the nook at the top: a wall row with the door
    const dx = 2 + r.randomInt(7)
    for (let x = 1; x <= 9; x++) g[2][x] = x === dx ? "D" : "#"
    g[1][dx] = "G"
    for (let x = 1; x <= 9; x++) if (x !== dx) g[1][x] = "#"
    const rocks = 3 + r.randomInt(4)
    for (let k = 0; k < rocks; k++) {
      const c = freeCell(g, r)
      if (c && c[1] >= 3 && c[1] <= 6) g[c[1]][c[0]] = "#"
    }
    const plate = freeCell(g, r)
    if (!plate || plate[1] < 3) continue
    g[plate[1]][plate[0]] = "P"
    const boulder = freeCell(g, r)
    if (!boulder || boulder[1] < 3 || boulder[1] > 6) continue
    g[boulder[1]][boulder[0]] = "B"
    // at least 3 pushes, however it's done
    const p = accept(
      "boulder",
      g,
      10,
      (rows) => !solvableWithin(rows, 2, "pushes"),
    )
    if (p) return p
  }
  throw new Error("no boulder room")
}

/** Switch: walls that swap with every bump of the switch */
export function switchRoom(r: Rng): Puzzle {
  for (let tries = 0; tries < 40000; tries++) {
    const g = room(11, 9, ".")
    // inner walls: a few short runs
    for (let k = 0; k < 7; k++) {
      const c = freeCell(g, r)
      if (!c) continue
      const [cx, cy] = c
      const horizontal = r.rng() < 0.5
      for (let n = 0; n < 2 + r.randomInt(3); n++) {
        const x = cx + (horizontal ? n : 0), y = cy + (horizontal ? 0 : n)
        if (g[y]?.[x] === "." && !reserved(g, x, y)) g[y][x] = "#"
      }
    }
    for (let k = 0; k < 6; k++) {
      const c = freeCell(g, r)
      if (c) g[c[1]][c[0]] = r.rng() < 0.5 ? "b" : "r"
    }
    const s = freeCell(g, r)
    if (!s) continue
    g[s[1]][s[0]] = "S"
    const goal = freeCell(g, r)
    if (!goal || goal[1] > 4) continue
    g[goal[1]][goal[0]] = "G"
    // the switch must be flipped at least twice, however it's done
    const p = accept(
      "switch",
      g,
      12,
      (rows) => !solvableWithin(rows, 1, "flips"),
    )
    if (p) return p
  }
  throw new Error("no switch room")
}

export const MAKERS: Record<Kind, (r: Rng) => Puzzle> = {
  ice: iceRoom,
  boulder: boulderRoom,
  switch: switchRoom,
}

/** The rules of each kind, as told to a player (or an agent) */
export const RULES: Record<Kind, string> = {
  ice:
    "The floor '_' is ice: when you step onto it you keep sliding in that direction until the next cell is a wall '#' (you stop in front of it) or you reach a plain floor cell '.' or 'G' (you stop on it). You cannot leave by the entrance 'E'.",
  boulder:
    "'B' is a boulder. Walking into it pushes it: it rolls in that direction until the next cell is a wall '#', the closed door 'D' or the entrance 'E', and you stay where you are. It rolls over the plate 'P' unless something stops it there. The door 'D' is open (walkable) only while the boulder is on the plate. You cannot walk onto the boulder or the walls, and you cannot leave by 'E'.",
  switch:
    "'S' is a switch, OFF at the start. Walking into it (you stay where you are) flips it ON/OFF. Blue walls 'b' stand (block you) while it is OFF and are open while ON; red walls 'r' stand while it is ON and are open while OFF. You cannot flip it while standing on a wall cell that would rise. '#' are walls, you cannot leave by 'E'.",
}
