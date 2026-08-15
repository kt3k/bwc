import { type Context } from "@kt3k/cell"
import { Gameloop } from "@kt3k/gameloop"
import * as signals from "../util/signals.ts"
import { CELL_SIZE } from "../util/constants.ts"
import { IdleMainActor, MoveEndMainActor } from "./main-character.ts"
import { inputQueue } from "./ui/input.ts"
import { DrawLayer } from "./draw-layer.ts"
import { RectScope } from "../util/rect-scope.ts"

import { Field } from "./field.ts"
import { Actor } from "../model/actor.ts"
import { restoreSave, savedPosition, savePosition } from "../util/save.ts"
import { drawNight, nightDarknessAt } from "./night.ts"

const parseGridPosition = (hash: string) => {
  const m = hash.match(/#(-?\d+),(-?\d+)/)
  if (m) {
    return { i: +m[1], j: +m[2] }
  }
  return null
}

restoreSave()

const start = parseGridPosition(globalThis.location.hash) ?? savedPosition()

// The starting position of the main character
const I = start?.i ?? -9964
const J = start?.j ?? -9981

/**
 * The area which is visible to the user
 * The center of this area is the center of the screen
 * The center of this area usually follows the 'me' character
 */
class ViewScope extends RectScope {}

/**
 * When the chunk of {@linkcode FieldBlock} overlaps with this scope,
 * the {@linkcode Character}s in that chunk start walking.
 */
class ActivateScope extends RectScope {
  static MARGIN = 20 * CELL_SIZE
  constructor(screenSize: number) {
    super(screenSize + ActivateScope.MARGIN, screenSize + ActivateScope.MARGIN)
  }
}

class DeactivateScope extends RectScope {
  static MARGIN = 22 * CELL_SIZE
  constructor(screenSize: number) {
    super(
      screenSize + DeactivateScope.MARGIN,
      screenSize + DeactivateScope.MARGIN,
    )
  }
}

const kimiDef = {
  type: "main",
  main: "main",
  src: "../actor/kimi/",
  href: "./actor/kimi/",
}

export function GameScreen({ el, query }: Context) {
  const entityCanvas = query<HTMLCanvasElement>(".canvas-entity")!
  const nightCanvas = query<HTMLCanvasElement>(".canvas-night")!

  const screenSize = Math.min(globalThis.screen.width, 450)

  entityCanvas.width = screenSize
  entityCanvas.height = screenSize
  nightCanvas.width = screenSize
  nightCanvas.height = screenSize
  const nightCtx = nightCanvas.getContext("2d")!
  el.style.width = screenSize + "px"
  el.style.height = screenSize + "px"

  const me = new Actor(
    I,
    J,
    kimiDef,
    "main",
    "down",
    1,
    new MoveEndMainActor(),
    new IdleMainActor(),
  )
  const viewScope = new ViewScope(screenSize, screenSize)
  const entityLayer = new DrawLayer(entityCanvas, viewScope)
  const activateScope = new ActivateScope(screenSize)
  const deactivateScope = new DeactivateScope(screenSize)

  const field = new Field(query(".field")!, me, activateScope, deactivateScope)
  signals.centerPixel.update({ x: field.me.centerX, y: field.me.centerY })

  const loadBlocks = () => {
    field.checkBlockLoad(field.me.i, field.me.j, viewScope).then(() => {
      signals.currentBlock.update(field.currentBlock())
    }).catch((e) => {
      console.error("Failed to load blocks", e)
    })
    field.checkBlockUnload(field.me.i, field.me.j)
  }
  signals.centerGrid10.subscribe(loadBlocks)

  // Persist the last position as the player moves around
  signals.centerGrid10.subscribe(() => {
    savePosition(field.me.i, field.me.j)
  })

  signals.centerPixel.subscribe(({ x, y }) => {
    viewScope.setCenter(x, y)
    field.translateBackground(-viewScope.left, -viewScope.top)
  })

  signals.isGameLoading.subscribe((v) => {
    if (!v) {
      query(".curtain")!.style.opacity = "0"
    }
  })

  const loop = new Gameloop(60, () => {
    if (!field.assetsReady) {
      signals.isGameLoading.update(true)
      // Inputs made during the loading screen shouldn't replay as a
      // burst of actions once the game starts
      inputQueue.length = 0
      return
    }
    signals.isGameLoading.update(false)

    field.step()
    signals.centerPixel.update({ x: field.me.centerX, y: field.me.centerY })

    entityLayer.clear()
    entityLayer.drawIterableEntity(field.props.iter())
    entityLayer.drawIterableEntity(field.items.iter())
    entityLayer.drawIterableEntity(field.actors.iter())
    entityLayer.drawIterableColorBox(field.effects.iter())
    entityLayer.drawWhiteNoise()

    const darkness = nightDarknessAt(field.time)
    signals.nightDarkness.update(darkness)
    drawNight(nightCtx, screenSize, field.props.iter(), viewScope, darkness)

    const time = field.time

    if (time % 300 === 299) {
      field.actors.checkDeactivate(field.me.i, field.me.j)
    }
    if (time % 300 === 199) {
      field.items.checkDeactivate(field.me.i, field.me.j)
    }
    if (time % 300 === 99) {
      field.props.checkDeactivate(field.me.i, field.me.j)
    }
    if (time % 60 === 59) {
      field.checkActivate(field.me.i, field.me.j, { viewScope })
        .catch((e) => console.error("Failed to activate entities", e))
    }
  })
  loop.onStep((fps, v) => {
    signals.fps.update(fps)
    if (v > 3000) {
      signals.v.update(3000)
    }
  })
  loop.start()

  const reset = (i: number, j: number) => {
    loop.stop()
    query(".curtain")!.style.opacity = "1"
    setTimeout(() => {
      field.reset()
      field.fastTravel(field.me, i, j)
      field.me.unsetFollower()
      savePosition(i, j)
      signals.centerPixel.update({ x: field.me.centerX, y: field.me.centerY })
      // centerGrid10 doesn't fire when the destination is in the same
      // 10-cell tile, so kick the block load explicitly; without this
      // the game would stay on the loading curtain forever
      loadBlocks()
      loop.start()
    }, 10)
  }

  globalThis.onhashchange = () => {
    const pos = parseGridPosition(globalThis.location.hash)
    if (pos) {
      reset(pos.i, pos.j)
    }
  }
}
