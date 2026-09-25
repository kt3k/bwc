import { assert, assertEquals } from "@std/assert"
import {
  darken,
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

Deno.test("darken steps down the palette grays and leaves colors alone", () => {
  assertEquals(darken(0xffffff), 0xb9bcb9)
  assertEquals(darken(0xb9bcb9), 0x6a6d6a)
  assertEquals(darken(0x6a6d6a), 0x4a4d4a)
  assertEquals(darken(0x4a4d4a), 0x000000)
  assertEquals(darken(0x000000), 0x000000)
  assertEquals(darken(0xd49d29), 0xd49d29)
})
