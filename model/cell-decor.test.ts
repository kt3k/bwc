import { assert, assertEquals } from "@std/assert"
import {
  edgePixels,
  parseNoise,
  patchFactor,
  pickTransform,
  pickVariant,
} from "./cell-decor.ts"
import { seed } from "../util/random.ts"

Deno.test("parseNoise keeps the old color=count form and reads shapes", () => {
  assertEquals(parseNoise("#b9bcb9=1"), [
    { color: "#b9bcb9", count: 1, shape: "line" },
  ])
  assertEquals(parseNoise("black=3&#4a4d4a=2:speck"), [
    { color: "black", count: 3, shape: "line" },
    { color: "#4a4d4a", count: 2, shape: "speck" },
  ])
  // unknown shapes fall back to lines, zero counts are dropped
  assertEquals(parseNoise("#000000=1:blob&#ffffff=0"), [
    { color: "#000000", count: 1, shape: "line" },
  ])
})

Deno.test("patchFactor is smooth, bounded and averages about 1", () => {
  let sum = 0
  let n = 0
  for (let i = -60; i < 60; i++) {
    for (let j = -60; j < 60; j++) {
      const f = patchFactor(i, j)
      assert(f >= 0 && f <= 2, `out of range at ${i},${j}: ${f}`)
      // neighbours differ by a bounded amount (no hard edges)
      assert(Math.abs(f - patchFactor(i + 1, j)) < 0.7)
      sum += f
      n++
    }
  }
  const mean = sum / n
  assert(Math.abs(mean - 1) < 0.1, `mean ${mean}`)
  // deterministic
  assertEquals(patchFactor(12, -7), patchFactor(12, -7))
})

Deno.test("pickVariant chooses by percent weight, -1 for the base", () => {
  const v = [{ weight: 10 }, { weight: 5 }]
  assertEquals(pickVariant(v, 0.0), 0)
  assertEquals(pickVariant(v, 0.099), 0)
  assertEquals(pickVariant(v, 0.1), 1)
  assertEquals(pickVariant(v, 0.149), 1)
  assertEquals(pickVariant(v, 0.15), -1)
  assertEquals(pickVariant(v, 0.99), -1)
  assertEquals(pickVariant(undefined, 0), -1)
})

Deno.test("pickTransform yields exact integer matrices", () => {
  const { randomInt } = seed("t")
  assertEquals(pickTransform(undefined, randomInt), [1, 0, 0, 1])
  const seen = new Set<string>()
  for (let n = 0; n < 200; n++) {
    const m = pickTransform("rot", randomInt)
    assert(m.every((v) => Number.isInteger(v)))
    seen.add(m.join(","))
  }
  assertEquals(seen.size, 4)
  for (let n = 0; n < 50; n++) {
    const [a, b, c, d] = pickTransform("h", randomInt)
    assert(Math.abs(a) === 1 && b === 0 && c === 0 && d === 1)
  }
})

Deno.test("noisePatches: false survives the catalog round trip", async () => {
  const { Catalog } = await import("./catalog.ts")
  const catalog = Catalog.fromJSON([{
    src: "catalog/base.json",
    json: {
      cells: {
        "2": {
          canEnter: false,
          src: "../cell/wall1.png",
          noise: "black=4",
          noisePatches: false,
        },
      },
      items: {},
      actors: {},
      props: {},
    },
  }], "http://localhost/")
  assertEquals(catalog.cells["2"].noisePatches, false)
  assertEquals(catalog.toJSON().cells["2"].noisePatches, false)
})

Deno.test("edgePixels is a checker on the bottom 2 rows", () => {
  const px = edgePixels()
  assertEquals(px.length, 16)
  for (const [x, y] of px) {
    assertEquals(y, x % 2 === 0 ? 15 : 14)
  }
})
