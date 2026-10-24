// The moment a goal is done (model/celebrate.ts, model/goal-fx.ts): the
// hit stop holds the world still under white noise (no shake) and lets
// go, the five white lines go out (the sound and the message as it lets
// go), and when they are gone, a beat at a time, a bolt strikes the
// letter's cell a little way off, leaves fall round it and the letter
// rises, and it can't be picked up until it has; laid again after a
// reload, it just lies there, in the same place
import { assert, assertEquals } from "@std/assert"
import { Catalog } from "./catalog.ts"
import { Actor, spawnActor } from "./actor.ts"
import { collectAll, Item } from "./item.ts"
import { Prop } from "./prop.ts"
import { PropSpawn } from "./field-block.ts"
import { celebrateGoal } from "./celebrate.ts"
import {
  BOLT_FRAMES,
  BOLT_STRIKES,
  boltPath,
  CLIMAX_LINE_COLOR,
  CLIMAX_LINES,
  FALLING_LEAF_COLORS,
  GlyphReveal,
  GOAL_HIT_STOP,
  GOAL_LINE_COLOR,
  GOAL_LINES,
  GOAL_LINES_FRAMES,
  GoalLines,
  LEAF_FALL_FRAMES,
  REVEAL,
  REVEAL_BEAT,
  REVEAL_DELAY,
  REVEAL_FRAMES,
  revealPose,
} from "./goal-fx.ts"
import { Palette } from "../util/palette.ts"
import { layGlyph, revealGlyph } from "./glyph.ts"
import { ringKey, ringRewardKey, stepRingSlot } from "./ring.ts"
import { oddRewardKey, unlikeType } from "./odd-one.ts"
import { seeded } from "./break-fx.ts"
import { juice, stepWorld } from "../util/juice.ts"
import { isPaletteColor } from "../util/palette.ts"
import * as signal from "../util/signals.ts"
import type { IColorBox, IField, IItem } from "./types.ts"

const catalog = Catalog.fromJSON(
  [{
    src: "base.json",
    json: JSON.parse(
      await Deno.readTextFile(
        new URL("../static/catalog/base.json", import.meta.url),
      ),
    ),
  }],
  "http://localhost/catalog/",
)

type Fx = { step(f: IField): void; finished: boolean }

/** A field of real items that keeps the effects added, and its time */
function makeField() {
  const items: Item[] = []
  const effects: Fx[] = []
  const field = {
    time: 0,
    actorList: [] as unknown[],
    canEnterStatic: () => true,
    isWater: () => false,
    props: { get: () => undefined },
    peekItems: (i: number, j: number) =>
      items.filter((t) => t.i === i && t.j === j) as IItem[],
    spawnItem: (type: string, i: number, j: number, id?: string) => {
      const item = new Item(id ?? null, i, j, catalog.items[type])
      items.push(item)
      return item
    },
    collectItem: (_i: number, _j: number, id: string) => {
      Item.collect(id)
      const k = items.findIndex((t) => t.id === id)
      if (k >= 0) items.splice(k, 1)
    },
    effects: { add: (e: Fx) => void effects.push(e) },
  }
  /** A frame of the game loop: the world, unless held still */
  const frame = () =>
    stepWorld(() => {
      field.time++
      for (const item of [...items]) item.step(field as unknown as IField)
      for (const e of [...effects]) {
        e.step(field as unknown as IField)
        if (e.finished) effects.splice(effects.indexOf(e), 1)
      }
    })
  return { field: field as unknown as IField, items, effects, frame }
}

const reset = () => {
  Item.deserializeCollected([])
  signal.glyphs.update([])
  signal.message.update(null)
  juice.freeze = 0
  juice.shake = 0
  juice.noise = 0
}

Deno.test("goal fx: the hit stop holds the world still for its frames, then lets go", () => {
  reset()
  let stepped = 0
  juice.freeze = 3
  const runs = Array.from({ length: 5 }, () => stepWorld(() => stepped++))
  assertEquals(runs, [false, false, false, true, true])
  assertEquals(stepped, 2)
  assertEquals(juice.freeze, 0)
})

Deno.test("goal fx: a goal done holds still under white noise, no shake, then the lines go out with its message", () => {
  reset()
  const { field, effects, frame } = makeField()
  const sounds: string[] = []
  const off = signal.sound.subscribe((s) => s && sounds.push(s.name))
  celebrateGoal(field, 10, 10, "A GOAL")
  assertEquals(GOAL_HIT_STOP, 32)
  assertEquals(juice.freeze, GOAL_HIT_STOP)
  // no shake; the white noise from this frame to the last one held
  assertEquals(juice.shake, 0)
  assertEquals(juice.noise, GOAL_HIT_STOP + 1)
  assertEquals(effects.length, 1)
  const lines = effects[0] as GoalLines
  assert(lines instanceof GoalLines)
  // in the same frame (the rest of the field's step): not yet
  lines.step(field)
  assertEquals(lines.f, 0)
  // held still: nothing moves, nothing on the goal cell (no white light),
  // no message, no sound yet
  for (let k = 0; k < GOAL_HIT_STOP; k++) {
    assert(!frame())
    assertEquals([...lines.boxes()], [])
  }
  assertEquals(lines.f, 0)
  assertEquals(signal.message.get(), null)
  assertEquals(sounds, [])
  // let go: the message and the sound, once, and the first five lines
  // out of each side of the goal cell
  assert(frame())
  assertEquals(signal.message.get(), { text: "A GOAL" })
  assertEquals(sounds, ["powerUp"])
  const first = [...lines.boxes()]
  assertEquals(first.length, 5 * 4)
  // white only, one wave: never more than the five lines of each side
  assertEquals(GOAL_LINE_COLOR, Palette.white)
  let far = 0
  let longest = 0
  while (effects.length > 0 && lines.f < 500) {
    const now = [...lines.boxes()]
    assert(now.length <= 5 * 4)
    assert(now.every((b) => b.color === Palette.white))
    for (const b of now) {
      far = Math.max(
        far,
        Math.abs(b.x + b.w / 2 - 10.5 * 16),
        Math.abs(b.y + b.h / 2 - 10.5 * 16),
      )
      longest = Math.max(longest, b.w, b.h)
    }
    frame()
  }
  // a little way out: the tips 2 to 3 cells off the cell's sides
  assert(far > 2.5 * 16 && far <= 3.5 * 16, `${far}`)
  // a little longer than a cell, shorter than two
  assertEquals(longest, GOAL_LINES.length)
  assert(GOAL_LINES.length > 16 && GOAL_LINES.length <= 20)
  assertEquals(lines.f, GOAL_LINES_FRAMES)
  // about a second (the 3 waves of before were ~2 s), longer than the
  // pickup's lines (48 frames)
  assert(GOAL_LINES_FRAMES >= 48 && GOAL_LINES_FRAMES <= 70)
  assertEquals(sounds, ["powerUp"])
  assertEquals(effects, [])
  off()
})

Deno.test("goal fx: the letter can't be picked up while it rises, and can after", () => {
  reset()
  const { field, items, effects, frame } = makeField()
  const me = new Actor(5, 5, catalog.actors["static"], "main")
  const id = ringRewardKey("A")
  const item = revealGlyph(field, 5, 5, id)
  assert(item)
  assert(effects.some((e) => e instanceof GlyphReveal))
  assert(item.revealing)
  // nothing shown yet, then it comes up a row at a time
  assertEquals(item.clipH, 0)
  // not to be taken, even standing on it
  for (let k = 0; k < REVEAL_FRAMES - 1; k++) {
    frame()
    collectAll(me, field, field.peekItems(5, 5))
    assertEquals(items.length, 1, `frame ${k}`)
  }
  assert(!Item.isCollected(id))
  frame()
  // settled: all of it, on its cell, and it can be taken
  assert(!item.revealing)
  assertEquals(item.clipH, undefined)
  assertEquals(item.y, 5 * 16)
  collectAll(me, field, field.peekItems(5, 5))
  assertEquals(items, [])
  assert(Item.isCollected(id))
  assertEquals(signal.glyphs.get().map((g) => g.id), [id])
  reset()
})

Deno.test("goal fx: after the lines, a beat at a time: the bolt thrice, the leaves, the letter rising", () => {
  const sounds: [string, number][] = []
  const fx = new GlyphReveal(
    5,
    5,
    0,
    {
      bolt: () => sounds.push(["bolt", fx.f]),
      climax: () => sounds.push(["climax", fx.f]),
    },
    seeded(3),
  )
  const field = { time: 1 } as IField
  // frames (after the hit stop) each part shows in
  const bolt: number[] = []
  const leaves: number[] = []
  const rise: number[] = []
  const shown: number[] = []
  const climaxLines: number[] = []
  while (!fx.finished && fx.f < 1000) {
    fx.step(field)
    const f = fx.f
    const boxes = [...fx.boxes()]
    if (boxes.length > 0) shown.push(f)
    const b = fx.bolt
    if (b) {
      bolt.push(f)
      // from above the cell down into it, white or gray1, edged black
      assert(Math.min(...b.path.map(([, y]) => y)) < 5 * 16 - 16)
      const [lx, ly] = b.path.at(-1)!
      assert(lx >= 5 * 16 && lx < 6 * 16 && ly >= 5 * 16 && ly < 6 * 16)
      assert(b.color === Palette.white || b.color === Palette.gray1)
      assert(boxes.some((x) => x.color === Palette.black))
    }
    const visible = fx.leaves.filter((l) => l.visible)
    if (visible.length > 0) {
      leaves.push(f)
      for (const l of visible) {
        // grays only
        assert(FALLING_LEAF_COLORS.includes(l.color))
        assert(l.w * l.h === 2)
        // round the letter's cell, within two cells of it
        assert(Math.abs(l.x - (5 * 16 + 8)) <= 2 * 16, `${l.x}`)
        assert(Math.abs(l.y - (5 * 16 + 8)) <= 4 * 16, `${l.y}`)
      }
    }
    if (revealPose(f).rows > 0) rise.push(f)
    if (f >= REVEAL_DELAY + REVEAL.climax[0]) {
      // the five lines in the letter's color go out at the climax
      const lines = boxes.filter((x) =>
        x.color === CLIMAX_LINE_COLOR && (x.w > 3 || x.h > 3)
      )
      if (lines.length > 0) climaxLines.push(f)
    }
  }
  // the lines gone, then a beat
  assertEquals(REVEAL_DELAY, GOAL_LINES_FRAMES)
  assertEquals(shown[0], REVEAL_DELAY + REVEAL_BEAT)
  // the bolt strikes three times, a beat after each, flickering (on and
  // off) within its frames each time
  assertEquals(REVEAL.bolts.length, BOLT_STRIKES)
  assertEquals(BOLT_STRIKES, 3)
  assertEquals(bolt[0], REVEAL_DELAY + REVEAL_BEAT)
  for (const [k, [b0, b1]] of REVEAL.bolts.entries()) {
    assertEquals(b1 - b0, BOLT_FRAMES)
    if (k > 0) assertEquals(b0, REVEAL.bolts[k - 1][1] + REVEAL_BEAT)
    const these = bolt.filter((f) =>
      f >= REVEAL_DELAY + b0 && f < REVEAL_DELAY + b1
    )
    assertEquals(these[0], REVEAL_DELAY + b0)
    assert(these.length > 0 && these.length < BOLT_FRAMES)
  }
  assertEquals(
    bolt.length,
    REVEAL.bolts.reduce(
      (n, [b0, b1]) =>
        n +
        bolt.filter((f) => f >= REVEAL_DELAY + b0 && f < REVEAL_DELAY + b1)
          .length,
      0,
    ),
  )
  // a beat after the last, the leaves; each gone at once, all within their
  // frames
  assertEquals(REVEAL.leaves[0], REVEAL.bolts.at(-1)![1] + REVEAL_BEAT)
  assert(leaves[0] >= REVEAL_DELAY + REVEAL.leaves[0])
  assert(leaves[0] <= REVEAL_DELAY + REVEAL.leaves[0] + 10)
  assert(leaves.at(-1)! < REVEAL_DELAY + REVEAL.leaves[1])
  // a beat after the leaves, the letter starts rising
  assertEquals(REVEAL.rise[0], REVEAL.leaves[1] + REVEAL_BEAT)
  assertEquals(rise[0], REVEAL_DELAY + REVEAL.rise[0])
  assertEquals(REVEAL.leaves[1] - REVEAL.leaves[0], LEAF_FALL_FRAMES)
  // the sounds: the crack as it strikes, the bell at the climax
  assertEquals(sounds, [
    ...REVEAL.bolts.map(([b0]) => ["bolt", REVEAL_DELAY + b0]),
    ["climax", REVEAL_DELAY + REVEAL.climax[0]],
  ])
  // the five lines go out at the climax
  assert(climaxLines.length > 0)
  assert(climaxLines[0] < REVEAL_DELAY + REVEAL.climax[1])
  // pickable when the climax is over (the lines may run on a little)
  assertEquals(REVEAL_FRAMES, REVEAL_DELAY + REVEAL.climax[1])
  assert(fx.f >= REVEAL_FRAMES)
})

Deno.test("goal fx: the bolt is one jagged line of pixels down onto the point", () => {
  for (let n = 0; n < 20; n++) {
    const path = boltPath(88, 92, seeded(n))
    assertEquals(path.at(-1), [88, 92])
    assertEquals(path[0][1], 92 - 40)
    assert(Math.abs(path[0][0] - 88) <= 3)
    for (let k = 1; k < path.length; k++) {
      const [x0, y0] = path[k - 1]
      const [x1, y1] = path[k]
      // a pixel down, or a pixel to a side: never a gap
      assertEquals(Math.abs(x1 - x0) + (y1 - y0), 1, `${n} ${k}`)
    }
    // it jogs to the sides
    assert(new Set(path.map(([x]) => x)).size > 1)
  }
})

Deno.test("goal fx: the letter rises out of the ground a row at a time, then hops", () => {
  const [r0, r1] = REVEAL.rise
  assertEquals(revealPose(0), { rows: 0, dy: 0 })
  assertEquals(revealPose(REVEAL_DELAY + r0 - 1).rows, 0)
  let rows = 0
  for (let t = r0; t < r1; t++) {
    const pose = revealPose(REVEAL_DELAY + t)
    // its bottom stays on the ground line
    assertEquals(pose.rows + pose.dy, 16)
    assert(pose.rows >= rows && pose.rows <= rows + 1)
    rows = pose.rows
  }
  assertEquals(rows, 16)
  // the hop at the climax, then settled
  const hop = Array.from(
    { length: REVEAL.climax[1] - r1 },
    (_, k) => revealPose(REVEAL_DELAY + r1 + k).dy,
  )
  assert(Math.min(...hop) < 0)
  assertEquals(hop.at(-1), 0)
})

Deno.test("goal fx: a ring made whole celebrates once; reloaded, its letter just lies there", () => {
  reset()
  const { field, items, effects, frame } = makeField()
  const slot = Prop.fromSpawn(
    new PropSpawn(100, 0, catalog.props["ring-slot"], {
      id: "R",
      kind: "boulder",
      reward: [102, 0],
    }),
  )
  const boulder = spawnActor("b", 100, 0, catalog.actors["boulder"])
  const f = field as unknown as {
    actors: unknown
    time: number
  }
  let actorList = [boulder]
  f.actors = {
    get: (i: number, j: number) =>
      actorList.filter((a) => a.i === i && a.j === j),
    remove: (a: unknown) => {
      actorList = actorList.filter((x) => x !== a)
    },
  }
  stepRingSlot(slot, field)
  assert(Item.isCollected(ringKey("R")))
  assertEquals(effects.filter((e) => e instanceof GoalLines).length, 1)
  assertEquals(effects.filter((e) => e instanceof GlyphReveal).length, 1)
  assertEquals(items.length, 1)
  assert(items[0].revealing)
  // a little way off the ring
  const [at] = items
  const d = Math.max(Math.abs(at.i - 100), Math.abs(at.j))
  assert(d >= 3 && d <= 4, `${d}`)
  // whole now: stepped on, it doesn't celebrate again
  for (
    let k = 0;
    k < GOAL_HIT_STOP + REVEAL_FRAMES + 16 * CLIMAX_LINES.dist + 10;
    k++
  ) {
    frame()
    stepRingSlot(slot, field)
  }
  assertEquals(effects, [])
  assertEquals(items.length, 1)
  assert(!items[0].revealing)

  // reloaded, the letter not taken: laid again with no reveal
  const saved = Item.serializeCollected()
  reset()
  Item.deserializeCollected(saved)
  const second = makeField()
  for (let k = 0; k < 31; k++) {
    second.frame()
    stepRingSlot(slot, second.field)
  }
  assertEquals(second.items.map((t) => t.id), [ringRewardKey("R")])
  // in the same place as when the ring was made whole
  assertEquals([second.items[0].i, second.items[0].j], [at.i, at.j])
  assert(!second.items[0].revealing)
  assertEquals(second.effects, [])
  assertEquals(juice.freeze, 0)
  // and layGlyph alone never reveals
  reset()
  const third = makeField()
  const laid = layGlyph(third.field, 1, 1, oddRewardKey("X"))
  assert(laid && !laid.revealing)
  reset()
})

Deno.test("goal fx: the odd one found celebrates with its letter rising", () => {
  reset()
  const { field, items, effects } = makeField()
  const odd = Prop.fromSpawn(
    new PropSpawn(100, 0, catalog.props[unlikeType("tulip")], {
      id: "T",
      reward: [101, 0],
    }),
  )
  const me = new Actor(100, 1, catalog.actors["static"], "main")
  odd.onPushed({ type: "pushed", dir: "up", peakAt: 7, pusher: me }, field)
  assertEquals(juice.freeze, GOAL_HIT_STOP)
  assertEquals(juice.shake, 0)
  assert(juice.noise > GOAL_HIT_STOP)
  assertEquals(effects.filter((e) => e instanceof GoalLines).length, 1)
  assertEquals(items.map((t) => t.id), [oddRewardKey("T")])
  assert(items[0].revealing)
  const d = Math.max(Math.abs(items[0].i - 100), Math.abs(items[0].j))
  assert(d >= 3 && d <= 4, `${d}`)
  // bumped again: no more
  odd.onPushed({ type: "pushed", dir: "up", peakAt: 7, pusher: me }, field)
  assertEquals(effects.filter((e) => e instanceof GoalLines).length, 1)
  reset()
})

Deno.test("goal fx: palette colors and whole pixels only, every frame", () => {
  const rand = seeded(7)
  const field = { time: 1 } as IField
  const fxs = [
    new GoalLines(3, 4, 0),
    new GlyphReveal(3, 4, 0, undefined, rand),
  ]
  for (const fx of fxs) {
    let frames = 0
    while (!fx.finished && frames < 500) {
      for (const b of fx.boxes() as Iterable<IColorBox>) {
        assert(isPaletteColor(b.color), b.color)
        for (const v of [b.x, b.y, b.w, b.h]) {
          assert(Number.isInteger(v), `${fx.constructor.name} ${frames}`)
        }
        assert(b.w > 0 && b.h > 0)
      }
      fx.step(field)
      frames++
    }
    assert(fx.finished)
  }
})
