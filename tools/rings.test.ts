// The missing ring's simulator, solver and signatures (tools/rings.ts),
// on hand-drawn patches, and the simulator against the game: the
// solutions of generated rings played in the real actors and props
// (model/actor.ts, model/prop.ts, model/ring.ts), compared move by move.
import { assert, assertEquals } from "@std/assert"
import { seed } from "../util/random.ts"
import { Catalog } from "../model/catalog.ts"
import { Actor, spawnActor } from "../model/actor.ts"
import { Item } from "../model/item.ts"
import { Prop } from "../model/prop.ts"
import { PropSpawn } from "../model/field-block.ts"
import { ringKey, ringRewardKey } from "../model/ring.ts"
import type { Dir, IActor, IField, IItem } from "../model/types.ts"
import {
  accept,
  AIMS,
  check,
  draft,
  type Layout,
  parse,
  type Ring,
  sigName,
  signature,
  solve,
  trace,
} from "./rings.ts"

// ---------------------------------------------------------------------
// the rules, one by one

/** The patch after the moves, drawn (the things on it) */
function after(rows: string[], moves: string): string[] {
  const layout = parse(rows)
  const w = layout.rows[0].length
  const last = trace(layout, moves).at(-1)!
  const g = layout.rows.map((r) => [...r])
  for (const p of last.filled) g[Math.floor(p / w)][p % w] = "="
  for (const p of last.flat) g[Math.floor(p / w)][p % w] = "-"
  last.things.forEach((p, n) => {
    if (p < 0) return
    const c = layout.things[n].kind === "stone" ? "S" : "B"
    g[Math.floor(p / w)][p % w] = c
  })
  g[Math.floor(last.player / w)][last.player % w] = "@"
  return g.map((r) => r.join(""))
}

Deno.test("rings: a stone moves a cell, a boulder rolls till stopped", () => {
  // (the player stays where it stood when it pushes)
  assertEquals(after(["@S...#"], "R"), ["@.S..#"])
  assertEquals(after(["@B...#"], "R"), ["@...B#"])
})

Deno.test("rings: on ice a stone slides on, and the player too", () => {
  assertEquals(after(["@Siii.#"], "R"), ["@.iiiS#"])
  assertEquals(after(["@Siii#."], "R"), ["@.iiS#."])
  assertEquals(after(["@iii#"], "R"), [".ii@#"])
})

Deno.test("rings: a thing pushed into water sinks and fills it", () => {
  assertEquals(after(["@Sw."], "R"), ["@.=."])
  assertEquals(after(["@B..w"], "R"), ["@...="])
  // and then it can be walked
  assertEquals(after(["@Sw."], "RRR"), ["..@."])
})

Deno.test("rings: the player pushes a bush flat, a thing can't", () => {
  assertEquals(after(["@k.."], "R"), ["@-.."])
  assertEquals(after(["@k.."], "RR"), [".@.."])
  assertEquals(after(["@Sk."], "R"), ["@Sk."])
  assertEquals(after(["@B.k"], "R"), ["@.Bk"])
})

Deno.test("rings: a boulder crushes a thing in its way, a stone stops", () => {
  assertEquals(after(["@B.S.#"], "R"), ["@...B#"])
  assertEquals(after(["@S.S.#"], "RRR"), [".@SS.#"])
})

Deno.test("rings: a thing pushed into the gap fills it", () => {
  const ring = [
    ".ooo.",
    ".oOo.",
    ".o_o.",
    ".....",
    "..S..",
    "..@..",
  ]
  assert(!check(parse(ring), "UU"))
  assert(check(parse(ring), "UUU"))
  // a boulder stops in the gap too: the heart is behind it
  const rolled = [
    ".ooo.",
    ".oOo.",
    ".o_o.",
    ".....",
    "..B..",
    "..@..",
  ]
  assertEquals(solve(parse(rolled))?.pushes, 1)
})

// ---------------------------------------------------------------------
// the solver and the signatures, on drawn patches

Deno.test("rings: a bank shot wants the roll alone", () => {
  // the boulder rolls to the rock, then up into the gap
  const layout = parse([
    ".............",
    ".............",
    "...ooo.......",
    "...oOo.......",
    "...o_o.......",
    ".............",
    ".B...#.......",
    ".............",
    ".............",
    ".............",
    "......@......",
  ])
  const solved = solve(layout)!
  assertEquals(solved.pushes, 2)
  assertEquals(solved.fills, "boulder")
  assert(check(layout, solved.moves))
  assertEquals(signature(layout), ["roll"])
})

Deno.test("rings: a ring in a moat wants a stone sunk first", () => {
  const layout = parse([
    ".............",
    ".............",
    "...wwwww.....",
    "...wooow.....",
    "...woOow.....",
    "...wo_ow.....",
    "...wwwww.....",
    ".....S.......",
    ".............",
    ".....S.......",
    "......@......",
  ])
  const solved = solve(layout)!
  assertEquals(solved.pushes, 5)
  assert(check(layout, solved.moves))
  assertEquals(signature(layout), ["push", "sink"])
})

Deno.test("rings: a stone on the ice wants the ice", () => {
  const layout = parse([
    ".............",
    ".............",
    ".............",
    "....ooo......",
    "....oOo......",
    "....o_o......",
    "..iiiiiii....",
    "..iiisiii....",
    "..iiiiiii....",
    ".............",
    "......@......",
  ])
  assertEquals(solve(layout)?.pushes, 1)
  assertEquals(signature(layout), ["push", "ice"])
})

Deno.test("rings: a boulder in a hedge wants bushes flat and a roll", () => {
  const layout = parse([
    ".............",
    ".............",
    "....ooo......",
    "....oOo......",
    "....o_o......",
    ".............",
    "...kkkkk.....",
    "...k.B.k.....",
    "...kkkkk.....",
    ".............",
    "......@......",
  ])
  const solved = solve(layout)!
  assertEquals(solved.pushes, 3)
  assertEquals(signature(layout), ["roll", "bush"])
  assertEquals(sigName(signature(layout)!), "roll+bush")
})

Deno.test("rings: an easy one is thrown away", () => {
  // walk to the stone and push it in: no signature but the push
  const layout = parse([
    ".............",
    ".............",
    "....ooo......",
    "....oOo......",
    "....o_o......",
    ".............",
    ".............",
    ".....S.......",
    ".............",
    ".............",
    "......@......",
  ])
  assertEquals(signature(layout), ["push"])
  assertEquals(accept(layout), null)
})

// ---------------------------------------------------------------------
// the simulator against the game

const catalog = Catalog.fromJSON(
  [{
    src: "base.json",
    json: JSON.parse(
      await Deno.readTextFile(
        new URL("../static/catalog/base.json", import.meta.url),
      ),
    ),
  }],
  "http://localhost/catalog/",
)

const CELL_OF: Record<string, string> = {
  ".": "0",
  "#": "1",
  w: "w",
  i: "i",
  k: "k",
  o: "0",
  O: "0",
  _: "0",
}
const DIR_OF: Record<string, Dir> = {
  U: "up",
  D: "down",
  L: "left",
  R: "right",
}

/** A field made of a ring's patch, with the game's actors and props */
class World {
  time = 0
  cells: string[][]
  actorList: IActor[] = []
  propMap = new Map<string, Prop>()
  items: { id: string; i: number; j: number; type: string }[] = []
  me: Actor
  things: IActor[]
  constructor(
    readonly layout: Layout,
    readonly ox: number,
    readonly oy: number,
  ) {
    this.cells = layout.rows.map((r) => [...r].map((c) => CELL_OF[c]))
    layout.rows.forEach((row, y) =>
      [...row].forEach((c, x) => {
        const type = c === "o"
          ? "ring-stone"
          : c === "O"
          ? "ring-heart"
          : c === "_"
          ? "ring-slot"
          : null
        if (!type) return
        const data = type === "ring-stone"
          ? undefined
          : { id: `test.${ox}`, reward: [ox, oy] }
        const prop = Prop.fromSpawn(
          new PropSpawn(ox + x, oy + y, catalog.props[type], data),
        )
        this.propMap.set(`${ox + x}.${oy + y}`, prop)
      })
    )
    this.things = layout.things.map((t, n) =>
      spawnActor(`thing${n}`, ox + t.x, oy + t.y, catalog.actors[t.kind])
    )
    this.me = new Actor(
      ox + layout.start[0],
      oy + layout.start[1],
      { type: "main", src: "", href: "" },
      "main",
      "up",
      4,
    )
    this.actorList = [this.me, ...this.things]
  }
  cellAt(i: number, j: number) {
    const c = this.cells[j - this.oy]?.[i - this.ox] ?? "0"
    return catalog.cells[c]
  }
  get field(): IField {
    return this as unknown as IField
  }
  canEnterStatic(i: number, j: number) {
    return this.cellAt(i, j).canEnter &&
      (this.propMap.get(`${i}.${j}`)?.canEnter ?? true)
  }
  canEnter(i: number, j: number) {
    return this.canEnterStatic(i, j) &&
      !this.actorList.some((a) => a.i === i && a.j === j)
  }
  isSlippery(i: number, j: number) {
    return !!this.cellAt(i, j).slippery
  }
  isWater(i: number, j: number) {
    return !!this.cellAt(i, j).water
  }
  conveyorDir() {
    return null
  }
  isDiggable() {
    return false
  }
  flattenCell(i: number, j: number) {
    const flat = this.cellAt(i, j).flattens
    if (!flat) return false
    this.updateCell(i, j, flat)
    return true
  }
  updateCell(i: number, j: number, c: string) {
    this.cells[j - this.oy][i - this.ox] = c
  }
  actors = {
    iter: () => this.actorList[Symbol.iterator](),
    get: (i: number, j: number) =>
      this.actorList.filter((a) => a.i === i && a.j === j),
    add: (a: IActor) => void this.actorList.push(a),
    remove: (a: IActor) => {
      this.actorList = this.actorList.filter((x) => x !== a)
    },
  }
  props = {
    get: (i: number, j: number) => this.propMap.get(`${i}.${j}`),
    remove: () => {},
    iter: () => this.propMap.values(),
  }
  effects = { add: () => {} }
  peekItem() {
    return undefined
  }
  peekItems(i: number, j: number) {
    return this.items.filter((t) =>
      t.i === i && t.j === j
    ) as unknown as IItem[]
  }
  spawnItem(type: string, i: number, j: number, id?: string) {
    const item = { id: id ?? `item${this.items.length}`, i, j, type }
    this.items.push(item)
    return item as unknown as IItem
  }
  colorCell() {}
  step() {
    this.time++
    for (const a of [...this.actorList]) {
      if (this.actorList.includes(a)) a.step(this.field)
    }
    for (const p of this.propMap.values()) p.step(this.field)
  }
  settled() {
    return this.actorList.every((a) =>
      (a as Actor).isActionQueueEmpty() && a.x === a.i * 16 && a.y === a.j * 16
    )
  }
  /** Steps till everything is still */
  settle() {
    let still = 0
    for (let n = 0; n < 3000 && still < 3; n++) {
      this.step()
      still = this.settled() ? still + 1 : 0
    }
  }
  /** Where everything is, as the simulator tells it */
  snapshot() {
    const w = this.layout.rows[0].length, h = this.layout.rows.length
    const cell = (i: number, j: number) => {
      const x = i - this.ox, y = j - this.oy
      return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x
    }
    const was = (c: string) =>
      [...this.layout.rows.join("")].flatMap((ch, p) => ch === c ? [p] : [])
    return {
      player: cell(this.me.i, this.me.j),
      things: this.things.map((t) =>
        this.actorList.includes(t) ? cell(t.i, t.j) : -1
      ),
      filled: was("w").filter((p) =>
        !this.cellAt(this.ox + p % w, this.oy + Math.floor(p / w)).water
      ),
      flat: was("k").filter((p) =>
        this.cellAt(this.ox + p % w, this.oy + Math.floor(p / w)).canEnter
      ),
    }
  }
}
/** Plays the ring's solution in the game, comparing each move */
function replay(ring: Ring, n: number) {
  const world = new World(ring, 1000 * n, 0)
  const sim = trace(ring, ring.solution)
  for (const [k, m] of [...ring.solution].entries()) {
    world.settle()
    world.me.tryMove("go", DIR_OF[m], world.field)
    world.settle()
    const want = sim[k]
    if (want.done) break
    assertEquals(
      world.snapshot(),
      {
        player: want.player,
        things: want.things,
        filled: want.filled,
        flat: want.flat,
      },
      `ring ${n} (${sigName(ring.signature)}), move ${k} of ${ring.solution}`,
    )
  }
  world.settle()
  return world
}

Deno.test("rings: the solutions play out the same in the game", () => {
  Item.deserializeCollected([])
  const r = seed("rings-test")
  let played = 0
  const sigs = new Set<string>()
  for (let n = 0; played < 25 && n < 2000; n++) {
    const ring = accept(draft(r, AIMS[n % AIMS.length]))
    if (!ring) continue
    played++
    sigs.add(sigName(ring.signature))
    const world = replay(ring, played)
    const id = `test.${1000 * played}`
    assert(Item.isCollected(ringKey(id)), `ring ${played} is whole`)
    // the reward lies by the ring, once
    const rewards = world.items.filter((t) => t.id === ringRewardKey(id))
    assertEquals(rewards.length, 1)
  }
  assertEquals(played, 25)
  // a few different tricks among them
  assert(sigs.size >= 4, [...sigs].join(" "))
})
