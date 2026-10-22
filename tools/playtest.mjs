// Playtest harness: one call = open the game (resuming the player's own
// save), do the steps, report what is on screen, close.
//
// node tools/playtest.mjs <player-name> "<steps>" [start i,j]
//
// The game must be built and served first (deno task build; deno task
// serve). Each player's save, and the screenshots, are kept under
// $PLAYTEST_DIR (default /tmp/bwc-playtest). See docs/playtesters.md.
//
// steps (space separated):
//   up:N down:N left:N right:N   walk N cells (a step bumps into what is there)
//   space                        dig / fish / jump / put the chosen tool
//   tool                         cycle the tool (none -> apple -> fish -> none)
//   map                          tap the minimap (opens it big / closes it)
//   wait:MS                      wait (1000 = 1 second)
//   shot                         take a screenshot (its path is printed)
// A screenshot is always taken at the end.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs"
const [, , name, stepsArg = "", start] = process.argv
if (!name) {
  console.log(
    'usage: node tools/playtest.mjs <player-name> "<steps>" [start i,j]',
  )
  process.exit(1)
}
const base = `${process.env.PLAYTEST_DIR ?? "/tmp/bwc-playtest"}/`
const ctx = await chromium.launchPersistentContext(`${base}profiles/${name}`, {
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  viewport: { width: 420, height: 520 },
})
const page = ctx.pages()[0] ?? await ctx.newPage()
const errors = []
page.on("pageerror", (e) => errors.push(e.message))
await page.goto(`http://localhost:8000/${start ? `#${start}` : ""}`)
await page.waitForTimeout(4000)
const shotsDir = `${base}shots/${name}`
await import("node:fs").then((fs) =>
  fs.mkdirSync(shotsDir, { recursive: true })
)
let n = Date.now() % 100000
const seen = new Set()
const texts = async () => {
  for (const sel of [".js-message-toast", ".js-speech-bubble"]) {
    const el = page.locator(sel)
    const hidden = await el.evaluate((e) => e.classList.contains("hidden"))
    if (hidden) continue
    const t = (await el.textContent())?.trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      console.log(`  ${sel.includes("speech") ? "speech" : "message"}: ${t}`)
    }
  }
}
const shot = async () => {
  const path = `${shotsDir}/${n++}.png`
  await page.screenshot({ path })
  console.log(`  screenshot: ${path}`)
}
const KEY = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
}
for (const s of stepsArg.split(/\s+/).filter(Boolean)) {
  const [cmd, arg] = s.split(":")
  if (KEY[cmd]) {
    for (let k = 0; k < Number(arg ?? 1); k++) {
      await page.keyboard.down(KEY[cmd])
      await page.waitForTimeout(60)
      await page.keyboard.up(KEY[cmd])
      await page.waitForTimeout(260)
      await texts()
    }
  } else if (cmd === "space") {
    await page.keyboard.press("Space")
    await page.waitForTimeout(400)
    await texts()
  } else if (cmd === "map") {
    await page.locator(".js-minimap").click()
    await page.waitForTimeout(300)
  } else if (cmd === "tool") {
    await page.keyboard.press("x")
    await page.waitForTimeout(200)
    await texts()
  } else if (cmd === "wait") {
    const end = Date.now() + Number(arg)
    while (Date.now() < end) {
      await page.waitForTimeout(400)
      await texts()
    }
  } else if (cmd === "shot") await shot()
  else console.log(`  (unknown step ${s})`)
}
await page.waitForTimeout(300)
await texts()
await shot()
const save = await page.evaluate(() => localStorage.getItem("bwc-save-v1"))
const s = JSON.parse(save ?? "{}")
console.log(
  `position: ${s.position ? `${s.position.i},${s.position.j}` : "?"}  coins: ${
    s.coinCount ?? 0
  }  apples: ${s.appleCount ?? 0}  place: ${await page.locator(".js-place-text")
    .textContent()}`,
)
if (errors.length) console.log("page errors:", errors.join(" | "))
await ctx.close()
