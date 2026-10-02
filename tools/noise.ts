// Deterministic 2D noise for the map generators: an integer hash, value
// noise with smooth interpolation, and fractal (fBm) sums of it.

/** A hash of a lattice point and a seed, in [0, 1] */
export function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Value noise: the lattice hashes, smoothly interpolated */
export function valueNoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const u = smooth(x - xi)
  const v = smooth(y - yi)
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s)
  const c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s)
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v
}

/** Fractal Brownian motion: octaves of value noise, in [0, 1] */
export function fbm(x: number, y: number, s: number, octaves = 5): number {
  let amp = 0.5, freq = 1, sum = 0, norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, y * freq, s + o * 101)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
