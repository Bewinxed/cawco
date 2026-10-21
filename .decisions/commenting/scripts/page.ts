/**
 * Renders page.oui as CawCo serves a decision page, and proves it:
 * - the program checked by the hub's own `checkProgram` (refused in its
 *   words if the hub would refuse it);
 * - the page the hub serves (`programHost`) around the decision host bundle
 *   core builds (`buildDecisionHost`), each Image's file at its address;
 * - a bridge on `window.cawco` as the overlay puts there, so the options are
 *   live picks;
 * - at 1440×900 in playwright-core's Chromium: every card has its options
 *   (`data-option`) and exactly one Recommended, a pick drawn as chosen
 *   brings its Continue, and nothing overflows or overlaps; each card
 *   captured under captures/.
 *
 *   bun .decisions/commenting/scripts/page.ts
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { buildDecisionHost } from "../../../packages/core/src/decision-host.ts";
import {
  checkProgram,
  programHost,
} from "../../../packages/hub/src/decision-program.ts";

const HERE = join(import.meta.dirname, "..");
const raw = await readFile(join(HERE, "page.oui"), "utf8");
const checked = checkProgram(raw);
console.log(`checkProgram: kept “${checked.read.title}”, dropped ${JSON.stringify(checked.dropped)}`);
const images = [...new Set(checked.read.images)];
const files = Object.fromEntries(images.map((name) => [name, `files/${name}`]));
const missing = (
  await Promise.all(images.map(async (name) => ((await Bun.file(join(HERE, name)).exists()) ? null : name)))
).filter(Boolean);
if (missing.length > 0) {
  throw new Error(`No file beside page.oui for: ${missing.join(", ")}`);
}
const host = await buildDecisionHost();
const BRIDGE = `<script>
  // The overlay's bridge (preview-overlay pick.ts), as far as the page reads it.
  (() => {
    const listeners = new Set();
    let picks = {};
    const tell = () => listeners.forEach((listener) => listener(picks));
    window.cawco = {
      choose: async (choice, option) => {
        picks = { ...picks, [choice]: { options: option === null ? [] : [].concat(option) } };
        tell();
      },
      note: async () => {},
      on: (_event, listener) => { listeners.add(listener); listener(picks); return () => listeners.delete(listener); },
      send: async () => {},
      set: async () => {},
    };
  })();
</script>`;
const html = programHost(checked.program, checked.read.title, files).replace(
  "</title>",
  `</title>\n${BRIDGE}`
);

const TYPES: Record<string, string> = { css: "text/css", js: "text/javascript" };

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/") {
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (path.startsWith("/__cawco/decision/")) {
      const file = host.get(path.slice("/__cawco/decision/".length));
      if (file) {
        const type = TYPES[path.slice(path.lastIndexOf(".") + 1)] ?? "application/octet-stream";
        return new Response(file, { headers: { "content-type": type } });
      }
    }
    if (path.startsWith("/files/")) {
      const file = Bun.file(join(HERE, decodeURIComponent(path.slice("/files/".length))));
      if (await file.exists()) { return new Response(file); }
    }
    return new Response("Not found", { status: 404 });
  },
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") { errors.push(message.text()); }
});
page.on("requestfailed", (request) => errors.push(`failed ${request.url()}`));
page.on("response", (response) => {
  if (response.status() >= 400) { errors.push(`${response.status()} ${response.url()}`); }
});
await page.goto(`http://127.0.0.1:${server.port}/`);
await page.waitForSelector("[data-cawco-choice]");
await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
});
await page.waitForTimeout(500);

// The page's words and its count agree: the title names as many picks as the counter counts.
const counter = await page.evaluate(
  // biome-ignore lint/performance/useTopLevelRegex: this function is serialised into the page; nothing outside it reaches there.
  () => /\d+ of \d+ picked/.exec(document.body.innerText)?.[0] ?? "no counter"
);
const title = await page.evaluate(() => document.querySelector("h1")?.textContent?.trim() ?? "no title");
console.log(`title “${title}”, counter “${counter}”`);

// Every card: its options, one Recommended, picks enabled.
const cards = await page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>("[data-cawco-choice]")].map((card) => ({
    id: card.dataset.cawcoChoice,
    question: card.querySelector("h2")?.textContent?.trim(),
    options: [...card.querySelectorAll<HTMLElement>("[data-option]")].map((option) => ({
      id: option.dataset.option,
      enabled: !(option as HTMLButtonElement).disabled && option.getAttribute("aria-disabled") !== "true",
    })),
    recommended: [...card.querySelectorAll("[data-slot=option-cell]")].filter((cell) =>
      [...cell.querySelectorAll("span")].some((span) => span.textContent === "Recommended")
    ).length,
    images: [...card.querySelectorAll("img")].map((image) => ({
      src: image.getAttribute("src"),
      loaded: image.complete && image.naturalWidth > 0,
    })),
  }))
);
let wiring = 0;
for (const card of cards) {
  const ok =
    card.options.length >= 2 &&
    card.options.every((option) => option.enabled) &&
    card.recommended === 1 &&
    card.images.every((image) => image.loaded);
  if (!ok) { wiring += 1; }
  console.log(
    `card ${card.id}: ${card.options.length} options [${card.options.map((o) => `${o.id}${o.enabled ? "" : " (disabled)"}`).join(", ")}], recommended ${card.recommended}, images ${card.images.filter((i) => i.loaded).length}/${card.images.length} loaded — ${ok ? "ok" : "FAIL"}`
  );
}

// A pick reaches the card: the bridge's picks draw the option chosen and bring Continue.
for (const card of cards) {
  const option = card.options.find((one) => one.id)?.id ?? "";
  // biome-ignore lint/performance/noAwaitInLoops: picks reach the bridge one at a time, as a person makes them.
  await page.evaluate(([choice, pick]) => (window as unknown as { cawco: { choose: (c: string, o: string) => Promise<void> } }).cawco.choose(choice, pick), [card.id ?? "", option]);
}
await page.waitForTimeout(300);
const picked = await page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>("[data-cawco-choice]")].map((card) => ({
    id: card.dataset.cawcoChoice,
    chosen: [...card.querySelectorAll<HTMLElement>("[data-option]")].filter((option) => option.getAttribute("aria-checked") === "true" || option.hasAttribute("data-chosen") || option.getAttribute("aria-pressed") === "true").map((option) => option.dataset.option),
    continue: !!card.querySelector("[data-continue]"),
  }))
);
for (const card of picked) {
  const ok = card.chosen.length === 1 && card.continue;
  if (!ok) { wiring += 1; }
  console.log(`pick ${card.id}: chosen ${JSON.stringify(card.chosen)}, Continue ${card.continue ? "shown" : "missing"} — ${ok ? "ok" : "FAIL"}`);
}
// Back to unpicked for the captures.
for (const card of cards) {
  // biome-ignore lint/performance/noAwaitInLoops: picks reach the bridge one at a time, as a person makes them.
  await page.evaluate((choice) => (window as unknown as { cawco: { choose: (c: string, o: null) => Promise<void> } }).cawco.choose(choice, null), card.id ?? "");
}
await page.waitForTimeout(300);

// Sweep: the page scrolls only down; nothing in a card runs past its box; no two options overlap.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the sweep runs in the page, so it is one function the browser is handed whole.
const found = await page.evaluate(() => {
  const out: string[] = [];
  const root = document.documentElement;
  if (root.scrollWidth > root.clientWidth) { out.push(`page scrolls sideways ${root.scrollWidth}>${root.clientWidth}`); }
  const box = (el: Element) => el.getBoundingClientRect();
  /** Inside a part the card holds folded shut (its note field, Decision.svelte's fold): drawn nowhere. */
  const folded = (el: Element) => {
    for (let at: Element | null = el; at && !at.matches("[data-cawco-choice]"); at = at.parentElement) {
      if (at.getBoundingClientRect().height === 0 && getComputedStyle(at).overflowY !== "visible") { return true; }
    }
    return false;
  };
  for (const card of document.querySelectorAll("[data-cawco-choice]")) {
    const edge = box(card);
    for (const el of card.querySelectorAll("*")) {
      const s = getComputedStyle(el);
      if (s.display === "none" || el.clientWidth <= 2 || el.closest("svg") || folded(el)) { continue; }
      const trimmed = (s as CSSStyleDeclaration & { textBoxTrim?: string }).textBoxTrim;
      // biome-ignore lint/performance/useTopLevelRegex: this function is serialised into the page; nothing outside it reaches there.
      const scrolls = (overflow: string) => /(auto|scroll)/.test(overflow);
      if (el.scrollWidth > el.clientWidth + 1 && !scrolls(s.overflowX)) { out.push(`overflow-x ${el.scrollWidth}>${el.clientWidth}: ${el.tagName} “${el.textContent?.trim().slice(0, 40)}”`); }
      if (el.scrollHeight > el.clientHeight + 1 && s.overflowY !== "visible" && !scrolls(s.overflowY) && (!trimmed || trimmed === "none")) { out.push(`overflow-y ${el.scrollHeight}>${el.clientHeight}: ${el.tagName} “${el.textContent?.trim().slice(0, 40)}”`); }
      const r = box(el);
      if (r.width > 0 && (r.left < edge.left - 0.5 || r.right > edge.right + 0.5)) { out.push(`past its card: ${el.tagName} “${el.textContent?.trim().slice(0, 40)}”`); }
    }
    const cells = [...card.querySelectorAll("[data-slot=option-cell]")];
    cells.forEach((a, i) => {
      for (const b of cells.slice(i + 1)) {
        const x = box(a);
        const y = box(b);
        if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 0.5 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 0.5) { out.push(`options overlap in ${(card as HTMLElement).dataset.cawcoChoice}`); }
      }
    });
    for (const image of card.querySelectorAll("img")) {
      const cell = image.closest("[data-slot=option-cell], [data-slot=decision-media]");
      if (cell) {
        const r = box(image);
        const c = box(cell);
        if (r.left < c.left - 0.5 || r.right > c.right + 0.5) { out.push(`picture past its cell: ${image.getAttribute("src")}`); }
      }
    }
  }
  return out;
});
console.log(`page sweep: ${found.length}`);
for (const line of found) { console.log(`  ${line}`); }

// The proof above ran at 1440×900. The captures take the page at its whole
// height, so the sticky Send bar stands at the page's foot, not over a card.
const tall = await page.evaluate(() => document.documentElement.scrollHeight);
await page.setViewportSize({ width: 1440, height: tall });
await page.waitForTimeout(300);
for (const card of cards) {
  const locator = page.locator(`[data-cawco-choice="${card.id}"]`);
  // biome-ignore lint/performance/noAwaitInLoops: one tab, one capture at a time.
  await locator.screenshot({ path: join(HERE, "captures", `card-${card.id}.png`) });
  console.log(`captured captures/card-${card.id}.png`);
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => scrollTo(0, 0));
await page.waitForTimeout(300);
await page.screenshot({ path: join(HERE, "captures", "page-top.png") });
console.log(`wiring failures: ${wiring}`);
console.log(`page errors: ${errors.length}${errors.length ? `\n  ${errors.join("\n  ")}` : ""}`);
await browser.close();
server.stop();
