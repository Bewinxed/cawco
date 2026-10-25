/// <reference lib="dom" />
/**
 * Makes the project page options' parts from the dashboard's real parts
 * (the suggestions preview's capture, its stage swapped):
 *
 *   bun design-previews/project-options/capture/capture.ts
 *
 * It serves the dashboard with its own dev server (against a stand-in hub
 * that answers nothing), loads stage.js into a page of it (the dashboard's
 * app.css with this folder's classes, then Stage.svelte mounting every
 * option's part on the owner's real task records), and writes:
 *
 * - `parts.js`: each part's markup as the component drew it;
 * - `house.css`: the dashboard's stylesheet cut to the rules those parts
 *   reach (every token, layer, keyframe and property kept), its faces'
 *   `url()`s pointing at `fonts/`;
 * - `fonts/`: the faces the parts drew in.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const HERE = import.meta.dir;
const OUT = resolve(HERE, "..");
const ROOT = resolve(HERE, "../../..");
const DASHBOARD = join(ROOT, "apps", "dashboard");
const VITE = join(DASHBOARD, "node_modules", ".bin", "vite");

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

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const vite = Bun.spawn(
  [VITE, "dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    cwd: DASHBOARD,
    env: {
      ...process.env,
      CAWCO_DEV_HUB_URL: `http://127.0.0.1:${hub.port}`,
      CAWCO_HUB_URL: `http://127.0.0.1:${hub.port}`,
    },
    stdout: "ignore",
    stderr: "inherit",
  }
);

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
try {
  const deadline = Date.now() + 90_000;
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
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors: string[] = [];
  // The dev server's own hot-reload socket, which a page on a routed document never needs, aside.
  const hot = /WebSocket connection to|\[vite\]|Failed to send error to Vite/;
  page.on("console", (message) => {
    if (message.type() === "error" && !hot.test(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  // A plain document on the dev server's origin, so the stage's modules load from it.
  await page.route(`${base}/__stage`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="en" style="color-scheme: light"><head><meta charset="utf-8"></head><body></body></html>',
    })
  );
  await page.goto(`${base}/__stage`);
  await page.addScriptTag({
    type: "module",
    url: `${base}/@fs${join(HERE, "stage.js")}`,
  });
  await page.waitForFunction(() => "__staged" in window, null, {
    timeout: 120_000,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  if (errors.length > 0) {
    throw new Error(`the stage said errors:\n${errors.join("\n")}`);
  }

  const read = await page.evaluate(() => {
    const parts: Record<string, string> = {};
    for (const part of document.querySelectorAll<HTMLElement>("[data-part]")) {
      const key = part.dataset.part ?? "";
      parts[key] = part.innerHTML.replaceAll("<!---->", "").trim();
    }
    /** A selector without its pseudo-classes and pseudo-elements: what it can match at all. */
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one scan of the selector's characters, escapes and brackets
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
          // Skip the pseudo's name, and its argument when it has one.
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
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one branch per kind of rule the stylesheet holds
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
          const key = `${family}|${weight}|${style}|${range}`;
          if ([...used].some((one) => one === key)) {
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
  });

  await rm(join(OUT, "fonts"), { recursive: true, force: true });
  await mkdir(join(OUT, "fonts"), { recursive: true });
  let { css } = read;
  for (const url of read.fonts) {
    const absolute = new URL(url, base).href;
    const name = new URL(absolute).pathname.split("/").at(-1) ?? "face.woff2";
    // biome-ignore lint/performance/noAwaitInLoops: a face or two, each written as it comes
    const response = await fetch(absolute);
    if (!response.ok) {
      throw new Error(`${absolute}: ${response.status}`);
    }
    await writeFile(
      join(OUT, "fonts", name),
      new Uint8Array(await response.arrayBuffer())
    );
    css = css.replaceAll(url, `fonts/${name}`);
  }
  await writeFile(
    join(OUT, "house.css"),
    `/* The dashboard's stylesheet, cut to the rules the captured parts reach (capture/capture.ts). Generated; not edited by hand. */\n${css}`
  );
  await writeFile(
    join(OUT, "parts.js"),
    `/* Each part's markup as its real component drew it (capture/capture.ts). Generated; not edited by hand. */\nexport const PARTS = ${JSON.stringify(read.parts, null, 1)};\n`
  );
  console.log(
    `captured ${Object.keys(read.parts).length} parts, ${(css.length / 1024).toFixed(0)} KB of CSS, ${read.fonts.length} faces`
  );
} finally {
  await browser.close();
  vite.kill();
  hub.stop(true);
}
