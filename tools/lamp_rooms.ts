// The lamp rooms of the LAMPS map (tools/generate_lamp_map.ts,
// ideas/groups.md, docs/group-representations.md 案 1): which groups of
// permutations, with which levers (cycles of the columns), and the
// target of each. No drawing and no files here, so the tests can lay the
// rooms again.
import {
  commutes,
  type Cycles,
  cyclesText,
  evalLevers,
  keyOf,
  pickTarget,
  reachable,
} from "../model/lamp-grid.ts"

export type LampRoomSpec = {
  /** The room's name, written on the ground (S3, Z2XZ2) */
  title: string
  /** The group's name for the signs */
  group: string
  /** The grid's size: n things on n places */
  n: number
  /** The levers' cycles of the columns (from 0) */
  levers: Cycles[]
  /** How many patterns the levers reach (checked) */
  order: number
  /** The target: the levers pulled (indices), or the farthest found */
  target?: number[]
  /** A line for the name sign */
  note?: string
  /** The look of each lever (group-lever: 0 swap, 1 turn, 2 mirror) */
  looks?: number[]
}

/** Every room, row by row on the map (an empty title starts a new row) */
export const LAMP_ROOM_SPECS: readonly (readonly LampRoomSpec[])[] = [
  [
    {
      title: "S3",
      group: "S3, THE SYMMETRIC GROUP",
      n: 3,
      levers: [[[0, 1]], [[1, 2]]],
      order: 6,
      target: [0, 1],
      note:
        "ALL 6 ORDERS OF 3 THINGS. A THEN B IS NOT B THEN A: TRY BOTH FROM THE START",
    },
    {
      title: "D3",
      group: "D3 = S3, THE TRIANGLE'S TURNS AND FLIPS",
      n: 3,
      levers: [[[0, 1]], [[0, 1, 2]]],
      order: 6,
      note:
        "THE SAME 6 PATTERNS AS THE S3 ROOM FROM A SWAP AND A TURN OF ALL THREE",
    },
    {
      title: "Z3",
      group: "Z3, THE CYCLIC GROUP",
      n: 3,
      levers: [[[0, 1, 2]]],
      order: 3,
      target: [0, 0],
      note:
        "ONLY 3 OF THE 6 PATTERNS EVER LIGHT: A TURN NEVER SWAPS JUST TWO. THREE PULLS AND IT IS BACK",
    },
  ],
  [
    {
      title: "S4",
      group: "S4, THE SYMMETRIC GROUP",
      n: 4,
      levers: [[[0, 1]], [[1, 2]], [[2, 3]]],
      order: 24,
      target: [0, 1, 2, 0, 1, 0],
      note:
        "ALL 24 ORDERS OF 4 THINGS FROM SWAPS OF NEIGHBOURS. THE PLAQUES: REVERSED",
    },
    {
      title: "A4",
      group: "A4, THE ALTERNATING GROUP",
      n: 4,
      levers: [[[0, 1, 2]], [[1, 2, 3]]],
      order: 12,
      target: [1, 0],
      note:
        "ONLY 12 OF THE 24 PATTERNS LIGHT: TWO SWAPS AT ONCE, AS ON THE PLAQUES, BUT NEVER ONE SWAP (THE ODD PATTERNS)",
    },
    {
      title: "D4",
      group: "D4, THE SQUARE'S TURNS AND FLIPS",
      n: 4,
      levers: [[[0, 1, 2, 3]], [[1, 3]]],
      order: 8,
      looks: [1, 2],
      note:
        "THE COLUMNS ARE THE 4 CORNERS OF A SQUARE, CLOCKWISE: A TURNS IT, B FLIPS IT ON THE DIAGONAL 1 3. 8 OF THE 24",
    },
  ],
  [
    {
      title: "Z4",
      group: "Z4, THE CYCLIC GROUP",
      n: 4,
      levers: [[[0, 1, 2, 3]]],
      order: 4,
      target: [0, 0],
      note: "4 PATTERNS, ONE LEVER. LOOK AT THE Z2XZ2 ROOM NEXT DOOR",
    },
    {
      title: "Z2XZ2",
      group: "Z2xZ2, THE KLEIN FOUR GROUP",
      n: 4,
      levers: [[[0, 1]], [[2, 3]]],
      order: 4,
      target: [0, 1],
      note:
        "4 PATTERNS TOO, BUT ANOTHER GROUP: EACH LEVER TWICE IS BACK, AND THEIR ORDER NEVER MATTERS",
    },
  ],
  [
    {
      title: "S5",
      group: "S5, THE SYMMETRIC GROUP",
      n: 5,
      levers: [[[0, 1]], [[0, 1, 2, 3, 4]]],
      order: 120,
      note: "ALL 120 ORDERS OF 5 THINGS FROM ONE SWAP AND ONE TURN OF ALL FIVE",
    },
    {
      title: "A5",
      group: "A5, THE ALTERNATING GROUP",
      n: 5,
      levers: [[[0, 1, 2]], [[2, 3, 4]]],
      order: 60,
      note:
        "60 OF THE 120: THE EVEN ONES. THE SMALLEST GROUP THAT CANNOT BE BROKEN INTO SMALLER ONES",
    },
  ],
]

/** A room laid out */
export type LampRoom = LampRoomSpec & {
  /** Its id: the GROUPS state of its levers, lamps and door, its goal */
  id: string
  /** The target arrangement (arr[place] = the thing there) */
  goal: number[]
  /** A shortest word of levers to it */
  solution: number[]
  /** Its looks, one a lever */
  leverLooks: number[]
  abelian: boolean
}

export const PREFIX = "lamps-"
export const LEVER_NAMES = "abc"

/** n! */
const factorial = (n: number): number => n <= 1 ? 1 : n * factorial(n - 1)

/** Lays out the room of the spec: its target and a solution */
export function layLampRoom(spec: LampRoomSpec): LampRoom {
  const all = reachable(spec.levers, spec.n)
  if (all.size !== spec.order) {
    throw new Error(`${spec.title}: ${all.size} patterns, not ${spec.order}`)
  }
  const picked = spec.target
    ? {
      arr: evalLevers(spec.levers, spec.target, spec.n),
      word: spec.target,
    }
    : pickTarget(spec.levers, spec.n, 5)
  const goal = picked.arr
  const solution = all.get(keyOf(goal, spec.n))!.word
  return {
    ...spec,
    id: `${PREFIX}${spec.title.toLowerCase()}`,
    goal,
    solution,
    leverLooks: spec.looks ??
      spec.levers.map((c) => c.length === 1 && c[0].length === 2 ? 0 : 1),
    abelian: commutes(spec.levers, spec.n),
  }
}

/** Every room, row by row */
export const LAMP_ROOMS: readonly (readonly LampRoom[])[] = LAMP_ROOM_SPECS
  .map((row) => row.map(layLampRoom))

const word = (w: number[]) =>
  w.map((k) => LEVER_NAMES[k].toUpperCase()).join(" ")

/** The name sign: the group, the grid, the levers' cycles, the order */
export function nameText(room: LampRoom): string {
  const levers = room.levers.map((c, k) =>
    `${LEVER_NAMES[k].toUpperCase()} ${cyclesText(c)}`
  )
  return [
    `${room.group}, OF ORDER ${room.order}: ${room.order} OF THE ${
      factorial(room.n)
    } PATTERNS OF ${room.n}x${room.n} LAMPS LIGHT.`,
    ` LEVERS (COLUMNS): ${levers.join(", ")}.`,
    room.abelian ? " IT COMMUTES." : " IT DOES NOT COMMUTE.",
    room.note ? ` ${room.note}` : "",
  ].join("")
}

export const RULE_TEXT =
  "ROW = THING, COLUMN = PLACE: ONE LAMP LIT IN EACH ROW AND EACH COLUMN. A LEVER SWAPS THE COLUMNS IT IS TIED TO, (1 2 3) TURNS THEM ROUND, 1 TO 2 TO 3 TO 1. LIGHT THE LAMPS AS ON THE PLAQUES"

/** The debug sign: a solution, and whether the order of the pulls matters */
export function debugText(room: LampRoom): string {
  const s = room.solution
  const reversed = evalLevers(room.levers, [...s].reverse(), room.n)
  const order = keyOf(reversed, room.n) !== keyOf(room.goal, room.n)
    ? ` (${word([...s].reverse())} LIGHTS ANOTHER PATTERN: THE ORDER MATTERS)`
    : room.abelian
    ? " IN ANY ORDER"
    : ""
  return `DEBUG: SOLUTION ${word(s)}${order}`
}
