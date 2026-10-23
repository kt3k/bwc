import { register } from "@kt3k/cell"
import { clearInput } from "./ui/input.ts"
import { KeyMonitor } from "./ui/key-monitor.ts"
import { FpsMonitor, VMonitor } from "./ui/fps-monitor.ts"
import {
  ActorsCounter,
  ItemsCounter,
  PropsCounter,
} from "./ui/spawns-counter.ts"
import { SwipeHandler } from "./ui/swipe-handler.ts"
import { ItemGetEffector } from "./ui/item-get-effector.ts"
import { LoadingIndicator } from "./ui/loading-indicator.ts"
import { AppleCounter } from "./ui/apple-counter.ts"
import { GlyphCounter } from "./ui/glyph-counter.ts"
import { MessageToast } from "./ui/message-toast.ts"
import { GameScreen } from "./game-screen.ts"
import { ExitButton } from "./ui/exit-button.ts"

import { Minimap } from "./ui/minimap.ts"
import { PlaceLabel } from "./ui/place-label.ts"
import { LetterLabel } from "./ui/letter-label.ts"
import { SoundPlayer } from "./ui/sound-player.ts"
import { SpeechBubble } from "./ui/speech-bubble.ts"
import { SpeedButtons } from "./ui/speed-buttons.ts"
import { ToolButtons } from "./ui/tool-buttons.ts"
import { SpaceHint } from "./ui/space-hint.ts"

globalThis.addEventListener("blur", clearInput)

register(GameScreen, "js-game-screen")
register(FpsMonitor, "js-fps-monitor")
register(VMonitor, "js-v-monitor")
register(KeyMonitor, "js-key-monitor")
register(SwipeHandler, "js-swipe-handler")
register(LoadingIndicator, "js-loading-indicator")
register(AppleCounter, "js-apple-counter")
register(GlyphCounter, "js-glyph-counter")
register(ItemGetEffector, "js-item-get-effector")
register(ActorsCounter, "js-actors-counter")
register(ItemsCounter, "js-items-counter")
register(PropsCounter, "js-props-counter")
register(ExitButton, "js-exit-button")
register(MessageToast, "js-message-toast")
register(SoundPlayer, "js-sound-player")
register(SpeechBubble, "js-speech-bubble")
register(Minimap, "js-minimap")
register(PlaceLabel, "js-place-label")
register(LetterLabel, "js-letter-label")
register(SpeedButtons, "js-speed-buttons")
register(ToolButtons, "js-tool-buttons")
register(SpaceHint, "js-space-hint")
