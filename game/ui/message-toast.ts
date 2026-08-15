import type { Context } from "@kt3k/cell"
import * as signal from "../../util/signals.ts"

const TOAST_DURATION = 3000

/** The toast ui which shows the message from signs etc. */
export function MessageToast({ el, subscribe }: Context) {
  let timer: ReturnType<typeof setTimeout> | undefined

  subscribe(signal.message, (message) => {
    if (!message) {
      return
    }
    el.textContent = message.text
    el.classList.remove("hidden")
    clearTimeout(timer)
    timer = setTimeout(() => {
      el.classList.add("hidden")
    }, TOAST_DURATION)
  })
}
