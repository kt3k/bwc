import { assert, assertEquals, assertFalse } from "@std/assert"
import { BlockMap, FieldBlock, PropSpawn, SpawnMap } from "./field-block.ts"
import { Catalog } from "./catalog.ts"

function spawn(i: number, j: number, type = "a") {
  return {
    i,
    j,
    type,
    equals(other: { i: number; j: number; type: string }): boolean {
      return this.i === other.i && this.j === other.j &&
        this.type === other.type
    },
    toJSON() {
      return { i: this.i, j: this.j, type: this.type }
    },
  }
}

Deno.test("SpawnMap.add replaces the previous spawn at the same cell", () => {
  const map = new SpawnMap([spawn(1, 2, "a"), spawn(1, 2, "b")])
  assertEquals(map.getAll().length, 1)
  assertEquals(map.getChunk(1, 2).length, 1)
  assertEquals(map.getChunk(1, 2)[0].type, "b")
})

Deno.test("SpawnMap.remove clears both the map and the chunk", () => {
  const map = new SpawnMap([spawn(1, 2)])
  map.remove(1, 2)
  assertFalse(map.has(1, 2))
  assertEquals(map.getAll().length, 0)
  assertEquals(map.getChunk(1, 2).length, 0)
})

Deno.test("FieldBlock.clone keeps spawn edits", () => {
  const catalog = new Catalog([])
  catalog.props["crate"] = {
    type: "crate",
    canEnter: false,
    src: "crate.png",
    href: "file:///crate.png",
  }
  const source = {
    i: 0,
    j: 0,
    catalogs: [],
    actors: [],
    items: [],
    props: [],
    field: Array(200).fill(".".repeat(200)),
    config: {},
  }
  const block = new FieldBlock(
    new BlockMap("file:///block_0.0.json", source, catalog),
  )
  block.propSpawns.add(new PropSpawn(3, 4, catalog.props["crate"]!, undefined))
  const clone = block.clone()
  assert(clone.propSpawns.has(3, 4))
  // and the clone is independent of the original
  clone.propSpawns.remove(3, 4)
  assert(block.propSpawns.has(3, 4))
})

Deno.test("SpawnMap works with negative world coordinates", () => {
  const map = new SpawnMap([spawn(-199, -1)])
  assert(map.has(-199, -1))
  assertEquals(map.getChunk(-199, -1).length, 1)
  map.remove(-199, -1)
  assertEquals(map.getChunk(-199, -1).length, 0)
})
