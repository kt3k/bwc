import { assert, assertEquals } from "@std/assert"
import { check, MAKERS, solvableWithin, solve } from "./minipuzzles.ts"
import { seed } from "../util/random.ts"

Deno.test("mini puzzles", async (t) => {
  await t.step("each kind is made solvable, its solution checks out", () => {
    const r = seed("mini-test")
    for (const kind of ["ice", "boulder", "switch"] as const) {
      for (let n = 0; n < 3; n++) {
        const p = MAKERS[kind](r)
        assertEquals(p.kind, kind)
        assert(check(p.rows, p.solution), `${kind} ${p.rows.join("\n")}`)
        assertEquals(solve(p.rows)?.length, p.solution.length)
        assert(!check(p.rows, ""))
        if (kind === "switch") assert(!solvableWithin(p.rows, 1, "flips"))
        if (kind === "boulder") assert(!solvableWithin(p.rows, 2, "pushes"))
      }
    }
  })

  await t.step("ice: you slide until something stops you", () => {
    const rows = [
      "#######",
      "#____G#",
      "#_____#",
      "#__.__#",
      "###E###",
    ]
    // up slides to the top row, right slides along it onto the goal
    assert(check(rows, "UR"))
    assertEquals(solve(rows), "UR")
  })

  await t.step("boulder: it rolls onto the plate, the door opens", () => {
    const rows = [
      "#######",
      "###G###",
      "###D###",
      "#.....#",
      "#..B..#",
      "#P....#",
      "##....#",
      "###E###",
    ]
    // straight up only pushes the boulder against the closed door
    assert(!check(rows, "UUUUU"))
    // push it left (it rolls to the wall), then from above down onto the
    // plate (stopped there by the wall below), then through the open door
    assert(check(rows, "URULULLLDRRUU"))
  })

  await t.step("switch: blue stands while OFF, red while ON", () => {
    const rows = [
      "#####",
      "#G..#",
      "#b#.#",
      "#.#S#",
      "#...#",
      "##E##",
    ]
    // the blue wall stands while the switch is OFF
    assert(!check(rows, "LUUU"))
    // bump the switch (ON), then the blue wall is down
    assert(check(rows, "RULLUUU"))
  })
})
