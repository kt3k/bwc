import { assert, assertEquals, assertFalse } from "@std/assert"
import { SpawnMap } from "./field-block.ts"

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

Deno.test("SpawnMap works with negative world coordinates", () => {
  const map = new SpawnMap([spawn(-199, -1)])
  assert(map.has(-199, -1))
  assertEquals(map.getChunk(-199, -1).length, 1)
  map.remove(-199, -1)
  assertEquals(map.getChunk(-199, -1).length, 0)
})
