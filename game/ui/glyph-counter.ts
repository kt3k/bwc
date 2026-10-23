import type { Context } from "@kt3k/cell"
import * as signal from "../../util/signals.ts"
import { glyphType } from "../../model/glyph.ts"

/**
 * How long a picked letter is held up over the player before it flies
 * to the counter (game/ui/item-get-effector.ts), in ms
 */
export const GLYPH_SHOW_MS = 900
/** The flight to the counter, in ms (as the other items' icons) */
export const GLYPH_FLY_MS = 300

/** The src of the sprite of the n-th sign */
export const glyphSrc = (glyph: number) => `./item/${glyphType(glyph)}.png`

/**
 * The count of the unreadable letters held (model/glyph.ts), a row of
 * the counters panel. Hidden while none is held. Its icon is the sign of
 * the last letter taken. It changes when the flying letter arrives.
 */
export function GlyphCounter({ el, query, subscribe }: Context) {
  let first = true
  subscribe(signal.glyphs, (glyphs) => {
    const update = () => {
      el.classList.toggle("hidden", glyphs.length === 0)
      const label = query(".glyph-count-label")
      if (label) label.textContent = glyphs.length.toString()
      const last = glyphs.at(-1)
      const icon = query(".js-glyph-icon")
      if (icon && last) icon.setAttribute("src", glyphSrc(last.glyph))
    }
    // the saved count shows at once; a new letter when it arrives
    if (first) update()
    else setTimeout(update, GLYPH_SHOW_MS + GLYPH_FLY_MS)
    first = false
  })
}
