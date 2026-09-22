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

`http://localhost:8000/#10002,-9996` is the debug map: every actor / item / prop
of the catalog listed at once with a labeled sign. It is also linked by the
"DEBUG" portal to the left of the start corridor. Regenerate it after changing
the catalog with `deno task generate-debug`.

# vscode extensions

Install
[./editor/vscode-bw-block-editor-0.4.0.vsix](./editor/vscode-bw-block-editor-0.4.0.vsix)
for editing maps.

Install [vscode-pixeledit](https://github.com/kt3k/vscode-pixeledit) for editing
characters and items.
