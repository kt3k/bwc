import { Item } from "../model/item.ts"
import * as signal from "./signals.ts"

const KEY = "bwc-save-v1"

type SaveData = {
  appleCount?: number
  greenAppleCount?: number
  coinCount?: number
  collectedItemIds?: string[]
  position?: { i: number; j: number }
}

let data: SaveData = {}
let restored = false

function read(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    // localStorage unavailable or corrupted save. Starts fresh.
    return null
  }
}

function write() {
  if (!restored) {
    return
  }
  data.collectedItemIds = Item.serializeCollected()
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // localStorage unavailable. Ignored.
  }
}

/**
 * Restores the saved progress into the signals and the collected item
 * set, and starts persisting further changes.
 */
export function restoreSave() {
  const saved = read()
  data = saved ?? {}
  if (saved) {
    signal.appleCount.update(saved.appleCount ?? 0)
    signal.greenAppleCount.update(saved.greenAppleCount ?? 0)
    signal.coinCount.update(saved.coinCount ?? 0)
    Item.deserializeCollected(saved.collectedItemIds ?? [])
  }
  restored = true
  signal.appleCount.subscribe((v) => {
    data.appleCount = v
    write()
  })
  signal.greenAppleCount.subscribe((v) => {
    data.greenAppleCount = v
    write()
  })
  signal.coinCount.subscribe((v) => {
    data.coinCount = v
    write()
  })
}

/** Returns the saved last position, if any */
export function savedPosition(): { i: number; j: number } | null {
  return data.position ?? read()?.position ?? null
}

/** Persists the last position of the main character */
export function savePosition(i: number, j: number) {
  data.position = { i, j }
  write()
}

/** Clears the saved progress */
export function clearSave() {
  data = {}
  try {
    localStorage.removeItem(KEY)
  } catch {
    // localStorage unavailable. Ignored.
  }
}
