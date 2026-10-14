import { assertEquals } from "@std/assert"
import { parsePath, rideSpeed, writePath } from "./ferry.ts"

Deno.test("a ferry's path is written as runs and read back", () => {
  const dirs = parsePath("d3r1u2")
  assertEquals(dirs, ["down", "down", "down", "right", "up", "up"])
  assertEquals(writePath(dirs), "d3r1u2")
  assertEquals(parsePath(""), [])
  assertEquals(writePath([]), "")
})

Deno.test("a long ride goes faster", () => {
  assertEquals(rideSpeed(20), 4)
  assertEquals(rideSpeed(200), 8)
})
