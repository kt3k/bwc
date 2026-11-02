// Draws the gate of the Cayley rooms (`cayley-gate`, model/cayley-room.ts,
// ideas/groups.md), in the grays (docs/art-guide.md): a stone doorway,
// two posts and a lintel, with a portcullis of bars. Shut, the bars
// reach the ground; open, they are drawn up into the lintel, only their
// tips showing, and the floor shows through. The lintel is carved plain,
// with a ring (the gate of e, where the room starts) or with a diamond
// (the gate of the target, the letter behind it). The levers reuse the
// group levers (tools/draw_groups.ts).
//
// Usage: deno -A tools/draw_cayley.ts
import { write } from "./draw_gazes.ts"

const MARKS: readonly (readonly [string, readonly string[]])[] = [
  ["", []],
  ["_e", [".KK.", "K..K", ".KK."]],
  ["_target", [".KK.", "KKKK", ".KK."]],
]

function gate(mark: readonly string[], open: boolean): string[] {
  const g = Array.from({ length: 16 }, () => Array(16).fill("."))
  const set = (x: number, y: number, ink: string) => {
    if (x >= 0 && x < 16 && y >= 0 && y < 16) g[y][x] = ink
  }
  // the bars: shut down to the ground, or drawn up to their tips
  const bottom = open ? 6 : 14
  for (const x of [4, 7, 10]) {
    for (let y = 5; y <= bottom; y++) {
      set(x, y, "K")
      set(x + 1, y, y === bottom ? "K" : "3")
    }
  }
  if (!open) {
    for (const y of [8, 12]) {
      for (let x = 3; x <= 12; x++) set(x, y, x % 3 === 1 ? "K" : "4")
    }
  }
  // the posts
  for (let y = 4; y <= 15; y++) {
    for (const [x0, x1] of [[0, 2], [13, 15]]) {
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || y === 15
        set(x, y, edge ? "K" : x === x0 + 1 && x0 === 0 ? "2" : "3")
      }
    }
  }
  // the lintel
  for (let y = 0; y <= 4; y++) {
    for (let x = 0; x <= 15; x++) {
      const edge = x === 0 || x === 15 || y === 0 || y === 4
      set(x, y, edge ? "K" : y === 1 ? "W" : "2")
    }
  }
  mark.forEach((row, dy) =>
    [...row].forEach((ink, dx) => {
      if (ink !== ".") set(6 + dx, 1 + dy, ink)
    })
  )
  return g.map((r) => r.join(""))
}

if (import.meta.main) {
  for (const [name, mark] of MARKS) {
    await write(`prop/cayley_gate${name}.png`, gate(mark, false))
    await write(`prop/cayley_gate${name}_open.png`, gate(mark, true))
  }
}
