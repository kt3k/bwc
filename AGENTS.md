## Dev lifecycle

- When changes are made, execute `deno fmt` to format file, check `deno lint` to
  check errors

## Colors

- Everything shown on screen must use only the colors of the palette in
  `util/palette.ts` (the vscode-pixeledit palette), including UI and effects. No
  alpha blending, gradients, fades or smoothing that would produce in-between
  colors. See docs/art-guide.md.
- In code, use the `Palette` constants (e.g. `Palette.gray2`) instead of hex
  literals; color parameters are typed `PaletteColor`.
- Run `deno task check-palette` after changing sprites, the catalog or the page.
- Item sprites (`static/item/`) are wrapped in a 1px ring of outer pixels in
  `Palette.gray2` just outside their outline, like the apple, and the outline is
  black only. Fix both with `deno task item-ring <png>`; `check-palette`
  enforces it. See "アイテムの外周 ピクセル" in docs/art-guide.md.
- An item's pickup lines use its main color (the color used most in its sprite).
  After changing an item sprite, run `deno -A tools/item_colors.ts`;
  `check-palette` checks the catalog colors are up to date.

## Git operations

- Commit messages should follow conventional commits
- PR title also follows conventional commmits
- When opened a new PR, open that URL in browser
- When merging PR, use squash and commit and summarize the contents at merge
  time
