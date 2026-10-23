// The arrangements of the odd one out (tools/odd_ones.ts) and how
// tools/generate_wilds.ts placed them in the maps
import { assert, assertEquals } from "@std/assert"
import { seed } from "../util/random.ts"
import { alikeType, ODD_FAMILIES, unlikeType } from "../model/odd-families.ts"
import { arrange } from "./odd_ones.ts"

Deno.test("odd ones: every arrangement has exactly one odd one, a reward cell free by it", () => {
  const rr = seed("odd-ones-test")
  for (const family of ODD_FAMILIES) {
    for (let n = 0; n < 200; n++) {
      const a = arrange(rr, family)
      assert(a.cells.length >= 4, family)
      assert(a.odd >= 0 && a.odd < a.cells.length)
      // the members are distinct and fill the bounds
      const keys = new Set(a.cells.map(([x, y]) => `${x}.${y}`))
      assertEquals(keys.size, a.cells.length)
      assertEquals(Math.max(...a.cells.map(([x]) => x)) + 1, a.w)
      assertEquals(Math.max(...a.cells.map(([, y]) => y)) + 1, a.h)
      // a row reads before its odd one: never at either end
      if (a.w === 1 || a.h === 1) {
        assert(a.odd > 0 && a.odd < a.cells.length - 1, family)
      }
      // the reward: corner-wise by the odd one, off the arrangement,
      // within the cell of open land round it
      const [ox, oy] = a.cells[a.odd]
      const [rx, ry] = a.reward
      assertEquals([Math.abs(rx - ox), Math.abs(ry - oy)], [1, 1])
      assert(!keys.has(`${rx}.${ry}`))
      assert(rx >= -1 && ry >= -1 && rx <= a.w && ry <= a.h)
    }
  }
})

type Spawn = { i: number; j: number; type: string; data?: { id: string } }

Deno.test("odd ones: placed in the WILDS, many, balanced and spread", async () => {
  const props: Spawn[] = []
  for await (
    const entry of Deno.readDir(new URL("../static/map/", import.meta.url))
  ) {
    if (!entry.name.endsWith(".json")) continue
    if (entry.name.startsWith("block_10000.")) continue // zoo, debug
    const block = JSON.parse(
      await Deno.readTextFile(
        new URL(`../static/map/${entry.name}`, import.meta.url),
      ),
    )
    for (const p of block.props ?? []) {
      if (/^(alike|unlike)-/.test(p.type)) props.push(p)
    }
  }
  const familyOf = (type: string) => type.replace(/^(alike|unlike)-/, "")
  const odd = props.filter((p) => p.type.startsWith("unlike-"))
  // the arrangements: the members within 2 cells of each other
  const group = new Map<Spawn, number>()
  let groups = 0
  for (const p of props) {
    if (group.has(p)) continue
    const q = [p]
    group.set(p, groups)
    for (let k = 0; k < q.length; k++) {
      for (const o of props) {
        if (group.has(o)) continue
        if (Math.max(Math.abs(o.i - q[k].i), Math.abs(o.j - q[k].j)) <= 2) {
          group.set(o, groups)
          q.push(o)
        }
      }
    }
    groups++
  }
  // one odd one in each, all of one family
  assertEquals(groups, odd.length)
  for (let g = 0; g < groups; g++) {
    const members = props.filter((p) => group.get(p) === g)
    assertEquals(members.filter((p) => p.type.startsWith("unlike-")).length, 1)
    assertEquals(new Set(members.map((p) => familyOf(p.type))).size, 1)
  }
  // many (about 3 for each ring), every family, roughly balanced
  assert(odd.length >= 100, `${odd.length}`)
  const count = new Map<string, number>()
  for (const p of odd) {
    count.set(familyOf(p.type), (count.get(familyOf(p.type)) ?? 0) + 1)
  }
  for (const f of ODD_FAMILIES) {
    assert(catalogHas(unlikeType(f)) && catalogHas(alikeType(f)))
    const n = count.get(f) ?? 0
    assert(n >= odd.length / ODD_FAMILIES.length - 3, `${f} ${n}`)
  }
  // none the same within 24 cells (between the middles: 16 between
  // the odd ones themselves); ids unique; the reward cell free
  const ids = new Set(odd.map((p) => p.data!.id))
  assertEquals(ids.size, odd.length)
  const at = new Set(props.map((p) => `${p.i}.${p.j}`))
  for (const a of odd) {
    const [ri, rj] = (a.data as unknown as { reward: [number, number] })
      .reward
    assert(!at.has(`${ri}.${rj}`))
    for (const b of odd) {
      if (a === b || familyOf(a.type) !== familyOf(b.type)) continue
      assert(Math.hypot(a.i - b.i, a.j - b.j) >= 16, `${a.i},${a.j}`)
    }
  }
})

const catalog = JSON.parse(
  await Deno.readTextFile(
    new URL("../static/catalog/base.json", import.meta.url),
  ),
)
const catalogHas = (type: string) => type in catalog.props
