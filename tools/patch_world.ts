// A field made of a patch of tools/rings.ts (a ring, a bell), with the
// game's real actors and props (model/actor.ts, model/prop.ts), for the
// tests to play a solution in and compare it with the simulator move by
// move (tools/rings.test.ts, tools/bells.test.ts).
import { Catalog } from "../model/catalog.ts"
import { Actor, spawnActor } from "../model/actor.ts"
import { Prop } from "../model/prop.ts"
import { PropSpawn } from "../model/field-block.ts"
import type { Dir, IActor, IField, IItem } from "../model/types.ts"
import type { Layout } from "./rings.ts"

export const catalog = Catalog.fromJSON(
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
  A: "0",
}
export const DIR_OF: Record<string, Dir> = {
  U: "up",
  D: "down",
  L: "left",
  R: "right",
}

/** A prop of the patch: its type and data, by the patch's character */
export type PropOf = (
  c: string,
) => { type: string; data?: unknown } | null

/** A field made of a patch, with the game's actors and props */
export class World {
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
    propOf: PropOf,
  ) {
    this.cells = layout.rows.map((r) => [...r].map((c) => CELL_OF[c]))
    layout.rows.forEach((row, y) =>
      [...row].forEach((c, x) => {
        const p = propOf(c)
        if (!p) return
        const prop = Prop.fromSpawn(
          new PropSpawn(ox + x, oy + y, catalog.props[p.type], p.data),
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
