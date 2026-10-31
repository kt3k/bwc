// Playtest harness, the image one: the screen as a screenshot
// (docs/playtesters.md). It runs on the same open game as the text one
// (tools/playtest_text.mjs): one game per player kept open in the
// background and held still between calls, so what was moved stays moved
// and nothing is lost to a reload.
//
// node tools/playtest.mjs <player-name> "<steps>" [start i,j]
// node tools/playtest.mjs <player-name> --stop
//
// The game must be built and served first (deno task build; deno task
// serve). Steps (space separated):
//   up:N down:N left:N right:N   walk N cells (a step bumps into what is there)
//   space                        dig / fish / jump / put the chosen tool
//   tool                         cycle the tool (none -> apple -> fish -> none)
//   map                          tap the minimap (opens it big / closes it)
//   wait:MS                      let time run (1000 = 1 second)
//   shot                         take a screenshot (its path is printed)
// A screenshot is always taken at the end; what was said is printed too.
process.env.PLAYTEST_MODE = "image"
await import("./playtest_text.mjs")
