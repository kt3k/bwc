import { memoizedLoading } from "./memo.ts"

async function loadImage_(path: string): Promise<ImageBitmap> {
  const res = await fetch(path)
  if (!res.ok) {
    throw new Error(`Failed to load image from ${path}: ${res.statusText}`)
  }
  const blob = await res.blob()
  return createImageBitmap(blob)
}

/**
 * Load a image from a path.
 * It caches the promise of the loading image. If the image is used somewhere in the system,
 * it will be returned from the cached promise.
 */
export const loadImage = memoizedLoading(loadImage_)

/** Load JSON from a URL */
// deno-lint-ignore no-explicit-any
async function loadJson_(url: string): Promise<any> {
  // always revalidated: a catalog cached from an older version would not
  // know the types that the (fresh) maps use
  const res = await fetch(url, { cache: "no-cache" })
  if (!res.ok) {
    throw new Error(`Failed to load text from ${url}: ${res.statusText}`)
  }
  return res.json()
}

export const loadJson = memoizedLoading(loadJson_)
