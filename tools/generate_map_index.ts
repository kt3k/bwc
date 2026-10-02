// Writes static/map/index.json: the list of every map block (id,
// position, name), so pages like static/maps.html can find the blocks
// without probing for files. Run it after adding or removing a block;
// tools/map_index.test.ts fails while the index is stale.
//
// Usage: deno -A tools/generate_map_index.ts
export type MapIndexEntry = { id: string; i: number; j: number; name?: string }

const MAP_DIR = new URL("../static/map/", import.meta.url)

/** Builds the index from the block files on disk */
export async function buildMapIndex(): Promise<MapIndexEntry[]> {
  const entries: MapIndexEntry[] = []
  for await (const e of Deno.readDir(MAP_DIR)) {
    const m = e.name.match(/^block_(-?\d+\.-?\d+)\.json$/)
    if (!m) continue
    const json = JSON.parse(
      await Deno.readTextFile(new URL(e.name, MAP_DIR)),
    ) as { i: number; j: number; name?: string }
    entries.push({
      id: m[1],
      i: json.i,
      j: json.j,
      ...(json.name ? { name: json.name } : {}),
    })
  }
  return entries.sort((a, b) => a.j - b.j || a.i - b.i)
}

export function serializeMapIndex(entries: MapIndexEntry[]): string {
  return JSON.stringify(entries, null, 2) + "\n"
}

if (import.meta.main) {
  const entries = await buildMapIndex()
  await Deno.writeTextFile(
    new URL("index.json", MAP_DIR),
    serializeMapIndex(entries),
  )
  console.log(`wrote static/map/index.json (${entries.length} blocks)`)
}
