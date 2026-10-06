// Reads the mini puzzle rooms back out of the WILDS map (by their signs)
// as the grids of tools/minipuzzles.ts, solved: to check that what the
// map holds is what the generator meant, and to hand the rooms to others
// (tools/minipuzzles_eval.ts).
//
// Usage: deno -A tools/minipuzzles_extract.ts  (prints JSON)
import { type Kind, solve } from "./minipuzzles.ts"

type Spawn = { i: number; j: number; type: string; data?: { text?: string } }
type Block = {
  i: number
  j: number
  name?: string
  field: string[]
  actors: Spawn[]
  items: Spawn[]
  props: Spawn[]
}

export type Room = {
  kind: Kind
  /** the world cell just inside the entrance (where the moves start) */
  start: [number, number]
  rows: string[]
  solution: string | null
}

export async function extractRooms(): Promise<Room[]> {
  const dir = new URL("../static/map/", import.meta.url)
  const blocks = new Map<string, Block>()
  for await (const e of Deno.readDir(dir)) {
    if (!/^block_.*\.json$/.test(e.name)) continue
    const b = JSON.parse(await Deno.readTextFile(new URL(e.name, dir)))
    if (b.name === "WILDS") blocks.set(`${b.i}.${b.j}`, b)
  }
  const block = (i: number, j: number) =>
    blocks.get(`${Math.floor(i / 200) * 200}.${Math.floor(j / 200) * 200}`)
  const cellAt = (i: number, j: number) => {
    const b = block(i, j)
    return b ? b.field[j - b.j][i - b.i] : "#"
  }
  const spawnAt = (i: number, j: number) => {
    const b = block(i, j)
    if (!b) return undefined
    return [...b.actors, ...b.items, ...b.props].find((s) =>
      s.i === i && s.j === j
    )
  }
  const rooms: Room[] = []
  for (const b of blocks.values()) {
    for (const sign of b.props) {
      const text = sign.data?.text ?? ""
      if (sign.type !== "sign" || !text.includes(" TRIAL:")) continue
      const kind: Kind = text.startsWith("ICE")
        ? "ice"
        : text.startsWith("WEIGHT")
        ? "boulder"
        : "switch"
      const x0 = sign.i - 6, y0 = sign.j - 10
      const rows: string[] = []
      for (let y = 0; y < 9; y++) {
        let row = ""
        for (let x = 0; x < 11; x++) {
          const i = x0 + x, j = y0 + y
          const c = cellAt(i, j)
          const s = spawnAt(i, j)
          if (y === 8 && x === 5) row += "E"
          else if (c === "Z") row += "#"
          else if (c === "i") row += "_"
          else if (s?.type === "boulder") row += "B"
          else if (s?.type === "plate") row += "P"
          else if (s?.type === "door") row += "D"
          else if (s?.type === "switch") row += "S"
          else if (s?.type === "blue-wall") row += "b"
          else if (s?.type === "red-wall") row += "r"
          else if (s && s.type !== "sign") row += "G"
          else row += "."
        }
        rows.push(row)
      }
      rooms.push({
        kind,
        start: [x0 + 5, y0 + 7],
        rows,
        solution: solve(rows),
      })
    }
  }
  return rooms.sort((a, b) => a.start[0] - b.start[0])
}

if (import.meta.main) {
  console.log(JSON.stringify(await extractRooms(), null, 2))
}
