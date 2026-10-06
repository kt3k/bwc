// Imports the original FF5-style sprites of kt3k/ff5study (original/,
// drawn by its rules from the FF5 field sprites) into this game, made to
// fit docs/art-guide.md:
//
// - characters and creatures become actors, props become props: both in
//   grayscale only. Each FF5 color is given one of the 5 tones (white,
//   gray2, gray3, gray4, black) by its brightness, and per sprite some
//   colors are moved to another tone so that hair, skin, clothes and
//   things held stay apart (like the townsfolk, by value and shape)
// - items keep their colors, each moved to the nearest palette color, and
//   get a black outline and the gray2 outer pixels (tools/item_ring.ts)
//
// The FF5 walk cycle maps onto the actor frames: *_stand -> 0, *_walk ->
// 1. Creatures have one frame a side: it is used for both, and "down"
// stands in for "up".
//
// Usage: deno -A tools/import_ff5_originals.ts [path/to/ff5study]
import { PALETTE, Palette } from "../util/palette.ts"
import { decodePng, encodePng } from "./png.ts"
import { addItemRing, blackenOutline, itemRingErrors } from "./item_ring.ts"

const root = Deno.args[0] ?? new URL("../../ff5study", import.meta.url).pathname
const sprites = `${root}/original/sprites`
const out = new URL("../static/", import.meta.url).pathname

/** The FF5 field-sprite colors of ff5study (tools/pixelart.py) */
const FF5: Record<string, [number, number, number]> = {
  k: [41, 41, 41], // outline (characters)
  K: [24, 24, 24], // outline (objects)
  w: [255, 255, 255], // white
  c: [214, 231, 214], // near white
  s: [255, 206, 165], // skin
  S: [255, 165, 123], // skin shade
  y: [255, 255, 0], // yellow
  g: [198, 140, 0], // gold
  b: [165, 90, 0], // brown
  O: [255, 165, 0], // orange
  o: [255, 82, 0], // orange-red
  r: [216, 64, 48], // red
  R: [140, 20, 30], // dark red
  p: [255, 123, 255], // pink
  m: [255, 49, 123], // magenta
  B: [115, 115, 255], // light blue
  u: [0, 90, 173], // mid blue
  n: [24, 57, 222], // navy
  i: [140, 220, 255], // ice / sky
  l: [140, 198, 57], // lime
  G: [0, 165, 0], // green
  d: [8, 88, 16], // dark green
  P: [206, 49, 255], // purple
  v: [128, 0, 224], // violet
  t: [0, 208, 160], // teal
  T: [0, 136, 120], // teal dark
  a: [181, 181, 173], // light gray
  A: [123, 115, 107], // gray
  e: [66, 66, 74], // dark gray
  Y: [160, 160, 160], // silver
  W: [123, 82, 49], // wood
  X: [90, 57, 33], // wood dark
  Z: [112, 88, 56], // olive brown
  h: [198, 165, 66], // straw / brass
  q: [231, 214, 82], // pale yellow
}
const letterOf = new Map(
  Object.entries(FF5).map(([k, [r, g, b]]) => [`${r},${g},${b}`, k]),
)

/** The 5 tones of the actors and props */
const TONES = {
  W: Palette.white,
  L: Palette.gray2,
  M: Palette.gray3,
  D: Palette.gray4,
  K: Palette.black,
} as const
type Tone = keyof typeof TONES

/** The tone of an FF5 color by its brightness */
function toneOf(letter: string): Tone {
  if (letter === "k" || letter === "K") return "K"
  const [r, g, b] = FF5[letter]
  const y = 0.299 * r + 0.587 * g + 0.114 * b
  if (y >= 200) return "W"
  if (y >= 150) return "L"
  if (y >= 100) return "M"
  return "D"
}

type Kind = "actor" | "prop"
interface Sheet {
  /** the sprite set in ff5study (original/sprites/<from>/) */
  from: string
  kind: Kind
  /** the name here (static/actor/<to>/ or static/prop/<to>.png) */
  to: string
  /** frame here <- frame file there */
  frames: Record<string, string>
  /** FF5 colors moved to another tone than their brightness gives */
  tones?: Record<string, Tone>
}

const WALK = {
  down0: "down_stand",
  down1: "down_walk",
  up0: "up_stand",
  up1: "up_walk",
  left0: "left_stand",
  left1: "left_walk",
  right0: "right_stand",
  right1: "right_walk",
}
const person = (
  from: string,
  to: string,
  tones?: Record<string, Tone>,
): Sheet => ({ from, kind: "actor", to, frames: WALK, tones })
const creature = (
  name: string,
  to: string,
  tones?: Record<string, Tone>,
): Sheet => ({
  from: "creatures",
  kind: "actor",
  to,
  frames: {
    down0: `${name}_down`,
    down1: `${name}_down`,
    up0: `${name}_down`,
    up1: `${name}_down`,
    left0: `${name}_left`,
    left1: `${name}_left`,
    right0: `${name}_right`,
    right1: `${name}_right`,
  },
  tones,
})
const prop = (
  name: string,
  to: string,
  tones?: Record<string, Tone>,
): Sheet => ({
  from: "props",
  kind: "prop",
  to,
  frames: { [to]: name },
  tones,
})

// Skin is white with a gray2 shade (like the townsfolk); the tones moved
// below keep the hair or hat, the clothes and the things held apart
const SKIN = { s: "W", S: "L" } as const
const SHEETS: Sheet[] = [
  person("merchant", "merchant", {
    ...SKIN,
    b: "M",
    W: "D",
    X: "D",
    g: "L",
    G: "L",
    l: "W",
  }),
  person("guard", "guard", {
    ...SKIN,
    Y: "L",
    B: "M",
    a: "W",
    W: "D",
    X: "D",
    n: "D",
    A: "M",
    r: "W",
    y: "W",
  }),
  person("old_sage", "sage", { ...SKIN, B: "L", n: "M", a: "L", W: "D" }),
  person("bard", "bard", {
    ...SKIN,
    G: "L",
    l: "W",
    y: "W",
    b: "D",
    W: "D",
    g: "M",
  }),
  person("blacksmith", "blacksmith", {
    ...SKIN,
    r: "L",
    R: "M",
    X: "D",
    W: "M",
    b: "D",
    e: "D",
  }),
  person("fishwife", "fishwife", { ...SKIN, G: "L", u: "M", d: "D", l: "W" }),
  person("assassin", "assassin", { ...SKIN, e: "D", A: "M", R: "L" }),
  person("princess", "princess", {
    ...SKIN,
    y: "L",
    i: "W",
    g: "M",
    Y: "M",
    p: "L",
  }),
  person("chancellor", "chancellor", {
    ...SKIN,
    P: "L",
    v: "M",
    g: "M",
    a: "W",
    b: "D",
  }),
  person("sailor", "sailor", { ...SKIN, n: "D", u: "M", b: "M" }),
  person("farmer", "farmer", {
    ...SKIN,
    h: "L",
    u: "M",
    X: "D",
    O: "W",
    b: "D",
    q: "W",
    g: "M",
  }),
  person("nun", "nun", { ...SKIN, u: "M", n: "D", c: "W" }),
  person("apprentice", "apprentice", {
    ...SKIN,
    t: "M",
    T: "D",
    O: "L",
    o: "M",
    b: "D",
  }),
  person("inventor", "inventor", {
    ...SKIN,
    O: "L",
    Z: "M",
    e: "D",
    h: "W",
    i: "W",
    o: "M",
    b: "D",
  }),
  person("lady_knight", "lady-knight", {
    ...SKIN,
    Y: "L",
    o: "M",
    B: "D",
    A: "M",
    a: "W",
    O: "L",
  }),
  person("dancer", "dancer", {
    ...SKIN,
    R: "M",
    r: "L",
    m: "W",
    y: "L",
    g: "L",
  }),
  person("catgirl_thief", "thief", {
    ...SKIN,
    n: "M",
    B: "L",
    P: "L",
    b: "D",
    p: "W",
    g: "L",
  }),
  person("kid", "child", {
    ...SKIN,
    b: "M",
    r: "L",
    R: "M",
    n: "D",
    y: "W",
    O: "L",
  }),
  // the city folk: the same figures in other tones, for the city's roles
  person("inventor", "lamplighter", {
    ...SKIN,
    O: "M",
    Z: "L",
    e: "D",
    h: "W",
    i: "W",
    o: "D",
    b: "D",
  }),
  person("bard", "crier", {
    ...SKIN,
    G: "M",
    l: "L",
    y: "W",
    b: "D",
    W: "D",
    g: "W",
  }),
  person("fishwife", "shopper", {
    ...SKIN,
    G: "M",
    u: "L",
    d: "D",
    l: "W",
    w: "L",
  }),
  person("merchant", "commuter", {
    ...SKIN,
    b: "D",
    W: "M",
    X: "D",
    g: "W",
    G: "M",
    l: "L",
  }),
  person("old_sage", "beggar", {
    ...SKIN,
    B: "D",
    n: "M",
    a: "M",
    W: "D",
    w: "L",
  }),
  person("blacksmith", "townsman", {
    ...SKIN,
    r: "D",
    R: "M",
    X: "L",
    W: "L",
    b: "M",
    e: "D",
  }),
  person("dancer", "townswoman", {
    ...SKIN,
    R: "D",
    r: "M",
    m: "L",
    y: "W",
    g: "W",
  }),
  creature("fox", "fox", { O: "L", o: "M", w: "W", c: "W" }),
  creature("slime", "slime", { i: "L", B: "M", w: "W", c: "W" }),
  prop("lantern", "lamp-post"),
  prop("campfire", "campfire", { O: "L", y: "W", r: "M" }),
  prop("tent", "tent"),
  prop("flower_pot", "flower-pot", { p: "W", m: "L", G: "M", d: "D", b: "M" }),
  prop("tombstone", "gravestone"),
  prop("bench", "bench"),
]

/** The items: these keep their colors (the nearest of the palette) */
const ITEMS: Record<string, string> = {
  potion: "potion",
  ether: "ether",
  sword: "sword",
  shield: "shield",
  bread: "bread",
  scroll: "scroll",
  gem: "gem",
  herb: "herb",
  coin_bag: "coin-bag",
}

const rgbOf = (hex: string) =>
  [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16))

async function load(path: string) {
  return await decodePng(await Deno.readFile(path))
}

/** Every pixel of an FF5 sprite as its letter ("" for transparent) */
function letters(rgba: Uint8Array): string[] {
  const result: string[] = []
  for (let p = 0; p < rgba.length / 4; p++) {
    if (rgba[p * 4 + 3] === 0) {
      result.push("")
      continue
    }
    const key = `${rgba[p * 4]},${rgba[p * 4 + 1]},${rgba[p * 4 + 2]}`
    const letter = letterOf.get(key)
    if (!letter) throw new Error(`not an FF5 color: ${key}`)
    result.push(letter)
  }
  return result
}

for (const sheet of SHEETS) {
  for (const [frame, file] of Object.entries(sheet.frames)) {
    const { w, h, rgba } = await load(`${sprites}/${sheet.from}/${file}.png`)
    const result = new Uint8Array(w * h * 4)
    letters(rgba).forEach((letter, p) => {
      if (!letter) return
      const tone = sheet.tones?.[letter] ?? toneOf(letter)
      result.set([...rgbOf(TONES[tone]), 255], p * 4)
    })
    const path = sheet.kind === "actor"
      ? `${out}actor/${sheet.to}/${frame}.png`
      : `${out}prop/${frame}.png`
    await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true })
    await Deno.writeFile(path, await encodePng(w, h, result))
  }
  console.log(`${sheet.kind} ${sheet.to} <- ${sheet.from}`)
}

const palette = PALETTE.map(rgbOf)
/** The nearest palette color (redmean distance) */
function nearest([r, g, b]: number[]): number[] {
  let best = palette[0], bestD = Infinity
  for (const c of palette) {
    const rm = (r + c[0]) / 2
    const d = (2 + rm / 256) * (r - c[0]) ** 2 + 4 * (g - c[1]) ** 2 +
      (2 + (255 - rm) / 256) * (b - c[2]) ** 2
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

for (const [file, to] of Object.entries(ITEMS)) {
  const { w, h, rgba } = await load(`${sprites}/items/${file}.png`)
  const recolored = new Uint8Array(w * h * 4)
  letters(rgba).forEach((letter, p) => {
    if (!letter) return
    const rgb = letter === "k" || letter === "K"
      ? rgbOf(Palette.black)
      : nearest(FF5[letter])
    recolored.set([...rgb, 255], p * 4)
  })
  // Most FF5 items fill the 16x16 to its edges: clear the edge pixels,
  // so the outer pixels fit (the item loses 1px on the sides it touches,
  // and the next pixel in becomes the outline)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        recolored.set([0, 0, 0, 0], (y * w + x) * 4)
      }
    }
  }
  const fixed = blackenOutline(w, h, addItemRing(w, h, recolored))
  const errors = itemRingErrors(w, h, fixed)
  if (errors.length > 0) {
    console.error(`item ${to}: no room for the outer pixels: ${errors}`)
    continue
  }
  await Deno.writeFile(`${out}item/${to}.png`, await encodePng(w, h, fixed))
  console.log(`item ${to} <- ${file}`)
}
