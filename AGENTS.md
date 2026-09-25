## Dev lifecycle

- When changes are made, execute `deno fmt` to format file, check `deno lint` to
  check errors

## Colors

- Everything shown on screen must use only the colors of the palette in
  `tools/palette.ts` (the vscode-pixeledit palette), including UI and effects.
  No alpha blending, gradients, fades or smoothing that would produce in-between
  colors. See docs/art-guide.md. Run `deno task check-palette` after changing
  sprites.

## Git operations

- Commit messages should follow conventional commits
- PR title also follows conventional commmits
- When opened a new PR, open that URL in browser
- When merging PR, use squash and commit and summarize the contents at merge
  time
