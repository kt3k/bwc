import { assert, assertEquals } from "@std/assert"
import {
  BreakRun,
  type FxContext,
  invert,
  MotionMeter,
  type Painter,
  type Params,
  PATTERNS,
  PRESETS,
  recipe,
  seeded,
  shade,
  type SpriteData,
} from "./break-fx.ts"
import { isPaletteColor, PALETTE, Palette } from "../util/palette.ts"
import type { Dir } from "./types.ts"

/** A 16x16 jar-ish sprite: a gray disc with a black rim */
function sprite(w = 16, h = 16): SpriteData {
  const px: SpriteData["px"] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2)
      px.push(
        d > w / 2 ? null : d > w / 2 - 1.5 ? Palette.black : Palette.gray2,
      )
    }
  }
  return { w, h, px }
}

/** Fails on anything off the pixel grid or off the palette */
function strictPainter(log: string[] = []): Painter {
  return {
    rect(x, y, w, h, color) {
      for (const v of [x, y, w, h]) {
        assert(Number.isInteger(v), `not a whole pixel: ${x},${y} ${w}x${h}`)
      }
      assert(w > 0 && h > 0, "an empty rect")
      assert(isPaletteColor(color), `not a palette color: ${color}`)
      log.push(color)
    },
  }
}

const DIRS: Dir[] = ["up", "down", "left", "right"]

/** Plays a run to the end, drawing every frame */
function play(run: { step(): void; draw(p: Painter): void; done: boolean }) {
  const painter = strictPainter()
  let frames = 0
  run.draw(painter)
  while (!run.done) {
    run.step()
    run.draw(painter)
    assert(++frames < 3000, "never ends")
  }
  return frames
}

Deno.test("every pattern draws whole pixels in palette colors, and ends", () => {
  const rand = seeded(1)
  for (const pattern of PATTERNS) {
    for (let trial = 0; trial < 12; trial++) {
      // the defaults first, then random settings, the extremes included
      const params: Params = {}
      for (const spec of pattern.params) {
        if (trial === 0) params[spec.key] = spec.value
        else if (spec.type === "num") {
          const steps = Math.round((spec.max - spec.min) / spec.step)
          const k = trial === 1
            ? 0
            : trial === 2
            ? steps
            : Math.floor(rand() * (steps + 1))
          params[spec.key] = spec.min + k * spec.step
        } else if (spec.type === "select") {
          params[spec.key] =
            spec.options[Math.floor(rand() * spec.options.length)]
        } else {
          const names = Object.keys(Palette)
          params[spec.key] = names[Math.floor(rand() * names.length)]
        }
      }
      for (const dir of DIRS) {
        const ctx: FxContext = {
          x: 48,
          y: 32,
          dir,
          sprite: trial % 3 === 0 ? sprite(24, 24) : sprite(),
          rand,
        }
        play(pattern.create(params, ctx))
      }
    }
  }
})

Deno.test("every preset plays out within the rules", () => {
  for (const preset of PRESETS) {
    for (const dir of DIRS) {
      const run = new BreakRun(preset.recipe, {
        x: 48,
        y: 32,
        dir,
        sprite: sprite(),
        rand: seeded(7),
      })
      play(run)
      assert(Number.isInteger(run.shakeOffset[0]))
    }
  }
})

Deno.test("the hit-stop holds every pattern still", () => {
  const ctx = (): FxContext => ({
    x: 0,
    y: 0,
    dir: "right",
    sprite: sprite(),
    rand: seeded(3),
  })
  const free = new BreakRun(recipe({ chips: {} }), ctx())
  const held = new BreakRun(recipe({ chips: {} }, { stop: 10 }), ctx())
  assertEquals(play(held) - play(free), 10)
})

Deno.test("invert keeps to the gray ramp", () => {
  assertEquals(invert(Palette.white), Palette.black)
  assertEquals(invert(Palette.gray2), Palette.gray3)
  for (const c of PALETTE) assert(isPaletteColor(invert(c)))
})

Deno.test("a lower frame rate stretches the effects", () => {
  const ctx = (): FxContext => ({
    x: 0,
    y: 0,
    dir: "up",
    sprite: sprite(),
    rand: seeded(5),
  })
  const at60 = play(new BreakRun(recipe({ poof: {} }), ctx()))
  const at15 = play(new BreakRun(recipe({ poof: {} }, { rate: 4 }), ctx()))
  assert(at60 > 0)
  assert(at15 >= at60 * 4 - 3 && at15 <= at60 * 4)
})

Deno.test("the calm presets bring nothing out of nothing", () => {
  const calm = new Set(
    PATTERNS.filter((pt) => pt.group === "calm").map((pt) => pt.id),
  )
  for (const preset of PRESETS) {
    const on = Object.entries(preset.recipe.layers).filter(([, l]) => l.on)
    if (!on.every(([id]) => calm.has(id) || id === "wipe")) {
      continue
    }
    for (const dir of DIRS) {
      const run = new BreakRun(preset.recipe, {
        x: 48,
        y: 32,
        dir,
        sprite: sprite(),
        rand: seeded(9),
      })
      play(run)
      assertEquals(run.motion.appeared, 0, `${preset.name} ${dir}`)
    }
  }
})

Deno.test("the motion meter counts what pops out and what moves", () => {
  const frame = (...keys: string[]) =>
    new Map(keys.map((k) => [k, Palette.white]))
  const m = new MotionMeter(frame("0,0"))
  m.add(frame("1,0"))
  assertEquals([m.changed, m.appeared, m.vanished], [2, 0, 0])
  m.add(frame("1,0", "5,5"))
  assertEquals([m.appeared, m.maxChanged], [1, 2])
  m.add(frame())
  assertEquals(m.vanished, 2)
})

Deno.test("shade steps down (and up) a hue's own ramp", () => {
  assertEquals(shade(Palette.cyan2, true), Palette.cyan3)
  assertEquals(shade(Palette.cyan4, true), Palette.black)
  assertEquals(shade(Palette.white, true), Palette.gray1)
  assertEquals(shade(Palette.black, false), Palette.gray4)
  assertEquals(shade(Palette.cyan1, false), Palette.white)
})
