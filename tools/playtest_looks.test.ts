// The text playtest harness tells the things on the screen by what they
// look like (tools/playtest_looks.json, docs/playtesters.md): every
// sprite of the catalog has its words, and the words never tell what a
// thing is for.
import { assertEquals } from "@std/assert"
import catalog from "../static/catalog/base.json" with { type: "json" }
import looks from "./playtest_looks.json" with { type: "json" }

type Looks = Record<string, Record<string, string | { look: string }>>
const L = looks as unknown as Looks
const wordsOf = (v: string | { look: string }) =>
  typeof v === "string" ? v : v.look

/** Words that tell what a thing is for, not what it looks like */
const GIVEAWAYS =
  /\b(button|switch|pressure plate|lever|trigger|goal|puzzle|trap|reward|pushable|collectible|power-?up|teleport\w*|checkpoint|save point|enemy|npc|quest)\b/i

Deno.test("every sprite of the catalog has its looks", () => {
  const missing: string[] = []
  for (const cell of Object.values(catalog.cells)) {
    if (!L.cells[cell.src]) missing.push(`cell ${cell.src}`)
  }
  for (const prop of Object.values(catalog.props)) {
    const p = prop as { src: string; growth?: { stages: string[] } }
    for (const src of [p.src, ...(p.growth?.stages ?? [])]) {
      if (!L.props[src]) missing.push(`prop ${src}`)
    }
  }
  for (const type of Object.keys(catalog.items)) {
    if (!L.items[type]) missing.push(`item ${type}`)
  }
  for (const type of Object.keys(catalog.actors)) {
    if (!L.actors[type]) missing.push(`actor ${type}`)
  }
  assertEquals([...new Set(missing)], [])
})

Deno.test("the looks never tell what a thing is for", () => {
  const bad: string[] = []
  for (const kind of ["cells", "props", "items", "actors"]) {
    for (const [key, v] of Object.entries(L[kind])) {
      if (GIVEAWAYS.test(wordsOf(v))) bad.push(`${key}: ${wordsOf(v)}`)
    }
  }
  assertEquals(bad, [])
})
