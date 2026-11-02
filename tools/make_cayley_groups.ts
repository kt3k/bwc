// Writes model/cayley-groups.ts, the groups of order 1 to 20 (54 of them)
// with their Cayley tables, from the data.json of kt3k/group
// (https://github.com/kt3k/group, generated there by
// scripts/generate.js, which checks the axioms and that the groups of one
// order are pairwise non-isomorphic). The game and the tools read the
// copy written here, never the other repo.
//
// Usage: deno -A tools/make_cayley_groups.ts <path to kt3k/group/data.json>
type Source = {
  order: number
  id: number
  names: string[]
  desc: { ja: string; en: string }
  t: number[]
  gens: number[]
}

const path = Deno.args[0]
if (!path) {
  console.error("usage: deno -A tools/make_cayley_groups.ts <data.json>")
  Deno.exit(1)
}
const data = JSON.parse(await Deno.readTextFile(path)) as Source[]

/** A table as one character per entry (base 36: the orders are at most 20) */
const pack = (t: number[]) => t.map((x) => x.toString(36)).join("")

const rows = data.map((g) =>
  `  [${g.order}, ${g.id}, ${JSON.stringify(g.names)}, ${
    JSON.stringify(g.desc.en)
  }, ${JSON.stringify(g.desc.ja)}, ${JSON.stringify(g.gens)}, "${pack(g.t)}"],`
)

const out =
  `// The groups of order 1 to 20, all 54 up to isomorphism, with their
// Cayley tables: a copy of data.json of kt3k/group
// (https://github.com/kt3k/group, its scripts/catalog.js builds each
// group, scripts/generate.js checks them), written by
// tools/make_cayley_groups.ts. Do not edit: run that again.
//
// Each row: the order, the GAP SmallGroup id (order, id), the names, the
// description (en, ja), the generators (element indices) and the table,
// one base-36 character per entry, row by row: t[a * n + b] = a·b. The
// element 0 is e.
export const CAYLEY_GROUPS: readonly (readonly [
  number,
  number,
  readonly string[],
  string,
  string,
  readonly number[],
  string,
])[] = [
${rows.join("\n")}
]
`
await Deno.writeTextFile(
  new URL("../model/cayley-groups.ts", import.meta.url),
  out,
)
console.log(`wrote model/cayley-groups.ts (${data.length} groups)`)
