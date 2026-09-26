// The color palette of kt3k/vscode-pixeledit (src/webview.ts). Nothing
// shown on screen may use any other color (docs/art-guide.md).
//
// Colors are named by hue and shade: shade 1 is the lightest and 4 the
// darkest of the ramp. The grays are ordered from white to black.
//
// Use these constants instead of writing hex literals in code; APIs that
// take a color (effects, cell colors) accept only a `PaletteColor`.

export const Palette = {
  white: "#ffffff",
  gray1: "#bec1be",
  gray2: "#b9bcb9",
  gray3: "#6a6d6a",
  gray4: "#4a4d4a",
  black: "#000000",

  blue1: "#cceaff",
  blue2: "#68a5ff",
  blue3: "#1950c7",
  blue4: "#001480",

  indigo1: "#dddeff",
  indigo2: "#8c9cff",
  indigo3: "#4b30e3",
  indigo4: "#1f008a",

  violet1: "#ecdaff",
  violet2: "#b586ff",
  violet3: "#7322d6",
  violet4: "#38007a",

  magenta1: "#f8d7fd",
  magenta2: "#d975fd",
  magenta3: "#951fa9",
  magenta4: "#540056",

  pink1: "#fcd5f5",
  pink2: "#e377b9",
  pink3: "#9d285c",
  pink4: "#5a0019",

  orange1: "#fcdbcf",
  orange2: "#e58d68",
  orange3: "#983600",
  orange4: "#4f1000",

  brown1: "#f9e7b5",
  brown2: "#d49d29",
  brown3: "#7f4b01",
  brown4: "#3d1c00",

  yellow1: "#f1f0aa",
  yellow2: "#b2af0d",
  yellow3: "#5e6400",
  yellow4: "#253200",

  lime1: "#dafaa9",
  lime2: "#7bc212",
  lime3: "#237601",
  lime4: "#013d00",

  green1: "#c9febc",
  green2: "#56c947",
  green3: "#047e03",
  green4: "#004000",

  teal1: "#c2fad7",
  teal2: "#46cb80",
  teal3: "#007644",
  teal4: "#013924",

  cyan1: "#c4f6f6",
  cyan2: "#47c0c4",
  cyan3: "#006e8a",
  cyan4: "#002e55",
} as const

/** One of the palette colors, as a lowercase `#rrggbb` string */
export type PaletteColor = (typeof Palette)[keyof typeof Palette]

/** All the palette colors */
export const PALETTE: readonly PaletteColor[] = Object.values(Palette)

const PALETTE_SET: ReadonlySet<string> = new Set(PALETTE)

/** true if `color` (a `#rrggbb` string, any case) is a palette color */
export function isPaletteColor(color: string): color is PaletteColor {
  return PALETTE_SET.has(color.toLowerCase())
}
