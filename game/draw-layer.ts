import { CanvasWrapper } from "../util/canvas-wrapper.ts"
import { type RectScope } from "../util/rect-scope.ts"
import type { IColorBox, IEntity } from "../model/types.ts"
import { randomInt } from "../util/random.ts"
import { Palette } from "../util/palette.ts"

export class DrawLayer {
  #canvasWrapper: CanvasWrapper
  #viewScope: RectScope
  #noiseCount = 0

  constructor(
    canvas: HTMLCanvasElement,
    viewScope: RectScope,
  ) {
    this.#canvasWrapper = new CanvasWrapper(canvas)
    this.#viewScope = viewScope
  }

  draw(obj: IEntity): void {
    const x = obj.x - this.#viewScope.left
    const y = obj.y - this.#viewScope.top
    if (obj.clipH !== undefined) {
      // only its top rows (a letter rising out of the ground)
      this.#canvasWrapper.drawImageTop(obj.image(), x, y, obj.clipH)
      return
    }
    this.#canvasWrapper.drawImage(obj.image(), x, y)
  }

  drawIterableEntity(iterable: Iterable<IEntity>): void {
    for (const obj of iterable) {
      if (this.#viewScope.overlaps(obj)) {
        this.draw(obj)
      }
    }
  }

  drawIterableColorBox(iterable: Iterable<IColorBox>): void {
    for (const obj of iterable) {
      if (obj.visible === false) continue
      if (this.#viewScope.overlaps(obj)) {
        this.#canvasWrapper.ctx.fillStyle = obj.color
        this.#canvasWrapper.ctx.fillRect(
          obj.x - this.#viewScope.left,
          obj.y - this.#viewScope.top,
          obj.w,
          obj.h,
        )
      }
    }
  }

  /**
   * The white noise: now and then (one frame in a thousand) a few frames
   * of white streaks all over the screen; with `forced`, this frame for
   * sure (a goal done holds the world still under it, util/juice.ts)
   */
  drawWhiteNoise(forced = false): void {
    if (forced) {
      // drawn below
    } else if (this.#noiseCount > 0) {
      this.#noiseCount--
    } else if (Math.random() > 0.001) {
      return
    } else {
      this.#noiseCount = randomInt(6) + 1
    }
    drawNoise(
      this.#canvasWrapper.ctx,
      this.#canvasWrapper.width,
      this.#canvasWrapper.height,
    )
  }

  clear(): void {
    this.#canvasWrapper.clear()
  }
}

/**
 * A frame of the white noise over the w x h canvas: up to `most` white
 * streaks, 4x1, anywhere (the effects lab draws it too, fewer on its
 * smaller stage)
 */
export function drawNoise(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  most = 500,
): void {
  ctx.fillStyle = Palette.white
  for (const _ of Array(randomInt(most))) {
    ctx.fillRect(randomInt(w), randomInt(h), 4, 1)
  }
}
