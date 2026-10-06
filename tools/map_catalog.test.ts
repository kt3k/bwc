import { assertEquals } from "@std/assert"
import { loadCatalog } from "../model/catalog.ts"

// A block whose spawn or cell isn't in the catalog fails to load, and the
// game shows the "not found" block in its place without a word
Deno.test("every spawn type and cell of every block is in the catalog", async () => {
  const catalog = await loadCatalog(
    new URL("../static/catalog/base.json", import.meta.url).href,
    ["base.json"],
  )
  const unknown: string[] = []
  const dir = new URL("../static/map/", import.meta.url)
  for await (const e of Deno.readDir(dir)) {
    if (!/^block_.*\.json$/.test(e.name)) continue
    const block = JSON.parse(await Deno.readTextFile(new URL(e.name, dir)))
    const kinds = [
      ["actors", catalog.actors],
      ["items", catalog.items],
      ["props", catalog.props],
    ] as const
    for (const [key, defs] of kinds) {
      for (const s of block[key] ?? []) {
        if (!(s.type in defs)) unknown.push(`${e.name} ${key} ${s.type}`)
      }
    }
    for (const c of new Set((block.field as string[]).join(""))) {
      if (!(c in catalog.cells)) unknown.push(`${e.name} cell ${c}`)
    }
  }
  assertEquals(unknown, [])
})
