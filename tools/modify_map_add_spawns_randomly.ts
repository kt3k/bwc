import { parseArgs } from "@std/cli/parse-args"
import {
  ActorSpawn,
  BlockMap,
  FieldBlock,
  ItemSpawn,
} from "../model/field-block.ts"
import { loadCatalog } from "../model/catalog.ts"

const randomInt = (n: number) => Math.floor(Math.random() * n)

const args = parseArgs(Deno.args)

if (args._.length === 0) {
  console.error(
    "Usage: deno -A tools/modify_map_add_spawns_randomly.ts <map_files...>",
  )
  Deno.exit(1)
}

for (const mapFile of args._) {
  await addCharactersRandomly(mapFile.toString())
}

async function addCharactersRandomly(mapFile: string) {
  const mapJson = new URL("../static/map/" + mapFile + ".json", import.meta.url)

  const map = await Deno.readTextFile(mapJson).then(
    JSON.parse,
  )

  const catalog = await loadCatalog(mapJson.href, map.catalogs)
  const bm = new BlockMap(mapJson.href, map, catalog)
  const fb = new FieldBlock(bm)
  let c = 0
  for (const _ of Array(400)) {
    const i = randomInt(200)
    const j = randomInt(200)
    const cell = fb.getCell(i, j)
    if (cell.canEnter) {
      c++
      const isRandom = Math.random() > 0.5
      fb.actorSpawns.add(
        new ActorSpawn(
          i + bm.i,
          j + bm.j,
          catalog.actors[isRandom ? "random" : "random-walk"]!,
        ),
      )
    }
  }
  if (mapFile === "block_0.0") {
    fb.itemSpawns.add(
      new ItemSpawn(2, 6, catalog.items["mushroom"]!),
    )

    for (const i of [...Array(8).keys()]) {
      fb.actorSpawns.add(
        new ActorSpawn(
          69,
          8 + i,
          catalog.actors["random-rotate"]!,
        ),
      )
    }

    for (const i of [...Array(7).keys()]) {
      fb.actorSpawns.add(
        new ActorSpawn(
          72,
          9 + i,
          catalog.actors["random-rotate"]!,
        ),
      )
    }

    for (const i of [...Array(8).keys()]) {
      fb.actorSpawns.add(
        new ActorSpawn(
          75,
          8 + i,
          catalog.actors["inertial"]!,
        ),
      )
    }

    fb.actorSpawns.add(
      new ActorSpawn(72, 8, catalog.actors["inertial"]!),
    )
  }

  if (mapFile === "block_-200.0") {
    const items = [
      [-3, 6, "apple"],
      [-4, 6, "green-apple"],
      [-5, 6, "apple"],
      [-6, 6, "apple"],

      [-3, 7, "apple"],
      [-4, 7, "apple"],
      [-5, 7, "apple"],
      [-6, 7, "apple"],

      [-3, 8, "apple"],
      [-4, 8, "apple"],
      [-5, 8, "apple"],
      [-6, 8, "apple"],
    ] as const
    for (const [i, j, type] of items) {
      fb.itemSpawns.add(new ItemSpawn(i, j, catalog.items[type]!))
    }
  }

  let itemCount = 0
  for (const _ of Array(1000)) {
    const i = randomInt(200)
    const j = randomInt(200)
    const cell = fb.getCell(i, j)
    if (cell.canEnter && !fb.propSpawns.has(i + fb.i, j + fb.j)) {
      itemCount++
      const random = Math.random()
      let type = "apple"
      if (random > 0.93) {
        type = "purple-mushroom"
      } else if (random > 0.8) {
        type = "mushroom"
      } else if (random > 0.65) {
        type = "green-apple"
      }
      fb.itemSpawns.add(
        new ItemSpawn(
          i + fb.i,
          j + fb.j,
          catalog.items[type]!,
        ),
      )
    }
  }

  console.log(
    `Added ${c} characters and ${itemCount} items to the map: ${mapFile}`,
  )
  const obj = fb.toMap().toObject()
  console.log(
    `${obj.actors.length} characters and ${obj.items.length} items in total`,
  )

  await Deno.writeTextFile(
    mapJson,
    JSON.stringify(fb.toMap().toObject(), null, 2),
  )
}
