/// <reference lib="dom" />
/**
 * Makes the at-limit preview's parts from the real components, today's and
 * the design's (the suggestions preview's capture, run on two trees):
 *
 *   bun design-previews/at-limit/capture/capture.ts
 *
 * For each tree it serves the dashboard with its own dev server (against a
 * stand-in hub that answers nothing), and for each pass loads stage.js into
 * a page of it with the clock held at the records' moment: the dashboard's
 * app.css, the stores seeded from the hub's real records (seed.js), then
 * Stage.svelte drawing every surface. A part marked `data-press` is pressed
 * open before it is read. Today's tree is origin/main, checked out once
 * into $TMPDIR (the stage copied in, the same records); the design's is
 * this checkout. It writes:
 *
 * - `parts.js`: each part's markup as its component drew it, keyed
 *   `<tree>:<pass>:<part>`, and the forks: Fork A's rail and phone rows
 *   without the at-limit dot (`nodot:…`: what TreeMark draws for a status
 *   with no dot), Fork B's line without its text button (`words:…`);
 * - `house.css`, `today.css`: each tree's stylesheet cut to the rules its
 *   parts reach, their faces' `url()`s pointing at `fonts/`;
 * - `fonts/`: the faces the parts drew in.
 */
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { type Browser, chromium } from "playwright-core";

const HERE = import.meta.dir;
const OUT = resolve(HERE, "..");
const ROOT = resolve(HERE, "../../..");
const TODAY = join(process.env.TMPDIR ?? "/tmp", "at-limit-today");
const STAGE_DIR = join("design-previews", "at-limit", "capture");

const records = JSON.parse(await readFile(join(HERE, "records.json"), "utf8"));
/** The held line's own moment: every pass reads the clock there, `after` a minute past its reset. */
const AT: number = records.at;
const AFTER: number = records.stalled.stalled.until + 60_000;

const freePort = (): Promise<number> =>
  new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? done(address.port)
          : fail(new Error("no port"))
      );
    });
  });

/** A hub that is never one: reads refused, its socket echoing, so the page never reaches a real hub. */
const hub = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  fetch: (request, server) =>
    server.upgrade(request)
      ? undefined
      : new Response("no hub", { status: 503 }),
  websocket: {
    message: (socket, message) => {
      socket.send(message);
    },
  },
});

/** Today's tree: origin/main, installed, the stage and its records copied in. */
async function todayTree(): Promise<string> {
  if (!existsSync(TODAY)) {
    const add = Bun.spawnSync(
      ["git", "-C", ROOT, "worktree", "add", "--detach", TODAY, "origin/main"],
      { stderr: "inherit" }
    );
    if (add.exitCode !== 0) {
      throw new Error("git worktree add failed");
    }
  }
  const install = Bun.spawnSync(["bun", "install"], {
    cwd: TODAY,
    stdout: "ignore",
    stderr: "inherit",
  });
  if (install.exitCode !== 0) {
    throw new Error("bun install failed in today's tree");
  }
  await rm(join(TODAY, STAGE_DIR), { recursive: true, force: true });
  await mkdir(join(TODAY, STAGE_DIR), { recursive: true });
  for (const name of ["Stage.svelte", "stage.js", "seed.js", "records.json"]) {
    await cp(join(HERE, name), join(TODAY, STAGE_DIR, name));
  }
  return TODAY;
}

/** One tree's passes: its dev server, a page per pass, every part read; its CSS cut to what they reach. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one tree's whole capture, pass by pass
async function stageOn(
  browser: Browser,
  tree: string,
  name: string,
  passes: [string, number][]
): Promise<{ css: string; parts: Record<string, string> }> {
  const dashboard = join(tree, "apps", "dashboard");
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const vite = Bun.spawn(
    [
      join(dashboard, "node_modules", ".bin", "vite"),
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: dashboard,
      env: {
        ...process.env,
        CAWCO_DEV_HUB_URL: `http://127.0.0.1:${hub.port}`,
        CAWCO_HUB_URL: `http://127.0.0.1:${hub.port}`,
      },
      stdout: "ignore",
      stderr: "inherit",
    }
  );
  try {
    const deadline = Date.now() + 120_000;
    while (
      // biome-ignore lint/performance/noAwaitInLoops: polls the dev server until it answers
      !(await fetch(`${base}/@vite/client`)
        .then((r) => r.ok)
        .catch(() => false))
    ) {
      if (Date.now() > deadline) {
        throw new Error(`vite dev never answered at ${base}`);
      }
      await Bun.sleep(250);
    }
    const parts: Record<string, string> = {};
    let cut: { css: string; fonts: string[] } = { css: "", fonts: [] };
    for (const [pass, time] of passes) {
      const page = await browser.newPage({
        viewport: { width: 1600, height: 1200 },
      });
      await page.clock.setFixedTime(time);
      const errors: string[] = [];
      // The dev server's own hot-reload socket, and the stand-in hub's refusals, aside.
      const aside =
        /WebSocket connection to|\[vite\]|Failed to send error to Vite|503|Failed to load resource/;
      page.on("console", (message) => {
        if (message.type() === "error" && !aside.test(message.text())) {
          errors.push(message.text());
        }
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route(`${base}/__stage`, (route) =>
        route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><html lang="en" style="color-scheme: light"><head><meta charset="utf-8"></head><body></body></html>',
        })
      );
      await page.goto(`${base}/__stage`);
      await page.evaluate((p) => {
        (window as unknown as { __pass: string }).__pass = p;
      }, pass);
      await page.addScriptTag({
        type: "module",
        url: `${base}/@fs${join(tree, STAGE_DIR, "stage.js")}`,
      });
      await page
        .waitForFunction(() => "__staged" in window, null, { timeout: 40_000 })
        .catch((error: Error) => {
          throw new Error(
            `${name} ${pass}: the stage never stood: ${error.message}\n${errors.join("\n")}`
          );
        });
      await page.evaluate(() => document.fonts.ready);
      // Pressed open: each part that says so, its line pressed, and what folds under it let finish.
      for (const button of await page
        .locator('[data-press] button[aria-expanded="false"]')
        .all()) {
        await button.click();
      }
      await page.waitForTimeout(1200);
      if (errors.length > 0) {
        throw new Error(`${name} ${pass}: the stage said errors:\n${errors.join("\n")}`);
      }
      const read = await page.evaluate(readPage);
      for (const [key, html] of Object.entries(read.parts)) {
        parts[`${name}:${key}`] = html;
      }
      // The pressed passes reach every rule the others do, and more: the last pass's cut is the tree's.
      cut = { css: read.css, fonts: read.fonts };
      await page.close();
    }
    // Its faces, from its own dev server while it is up, into fonts/.
    let { css } = cut;
    await mkdir(join(OUT, "fonts"), { recursive: true });
    for (const url of cut.fonts) {
      const absolute = new URL(url, base).href;
      const file = new URL(absolute).pathname.split("/").at(-1) ?? "face.woff2";
      // biome-ignore lint/performance/noAwaitInLoops: a face or two, each written as it comes
      const response = await fetch(absolute);
      if (!response.ok) {
        throw new Error(`${absolute}: ${response.status}`);
      }
      await writeFile(
        join(OUT, "fonts", file),
        new Uint8Array(await response.arrayBuffer())
      );
      css = css.replaceAll(url, `fonts/${file}`);
    }
    return { parts, css };
  } finally {
    vite.kill();
  }
}

/** Every part's markup, and the page's stylesheet cut to the rules they reach (run in the page). */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, its helpers inside it
function readPage() {
  const parts: Record<string, string> = {};
  for (const part of document.querySelectorAll<HTMLElement>("[data-part]")) {
    const key = part.dataset.part ?? "";
    parts[key] = part.innerHTML.replaceAll("<!---->", "").trim();
  }
  /** A selector without its pseudo-classes and pseudo-elements: what it can match at all. */
  const bare = (selector: string): string => {
    let out = "";
    let depth = 0;
    for (let i = 0; i < selector.length; i += 1) {
      const c = selector[i];
      if (c === "\\") {
        if (depth === 0) {
          out += c + (selector[i + 1] ?? "");
        }
        i += 1;
        continue;
      }
      if (depth > 0) {
        if (c === "(") {
          depth += 1;
        } else if (c === ")") {
          depth -= 1;
        }
        continue;
      }
      if (c === ":") {
        let j = i + 1;
        if (selector[j] === ":") {
          j += 1;
        }
        // biome-ignore lint/performance/useTopLevelRegex: it runs in the page, which shares no scope with this module
        while (j < selector.length && /[\w-]/.test(selector[j] ?? "")) {
          j += 1;
        }
        if (selector[j] === "(") {
          depth = 1;
          j += 1;
        }
        i = j - 1;
        continue;
      }
      out += c;
    }
    return out.trim();
  };
  const splitList = (list: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < list.length; i += 1) {
      const c = list[i];
      if (c === "\\") {
        i += 1;
      } else if (c === "(" || c === "[") {
        depth += 1;
      } else if (c === ")" || c === "]") {
        depth -= 1;
      } else if (c === "," && depth === 0) {
        out.push(list.slice(start, i));
        start = i + 1;
      }
    }
    out.push(list.slice(start));
    return out;
  };
  const reaches = (selectorText: string): boolean =>
    splitList(selectorText).some((one) => {
      // biome-ignore lint/performance/useTopLevelRegex: it runs in the page, which shares no scope with this module
      const b = bare(one).replace(/[>+~]\s*$/, "");
      if (!b || b === "&") {
        return true;
      }
      try {
        return document.querySelector(b.replaceAll("&", "")) !== null;
      } catch {
        return true;
      }
    });
  const used = new Set<string>();
  for (const face of document.fonts) {
    if (face.status === "loaded") {
      used.add(
        `${face.family.replaceAll('"', "")}|${face.weight}|${face.style}|${face.unicodeRange}`
      );
    }
  }
  const fonts: string[] = [];
  const keep = (rules: CSSRuleList): string => {
    let text = "";
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        if (reaches(rule.selectorText)) {
          text += `${rule.cssText}\n`;
        }
      } else if (rule instanceof CSSFontFaceRule) {
        const s = rule.style;
        const family = s.getPropertyValue("font-family").replaceAll('"', "");
        const weight = s.getPropertyValue("font-weight") || "normal";
        const style = s.getPropertyValue("font-style") || "normal";
        const range = s.getPropertyValue("unicode-range") || "U+0-10FFFF";
        if (used.has(`${family}|${weight}|${style}|${range}`)) {
          text += `${rule.cssText}\n`;
          for (const m of rule.cssText.matchAll(/url\("?([^")]+)"?\)/g)) {
            fonts.push(m[1] ?? "");
          }
        }
      } else if (
        rule instanceof CSSMediaRule ||
        rule instanceof CSSSupportsRule ||
        rule instanceof CSSContainerRule
      ) {
        const inner = keep(rule.cssRules);
        if (inner) {
          const head = rule.cssText.slice(0, rule.cssText.indexOf("{"));
          text += `${head}{\n${inner}}\n`;
        }
      } else if (rule instanceof CSSLayerBlockRule) {
        const inner = keep(rule.cssRules);
        if (inner) {
          text += `@layer ${rule.name} {\n${inner}}\n`;
        }
      } else if (rule instanceof CSSImportRule) {
        if (rule.styleSheet) {
          text += keep(rule.styleSheet.cssRules);
        }
      } else {
        text += `${rule.cssText}\n`;
      }
    }
    return text;
  };
  let css = "";
  for (const sheet of document.styleSheets) {
    css += keep(sheet.cssRules);
  }
  return { parts, css, fonts: [...new Set(fonts)] };
}

/**
 * The forks, from the design's own parts: Fork A without the dot is the
 * tree mark as TreeMark draws a status with none (no `data-dot`, no dot,
 * no hole cut for it); Fork B in words is the second line without its text
 * button and the stop before it.
 */
function forks(parts: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, html] of Object.entries(parts)) {
    if (/:(rail|home)$/.test(key)) {
      out[key.replace(/^design:/, "nodot:")] = html
        .replace(/ data-dot="held"/g, "")
        .replace(/ style="--dot: var\(--ink-muted\);"/g, "")
        .replace(/--dot: var\(--ink-muted\); ?/g, "")
        .replace(
          /<span data-slot="dot" aria-hidden="true" class="absolute z-5[^"]*"[^>]*><\/span>/g,
          ""
        );
    }
    if (/:(line|pressed)$/.test(key)) {
      out[key.replace(/^design:/, "words:")] = html.replace(
        /<span aria-hidden="true">\s*·\s*<\/span><button data-slot="move-to"[^>]*>[^<]*<\/button>/g,
        ""
      );
    }
  }
  return out;
}

/** The parts the preview's states draw (preview.js), and only those: a tab strip is 54 KB of markup. */
const DRAWN = new Set([
  ...["tabs", "home", "rail", "line", "tray"].map((p) => `today:moves:${p}`),
  ...["tabs", "home", "rail", "line", "pressed", "tray"].map((p) => `design:moves:${p}`),
  "design:resets:home",
  "design:fits:home",
  "design:fits:line",
  "design:fits:pressed",
  "design:after:line",
  "nodot:moves:rail",
  "nodot:moves:home",
  "words:fits:line",
  "words:fits:pressed",
]);

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
try {
  await rm(join(OUT, "fonts"), { recursive: true, force: true });
  const today = await stageOn(browser, await todayTree(), "today", [
    ["moves", AT],
  ]);
  const design = await stageOn(browser, ROOT, "design", [
    ["moves", AT],
    ["resets", AT],
    ["after", AFTER],
    ["fits", AT],
  ]);
  const all = { ...today.parts, ...design.parts, ...forks(design.parts) };
  const parts = Object.fromEntries(
    Object.entries(all).filter(([key]) => DRAWN.has(key))
  );
  const missing = [...DRAWN].filter((key) => !(key in parts));
  if (missing.length > 0) {
    throw new Error(`parts the preview draws were not captured: ${missing.join(", ")}`);
  }

  const head = (tree: string) =>
    `/* ${tree}'s dashboard stylesheet, cut to the rules its captured parts reach (capture/capture.ts). Generated; not edited by hand. */\n`;
  await writeFile(join(OUT, "house.css"), head("The design") + design.css);
  await writeFile(join(OUT, "today.css"), head("Today") + today.css);
  await writeFile(
    join(OUT, "parts.js"),
    `/* Each part's markup as its real component drew it (capture/capture.ts). Generated; not edited by hand. */\nexport const PARTS = ${JSON.stringify(parts, null, 1)};\n`
  );
  console.log(
    `captured ${Object.keys(parts).length} parts; house.css ${(design.css.length / 1024).toFixed(0)} KB, today.css ${(today.css.length / 1024).toFixed(0)} KB`
  );
} finally {
  await browser.close();
  hub.stop(true);
}
