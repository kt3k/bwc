// The text playtest harness' way in (tools/playtest_text.mjs,
// docs/playtesters.md): with `?playtest` in the URL, the game puts
// `globalThis.__playtest` up, to tell what is on the screen as data (the
// terrain, the props by the sprite they show, the items, the actors, the
// effects) and to hold the world still between the harness' calls. The
// harness turns it into a map in text. Without `?playtest` nothing is put
// up.
import { CELL_SIZE } from "../util/constants.ts"
import { floorN, modulo } from "../util/math.ts"
import { BLOCK_SIZE } from "../util/constants.ts"
import type { RectScope } from "../util/rect-scope.ts"
import type { Field } from "./field.ts"
import { Prop } from "../model/prop.ts"

/** A thing on the screen, at a world cell */
export type Seen = {
  i: number
  j: number
  /** prop: its sprite path; item and actor: its type */
  what: string
  /** an actor's id, to follow it from call to call */
  id?: string
  dir?: string
}

/** What is on the screen now */
export type View = {
  time: number
  me: { i: number; j: number; dir: string }
  /** The top left world cell of `cells` */
  i0: number
  j0: number
  /** The cell characters row by row ("" where not loaded) */
  cells: string[]
  /** The sprite of each cell character in the rows */
  cellSrc: Record<string, string>
  props: Seen[]
  items: Seen[]
  actors: Seen[]
  /** The effects, by the cell they're over: a look, or a color */
  effects: { i: number; j: number; look: string; ground?: boolean }[]
}

export function installPlaytestHook(
  field: Field,
  viewScope: RectScope,
  pause: () => void,
  resume: () => void,
) {
  if (!new URLSearchParams(globalThis.location.search).has("playtest")) {
    return
  }
  const view = (): View => {
    const i0 = Math.floor(viewScope.left / CELL_SIZE)
    const j0 = Math.floor(viewScope.top / CELL_SIZE)
    const i1 = Math.ceil(viewScope.right / CELL_SIZE)
    const j1 = Math.ceil(viewScope.bottom / CELL_SIZE)
    const inView = (i: number, j: number) =>
      i >= i0 && i < i1 && j >= j0 && j < j1
    const cells: string[] = []
    const cellSrc: Record<string, string> = {}
    for (let j = j0; j < j1; j++) {
      let row = ""
      for (let i = i0; i < i1; i++) {
        const block = field.blockAt(i, j)
        if (!block) {
          row += " "
          continue
        }
        const c = block.field[modulo(j, BLOCK_SIZE)][modulo(i, BLOCK_SIZE)]
        cellSrc[c] ??= block.getCell(i, j)?.src ?? ""
        row += c
      }
      cells.push(row)
    }
    const props: Seen[] = []
    for (const p of field.props.iter()) {
      if (!inView(p.i, p.j)) continue
      const src = p instanceof Prop ? p.shownSrc : p.type
      if (src) props.push({ i: p.i, j: p.j, what: src })
    }
    const items: Seen[] = []
    for (const it of field.items.iter()) {
      if (it.isFollowing || !inView(it.i, it.j)) continue
      items.push({ i: it.i, j: it.j, what: it.def.type })
    }
    const actors: Seen[] = []
    for (const a of field.actors.iter()) {
      if (a.id === "main" || !inView(a.i, a.j)) continue
      actors.push({ i: a.i, j: a.j, what: a.type, id: a.id, dir: a.dir })
    }
    const effects: View["effects"] = []
    const seen = new Set<string>()
    for (const e of field.effects.all()) {
      const boxes = "boxes" in e ? [...e.boxes()] : [e]
      const look = ("look" in e && e.look) || ""
      for (const b of boxes) {
        if (b.visible === false) continue
        const i = floorN(b.x + b.w / 2, CELL_SIZE) / CELL_SIZE
        const j = floorN(b.y + b.h / 2, CELL_SIZE) / CELL_SIZE
        if (!inView(i, j)) continue
        const what = look || `a fleck of ${b.color}`
        const key = `${i}.${j}.${what}`
        if (seen.has(key)) continue
        seen.add(key)
        effects.push({ i, j, look: what, ground: b.ground })
      }
    }
    const me = field.me
    return {
      time: field.time,
      me: { i: me.i, j: me.j, dir: me.dir },
      i0,
      j0,
      cells,
      cellSrc,
      props,
      items,
      actors,
      effects,
    }
  }
  Object.assign(globalThis, {
    __playtest: { view, pause, resume },
  })
}
