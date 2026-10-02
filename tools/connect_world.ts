// Ties the puzzle dungeon into the overworld, so the whole world is one
// map you walk across (portals only link the START island to it):
//
// - the west village (block_-400.200) leads into B1F (block_-400.400,
//   right below) by its south road; a signpost marks it
// - the tunnel from the B1F vault to B2F (block_200.400) runs east under
//   the lake (block_-200.400) and the forest (block_0.400) along row 196
// - the tutorial's last room points the way instead of holding a portal
//
// The dungeon generators carve their own ends of these passages. Run
// this after tools/generate_map_blocks.ts (it regenerates the blocks
// this script edits). Re-running changes nothing.
//
// Usage: deno -A tools/connect_world.ts
import { loadCatalog } from "../model/catalog.ts"

type Spawn = { i: number; j: number; type: string; data?: unknown }
type BlockJson = {
  i: number
  j: number
  actors: Spawn[]
  items: Spawn[]
  props: Spawn[]
  field: string[]
}

/** The tunnel row (local), shared with the B1F and B2F generators */
const TUNNEL_ROW = 196

const catalog = await loadCatalog(
  new URL("../static/catalog/base.json", import.meta.url).href,
  ["base.json"],
)

async function edit(id: string, fn: (map: BlockJson) => void) {
  const url = new URL(`../static/map/block_${id}.json`, import.meta.url)
  const map: BlockJson = JSON.parse(await Deno.readTextFile(url))
  fn(map)
  await Deno.writeTextFile(url, JSON.stringify(map, null, 2))
  console.log(`connected block_${id}`)
}

/** Sets cells (local, inclusive) and drops the spawns standing on them */
function carve(
  map: BlockJson,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cell: string,
) {
  const grid = map.field.map((row) => [...row])
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) grid[y][x] = cell
  }
  map.field = grid.map((row) => row.join(""))
  const inside = (s: Spawn) => {
    const x = s.i - map.i
    const y = s.j - map.j
    return x >= x0 && x <= x1 && y >= y0 && y <= y1
  }
  map.actors = map.actors.filter((s) => !inside(s))
  map.items = map.items.filter((s) => !inside(s))
  map.props = map.props.filter((s) => !inside(s))
}

/** Puts a prop at a local cell, replacing whatever prop was there */
function put(
  map: BlockJson,
  x: number,
  y: number,
  prop: Omit<Spawn, "i" | "j">,
) {
  const i = map.i + x
  const j = map.j + y
  map.props = map.props.filter((p) => !(p.i === i && p.j === j))
  map.props.push({ i, j, ...prop })
}

// the tunnel under the lake and the forest: a floor row between walls
for (const id of ["-200.400", "0.400"]) {
  await edit(id, (map) => {
    carve(map, 0, TUNNEL_ROW - 1, 199, TUNNEL_ROW - 1, "1")
    carve(map, 0, TUNNEL_ROW + 1, 199, TUNNEL_ROW + 1, "1")
    carve(map, 0, TUNNEL_ROW, 199, TUNNEL_ROW, "0")
  })
}

// the west village's south road goes on into B1F
await edit("-400.200", (map) => {
  const cell = map.field[190][103]
  if (!catalog.cells[cell]?.canEnter) {
    throw new Error("the signpost spot by the south road is blocked")
  }
  put(map, 103, 190, {
    type: "sign",
    data: { text: "SOUTH: THE PUZZLE DUNGEON B1F" },
  })
})

// the tutorial's last room: a sign where the dungeon portal stood
await edit("-200.0", (map) => {
  put(map, 89, 114, {
    type: "sign",
    data: {
      text: "WELL DONE! THE PUZZLE DUNGEON IS SOUTH OF THE WEST VILLAGE",
    },
  })
  map.props = map.props.filter((p) =>
    !(p.type === "portal" && p.i === map.i + 91 && p.j === map.j + 116)
  )
  put(map, 91, 116, { type: "chest", data: { drops: "coin", count: 5 } })
})
