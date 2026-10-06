// Checks an answer to one of the mini puzzle rooms of the WILDS (as
// tools/minipuzzles_extract.ts reads them): plays the moves by the rules
// of tools/minipuzzles.ts and says whether they reach the goal, without
// giving the solution away.
//
// Usage: deno -A tools/minipuzzles_eval.ts <room number> <moves, e.g. UULR>
//        deno -A tools/minipuzzles_eval.ts --list   (the rooms and the rules)
import { check, RULES, step } from "./minipuzzles.ts"
import { extractRooms } from "./minipuzzles_extract.ts"

const rooms = await extractRooms()
if (Deno.args[0] === "--list") {
  rooms.forEach((r, k) => {
    console.log(`room ${k + 1} (${r.kind}): ${RULES[r.kind]}`)
    console.log(r.rows.join("\n") + "\n")
  })
  Deno.exit(0)
}
const k = Number(Deno.args[0]) - 1
const moves = (Deno.args[1] ?? "").toUpperCase().replace(/[^UDLR]/g, "")
const room = rooms[k]
if (!room) {
  console.error(`no room ${Deno.args[0]} (1..${rooms.length})`)
  Deno.exit(1)
}
if (check(room.rows, moves)) {
  console.log(
    `SOLVED room ${
      k + 1
    } in ${moves.length} moves (the shortest takes ${room.solution?.length})`,
  )
} else {
  // where the moves left the player (and what's changed), to retry
  const start = room.rows.findIndex((r) => r.includes("E"))
  let s = {
    x: 5,
    y: start - 1,
    bx: -1,
    by: -1,
    on: false,
  }
  room.rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === "B") {
        s.bx = x
        s.by = y
      }
    })
  )
  for (const m of moves) s = step(room.rows, s, m) ?? s
  console.log(
    `NOT SOLVED: you end at column ${s.x}, row ${s.y}` +
      (room.kind === "boulder" ? `, the boulder at ${s.bx},${s.by}` : "") +
      (room.kind === "switch" ? `, the switch ${s.on ? "ON" : "OFF"}` : ""),
  )
}
