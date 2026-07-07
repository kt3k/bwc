import type { Context } from "@kt3k/cell"
import * as signal from "../../util/signals.ts"

/** Monitors the current fps number */
export function FpsMonitor({ el, subscribe }: Context) {
  subscribe(signal.fps, (fps) => {
    el.textContent = fps.toFixed(0)
  })
}

/** Monitors the current v value */
export function VMonitor({ el, subscribe }: Context) {
  subscribe(signal.v, (v) => {
    el.textContent = v.toFixed(0)
  })
}
