import { assertEquals } from "@std/assert"
import { buildMapIndex, serializeMapIndex } from "./generate_map_index.ts"

Deno.test("static/map/index.json lists every block (deno task generate-map-index)", async () => {
  const actual = await Deno.readTextFile(
    new URL("../static/map/index.json", import.meta.url),
  )
  assertEquals(actual, serializeMapIndex(await buildMapIndex()))
})
