import { assertEquals } from "@std/assert"
import { rumorOf, setRumors, tell, wayTo } from "./rumor.ts"

Deno.test("the way is told in the eight winds", () => {
  assertEquals(wayTo(0, 0, 10, 0), "EAST")
  assertEquals(wayTo(0, 0, 0, -10), "NORTH")
  assertEquals(wayTo(0, 0, -10, 10), "SOUTH-WEST")
})

Deno.test("the nearer the place, the plainer the rumor", () => {
  const castle = { topic: "THE CASTLE", i: 0, j: 0 }
  assertEquals(
    tell(castle, 0, 500),
    "THEY SAY THE CASTLE LIES FAR AWAY, TO THE NORTH",
  )
  assertEquals(tell(castle, 300, 0), "THE CASTLE? ABOUT 300 STEPS WEST OF HERE")
  assertEquals(tell(castle, 0, -60), "THE CASTLE IS NEAR NOW: 60 STEPS SOUTH")
  assertEquals(tell(castle, 5, 0), "THE CASTLE IS RIGHT HERE, JUST WEST!")
})

Deno.test("each one tells of a place they have heard of", () => {
  setRumors([{ topic: "THE CAPE", i: 100, j: 0 }])
  assertEquals(rumorOf("a", 0, 0), "THE CAPE IS NEAR NOW: 100 STEPS EAST")
  // a land away: no rumor
  assertEquals(rumorOf("a", 10000, 10000), null)
  setRumors([])
})
