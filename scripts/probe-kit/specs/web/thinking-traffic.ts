/**
 * The reasoning lifecycle on the traffic bench (/motion/traffic), on the desk
 * and a phone in Chromium, read from the engine frame by frame: the thinking
 * indicator reserves its space as it comes, sits on the tool rows' type and
 * rail, keeps its first step as the next paragraph lands and folds from its
 * header; the call that takes its place opens from its height to its own;
 * the answer follows it pinned to the bottom; a direct answer crossfades in
 * over the reasoning in the one live row; a fast phase change keeps the
 * latest reasoning; a turn waiting on a permission draws no working
 * indicator; a reader scrolled up stays where they are; and nothing in the
 * thinking breaks a house rule (house-rules.ts). Each is the transcript's own
 * rule as Row.svelte, LiveRow.svelte and rows.ts `liveContent` write it.
 */
import { HouseRules } from "../../house-rules";
import { type Kit, open, type Spec, settle, type View } from "../../kit";
// `window.__traffic` and the frames this spec keeps on `window`, read inside
// each callback: one runs alone in the page.
import "../../traffic-bench";

const VIEWS_RUN: View[] = ["desk", "phone"];

async function lifecycle(kit: Kit, view: View) {
  const check = (what: string, ok: boolean, detail = "") =>
    kit.check(`${view}: ${what}`, ok, detail);
  const page = await kit.page(view);
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
  await page.evaluate(() => {
    const b = window;
    b.__thinkingFrames = [];
    b.__recordThinking = true;
    const frame = () => {
      const tr = document.querySelector('[data-slot="tr"]') as HTMLElement;
      // The live tail (LiveRow) and the row its place is (Row): the last
      // one, since a streamed answer that settled goes on drawing as one.
      const live = [...tr.querySelectorAll('[data-slot="live"]')].at(-1);
      const row = live?.closest('[data-slot="row"]');
      const tweens = (el: Element | null | undefined) =>
        (el?.getAnimations() ?? []).some((run) =>
          (run.effect as KeyframeEffect | null)
            ?.getKeyframes()
            .some((key) => "blockSize" in key)
        );
      // Every row whose place is tweening now, by its place in the list.
      const growing = [...tr.querySelectorAll('[data-slot="row"]')].flatMap(
        (el, i): [number, number][] =>
          tweens(el) ? [[i, el.getBoundingClientRect().height]] : []
      );
      b.__thinkingFrames.push({
        time: performance.now(),
        height: live?.getBoundingClientRect().height ?? 0,
        reserved: row?.getBoundingClientRect().height ?? 0,
        indicator: !!tr.querySelector('[data-slot="thinking-indicator"]'),
        // The row's own faces, not the label faces inside its reasoning block.
        faces:
          live?.querySelectorAll(':scope > [data-slot="face"]').length ?? 0,
        tweening: tweens(live) || tweens(row),
        growing,
      });
      if (b.__recordThinking) {
        requestAnimationFrame(frame);
      }
    };
    requestAnimationFrame(frame);
    b.__traffic.user("Check the reasoning lifecycle.");
  });
  await page.locator('[data-slot="thinking-indicator"]').waitFor();
  await page.waitForTimeout(700);
  const entry = await page.evaluate(() => [
    ...new Set(
      window.__thinkingFrames
        .filter((f) => f.indicator)
        .map((f) => Math.round(f.reserved))
    ),
  ]);
  check(
    "the indicator reserves its space across frames",
    entry.length >= 3,
    `heights ${entry.join(", ")}`
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

  const house = new HouseRules(kit, view, {
    scope: "[data-think]",
    noImpeccable:
      "its read lets go of the transcript's pin to its foot (scrolled back, the legs below found the answer 39px and 68px off it), and they read that pin",
  });
  await house.at(page, "the thinking, its steps open");
  house.report();

  await page.evaluate(() => {
    const b = window;
    b.__exitAt = performance.now();
    b.__traffic.patch({
      openBlock: "tool",
      thinkingStream: "",
      currentTool: { toolId: "live-tool", name: "Read", glance: "src/main.ts" },
    });
  });
  await page.waitForTimeout(700);
  const exit = await page.evaluate(() =>
    window.__thinkingFrames.filter((f) => f.time >= window.__exitAt)
  );
  // The call in flight takes the reasoning's place (Row `takePlace`): it
  // opens from the reasoning's height to its own, so the place is never empty.
  const byRow = new Map<number, Set<number>>();
  for (const [row, height] of exit.flatMap((f) => f.growing)) {
    byRow.set(row, (byRow.get(row) ?? new Set()).add(Math.round(height)));
  }
  const exitHeights = [...byRow.values()].map((heights) => [...heights]);
  check(
    "the call that takes the reasoning's place tweens from its height to its own",
    exitHeights.some((heights) => heights.length >= 3) &&
      (await page.locator('[data-slot="thinking-indicator"]').count()) === 0,
    `heights while tweening, by row ${JSON.stringify(exitHeights)}`
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
  await page.evaluate(() => {
    window.__directAt = performance.now();
    window.__traffic.patch({
      openBlock: null,
      thinkingStream: "",
      streaming: "A direct answer.",
    });
  });
  await page.waitForTimeout(400);
  const direct = await page.evaluate(() =>
    window.__thinkingFrames.filter((f) => f.time >= window.__directAt)
  );
  const faces = await page
    .locator('[data-slot="live"]')
    .last()
    .locator(':scope > [data-slot="face"]')
    .count();
  check(
    "a direct answer enters over the reasoning in one container, then stands alone",
    direct.some((f) => f.indicator && f.faces === 2) && faces === 1,
    `two faces seen ${direct.some((f) => f.faces === 2)}; faces now ${faces}`
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
  await page.evaluate(() => {
    window.__recordThinking = false;
  });
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
    for (const view of VIEWS_RUN) {
      // biome-ignore lint/performance/noAwaitInLoops: each view's scenario runs alone, timed
      await lifecycle(kit, view);
    }
    await stepInk(kit);
  },
};
export default spec;
