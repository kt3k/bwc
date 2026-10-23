// The families of the odd one out (model/odd-one.ts) and their prop
// types, on their own (no imports) so that the oddities' tables can name
// them while the modules are still loading
/**
 * The families: the same thing, many times, one of them different
 * (tools/odd_ones.ts gives each its arrangement)
 */
export const ODD_FAMILIES = [
  /** a row of tulips leaning one way; one leans the other */
  "tulip",
  /** a fairy ring of toadstools; one is upside down */
  "toadstool",
  /** a flock of stone birds looking one way; one looks the other */
  "stonebird",
  /** a row of standing stones; one is cracked */
  "menhir",
  /** a row of posts; one leans */
  "post",
  /** a row of cairns of three stones; one has four */
  "cairn",
  /** a grid of flat stones with an arrow carved; one points aside */
  "arrowstone",
] as const
export type OddFamily = typeof ODD_FAMILIES[number]

/** The prop type of the many of a family */
export const alikeType = (family: string) => `alike-${family}`
/** The prop type of the odd one of a family */
export const unlikeType = (family: string) => `unlike-${family}`
