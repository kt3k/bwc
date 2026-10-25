import { assertEquals } from "@std/assert"
import { byDepth, DrawLayer } from "./draw-layer.ts"
import { RectScope } from "../util/rect-scope.ts"
import type { IEntity } from "../model/types.ts"

class Scope extends RectScope {}

/**
 * A sprite w x h standing on the cell (i, j), as Prop.x / Prop.y place
 * one (centered, its bottom on the cell's), dy pixels down (moving)
 */
function sprite(name: string, i: number, j: number, w = 16, h = 16, dy = 0) {
  return {
    name,
    i,
    j,
    x: i * 16 - Math.floor((w - 16) / 2),
    y: j * 16 - (h - 16) + dy,
    w: 16,
    h: 16,
    image: () => ({ name, width: w, height: h }) as unknown as ImageBitmap,
    loadAssets: () => Promise.resolve(),
    assetsReady: true,
  } as IEntity & { name: string }
}

/** A layer drawing on a canvas that only notes what was drawn */
function layer(scope: RectScope) {
  const drawn: string[] = []
  const ctx = {
    drawImage: (img: { name: string }) => drawn.push(img.name),
  }
  const canvas = { getContext: () => ctx } as unknown as HTMLCanvasElement
  return { drawn, layer: new DrawLayer(canvas, scope) }
}

Deno.test("byDepth: by where their feet are, those level keeping their order", () => {
  const objs = [
    sprite("a", 0, 3),
    sprite("tall", 1, 2, 16, 24),
    sprite("b", 2, 1),
    sprite("c", 3, 3),
    sprite("moving", 4, 2, 16, 16, -4),
  ]
  assertEquals(byDepth(objs).map((o) => o.name), [
    "b",
    "moving",
    "tall",
    "a",
    "c",
  ])
})

Deno.test("a tall sprite covers what stands in the cell above it, not below", () => {
  const scope = new Scope(320, 320)
  const { drawn, layer: l } = layer(scope)
  // the statue (16x24) on (0, 1), listed before the one above it and
  // after the one below it
  l.drawIterableEntityByDepth([
    sprite("below", 0, 2),
    sprite("statue", 0, 1, 16, 24),
    sprite("above", 0, 0),
  ])
  assertEquals(drawn, ["above", "statue", "below"])
})

Deno.test("a tall sprite is drawn while only its foot is in view", () => {
  const scope = new Scope(160, 160)
  // the view's top edge at y = 106: the statue on (0, 6) (its sprite
  // from y = 88 to 112) shows its bottom 6 rows; the stone on (0, 4)
  // doesn't show
  scope.setCenter(0, 106 + 80)
  const { drawn, layer: l } = layer(scope)
  l.drawIterableEntityByDepth([
    sprite("statue", 0, 6, 16, 24),
    sprite("stone", 0, 4),
  ])
  assertEquals(drawn, ["statue"])
})
