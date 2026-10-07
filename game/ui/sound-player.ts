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
  /** A short bell-like tone at the note (semitones above C5) */
  const bell = (note: number) =>
    cache[`bell.${note}`] ??= (() => {
      const def = sfxr.generate("tone")
      const hz = 523.25 * 2 ** (note / 12)
      // the inverse of jsfxr's frequency curve (sfxr.js, p_base_freq)
      def.p_base_freq = Math.sqrt(hz * 100 / 8 / 44100 - 0.001)
      def.p_env_sustain = 0.05
      def.p_env_decay = 0.35
      def.p_env_punch = 0.3
      def.sound_vol = 0.2
      return def
    })()

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
      sfxr.play(
        sound.name === "bell" ? bell(sound.note ?? 0) : synthdef(sound.name),
      )
    } catch {
      // Audio isn't available (e.g. before the first user gesture on
      // mobile). Ignored.
    }
  })
}
