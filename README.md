# bwc

> A prototype of topdown 2D game

bwc is fork of https://github.com/kt3k/bw

# development

Clone the repo and run:

```
deno task dev
```

Go to `http://localhost:8000`

`http://localhost:8000/preview.html` shows the catalog preview (every cell /
item / prop / actor with its behavior) and links to the interactive zoo block
where all of them are placed live.

`http://localhost:8000/maps.html` is the world map viewer: every block at once,
from the whole world down to the sprites (drag to pan, wheel to zoom, hover for
the cell details, double click to play from there). It renders one pixel per
cell when zoomed out and builds sprite chunks only for the visible area when
zoomed in. Run `deno task generate-map-index` after adding or removing a block.

`http://localhost:8000/cells.html` lists every cell of the catalog: a patch of
each drawn as in the game (noise, variants, flips, the base edge of walls), its
image, its properties, and the maps that use it.

`http://localhost:8000/#10002,-9996` is the debug map: every actor / item / prop
of the catalog listed at once with a labeled sign. It is also linked by the
"DEBUG" portal to the left of the start corridor. Regenerate it after changing
the catalog with `deno task generate-debug`.

`http://localhost:8000/#10402,-9996` is the GOALS map (block_10400.-10000), for
trying the goals: a bay for every signature of the missing ring (each a real
ring drawn and solved by tools/rings.ts, the WILDS' own first, with signs naming
the signature, the pushes and a solution), a bay for every signature of the bell
out of reach (tools/bells.ts, the same way), a bay for every signature and kind
of the pair (tools/pairs.ts, in a column to the east), a bay for every signature
and kind of the dais to clear (tools/clears.ts, under the pairs), a bay for
every signature of the statue's gaze (tools/gazes.ts, under the daises), a bay
for every signature of the patrol's way (tools/patrols.ts, in a third column),
six stray sheep to herd into their folds (tools/folds.ts, under the patrols), a
bay for every family of the odd one out, and a room where Odradek can be
watched. Goals done there count and give letters like the WILDS' ones (so the
Odradeks turn up, the first in the hall of waystones). The RESET in the map
undoes the goals of this map only (their ids start with `goals-`), takes back
their letters and reloads the map; the WILDS' goals are kept. It is linked by
the "GOALS" portal room, past the DEBUG room along its bottom row. Regenerate it
with `deno task generate-goals` (a few minutes: it draws and solves thousands of
rings, bells, pairs, daises, statues and patrols' ways; `--drafts N`,
`--bell-drafts N`, `--pair-drafts N`, `--clear-drafts N`, `--gaze-drafts N` and
`--patrol-drafts N` draw fewer extra ones).

# vscode extensions

Install
[./editor/vscode-bw-block-editor-0.4.0.vsix](./editor/vscode-bw-block-editor-0.4.0.vsix)
for editing maps.

Install [vscode-pixeledit](https://github.com/kt3k/vscode-pixeledit) for editing
characters and items.
