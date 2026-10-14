// Draws the window frame of the four panes (model/pane.ts): the empty
// frame, cracked, and the frame whole again showing each of its four
// places (a snowy field, a faraway sea, a town at dusk, a cloudless sky).
// In the grays (docs/art-guide.md).
//
// Usage: deno -A tools/draw_panes.ts
import { picture, write } from "./draw_waystones.ts"

/** The frame, the 8x8 glass inside left as ".." to fill */
const FRAME = [
  "................",
  "..KKKKKKKKKKKK..",
  "..K2222222223K..",
  "..K2KKKKKKKK3K..",
  "..K2K@@@@@@K3K..",
  "..K2K@@@@@@K3K..",
  "..K2K@@@@@@K3K..",
  "..K2K@@@@@@K3K..",
  "..K2K@@@@@@K3K..",
  "..K2K@@@@@@K3K..",
  "..K2KKKKKKKK3K..",
  "..K2222222223K..",
  "..KKKKKKKKKKKK..",
  "....K33333K.....",
  "...KK33333KK....",
  "...KKKKKKKKK....",
]
/** The glass of each kind: 6 rows of 6 inks */
const GLASS: Record<string, string[]> = {
  empty: ["K..K.K", ".K..K.", "..K...", ".K.K..", "K...K.", "..K..K"],
  snow: ["111111", "1W111W", "111W11", "W11111", "222222", "W2W2W2"],
  sea: ["111111", "111111", "333333", "3W33W3", "434343", "444444"],
  town: ["333333", "33W333", "3K33K3", "KKK3KK", "KWKKWK", "KKKKKK"],
  sky: ["111111", "11WW11", "1WWWW1", "11WW11", "111111", "111111"],
}

function pane(kind: string) {
  const g = GLASS[kind]
  return picture(FRAME.map((row, y) => {
    if (!row.includes("@")) return row
    const glass = g[y - 4].replaceAll(".", "4")
    return row.replace("@@@@@@", glass)
  }))
}

if (import.meta.main) {
  await write("prop/pane_empty.png", pane("empty"))
  for (const k of ["snow", "sea", "town", "sky"]) {
    await write(`prop/pane_${k}.png`, pane(k))
  }
}
