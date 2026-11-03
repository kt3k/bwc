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
of the catalog listed at once with a labeled sign. Regenerate it after changing
the catalog with `deno task generate-debug`. To its right, walled off and
reached by its "GROUPS" portal (or `#10109,-9995`), the GROUPS area: puzzles run
by finite groups (S3, S4, Z4, D4, Z2xZ2, Z6, ...) built from a few parts, levers
that swap or turn standing stones and a Moai, a mural and a door
(ideas/groups.md). From the GROUPS, the "CAYLEY" portal (or `#10202,-9996`)
leads to the CAYLEY map (block_10200.-10000 and block_10200.-9800): a Cayley
room for every group of order 1 to 20 (54, with their tables copied from
kt3k/group), a gate per element with exactly one open and a lever per generator
moving the opening from g to g·x, the gates laid out as the group's Cayley graph
(tools/generate_cayley_map.ts, written by `deno task generate-debug` too;
docs/group-representations.md).

`http://localhost:8000/#10602,-9996` is the LAMPS map (block_10600.-10000):
groups of permutations shown as permutation matrices of two-state floor lamps.
In each room n x n lamps (row = thing, column = place, exactly one lit in each
row and column, at first the diagonal), levers that permute the columns (S3, D3,
Z3, S4, A4, D4, Z4, Z2xZ2, S5, A5), the target as a plaque grid beside them and
a door that opens on a letter the first time the lamps match it
(tools/generate_lamp_map.ts, written by `deno task generate-debug` too; its
RESET undoes the goals starting with `lamps-`).

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
the "GOALS" portal of the start island. Regenerate it with
`deno task generate-goals` (a few minutes: it draws and solves thousands of
rings, bells, pairs, daises, statues and patrols' ways; `--drafts N`,
`--bell-drafts N`, `--pair-drafts N`, `--clear-drafts N`, `--gaze-drafts N` and
`--patrol-drafts N` draw fewer extra ones).

All the debug places have a portal on the start island, side by side in one
small hall off the start corridor (west, across from the free roam room), each
named on the ground in white letters: DEBUG, GROUPS, CAYLEY, GOALS, ZOO (the
preview zoo, `#10010,10004`), TOWN (the zoo's town square), BAIT and HOMES (the
DEBUG map's rooms of the tools and of the animals) and LAMPS. The hall is built
by tools/start_portals.ts alone; `deno task generate-debug`, `generate-goals`
and `generate-zoo` rebuild it after writing their maps, and
`deno -A tools/start_portals.ts` rebuilds it by itself. In the debug maps, the
portals are named on the ground the same way (START, GROUPS, DEBUG, ...).

# vscode extensions

Install
[./editor/vscode-bw-block-editor-0.4.0.vsix](./editor/vscode-bw-block-editor-0.4.0.vsix)
for editing maps.

Install [vscode-pixeledit](https://github.com/kt3k/vscode-pixeledit) for editing
characters and items.
