import type { Context } from "@kt3k/cell"
import * as jsfxr from "jsfxr"
import * as signal from "../../util/signals.ts"

// deno-lint-ignore no-explicit-any
const sfxr = (jsfxr as any).sfxr

/** The ui which plays the sound effects requested via the sound signal */
export function SoundPlayer({ subscribe }: Context) {
  // Cache the generated synthdefs so that each sound name keeps a
  // consistent sound over the session
  // deno-lint-ignore no-explicit-any
  const cache: Record<string, any> = {}
  const synthdef = (name: string) => cache[name] ??= sfxr.generate(name)

  // Mobile browsers block audio until the first user gesture, so play a
  // muted sound on the first interaction to unlock the audio playback
  const unlock = () => {
    try {
      const audio = sfxr.toAudio(synthdef("pickupCoin"))
      audio.volume = 0
      audio.play()
    } catch {
      // Audio isn't available. Ignored.
    }
  }
  document.addEventListener("pointerdown", unlock, { once: true })

  subscribe(signal.sound, (sound) => {
    if (!sound) {
      return
    }
    try {
      sfxr.play(synthdef(sound.name))
    } catch {
      // Audio isn't available (e.g. before the first user gesture on
      // mobile). Ignored.
    }
  })
}
