/**
 * An HTML decision page's dials, as the browser draws them: what
 * scripts/decision-dials-check.ts (part of `bun run check`) can't tell
 * without one. No fleet: the dashboard's own stage (decision-embeds.ts
 * `startDecisionStage`) serves the decision host's files and the hub-built
 * pages (`buildDecisionPage`) beside it.
 *
 * 1. A kit page whose own sheet styles bare elements draws the same with
 *    `{{DIALS}}` and without: every computed property of every element of
 *    its own, custom properties too, light and dark.
 * 2. The dials' Select opens in the layer inside their shadow root, never on
 *    the page, and its pick lands.
 * 3. On a page with no kit tokens whose `html` sets `font-size: 20px`, the
 *    dials measure as on the kit page (their type, a row, the column), and
 *    the colour's picker opens over `--dur-pop` as their own root holds it,
 *    never 0 ms.
 * 4. A play's clip that runs twice with `direction: "alternate"` reads that
 *    direction and a move of both its runs, and Play replays it there and
 *    back to the move's end.
 *
 *   bun scripts/probe-kit/run.ts web decision-dials
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { REPLAY_ID } from "../../../../packages/agent/src/stage-host/canvas/replays";
import { DIALS_ROOT } from "../../../../packages/core/src/dials-root";
import { buildDecisionPage } from "../../../../packages/hub/src/decision-page";
import { APP, startDecisionStage } from "../../decision-embeds";
import type { Kit, Spec } from "../../spec";

/** The page's own look, on bare elements. */
const BARE_STYLES = `html { scrollbar-gutter: stable; }
body { margin: 0; padding: 24px; background: #fdf6e3; color: #073642; font-family: Georgia, serif; line-height: 1.7; letter-spacing: 0.01em; display: grid; gap: 18px; }
h1 { font-size: 2.4rem; font-weight: 800; margin: 0; }
p { margin: 0 0 1em; max-width: 60ch; }
button { font: inherit; padding: 6px 14px; border: 2px solid currentColor; border-radius: 3px; background: transparent; }
input, select { font: inherit; padding: 4px 8px; border: 1px solid #93a1a1; }
label { display: block; font-style: italic; }
ul { padding-left: 1.4em; }
a { color: #b58900; }
div { box-sizing: content-box; }`;

const BODY = `<h1>A page of bare elements</h1>
<p>Words in a paragraph, with <a href="#x">a link</a> and <b>bold</b> in them.</p>
<label>Name <input value="Swatch"></label>
<label>Tone <select><option>calm</option><option>loud</option></select></label>
<button type="button">A plain button</button>
<ul><li>One</li><li>Two</li></ul>
<div id="card" style="width: 120px; height: 60px; background: #268bd2"></div>
<script>
if (window.cawcoDials) {
  window.cawcoDials("Card", { radius: [12, 0, 32], tint: "#268bd2", tone: { type: "select", options: ["calm", "loud"], default: "calm" }, framed: true });
}
</script>`;

/** A kit page of bare elements, with `{{DIALS}}` or without; `rootless`: no kit tokens, its root's font 20px. */
const pageSource = (dials: boolean, rootless = false) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bare elements</title>
<style>${rootless ? "html { font-size: 20px; }" : "{{KIT_CSS}}"}
${BARE_STYLES}</style>
${dials ? "{{DIALS}}" : ""}
</head>
<body>
${BODY}
</body>
</html>`;

const built = async (dials: boolean, rootless = false): Promise<string> => {
  const page = await buildDecisionPage(pageSource(dials, rootless), {
    image: async () => undefined,
    mockup: async () => undefined,
  });
  if (!("html" in page)) {
    throw new Error("problem" in page ? page.problem : page.response.detail);
  }
  return page.html;
};

/** Leg 4's states file, under `src/` (SvelteKit serves only that); gone when the spec ends. */
const SCRATCH = "src/lib/cawco/probe-decision-dials";
const PULSE = `${SCRATCH}/Pulse.stories.ts`;
const PULSE_FILES: Record<string, string> = {
  "Dot.svelte": `<script>
  let { tone = "calm" } = $props();
</script>

<span data-probe="dot">{tone}</span>
`,
  "Pulse.stories.ts": `import Dot from "./Dot.svelte";

export default { component: Dot, args: { tone: "calm" } };

/** The dot at rest. */
export const Rest = { args: {} };

/** The dot pulsed once, there and back. */
export const Pulsed = {
  args: { tone: "loud" },
  from: "Rest",
  play: async ({ canvasElement, update }) => {
    await update({ tone: "loud" });
    canvasElement
      .querySelector("[data-probe=dot]")
      .animate([{ opacity: 1 }, { opacity: 0.2 }], {
        duration: 400,
        iterations: 2,
        direction: "alternate",
      });
  },
};
`,
};

const DIALS_HOST = "cawco-dials";
const ROW = `${DIALS_HOST} [data-dial-row]`;

/** Every computed property of every element the page holds of its own: never the dials' host, nor what `{{DIALS}}` puts in its head. */
const pageStyles = (page: Page) =>
  page.evaluate((host) => {
    const dialsOwn = (el: Element) =>
      el.localName === host ||
      (el.localName === "script" &&
        (((el as HTMLScriptElement).src ?? "").includes("/__cawco/decision/") ||
          (el.textContent ?? "").includes("cawcoDialsHeld=")));
    const out: Record<string, Record<string, string>> = {};
    [
      document.documentElement,
      ...document.querySelectorAll("head, head *, body, body *"),
    ]
      .filter((el) => !dialsOwn(el))
      .forEach((el, at) => {
        const style = getComputedStyle(el);
        const all: Record<string, string> = {};
        for (const name of Array.from(style)) {
          all[name] = style.getPropertyValue(name);
        }
        out[`${at}:${el.localName}`] = all;
      });
    return out;
  }, DIALS_HOST);

/** Where two reads of the page's styles differ, each `element property: a → b`. */
const differences = (
  a: Record<string, Record<string, string>>,
  b: Record<string, Record<string, string>>
) => {
  const said: string[] = [];
  let compared = 0;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const was = a[key] ?? {};
    const now = b[key] ?? {};
    for (const name of new Set([...Object.keys(was), ...Object.keys(now)])) {
      compared += 1;
      if (was[name] !== now[name]) {
        said.push(`${key} ${name}: ${was[name]} → ${now[name]}`);
      }
    }
  }
  return { compared, said };
};

/** A page opened and drawn: its dials' rows stand when it has dials. */
const opened = async (
  kit: Kit,
  url: string,
  theme: "light" | "dark",
  dials: boolean
): Promise<Page> => {
  const page = await kit.page("desk", { theme });
  await page.goto(url, { waitUntil: "load" });
  if (dials) {
    await page.locator(ROW).first().waitFor({ timeout: 30_000 });
  }
  await page.evaluate(() => document.fonts.ready);
  return page;
};

/** What the dials measure on `page`: a row's label's type, a row, the column, read in their shadow root. */
const dialsMeasures = (page: Page) =>
  page.evaluate((root) => {
    const shadow = document.querySelector("cawco-dials")?.shadowRoot;
    const row = shadow?.querySelector<HTMLElement>("[data-dial-row]");
    const label = row?.querySelector<HTMLElement>("label") ?? row;
    const column = shadow?.querySelector<HTMLElement>(
      "[data-slot=dials-column]"
    );
    const type = label ? getComputedStyle(label) : null;
    return {
      root: !!shadow?.querySelector(`[${root}]`),
      labelFont: type ? `${type.fontSize}/${type.lineHeight}` : null,
      rowHeight: row ? Math.round(row.getBoundingClientRect().height) : null,
      columnWidth: column
        ? Math.round(column.getBoundingClientRect().width)
        : null,
      columnHeight: column
        ? Math.round(column.getBoundingClientRect().height)
        : null,
    };
  }, DIALS_ROOT);

/** The dials' Select picked to `option`: where its options opened, and what its trigger reads after. */
async function pickTone(page: Page, option: string) {
  await page
    .locator(`${DIALS_HOST} [data-slot=select-trigger]`)
    .first()
    .click();
  const content = page.locator(`${DIALS_HOST} [data-slot=select-content]`);
  await content.waitFor({ timeout: 10_000 });
  const where = await page.evaluate(() => {
    const shadow = document.querySelector("cawco-dials")?.shadowRoot;
    const inside = shadow?.querySelector("[data-slot=select-content]");
    return {
      inLayer: !!inside?.closest("[data-slot=dials-layer]"),
      onPage: !!document.querySelector("[data-slot=select-content]"),
    };
  });
  await page
    .locator(`${DIALS_HOST} [data-slot=select-item]`, { hasText: option })
    .click();
  await content.waitFor({ state: "detached", timeout: 10_000 });
  const reads = await page
    .locator(`${DIALS_HOST} [data-slot=select-trigger]`)
    .first()
    .innerText();
  return { ...where, reads: reads.trim() };
}

/** Leg 1 and 2: the kit page, with its dials and without, in `theme`. */
async function samePage(
  kit: Kit,
  urls: { with: string; without: string },
  theme: "light" | "dark"
): Promise<void> {
  const without = await opened(kit, urls.without, theme, false);
  const withDials = await opened(kit, urls.with, theme, true);
  const { compared, said } = differences(
    await pageStyles(without),
    await pageStyles(withDials)
  );
  kit.check(
    `1 (${theme}): the page's every computed property is the same with {{DIALS}} and without`,
    compared > 1000 && said.length === 0,
    said.length > 0
      ? `${said.length} differ: ${said.slice(0, 6).join(" | ")}`
      : `${compared} properties compared, 0 differ`
  );
  if (theme === "light") {
    const picked = await pickTone(withDials, "loud");
    kit.check(
      "2: the dials' Select opens in the layer inside their shadow root, never on the page, and its pick lands",
      picked.inLayer && !picked.onPage && picked.reads === "loud",
      JSON.stringify(picked)
    );
  }
  await without.close();
  await withDials.close();
}

/** Leg 3: the page with no kit tokens and a 20px root, beside the kit page. */
async function rootlessPage(
  kit: Kit,
  urls: { rootless: string; with: string }
): Promise<void> {
  const kitPage = await opened(kit, urls.with, "light", true);
  const rootless = await opened(kit, urls.rootless, "light", true);
  const [onKit, onRootless] = await Promise.all([
    dialsMeasures(kitPage),
    dialsMeasures(rootless),
  ]);
  kit.check(
    "3: on a page with no kit tokens and a 20px root, the dials measure as on the kit page",
    onKit.root &&
      onKit.labelFont !== null &&
      JSON.stringify(onKit) === JSON.stringify(onRootless),
    `kit page ${JSON.stringify(onKit)}; rootless ${JSON.stringify(onRootless)}`
  );
  // The colour's picker opens over --dur-pop (the kit popover's own
  // motion) as the dials' own root holds it.
  const swatch = rootless
    .locator(`${DIALS_HOST} [data-slot=popover-trigger]`)
    .filter({ visible: true })
    .first();
  await swatch.waitFor({ timeout: 10_000 });
  await swatch.click();
  const content = rootless
    .locator(`${DIALS_HOST} [data-slot=popover-content]`)
    .first();
  await content.waitFor({ timeout: 10_000 });
  const glide = await content.evaluate((card, root) => {
    // Its fade's duration as the card computes it (the transition has
    // ended by the time the card is read): the token resolved, never 0 ms.
    const style = getComputedStyle(card);
    const properties = style.transitionProperty
      .split(",")
      .map((one) => one.trim());
    const durations = style.transitionDuration
      .split(",")
      .map((one) => one.trim());
    const fade = durations[properties.indexOf("opacity")] ?? "0s";
    const ran = fade.endsWith("ms")
      ? Number.parseFloat(fade)
      : Number.parseFloat(fade) * 1000;
    const tokens = card.closest(`[${root}]`);
    // A duration token as written, `260ms` or `.26s`, in ms.
    const said = tokens
      ? getComputedStyle(tokens).getPropertyValue("--dur-pop").trim()
      : "";
    const figure = Number.parseFloat(said);
    return {
      ran,
      token: said.endsWith("ms") ? figure : figure * 1000,
      said,
    };
  }, DIALS_ROOT);
  kit.check(
    "3: there, the colour's picker opens over --dur-pop as the dials' own root holds it",
    glide.token > 0 && Math.round(glide.ran) === Math.round(glide.token),
    JSON.stringify(glide)
  );
  await kitPage.close();
  await rootless.close();
}

/** The stage page's canvas frame, framed as a panel's is. */
async function panelFrame(page: Page, stagePort: number): Promise<Frame> {
  await page.setContent(
    `<iframe style="border:0;width:680px;height:500px" src="http://127.0.0.1:${stagePort}/@cawco/canvas?file=${encodeURIComponent(PULSE)}&spec=%7B%7D&by=panel"></iframe>`
  );
  const frame = page
    .frames()
    .find((one) => one.url().includes("@cawco/canvas"));
  if (!frame) {
    throw new Error("The stage's canvas frame did not open.");
  }
  await frame.waitForFunction(() => "__cawcoCanvas" in window, null, {
    timeout: 120_000,
  });
  return frame;
}

/** Leg 4: the play's alternate clip, read and replayed. */
async function alternateLeg(kit: Kit, stagePort: number): Promise<void> {
  const page = await kit.page("desk", { theme: "light" });
  const frame = await panelFrame(page, stagePort);
  const reached = (ask: number) =>
    frame.evaluate(
      (asked) =>
        new Promise<unknown>((done) => {
          addEventListener("cawco:stage-reached", (event) => {
            const said = (event as CustomEvent<{ ask: number }>).detail;
            if (said.ask === asked) {
              done(said);
            }
          });
        }),
      ask
    );
  const reach = (ask: number, story: string, from: string | null) =>
    frame.evaluate(
      ([asked, to, was, file]) => {
        dispatchEvent(
          new CustomEvent("cawco:stage-reach", {
            detail: {
              ask: asked,
              to: { file, story: to },
              from: was ? { file, story: was } : null,
              play: was !== null,
              still: false,
            },
          })
        );
      },
      [ask, story, from, PULSE] as const
    );
  const rested = reached(1);
  await reach(1, "Rest", null);
  await rested;
  const pulsed = reached(2);
  await reach(2, "Pulsed", "Rest");
  const { move } = (await pulsed) as {
    move: {
      clips: { direction: string; iterations: number }[];
      length: number;
    } | null;
  };
  const clip = move?.clips[0];
  kit.check(
    "4: a play's clip of two runs with direction alternate reads that direction, and a move of both its runs",
    clip?.direction === "alternate" &&
      clip.iterations === 2 &&
      move?.length === 800,
    JSON.stringify(move)
  );
  // Play, as the face's Play asks it, with nothing tuned: the dot's opacity read every frame.
  const played = await frame.evaluate(async (replay) => {
    const dot = document.querySelector<HTMLElement>("[data-probe=dot]");
    if (!dot) {
      return null;
    }
    const ends = new Promise<number>((done) => {
      addEventListener("cawco:stage-time", (event) => {
        const said = (event as CustomEvent<{ playing: boolean; t: number }>)
          .detail;
        if (!said.playing) {
          done(said.t);
        }
      });
    });
    dispatchEvent(
      new CustomEvent("cawco:stage-play", {
        detail: {
          ask: 3,
          from: 0,
          loopFrom: 0,
          repeat: false,
          still: false,
          tuning: [],
        },
      })
    );
    const seen: number[] = [];
    let timing = "";
    const t0 = performance.now();
    while (performance.now() - t0 < 1200) {
      await new Promise((next) => requestAnimationFrame(next));
      const run = dot.getAnimations().find((one) => one.id === replay);
      if (run && !timing) {
        const said = run.effect?.getTiming();
        timing = `${said?.iterations} runs, ${said?.direction}`;
      }
      seen.push(Number(getComputedStyle(dot).opacity));
    }
    const lowest = seen.indexOf(Math.min(...seen));
    return {
      timing,
      lowest: seen[lowest],
      after: Math.max(...seen.slice(lowest)),
      end: await ends,
    };
  }, REPLAY_ID);
  kit.check(
    "4: Play replays it there and back: down to its far frame, back to its first, ending at the move's 800 ms",
    !!played &&
      played.timing === "2 runs, alternate" &&
      played.lowest < 0.3 &&
      played.after > 0.95 &&
      played.end === 800,
    JSON.stringify(played)
  );
  await page.close();
}

const spec: Spec = {
  name: "decision-dials",
  group: "Previews, pages and comments",
  async run(kit) {
    const dir = join(APP, SCRATCH);
    mkdirSync(dir, { recursive: true });
    for (const [name, text] of Object.entries(PULSE_FILES)) {
      writeFileSync(join(dir, name), text);
    }
    try {
      const pages = {
        with: await built(true),
        without: await built(false),
        rootless: await built(true, true),
      };
      const stage = await startDecisionStage(
        new Map(),
        {},
        { root: APP, kit: true },
        pages
      );
      try {
        const { origin } = new URL(stage.pageUrl("none", "light"));
        const urls = {
          with: `${origin}/__cawco/page/with/`,
          without: `${origin}/__cawco/page/without/`,
          rootless: `${origin}/__cawco/page/rootless/`,
        };
        await samePage(kit, urls, "light");
        await samePage(kit, urls, "dark");
        await rootlessPage(kit, urls);
        await alternateLeg(kit, stage.stagePort);
      } finally {
        await stage.stop();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};
export default spec;
