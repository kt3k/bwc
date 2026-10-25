// The stray sheep (tools/folds.ts): the herding solved on hand-drawn
// patches, and against the game: a bot herds the real sheep
// (model/actor.ts, IdleDelegateFlee) into generated folds, moving the
// player as the solver says from where the player and the sheep really
// are, and the gate (model/fold.ts) shuts on it.
import { assert, assertEquals } from "@std/assert"
import { seed } from "../util/random.ts"
import { Item } from "../model/item.ts"
import { Actor, spawnActor } from "../model/actor.ts"
import { foldKey, foldRewardKey } from "../model/fold.ts"
import type { Dir } from "../model/types.ts"
import {
  acceptFold,
  draftFold,
  type Fold,
  FOLD_AIMS,
  type FoldLayout,
  parseFold,
  solveFold,
} from "./folds.ts"
import { catalog, World } from "./patch_world.ts"

// ---------------------------------------------------------------------
// the herding

Deno.test("folds: the sheep runs straight away, then aside, off the patch is lost", () => {
  const { herd } = solveFold(parseFold(["....", ".O..", "....", ".@.."]))
  const at = (x: number, y: number) => y * 4 + x
  // straight away (up), from the player below
  assertEquals(herd.flee(at(1, 3), at(1, 1)), [at(1, 0)])
  // out of range: it stays
  assertEquals(herd.flee(at(3, 3), at(0, 0)), [at(0, 0)])
  // against the top edge, from below: off the patch
  assertEquals(herd.flee(at(1, 2), at(1, 0)), [-1])
})

Deno.test("folds: a sheep in front of the gateway is herded in", () => {
  const layout = parseFold([
    ".........",
    ".fffff...",
    ".fPPPf...",
    ".fPPPf...",
    ".ffGff...",
    ".........",
    "...O.....",
    ".........",
    ".........",
    "....@....",
  ])
  const solved = solveFold(layout)
  assert(solved.rounds < Infinity)
  assert(solved.herds >= 2)
})

// ---------------------------------------------------------------------
// the real sheep

const STEP: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}

/** A field of the fold's patch, a real sheep in it, the gate in place */
function world(fold: Fold, n: number, id: string) {
  const ox = 1000 * n, oy = 0
  const [x0, y0, x1, y1] = fold.inside
  const data = {
    id,
    i0: ox + x0,
    j0: oy + y0,
    i1: ox + x1,
    j1: oy + y1,
    reward: [ox + fold.reward[0], oy + fold.reward[1]],
  }
  // the gate in the gateway
  const w = new World(
    { rows: fold.rows, things: [], start: fold.start },
    ox,
    oy,
    (c) => c === "G" ? { type: "fold-gate", data } : null,
  )
  // the player at speed 2 (the game's own), the sheep where it grazes
  w.me = new Actor(
    ox + fold.start[0],
    oy + fold.start[1],
    { type: "main", src: "", href: "" },
    "main",
    "up",
    2,
  )
  const sheep = spawnActor(
    "sheep",
    ox + fold.sheep[0],
    oy + fold.sheep[1],
    catalog.actors["sheep"],
  )
  w.actorList = [w.me, sheep]
  return { w, sheep }
}

/** The bot: the player moves as the solver says, from where things are */
function herd(fold: Fold, n: number, id: string, frames = 4000) {
  const solved = solveFold(fold)
  const { w, sheep } = world(fold, n, id)
  const local = (a: { i: number; j: number }): [number, number] => [
    a.i - w.ox,
    a.j - w.oy,
  ]
  for (let t = 0; t < frames && !Item.isCollected(foldKey(id)); t++) {
    const me = w.me
    if (me.isActionQueueEmpty() && me.x === me.i * 16 && me.y === me.j * 16) {
      const p = local(me), s = local(sheep)
      const running = sheep.x !== sheep.i * 16 || sheep.y !== sheep.j * 16
      const to = solved.next(p, s, running)
      if (to && (to[0] !== p[0] || to[1] !== p[1])) {
        const step = firstStep(fold, p, to, s)
        if (step) me.tryMove("go", step, w.field)
      }
    }
    w.step()
  }
  return w
}

/** The first step of a shortest walk from p to q, round the sheep at s */
function firstStep(
  fold: FoldLayout,
  p: [number, number],
  q: [number, number],
  s: [number, number],
): Dir | null {
  const W = fold.rows[0].length, H = fold.rows.length
  const open = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H && ".GP".includes(fold.rows[y][x]) &&
    !(x === s[0] && y === s[1])
  const first = new Map<string, Dir | null>([[`${p}`, null]])
  const queue: [number, number][] = [p]
  for (let k = 0; k < queue.length; k++) {
    const [x, y] = queue[k]
    if (x === q[0] && y === q[1]) return first.get(`${queue[k]}`) ?? null
    for (const [dir, [dx, dy]] of Object.entries(STEP) as [Dir, number[]][]) {
      const c: [number, number] = [x + dx, y + dy]
      if (!open(...c) || first.has(`${c}`)) continue
      first.set(`${c}`, first.get(`${queue[k]}`) ?? dir)
      queue.push(c)
    }
  }
  return null
}

Deno.test("folds: the real sheep is herded into the generated folds", () => {
  Item.deserializeCollected([])
  const r = seed("folds-test")
  let played = 0, won = 0
  const missed: string[] = []
  for (let n = 0; played < 12 && n < 400; n++) {
    const fold = acceptFold(draftFold(r, FOLD_AIMS[n % FOLD_AIMS.length]))
    if (!fold) continue
    played++
    const id = `test.${played}`
    const w = herd(fold, played, id)
    if (Item.isCollected(foldKey(id))) {
      won++
      // the gate shut, the letter by it
      const rewards = w.items.filter((t) => t.id === foldRewardKey(id))
      assertEquals(rewards.length, 1)
    } else missed.push(`${played}`)
  }
  assertEquals(played, 12)
  assertEquals(missed, [], `herded ${won} of ${played}`)
})
