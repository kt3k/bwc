// The catalog preview page (static/preview.html): renders every cell,
// item, prop and actor in the catalog with its sprite and behavior.

interface CatalogJson {
  cells: Record<string, {
    canEnter: boolean
    src: string
    noise?: string
    slippery?: boolean
    water?: boolean
    conveyor?: string
    diggable?: boolean
    noisePatches?: boolean
    flip?: string
    variants?: Record<string, number>
    casts?: boolean
  }>
  items: Record<string, { src: string; collect: string }>
  actors: Record<
    string,
    { src: string; moveEnd?: string; idle?: string; pushed?: string }
  >
  props: Record<string, {
    src: string
    canEnter: boolean
    pushed?: string
    onEnter?: string
    growth?: { stages: string[]; interval: number }
  }>
}

/** Hand-written behavior notes, keyed by "<kind>.<name>" */
const NOTES: Record<string, string> = {
  "cell.0": "basic floor",
  "cell.1": "wall",
  "cell.2": "wall",
  "cell.3": "floor (tutorial/course look)",
  "cell.4": "floor (dungeon B2F look)",
  "cell.5": "floor (dungeon look)",
  "cell.6": "floor",
  "cell.b": "black blocker",
  "cell.f": "forest floor",
  "cell.i": "ice: slide straight at 4x until blocked",
  "cell.w":
    "water: blocks walking, fish with space, boulders sink into bridges",
  "cell.x": "cracked: stand on it and press space to dig coins (once)",
  "cell.n": "conveyor: forces a 4x slide up",
  "cell.s": "conveyor: forces a 4x slide down",
  "cell.o": "conveyor: forces a 4x slide left",
  "cell.e": "conveyor: forces a 4x slide right",
  "cell.c": "cobblestone floor (villages, plazas)",
  "cell.d": "wooden planks (docks, corridors)",
  "cell.m": "mosaic tiles (vaults, shrines)",
  "cell.p": "gravel (arenas, boulder lanes)",
  "cell.h": "steel plates (machine rooms)",
  "cell.y": "sand (waterside)",
  "cell.g": "green background for emphasized text (not terrain)",
  "cell.a": "blue background for emphasized text (not terrain)",
  "cell.r": "red background for emphasized text (not terrain)",
  "item.apple": "+1 apple; spawns bouncy splashes; opens apple gates",
  "item.green-apple": "+1 green apple",
  "item.coin": "+1 coin; spend at shops",
  "item.seed": "+1 seed; press space to plant a sapling",
  "item.key": "+1 key; key gates consume one",
  "item.mushroom": "2x speed for 15 seconds",
  "item.purple-mushroom": "4x uncontrollable straight dash",
  "item.fish": "follows you; jumping (space) scares it off",
  "prop.crate": "push to break",
  "prop.hatena": "push to break",
  "prop.chest": "push to break; scatters its drops",
  "prop.sign": "push to read the message",
  "prop.spring":
    "step on it: launched 3 cells at 4x in your heading; a fish follower flees",
  "prop.portal": "step on it to teleport",
  "prop.portal-out": "teleport arrival marker",
  "prop.reset-portal": "push to wipe the save and restart",
  "prop.apple-gate": "opens if you carry enough apples",
  "prop.key-gate": "consumes 1 key to open",
  "prop.timer-gate": "push to open for a while, then it closes",
  "prop.moon-gate": "opens while a lit lantern is within 12 cells",
  "prop.door": "open while ANY actor stands on a plate of its group",
  "prop.plate": "pressure switch for doors (player, NPC or boulder)",
  "prop.shop": "push to buy (price in coins)",
  "prop.fish-shrine": "push with a fish follower: +5 coins",
  "prop.lantern": "a light; ghosts fear it, moon gates open near it",
  "prop.lantern-unlit": "push to light it",
  "prop.sapling": "grows to a fruit tree; push the grown tree for apples",
  "prop.race-start": "step on it to start the race clock",
  "prop.race-goal": "step on it to finish; beat par for coins",
  "prop.switch":
    "push to flip its group: blue walls lower and red walls rise (and back)",
  "prop.blue-wall": "stands while its switch group is OFF",
  "prop.red-wall": "stands while its switch group is ON",
  "prop.and-wall": "lowers only while every listed switch group is ON",
  "prop.timer-button": "push to open its shutters for a while",
  "prop.shutter": "open while its timer button holds it",
  "prop.seq-button": "press the group in number order; a skip resets it",
  "prop.seal-wall": "opens for good once its buttons were pressed in order",
  "prop.slide-button": "push to move the gap of its slide walls one step",
  "prop.slide-wall": "a wall line with one moving gap",
  "prop.stool": "decoration (walkable)",
  "prop.table": "decoration (blocks)",
  "prop.table2": "decoration (blocks)",
  "actor.random": "wanders around",
  "actor.random-walk": "walks randomly every frame",
  "actor.random-rotate": "rotates in place",
  "actor.inertial": "keeps going; bounces back off walls",
  "actor.static": "stands still",
  "actor.chaser": "chases you in range; steals apples",
  "actor.boulder":
    "push it: rolls until blocked, crushes NPCs, sinks into water as a bridge, presses buttons",
  "actor.patrol":
    "walks back and forth between obstacles; presses buttons it bumps into; can't be shoved",
  "actor.ghost": "walks through walls, fears lanterns, steals coins",
}

const CELL = 16
const SCALE = 3

function el(tag: string, className?: string, text?: string): HTMLElement {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text) e.textContent = text
  return e
}

function spriteCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas")
  canvas.width = CELL * SCALE
  canvas.height = CELL * SCALE
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingEnabled = false
  return [canvas, ctx]
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

function card(
  name: string,
  flags: string,
  note: string,
): [HTMLElement, HTMLElement] {
  const c = el("div", "card")
  const body = el("div")
  body.appendChild(el("div", "name", name))
  if (flags) body.appendChild(el("div", "flags", flags))
  if (note) body.appendChild(el("div", "note", note))
  c.appendChild(body)
  return [c, body]
}

async function main() {
  const catalogUrl = new URL("catalog/base.json", location.href)
  const catalog: CatalogJson = await (await fetch(catalogUrl)).json()
  const resolve = (src: string) => new URL(src, catalogUrl).href

  const app = document.getElementById("app")!
  app.textContent = ""

  const section = (title: string) => {
    app.appendChild(el("h2", "", title))
    const grid = el("div", "grid")
    app.appendChild(grid)
    return grid
  }

  const cells = section(`CELLS (${Object.keys(catalog.cells).length})`)
  for (const [name, def] of Object.entries(catalog.cells)) {
    const flags = [
      def.canEnter ? "walkable" : "blocks",
      def.slippery ? "slippery" : "",
      def.water ? "water" : "",
      def.conveyor ? `conveyor:${def.conveyor}` : "",
      def.diggable ? "diggable" : "",
      def.flip ? `flip: ${def.flip}` : "",
      def.casts ? "wall (black checker base edge)" : "",
      def.noise
        ? `noise: ${def.noise}${def.noisePatches === false ? " (even)" : ""}`
        : "",
    ].filter(Boolean).join(" / ")
    const [c, body] = card(name, flags, NOTES[`cell.${name}`] ?? "")
    const [canvas, ctx] = spriteCanvas()
    c.insertBefore(canvas, body)
    cells.appendChild(c)
    loadImage(resolve(def.src)).then((img) => {
      ctx.drawImage(img, 0, 0, CELL * SCALE, CELL * SCALE)
    }).catch(() => {})
    // The rare variant tiles, with their weight
    for (const [src, weight] of Object.entries(def.variants ?? {})) {
      const [vc, vctx] = spriteCanvas()
      vc.title = `${src} (${weight}%)`
      c.insertBefore(vc, body)
      loadImage(resolve(src)).then((img) => {
        vctx.drawImage(img, 0, 0, CELL * SCALE, CELL * SCALE)
      }).catch(() => {})
    }
  }

  const items = section(`ITEMS (${Object.keys(catalog.items).length})`)
  for (const [name, def] of Object.entries(catalog.items)) {
    const [c, body] = card(
      name,
      `collect: ${def.collect}`,
      NOTES[`item.${name}`] ?? "",
    )
    const [canvas, ctx] = spriteCanvas()
    c.insertBefore(canvas, body)
    items.appendChild(c)
    loadImage(resolve(def.src)).then((img) => {
      ctx.drawImage(img, 0, 0, CELL * SCALE, CELL * SCALE)
    }).catch(() => {})
  }

  // Skip the single-letter text props to keep the list readable
  const isLetterProp = (name: string) => /^[a-z0-9](_white)?$/.test(name)
  const propEntries = Object.entries(catalog.props).filter(([name]) =>
    !isLetterProp(name)
  )
  const props = section(`PROPS (${propEntries.length})`)
  for (const [name, def] of propEntries) {
    const flags = [
      def.canEnter ? "walkable" : "blocks",
      def.pushed ? `pushed: ${def.pushed}` : "",
      def.onEnter ? `onEnter: ${def.onEnter}` : "",
      def.growth ? `grows (${def.growth.stages.length} stages)` : "",
    ].filter(Boolean).join(" / ")
    const [c, body] = card(name, flags, NOTES[`prop.${name}`] ?? "")
    const [canvas, ctx] = spriteCanvas()
    c.insertBefore(canvas, body)
    props.appendChild(c)
    const srcs = def.growth ? def.growth.stages : [def.src]
    Promise.all(srcs.map((s) => loadImage(resolve(s)))).then((imgs) => {
      let n = 0
      const draw = () => {
        ctx.clearRect(0, 0, CELL * SCALE, CELL * SCALE)
        ctx.drawImage(imgs[n % imgs.length], 0, 0, CELL * SCALE, CELL * SCALE)
        n++
      }
      draw()
      if (imgs.length > 1) setInterval(draw, 900)
    }).catch(() => {})
  }

  const actors = section(`ACTORS (${Object.keys(catalog.actors).length})`)
  for (const [name, def] of Object.entries(catalog.actors)) {
    const flags = [
      def.idle ? `idle: ${def.idle}` : "",
      def.moveEnd ? `moveEnd: ${def.moveEnd}` : "",
      def.pushed ? `pushed: ${def.pushed}` : "",
    ].filter(Boolean).join(" / ")
    const [c, body] = card(name, flags, NOTES[`actor.${name}`] ?? "")
    const [canvas, ctx] = spriteCanvas()
    c.insertBefore(canvas, body)
    actors.appendChild(c)
    Promise.all(
      [`${def.src}down0.png`, `${def.src}down1.png`].map((s) =>
        loadImage(resolve(s))
      ),
    ).then((imgs) => {
      let n = 0
      const draw = () => {
        ctx.clearRect(0, 0, CELL * SCALE, CELL * SCALE)
        ctx.drawImage(imgs[n % 2], 0, 0, CELL * SCALE, CELL * SCALE)
        n++
      }
      draw()
      setInterval(draw, 500)
    }).catch(() => {})
  }
}

main()
