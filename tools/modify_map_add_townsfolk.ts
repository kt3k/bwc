// Brings the townsfolk (see ideas/game-ideas-5.md) into the village
// blocks: a villager in every house (next to its table), a stall with
// its keeper by the crossroads, kids playing near the crossing, and two
// cats. Re-running replaces the townsfolk placed before, so the result
// doesn't depend on how often it runs.
//
// Usage: deno -A tools/modify_map_add_townsfolk.ts [block ids...]
//   (default: the village blocks 200.-200 and -400.200)
import { loadCatalog } from "../model/catalog.ts"

type Spawn = { i: number; j: number; type: string; data?: unknown }
type BlockJson = {
  i: number
  j: number
  actors: Spawn[]
  props: Spawn[]
  field: string[]
}

const TOWNSFOLK = new Set(["villager", "villager2", "keeper", "kid", "cat"])
/** The town props, only ever placed in these blocks by this script */
const TOWN_PROPS = new Set(["well", "barrel", "jar", "flowers", "notice-board"])
/** Stalls placed by this script, told apart from other shops */
const STALL = { sells: "mushroom", price: 3, stall: true }

const catalog = await loadCatalog(
  new URL("../static/catalog/base.json", import.meta.url).href,
  ["base.json"],
)

const blocks = Deno.args.length > 0 ? Deno.args : ["200.-200", "-400.200"]
for (const id of blocks) {
  const url = new URL(`../static/map/block_${id}.json`, import.meta.url)
  const map: BlockJson = JSON.parse(await Deno.readTextFile(url))
  map.actors = map.actors.filter((a) => !TOWNSFOLK.has(a.type))
  map.props = map.props.filter((p) =>
    !(p.type === "shop" && (p.data as { stall?: boolean })?.stall) &&
    !TOWN_PROPS.has(p.type)
  )

  const used = new Set<string>()
  for (const a of map.actors) used.add(`${a.i}.${a.j}`)
  const blocking = new Set<string>()
  for (const p of map.props) {
    if (!catalog.props[p.type]?.canEnter) blocking.add(`${p.i}.${p.j}`)
    used.add(`${p.i}.${p.j}`)
  }
  const cellAt = (i: number, j: number) => map.field[j - map.j]?.[i - map.i]
  const free = (i: number, j: number) => {
    const cell = cellAt(i, j)
    return cell !== undefined && (catalog.cells[cell]?.canEnter ?? false) &&
      !used.has(`${i}.${j}`) && !blocking.has(`${i}.${j}`)
  }
  /** The nearest free cell to (i, j) within r, on the same floor type */
  const near = (i: number, j: number, r: number, sameCell = false) => {
    for (let d = 0; d <= r; d++) {
      for (let dj = -d; dj <= d; dj++) {
        for (let di = -d; di <= d; di++) {
          if (Math.abs(di) + Math.abs(dj) !== d) continue
          const [ni, nj] = [i + di, j + dj]
          if (!free(ni, nj)) continue
          if (sameCell && cellAt(ni, nj) !== cellAt(i, j)) continue
          return [ni, nj] as const
        }
      }
    }
    return null
  }
  const add = (type: string, at: readonly [number, number] | null) => {
    if (!at) return
    used.add(`${at[0]}.${at[1]}`)
    map.actors.push({ i: at[0], j: at[1], type })
  }

  // a villager at home in every house (a house has a table and a stool)
  const tables = map.props.filter((p) => p.type === "table")
  tables.forEach((t, n) => {
    add(n % 2 === 0 ? "villager" : "villager2", near(t.i + 2, t.j, 3, true))
  })
  // a cat by the first two houses
  for (const t of tables.slice(0, 2)) add("cat", near(t.i + 1, t.j + 3, 4))
  // the stall by the crossroads: counter on the road side, keeper behind
  const [ci, cj] = [map.i + 104, map.j + 97]
  const counter = near(ci, cj, 6)
  if (counter && free(counter[0], counter[1] - 1)) {
    used.add(`${counter[0]}.${counter[1]}`)
    map.props.push({ i: counter[0], j: counter[1], type: "shop", data: STALL })
    add("keeper", [counter[0], counter[1] - 1])
  }
  const place = (
    type: string,
    at: readonly [number, number] | null,
    data?: unknown,
  ) => {
    if (!at) return
    used.add(`${at[0]}.${at[1]}`)
    if (!(catalog.props[type]?.canEnter)) blocking.add(`${at[0]}.${at[1]}`)
    map.props.push({ i: at[0], j: at[1], type, ...(data ? { data } : {}) })
  }
  // town props: barrels and a jar in the houses, a well and flower beds by
  // the crossing, a notice board next to the stall
  tables.forEach((t, n) => {
    place(n % 2 === 0 ? "barrel" : "jar", near(t.i + 5, t.j, 3, true))
  })
  place("well", near(map.i + 106, map.j + 106, 4))
  for (const [di, dj] of [[3, 3], [4, 3], [3, -3], [4, -3]]) {
    place("flowers", near(map.i + 100 + di, map.j + 100 + dj, 2))
  }
  if (counter) {
    place("notice-board", near(counter[0] + 3, counter[1], 3), {
      text: "TOWN NEWS: FRESH MUSHROOMS AT THE STALL",
    })
  }
  // kids playing south-east of the crossing
  for (const [di, dj] of [[6, 6], [9, 8], [5, 10]]) {
    add("kid", near(map.i + 100 + di, map.j + 100 + dj, 5))
  }

  await Deno.writeTextFile(url, JSON.stringify(map, null, 2))
  const n = map.actors.filter((a) => TOWNSFOLK.has(a.type)).length
  console.log(`block_${id}: ${n} townsfolk`)
}
