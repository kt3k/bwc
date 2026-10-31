// Text playtest harness: the screen as a map in text, not a picture
// (docs/playtesters.md). One game per player is kept open in the
// background, held still between calls, so what was moved stays moved and
// the world doesn't run on while the player thinks.
//
// node tools/playtest_text.mjs <player-name> "<steps>" [start i,j]
// node tools/playtest_text.mjs <player-name> --stop
//
// The game must be built and served first (deno task build; deno task
// serve). Steps (space separated):
//   up:N down:N left:N right:N   walk N cells (a step bumps into what is there)
//   space                        dig / fish / jump / put the chosen tool
//   tool                         cycle the tool (none -> apple -> fish -> none)
//   wait:MS                      let time run (1000 = 1 second)
//   map                          the minimap, in text
//   look                         a screenshot too (its path is printed)
// After the steps the screen is printed as text: a grid of the cells
// around you (you are @ at 0,0; up is -y), the things on it in plain
// words (tools/playtest_looks.json: what they look like, never what they
// are), what was said, and what moved while the steps ran.
import fs from "node:fs"
import http from "node:http"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const base = `${process.env.PLAYTEST_DIR ?? "/tmp/bwc-playtest"}/`
const url = process.env.PLAYTEST_URL ?? "http://localhost:8000/"
const [, , name, stepsArg = "", start] = process.argv
if (!name) {
  console.log(
    'usage: node tools/playtest_text.mjs <player-name> "<steps>" [start i,j]',
  )
  process.exit(1)
}
const sockDir = `${base}sock`
fs.mkdirSync(sockDir, { recursive: true })
const sock = `${sockDir}/${name}.sock`

if (stepsArg === "--daemon") await daemon()
else await client()

// ---------------------------------------------------------------------
// the client: one call

function post(body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: sock, path: "/", method: "POST" },
      (res) => {
        let out = ""
        res.setEncoding("utf8")
        res.on("data", (d) => out += d)
        res.on("end", () => resolve(out))
      },
    )
    req.on("error", reject)
    req.end(JSON.stringify(body))
  })
}

async function client() {
  if (stepsArg === "--stop") {
    await post({ stop: true }).catch(() => {})
    console.log("stopped")
    return
  }
  let alive = await post({ ping: true }).then(() => true, () => false)
  if (!alive) {
    fs.rmSync(sock, { force: true })
    const child = spawn(
      process.execPath,
      [fileURLToPath(import.meta.url), name, "--daemon", start ?? ""],
      { detached: true, stdio: "ignore" },
    )
    child.unref()
    for (let k = 0; k < 120 && !alive; k++) {
      await new Promise((r) => setTimeout(r, 500))
      alive = await post({ ping: true }).then(() => true, () => false)
    }
    if (!alive) {
      console.log("the game didn't open (is it served on port 8000?)")
      process.exit(1)
    }
  }
  process.stdout.write(await post({ steps: stepsArg }))
}

// ---------------------------------------------------------------------
// the daemon: one game, kept open

async function daemon() {
  const { chromium } = await import("playwright").catch(() =>
    import("/opt/node22/lib/node_modules/playwright/index.mjs")
  )
  const looks = JSON.parse(
    fs.readFileSync(new URL("./playtest_looks.json", import.meta.url)),
  )
  const ctx = await chromium.launchPersistentContext(
    `${base}profiles/${name}`,
    {
      viewport: { width: 420, height: 520 },
      ...(process.env.PLAYTEST_CHROME
        ? { executablePath: process.env.PLAYTEST_CHROME }
        : {}),
    },
  )
  const page = ctx.pages()[0] ?? await ctx.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  const startAt = process.argv[4]
  await page.goto(`${url}?playtest${startAt ? `#${startAt}` : ""}`)
  // till the game is in (the curtain up) and the screen is filled
  for (let k = 0; k < 120; k++) {
    const ready = await page.evaluate(() =>
      !!globalThis.__playtest &&
      getComputedStyle(document.querySelector(".curtain")).opacity === "0" &&
      globalThis.__playtest.view().cells.some((r) => r.trim())
    ).catch(() => false)
    if (ready) break
    await page.waitForTimeout(500)
  }
  await page.waitForTimeout(500)
  await page.evaluate(() => globalThis.__playtest.pause())
  const shotsDir = `${base}shots/${name}`
  fs.mkdirSync(shotsDir, { recursive: true })

  let idle
  const keepAlive = () => {
    clearTimeout(idle)
    // gone after an hour with no call
    idle = setTimeout(() => quit(), 60 * 60 * 1000)
  }
  const server = http.createServer(async (req, res) => {
    let body = ""
    for await (const d of req) body += d
    const msg = JSON.parse(body || "{}")
    keepAlive()
    if (msg.ping) return res.end("ok")
    if (msg.stop) {
      res.end("ok")
      return quit()
    }
    try {
      res.end(await run(page, msg.steps ?? "", looks, shotsDir, errors))
    } catch (e) {
      res.end(`(harness error: ${e.message})\n`)
    }
  })
  const quit = async () => {
    server.close()
    fs.rmSync(sock, { force: true })
    await ctx.close().catch(() => {})
    process.exit(0)
  }
  server.listen(sock)
  keepAlive()
}

const KEY = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
}

/** Runs the steps with the world going, then holds it still and tells */
async function run(page, stepsArg, looks, shotsDir, errors) {
  const out = []
  const said = []
  const seenSaid = new Set()
  const texts = async () => {
    for (const sel of [".js-message-toast", ".js-speech-bubble"]) {
      const t = await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        return el && !el.classList.contains("hidden")
          ? el.textContent.trim()
          : ""
      }, sel)
      if (t && !seenSaid.has(t)) {
        seenSaid.add(t)
        said.push(`${sel.includes("speech") ? "said" : "message"}: ${t}`)
      }
    }
  }
  const views = []
  const snap = async () => views.push(await view(page))
  let wantMap = false
  let wantLook = false
  await snap()
  await page.evaluate(() => globalThis.__playtest.resume())
  try {
    for (const s of stepsArg.split(/\s+/).filter(Boolean)) {
      const [cmd, arg] = s.split(":")
      if (KEY[cmd]) {
        for (let k = 0; k < Number(arg ?? 1); k++) {
          await page.keyboard.down(KEY[cmd])
          await page.waitForTimeout(60)
          await page.keyboard.up(KEY[cmd])
          await page.waitForTimeout(260)
          await texts()
          if (k % 3 === 2) await snap()
        }
      } else if (cmd === "space") {
        await page.keyboard.press("Space")
        await page.waitForTimeout(400)
        await texts()
      } else if (cmd === "tool") {
        await page.keyboard.press("x")
        await page.waitForTimeout(200)
        await texts()
      } else if (cmd === "wait") {
        const end = Date.now() + Number(arg)
        while (Date.now() < end) {
          await page.waitForTimeout(400)
          await texts()
          await snap()
        }
      } else if (cmd === "map") wantMap = true
      else if (cmd === "look") wantLook = true
      else out.push(`(unknown step ${s})`)
    }
    await page.waitForTimeout(300)
    await texts()
    await snap()
  } finally {
    await page.evaluate(() => globalThis.__playtest.pause())
  }
  const now = views[views.length - 1]
  out.push(render(now, looks))
  out.push(said.length ? said.join("\n") : "nothing said")
  out.push(motion(views, looks))
  if (wantMap) out.push(await minimap(page))
  if (wantLook) {
    const path = `${shotsDir}/${Date.now() % 100000}.png`
    await page.screenshot({ path })
    out.push(`screenshot: ${path}`)
  }
  out.push(await status(page, now))
  if (errors.length) out.push(`page errors: ${errors.splice(0).join(" | ")}`)
  return out.join("\n\n") + "\n"
}

const view = (page) => page.evaluate(() => globalThis.__playtest.view())

/** The palette's color names (util/palette.ts), for the flecks */
const COLOR_NAMES = Object.fromEntries(
  [
    ...fs.readFileSync(new URL("../util/palette.ts", import.meta.url), "utf8")
      .matchAll(/^\s+([a-z]+)\d*: "(#[0-9a-f]{6})"/gm),
  ]
    .map(([, name, hex]) => [hex, name]),
)
/** An effect's words: its look, or "a fleck of <color>" */
const effectWords = (look) =>
  look.replace(/#[0-9a-f]{6}/, (hex) => COLOR_NAMES[hex] ?? "color")

// ---------------------------------------------------------------------
// the screen in text

/** What a thing looks like, in words */
function lookOf(looks, kind, key) {
  const l = looks[kind]?.[key]
  if (typeof l === "string") return l
  if (l?.look) return l.look
  return `something not described yet (${kind})`
}

/** The letters for the things (the terrain has the signs, and v for a way down) */
const SYMBOLS = "abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUWXYZ0123456789"
  .split("")

/**
 * The grid, its key, and the things that share a cell. Terrain takes a
 * character of its own kind (tools/playtest_looks.json, cells: sym);
 * every distinct thing on top a letter, the same look the same letter
 */
function render(v, looks) {
  const W = v.cells[0]?.length ?? 0
  const H = v.cells.length
  const grid = v.cells.map((row) =>
    [...row].map((c) => {
      if (c === " ") return " "
      const l = looks.cells[v.cellSrc[c]]
      return l?.sym ?? "?"
    })
  )
  const terrain = new Map()
  for (const row of v.cells) {
    for (const c of row) {
      if (c === " ") continue
      const l = looks.cells[v.cellSrc[c]]
      const sym = l?.sym ?? "?"
      const words = l?.look ?? "unknown ground"
      if (!terrain.has(sym)) terrain.set(sym, new Set())
      terrain.get(sym).add(words)
    }
  }
  const symOf = new Map()
  const at = new Map()
  const put = (i, j, words) => {
    if (!symOf.has(words)) symOf.set(words, SYMBOLS[symOf.size] ?? "+")
    const key = `${i},${j}`
    if (!at.has(key)) at.set(key, [])
    at.get(key).push(words)
    const x = i - v.i0, y = j - v.j0
    if (y >= 0 && y < H && x >= 0 && x < W) grid[y][x] = symOf.get(words)
  }
  for (const p of v.props) put(p.i, p.j, lookOf(looks, "props", p.what))
  for (const it of v.items) put(it.i, it.j, lookOf(looks, "items", it.what))
  for (const a of v.actors) put(a.i, a.j, lookOf(looks, "actors", a.what))
  grid[v.me.j - v.j0][v.me.i - v.i0] = "@"
  const lines = []
  const rel = (n, me) => `${n - me >= 0 ? "+" : ""}${n - me}`
  lines.push(
    `the screen (${W} x ${H} cells; you are @ at 0,0 facing ${v.me.dir}; ` +
      `x grows right, y grows down; the left edge is x=${
        rel(v.i0, v.me.i)
      }, the top edge y=${rel(v.j0, v.me.j)}):`,
  )
  for (let y = 0; y < H; y++) {
    lines.push(`${rel(v.j0 + y, v.me.j).padStart(4)} ${grid[y].join("")}`)
  }
  lines.push("key:")
  lines.push("  @ you")
  for (const [sym, words] of terrain) {
    lines.push(`  ${sym} ${[...words].join(" / ")}`)
  }
  for (const [words, sym] of symOf) lines.push(`  ${sym} ${words}`)
  const shared = [...at].filter(([, w]) => w.length > 1)
  if (shared.length) {
    lines.push("on the same cell (the one on top is shown):")
    for (const [key, w] of shared) {
      const [i, j] = key.split(",").map(Number)
      lines.push(
        `  ${rel(i, v.me.i)},${rel(j, v.me.j)}: ${
          [...w].reverse().join(", under it ")
        }`,
      )
    }
  }
  if (v.effects.length) {
    const byLook = new Map()
    for (const e of v.effects) {
      if (!byLook.has(e.look)) byLook.set(e.look, [])
      byLook.get(e.look).push(`${rel(e.i, v.me.i)},${rel(e.j, v.me.j)}`)
    }
    lines.push("in the air / on the ground just now:")
    for (const [look, cells] of byLook) {
      lines.push(`  ${effectWords(look)}: ${cells.join(" ")}`)
    }
  }
  return lines.join("\n")
}

/** What moved, came or went while the steps ran (seen ~1 s apart) */
function motion(views, looks) {
  const first = views[0], last = views[views.length - 1]
  const me = last.me
  const rel = (i, j) =>
    `${i - me.i >= 0 ? "+" : ""}${i - me.i},${j - me.j >= 0 ? "+" : ""}${
      j - me.j
    }`
  const byId = (v) => new Map(v.actors.map((a) => [a.id, a]))
  const a0 = byId(first), a1 = byId(last)
  const lines = []
  for (const [id, a] of a1) {
    const words = lookOf(looks, "actors", a.what)
    const was = a0.get(id)
    if (!was) {
      lines.push(`  came into sight: ${words} (now at ${rel(a.i, a.j)})`)
    } else if (was.i !== a.i || was.j !== a.j) {
      lines.push(
        `  moved: ${words}, ${rel(was.i, was.j)} -> ${rel(a.i, a.j)}`,
      )
    }
  }
  for (const [id, a] of a0) {
    if (a1.has(id)) continue
    // gone from the screen, or gone (taken, sunk, eaten)
    lines.push(
      `  no longer seen: ${lookOf(looks, "actors", a.what)} (was at ${
        rel(a.i, a.j)
      })`,
    )
  }
  const key = (p) => `${p.i},${p.j}`
  const p0 = new Map(first.props.map((p) => [key(p), p.what]))
  for (const p of last.props) {
    const was = p0.get(key(p))
    if (was && was !== p.what) {
      lines.push(
        `  changed: at ${rel(p.i, p.j)}, ${lookOf(looks, "props", was)} -> ${
          lookOf(looks, "props", p.what)
        }`,
      )
    }
  }
  const flying = new Map()
  for (const v of views) {
    for (const e of v.effects) {
      if (!flying.has(e.look)) flying.set(e.look, new Set())
      flying.get(e.look).add(rel(e.i, e.j))
    }
  }
  for (const [look, cells] of flying) {
    if (cells.size > 1) {
      lines.push(
        `  seen moving: ${effectWords(look)}, over ${
          [...cells].slice(0, 12).join(" ")
        }`,
      )
    }
  }
  return lines.length ? `while you went:\n${lines.join("\n")}` : "nothing moved"
}

/** The minimap as the player sees it, a character a pixel (4 cells) */
async function minimap(page) {
  const rows = await page.evaluate(() => {
    const c = document.querySelector(".js-minimap canvas")
    const ctx = c.getContext("2d")
    const { data, width, height } = ctx.getImageData(
      0,
      0,
      c.width,
      c.height,
    )
    const rows = []
    for (let y = 0; y < height; y++) {
      let r = ""
      for (let x = 0; x < width; x++) {
        const k = (y * width + x) * 4
        r += `${data[k]},${data[k + 1]},${data[k + 2]},${data[k + 3]};`
      }
      rows.push(r)
    }
    return rows
  })
  // the minimap's colors (game/ui/minimap.ts)
  const SYM = {
    "185,188,185": ".", // ground
    "74,77,74": "#", // wall, rock, trees
    "255,255,255": "_", // ice
    "241,240,170": "=", // a narrow way through
  }
  const lines = rows.map((r) =>
    r.split(";").filter(Boolean).map((px) => {
      const [rr, g, b, a] = px.split(",").map(Number)
      if (a === 0) return " "
      if (`${rr},${g},${b}` in SYM) return SYM[`${rr},${g},${b}`]
      if (b > rr && b > g) return "~" // water
      return "@" // you
    }).join("")
  )
  return [
    "the minimap (a character for 4 x 4 cells, you in the middle as @):",
    ...lines,
    "  . open ground   # walls, rock, trees   ~ water   _ ice   = a narrow way through",
  ].join("\n")
}

async function status(page, v) {
  const s = await page.evaluate(() => ({
    save: JSON.parse(localStorage.getItem("bwc-save-v1") ?? "{}"),
    place: document.querySelector(".js-place-text")?.textContent ?? "",
    space: document.querySelector(".js-space-hint img")?.alt ?? "",
  }))
  // the picture beside SPACE at the bottom of the screen, in words
  const SPACE = {
    JUMP: "an arrow pointing up",
    DIG: "a small spade over a mound",
    APPLE: "an apple",
    FISH: "a fish",
  }
  return `you: ${v.me.i},${v.me.j}  coins: ${s.save.coinCount ?? 0}  ` +
    `apples: ${s.save.appleCount ?? 0}  place: ${s.place}\n` +
    `the picture beside SPACE: ${SPACE[s.space] ?? "none"}`
}
