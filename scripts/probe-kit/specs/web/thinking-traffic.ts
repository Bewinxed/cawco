/**
 * The reasoning lifecycle on the traffic bench (/motion/traffic), on the desk
 * and a phone, in Chromium and in WebKit (Safari is how the owner reads
 * CawCo on his phone): the thinking indicator opens its place as it comes,
 * sits on the tool rows' type and rail, keeps its first step as the next
 * paragraph lands and folds from its header; the call that takes its place
 * opens from its height to its own; the answer follows it pinned to the
 * bottom; a direct answer crossfades in over the reasoning in the one live
 * row; a fast phase change keeps the latest reasoning; a turn waiting on a
 * permission draws no working indicator; a reader scrolled up stays where
 * they are; and nothing in the thinking breaks a house rule
 * (house-rules.ts). Each is the transcript's own rule as Row.svelte,
 * LiveRow.svelte and rows.ts `liveContent` write it.
 *
 * Each motion is read on a held clock, sought to fractions of its run
 * (kit.ts `readMotion`), never filmed: sampled once a frame, headless WebKit
 * drew two or three frames over a 240ms opening on a loaded machine and the
 * tween read as one or two heights (`[[59],[58]]`), while the same run held
 * and sought reads its whole opening on either engine.
 */
import { HouseRules } from "../../house-rules";
import {
  type Engine,
  type Kit,
  open,
  readMotion,
  type Spec,
  settle,
  type View,
} from "../../kit";
// `window.__traffic` and what this spec keeps on `window`, read inside each
// callback: one runs alone in the page.
import "../../traffic-bench";

/** Every engine on both sizes: the motion is the same on Chromium and WebKit. */
const LEGS: { engine: Engine; view: View }[] = [
  { engine: "chromium", view: "desk" },
  { engine: "chromium", view: "phone" },
  { engine: "webkit", view: "desk" },
  { engine: "webkit", view: "phone" },
];

const TR = '[data-slot="tr"]';
/** Every twentieth of the clock. */
const FRACTIONS = Array.from({ length: 21 }, (_, i) => i / 20);

/** The height of the row the thinking indicator stands in; -1 where none stands. In the page. */
function indicatorPlace(): number {
  const row = document
    .querySelector('[data-slot="thinking-indicator"]')
    ?.closest('[data-slot="row"]');
  return row ? Math.round(row.getBoundingClientRect().height) : -1;
}

/**
 * The height of each row whose place a `block-size` tween holds, found at
 * the read's first fraction and followed through the rest (a run sought to
 * its end leaves `getAnimations()`). In the page.
 */
function placingHeights(): number[] {
  if (window.__placing.length === 0) {
    window.__placing = [
      ...document.querySelectorAll('[data-slot="tr"] [data-slot="row"]'),
    ].filter((row) =>
      row
        .getAnimations()
        .some((run) =>
          (run.effect as KeyframeEffect | null)
            ?.getKeyframes()
            .some((key) => "blockSize" in key)
        )
    );
  }
  return window.__placing.map((row) =>
    Math.round(row.getBoundingClientRect().height)
  );
}

/** Whether the indicator stands, and the live row's own faces (not its reasoning's label faces). In the page. */
function liveFaces(): { faces: number; indicator: boolean } {
  const tr = document.querySelector('[data-slot="tr"]') as HTMLElement;
  const live = [...tr.querySelectorAll('[data-slot="live"]')].at(-1);
  return {
    indicator: !!tr.querySelector('[data-slot="thinking-indicator"]'),
    faces: live?.querySelectorAll(':scope > [data-slot="face"]').length ?? 0,
  };
}

/** Distinct values, in their order. */
const distinct = (values: number[]) => [...new Set(values)];

async function lifecycle(kit: Kit, engine: Engine, view: View) {
  const check = (what: string, ok: boolean, detail = "") =>
    kit.check(`${engine} ${view}: ${what}`, ok, detail);
  const page = await kit.page(view, { engine });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  await open(
    page,
    `${await kit.bench()}/motion/traffic`,
    () => "__traffic" in window
  );
  await page.evaluate(() => window.__traffic.reset(36));
  await page.waitForFunction(() => window.__traffic.landed());
  await settle(page, 1000);
  // The indicator's place opens from nothing to its own height (Row
  // `arrive`), read where it stands at each fraction.
  const entry = await readMotion(
    page,
    () =>
      page.evaluate(() =>
        window.__traffic.user("Check the reasoning lifecycle.")
      ),
    TR,
    { fractions: FRACTIONS, read: () => page.evaluate(indicatorPlace) }
  );
  await page.locator('[data-slot="thinking-indicator"]').waitFor();
  const entryHeights = entry.at.map((one) => one.value);
  const placed = entryHeights.filter((height) => height >= 0);
  const entryOwn = await page.evaluate(indicatorPlace);
  check(
    "the indicator opens its place from nothing to its own height",
    placed.length === entryHeights.length &&
      (placed[0] ?? -1) <= 1 &&
      placed.at(-1) === entryOwn &&
      entryOwn > 0 &&
      distinct(placed).length >= 3 &&
      placed.every((height, i) => i === 0 || height >= (placed[i - 1] ?? 0)),
    `by ${entry.by}: heights ${placed.join(", ")} of ${entryHeights.length} fractions, its own ${entryOwn}`
  );

  const type = await page.evaluate(() => {
    const tr = document.querySelector('[data-slot="tr"]') as HTMLElement;
    const measure = (el: Element | null | undefined) => {
      if (!el) {
        return null;
      }
      const s = getComputedStyle(el);
      return {
        font: s.fontFamily,
        size: s.fontSize,
        weight: s.fontWeight,
        line: s.lineHeight,
        padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft],
        gap: s.columnGap,
        x: el.getBoundingClientRect().left - tr.getBoundingClientRect().left,
      };
    };
    return {
      indicator: measure(tr.querySelector('[data-slot="thinking-indicator"]')),
      label: measure(tr.querySelector('[data-slot="labels"]')),
      header: measure(tr.querySelector('[data-slot="thinking-steps-header"]')),
      tool: measure([...tr.querySelectorAll('[data-slot="trow"]')].at(-1)),
      rail: measure(tr.querySelector("[data-think]")),
      toolRail: measure([...tr.querySelectorAll('[data-slot="tools"]')].at(-1)),
    };
  });
  const { indicator, label, header, tool, rail, toolRail } = type;
  check(
    "the indicator's label is set as a tool row's (font, size, weight, line)",
    !!label &&
      !!tool &&
      label.font === tool.font &&
      label.size === tool.size &&
      label.weight === tool.weight &&
      label.line === tool.line,
    JSON.stringify({ label, tool })
  );
  check(
    "the indicator has no padding, and its gap is a tool row's",
    indicator?.padding.join(" ") === "0px 0px 0px 0px" &&
      indicator?.gap === tool?.gap,
    JSON.stringify(indicator)
  );
  check(
    "the steps' header starts on a tool row's x; the rail on the tools' rail",
    header?.x === tool?.x &&
      rail?.x === toolRail?.x &&
      rail?.padding[3] === toolRail?.padding[3],
    JSON.stringify({ header: header?.x, tool: tool?.x, rail, toolRail })
  );

  const first =
    "I am checking the real reasoning stream, with enough text to wrap onto several lines in the mobile transcript.";
  await page.evaluate((text) => window.__traffic.thinking(text), first);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__firstStep = document.querySelector('[data-slot="thinking-step"]');
  });
  await page.evaluate(
    (text) =>
      window.__traffic.thinking(
        `${text}\n\nThe next paragraph arrives from the model.`
      ),
    first
  );
  await page.waitForTimeout(350);
  const steps = await page
    .locator('[data-slot="thinking-step"]')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.status));
  const kept = await page.evaluate(
    () =>
      window.__firstStep ===
      document.querySelector('[data-slot="thinking-step"]')
  );
  check(
    "the next paragraph is a second step; the first is the same element, complete",
    steps.join(",") === "complete,active" && kept,
    `steps ${steps.join(",")}; first kept ${kept}`
  );
  const head = page.locator('[data-slot="thinking-steps-header"]').last();
  await head.focus();
  await head.press("Enter");
  await page.waitForTimeout(300);
  const shut = await head.getAttribute("aria-expanded");
  await head.press("Enter");
  await page.waitForTimeout(300);
  const opened = await head.getAttribute("aria-expanded");
  check(
    "Enter on the header folds the steps and opens them again",
    shut === "false" && opened === "true",
    `${shut} → ${opened}`
  );

  const house = new HouseRules(kit, `${engine} ${view}`, {
    scope: "[data-think]",
    noImpeccable:
      "its read lets go of the transcript's pin to its foot (scrolled back, the legs below found the answer 39px and 68px off it), and they read that pin",
  });
  await house.at(page, "the thinking, its steps open");
  house.report();

  // The call in flight takes the reasoning's place (Row `takePlace`): it
  // opens from the reasoning's height to its own, so the place is never empty.
  const reasoning = await page.evaluate(() => {
    const live = [...document.querySelectorAll('[data-slot="live"]')].at(-1);
    const row = live?.closest('[data-slot="row"]');
    window.__placing = [];
    return Math.round(row?.getBoundingClientRect().height ?? -1);
  });
  const exit = await readMotion(
    page,
    () =>
      page.evaluate(() =>
        window.__traffic.patch({
          openBlock: "tool",
          thinkingStream: "",
          currentTool: {
            toolId: "live-tool",
            name: "Read",
            glance: "src/main.ts",
          },
        })
      ),
    TR,
    { fractions: FRACTIONS, read: () => page.evaluate(placingHeights) }
  );
  const exitOwn = await page.evaluate(() =>
    window.__placing.map((row) =>
      Math.round(row.getBoundingClientRect().height)
    )
  );
  // Each tweening row's heights through the clock.
  const exitHeights = exitOwn.map((_, row) =>
    exit.at.map((one) => one.value[row] ?? -1)
  );
  const taker = exitHeights.findIndex(
    (heights) => Math.abs((heights[0] ?? -1) - reasoning) <= 1
  );
  const taken = exitHeights[taker] ?? [];
  check(
    "the call that takes the reasoning's place tweens from its height to its own",
    taker >= 0 &&
      taken.at(-1) === exitOwn[taker] &&
      distinct(taken).length >= 3 &&
      (await page.locator('[data-slot="thinking-indicator"]').count()) === 0,
    `by ${exit.by}: the reasoning stood ${reasoning}px; heights through the clock, by tweening row ${JSON.stringify(exitHeights.map(distinct))}, each one's own ${JSON.stringify(exitOwn)}`
  );

  await page.evaluate(() => {
    window.__traffic.tool("Read", "src/main.ts");
    window.__traffic.patch({
      currentTool: null,
      openBlock: null,
      streaming: "The answer follows the actual reasoning.",
    });
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    window.__traffic.assistant("The answer follows the actual reasoning.");
    window.__traffic.patch({ streaming: "", busy: false });
  });
  await page.waitForTimeout(700);
  const bottom = await page
    .locator('[data-slot="tr"]')
    .evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
  check(
    "the answer lands still pinned to the bottom",
    bottom <= 2,
    `${bottom}px off`
  );

  await page.evaluate(() =>
    window.__traffic.thinking("Reasoning that goes directly into an answer.")
  );
  await page.waitForTimeout(350);
  const direct = await readMotion(
    page,
    () =>
      page.evaluate(() =>
        window.__traffic.patch({
          openBlock: null,
          thinkingStream: "",
          streaming: "A direct answer.",
        })
      ),
    TR,
    { fractions: FRACTIONS, read: () => page.evaluate(liveFaces) }
  );
  const faces = await page
    .locator('[data-slot="live"]')
    .last()
    .locator(':scope > [data-slot="face"]')
    .count();
  const over = direct.at.filter(
    (one) => one.value.indicator && one.value.faces === 2
  );
  check(
    "a direct answer enters over the reasoning in one container, then stands alone",
    over.length > 0 && faces === 1,
    `by ${direct.by}: two faces over the reasoning at ${over.map((one) => one.fraction).join(", ") || "no fraction"}; faces now ${faces}`
  );
  await page.evaluate(() =>
    window.__traffic.patch({ streaming: "", busy: true })
  );
  await page.waitForTimeout(350);
  await page.evaluate(() => window.__traffic.patch({ busy: false }));
  await page.waitForTimeout(350);
  check(
    "no indicator once the turn is over",
    (await page.locator('[data-slot="thinking-indicator"]').count()) === 0
  );

  await page.evaluate(() => window.__traffic.thinking("A rapid phase change."));
  await page.waitForTimeout(300);
  await page.evaluate(() =>
    window.__traffic.patch({
      openBlock: null,
      streaming: "An interrupted answer.",
    })
  );
  await page.waitForTimeout(40);
  await page.evaluate(() =>
    window.__traffic.patch({
      openBlock: "thinking",
      streaming: "",
      thinkingStream: "The latest reasoning survives.",
    })
  );
  // A live stream shows its words as they land and holds the last one back
  // until more comes, so the reasoning reads as far as its last whole word.
  await page.waitForTimeout(400);
  const swapText =
    (await page.locator('[data-slot="live"]').last().textContent()) ?? "";
  check(
    "a fast phase change keeps the latest reasoning, not the interrupted answer, in one face",
    (await page
      .locator('[data-slot="live"]')
      .last()
      .locator(':scope > [data-slot="face"]')
      .count()) === 1 &&
      swapText.includes("The latest reasoning") &&
      !swapText.includes("An interrupted answer"),
    swapText.slice(-80)
  );
  await page.evaluate(() => window.__traffic.thinking(null));
  await page.waitForTimeout(350);

  // A turn working on the reader's message with nothing to show yet draws
  // the working indicator; one waiting on a permission draws none (rows.ts
  // `liveContent`, `indicating`).
  await page.evaluate(() => window.__traffic.user("Go on."));
  await page.waitForTimeout(350);
  const working = await page
    .locator('[data-slot="thinking-indicator"]')
    .count();
  await page.evaluate(() =>
    window.__traffic.patch({ pending: [{ requestId: "permission" }] })
  );
  await page.waitForTimeout(350);
  const asking = await page.locator('[data-slot="thinking-indicator"]').count();
  check(
    "a turn waiting on a permission draws no working indicator",
    working > 0 && asking === 0,
    `working ${working}, waiting on a permission ${asking}`
  );
  await page.evaluate(() =>
    window.__traffic.patch({ pending: [], busy: false })
  );
  await page.waitForTimeout(350);

  await page.evaluate(() => {
    (document.querySelector('[data-slot="tr"]') as HTMLElement).scrollTop -=
      450;
  });
  await page.waitForTimeout(100);
  const before = await page
    .locator('[data-slot="tr"]')
    .evaluate((el) => el.scrollTop);
  await page.evaluate(() =>
    window.__traffic.thinking("Reasoning while the user reads history.")
  );
  await page.waitForTimeout(450);
  const after = await page
    .locator('[data-slot="tr"]')
    .evaluate((el) => el.scrollTop);
  check(
    "a reader scrolled up stays where they are as reasoning arrives",
    Math.abs(after - before) <= 2,
    `${before} → ${after}`
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    (document.querySelector('[data-slot="tr"]') as HTMLElement).scrollTop = 1e7;
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__traffic.thinking(null));
  await page.waitForTimeout(100);
  check(
    "with reduced motion the indicator goes at once",
    (await page.locator('[data-slot="thinking-indicator"]').count()) === 0
  );
  check("no page error", errors.length === 0, errors.join(" | "));
  await page.close();
}

/** Each ink a step's glyph takes (ThinkingStep `ink`, MoveWait's phases), against its token. */
const INK_TOKENS = {
  done: "--status-done-glyph",
  active: "--ink-strong",
  fail: "--status-fail-glyph",
  attn: "--status-attn-glyph",
  muted: "--ink-muted",
} as const;

async function stepInk(kit: Kit) {
  const page = await kit.page("desk", { theme: "light" });
  await open(
    page,
    `${await kit.bench()}/motion/step-ink`,
    '[data-ink] [data-slot="thinking-step-icon"]'
  );
  const read = await page.evaluate(
    (tokens) =>
      Object.entries(tokens).map(([ink, token]) => {
        const cell = document.querySelector(
          `[data-ink="${ink}"] [data-slot="thinking-step-icon"]`
        );
        const probe = document.createElement("span");
        probe.style.color = `var(${token})`;
        document.body.append(probe);
        const want = getComputedStyle(probe).color;
        probe.remove();
        return {
          ink,
          token,
          got: cell ? getComputedStyle(cell).color : null,
          want,
        };
      }),
    INK_TOKENS
  );
  kit.check(
    "a step's glyph takes its ink's token: done, running, failed, waiting on you, stopped",
    read.length === 5 && read.every((one) => one.got === one.want),
    JSON.stringify(read)
  );
  await page.close();
}

const spec: Spec = {
  name: "thinking-traffic",
  run: async (kit) => {
    for (const { engine, view } of LEGS) {
      // biome-ignore lint/performance/noAwaitInLoops: each leg's scenario runs alone, timed
      await lifecycle(kit, engine, view);
    }
    await stepInk(kit);
  },
};
export default spec;
