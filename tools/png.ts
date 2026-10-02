// A minimal PNG encoder (8-bit RGBA, no filtering) for the tools that
// write images, and a decoder for the 8-bit PNGs of the sprites.

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(name: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(name), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** Encodes RGBA pixels (row by row) as a PNG file */
export async function encodePng(
  w: number,
  h: number,
  rgba: Uint8Array,
): Promise<Uint8Array> {
  const raw = new Uint8Array(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) {
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1)
  }
  const zipped = new Uint8Array(
    await new Response(
      new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate")),
    ).arrayBuffer(),
  )
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, w)
  view.setUint32(4, h)
  ihdr.set([8, 6, 0, 0, 0], 8)
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zipped),
    chunk("IEND", new Uint8Array()),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Decodes an 8-bit non-interlaced PNG into RGBA pixels */
export async function decodePng(
  bytes: Uint8Array,
): Promise<{ w: number; h: number; rgba: Uint8Array }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let pos = 8
  let w = 0, h = 0, depth = 0, type = 0
  let palette: Uint8Array | null = null
  let trns: Uint8Array | null = null
  const idat: Uint8Array[] = []
  while (pos < bytes.length) {
    const len = view.getUint32(pos)
    const name = new TextDecoder().decode(bytes.subarray(pos + 4, pos + 8))
    const data = bytes.subarray(pos + 8, pos + 8 + len)
    if (name === "IHDR") {
      w = view.getUint32(pos + 8)
      h = view.getUint32(pos + 12)
      depth = data[8]
      type = data[9]
    } else if (name === "PLTE") palette = data
    else if (name === "tRNS") trns = data
    else if (name === "IDAT") idat.push(data)
    pos += 12 + len
  }
  if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`)
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]
  if (!channels) throw new Error(`unsupported color type ${type}`)
  const zipped = new Blob(idat.map((c) => c.slice())).stream().pipeThrough(
    new DecompressionStream("deflate"),
  )
  const raw = new Uint8Array(await new Response(zipped).arrayBuffer())
  const stride = w * channels
  const rgba = new Uint8Array(w * h * 4)
  let prev = new Uint8Array(stride)
  let p = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[p++]
    const line = raw.slice(p, p + stride)
    p += stride
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      if (filter === 1) line[i] = (line[i] + a) & 255
      else if (filter === 2) line[i] = (line[i] + b) & 255
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255
      else if (filter === 4) line[i] = (line[i] + paeth(a, b, c)) & 255
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      const px = line.subarray(x * channels, (x + 1) * channels)
      switch (type) {
        case 6:
          rgba.set(px, o)
          break
        case 2:
          rgba.set([px[0], px[1], px[2], 255], o)
          break
        case 0:
          rgba.set([px[0], px[0], px[0], 255], o)
          break
        case 4:
          rgba.set([px[0], px[0], px[0], px[1]], o)
          break
        case 3: {
          const i = px[0]
          rgba.set([
            palette![i * 3],
            palette![i * 3 + 1],
            palette![i * 3 + 2],
            trns && i < trns.length ? trns[i] : 255,
          ], o)
          break
        }
      }
    }
    prev = line
  }
  return { w, h, rgba }
}
