// biome-ignore-all lint/performance/noAwaitInLoops: each viewport runs a timed transcript scenario in isolation.
// Run against the dashboard dev server: bun scripts/thinking-traffic.mjs [URL]
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { userLayerPath } from "../packages/core/src/paths.ts";

const anySocket = /.*/;
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1280, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
      reducedMotion: "no-preference",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    // The fixture owns its session. Block HMR so concurrent source edits cannot
    // navigate away halfway through a measured animation.
    await page.routeWebSocket(anySocket, () => undefined);
    await page.goto(
      `${process.argv[2] ?? "http://localhost:5173"}/motion/traffic`
    );
    await page.waitForFunction(() => window.__traffic);
    await page.evaluate(() => window.__traffic.reset(36));
    await page.waitForFunction(() => window.__traffic.landed());
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      window.__thinkingFrames = [];
      window.__recordThinking = true;
      const frame = () => {
        const tr = document.querySelector(".tr");
        const swap = tr.querySelector(".swap");
        const indicator = tr.querySelector('[data-slot="thinking-indicator"]');
        window.__thinkingFrames.push({
          time: performance.now(),
          top: tr.scrollTop,
          gap: tr.scrollHeight - tr.clientHeight - tr.scrollTop,
          height: swap?.getBoundingClientRect().height ?? 0,
          reserved:
            swap?.closest(".arrive")?.getBoundingClientRect().height ?? 0,
          indicator: !!indicator,
          faces: swap?.querySelectorAll(".face").length ?? 0,
          animations: swap?.getAnimations().map((a) => a.animationName) ?? [],
        });
        if (window.__recordThinking) {
          requestAnimationFrame(frame);
        }
      };
      requestAnimationFrame(frame);
      window.__traffic.user("Check the reasoning lifecycle.");
    });
    await page.locator('[data-slot="thinking-indicator"]').waitFor();
    await page.waitForTimeout(700);
    const entryHeights = await page.evaluate(() =>
      window.__thinkingFrames
        .filter((f) => f.indicator)
        .map((f) => Math.round(f.reserved))
    );
    assert(
      new Set(entryHeights).size >= 3,
      `indicator reserves space across frames: ${entryHeights}`
    );
    const typography = await page.evaluate(() => {
      const tr = document.querySelector(".tr");
      const measure = (el) => {
        const s = getComputedStyle(el);
        return {
          font: s.fontFamily,
          size: s.fontSize,
          weight: s.fontWeight,
          line: s.lineHeight,
          padding: [
            s.paddingTop,
            s.paddingRight,
            s.paddingBottom,
            s.paddingLeft,
          ],
          gap: s.columnGap,
          x: el.getBoundingClientRect().left - tr.getBoundingClientRect().left,
        };
      };
      return {
        indicator: measure(
          tr.querySelector('[data-slot="thinking-indicator"]')
        ),
        label: measure(tr.querySelector(".labels")),
        header: measure(
          tr.querySelector('[data-slot="thinking-steps-header"]')
        ),
        tool: measure([...tr.querySelectorAll(".trow")].at(-1)),
        rail: measure(tr.querySelector(".think")),
        toolRail: measure([...tr.querySelectorAll(".tools")].at(-1)),
        iconWidth: tr
          .querySelector('[data-slot="thinking-indicator"] svg')
          .getBoundingClientRect().width,
      };
    });
    for (const field of ["font", "size", "weight", "line"]) {
      assert.equal(
        typography.label[field],
        typography.tool[field],
        `matching ${field}`
      );
    }
    assert.deepEqual(typography.indicator.padding, [
      "0px",
      "0px",
      "0px",
      "0px",
    ]);
    assert.equal(typography.header.x, typography.tool.x);
    assert.equal(typography.indicator.gap, typography.tool.gap);
    assert.equal(typography.rail.x, typography.toolRail.x);
    assert.equal(typography.rail.padding[3], typography.toolRail.padding[3]);
    assert.equal(typography.iconWidth, 15);
    const first =
      "I am checking the real reasoning stream, with enough text to wrap onto several lines in the mobile transcript.";
    await page.evaluate((text) => window.__traffic.thinking(text), first);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__firstStep = document.querySelector(
        '[data-slot="thinking-step"]'
      );
    });
    await page.evaluate(
      (text) =>
        window.__traffic.thinking(
          `${text}\n\nThe next paragraph arrives from the model.`
        ),
      first
    );
    await page.waitForTimeout(350);
    assert.equal(await page.locator('[data-slot="thinking-step"]').count(), 2);
    assert.equal(
      await page.evaluate(
        () =>
          window.__firstStep ===
          document.querySelector('[data-slot="thinking-step"]')
      ),
      true
    );
    assert.deepEqual(
      await page
        .locator('[data-slot="thinking-step"]')
        .evaluateAll((els) => els.map((el) => el.dataset.status)),
      ["complete", "active"]
    );
    const header = page.locator('[data-slot="thinking-steps-header"]').last();
    await header.focus();
    await header.press("Enter");
    await page.waitForTimeout(300);
    assert.equal(await header.getAttribute("aria-expanded"), "false");
    await header.press("Enter");
    await page.waitForTimeout(300);
    assert.equal(await header.getAttribute("aria-expanded"), "true");
    await page.addScriptTag({
      content: await readFile(
        userLayerPath("skills", "ui-observer", "observer.browser.js"),
        "utf8"
      ),
    });
    const observed = await page.evaluate(() =>
      globalThis.__uiObserver({ scopeSel: ".think", maxDepth: 5 })
    );
    const visibleOverflow = observed.observations.filter(
      (item) =>
        ["horizontal-overflow", "text-clipped"].includes(item.type) &&
        !item.selector?.includes("sr-only")
    );
    assert.deepEqual(
      visibleOverflow,
      [],
      "observer finds no clipped visible thinking content"
    );
    const overflow = await page
      .locator(".think")
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    assert(overflow <= 1, `thinking has no horizontal overflow: ${overflow}`);
    await page.evaluate(() => {
      window.__exitAt = performance.now();
      window.__traffic.patch({
        openBlock: "tool",
        thinkingStream: "",
        currentTool: {
          toolId: "live-tool",
          name: "Read",
          glance: "src/main.ts",
        },
      });
    });
    await page.waitForTimeout(700);
    const exit = await page.evaluate(() =>
      window.__thinkingFrames.filter((f) => f.time >= window.__exitAt)
    );
    assert(
      exit.some(
        (f) =>
          f.height > 0 && f.animations.some((name) => name.endsWith("reserve"))
      ),
      "row survives removal and closes"
    );
    const heights = exit
      .filter((f) => f.height > 0)
      .map((f) => Math.round(f.height));
    assert(
      new Set(heights).size >= 3,
      `exit has intermediate heights: ${heights}`
    );
    assert.equal(
      await page.locator('[data-slot="thinking-indicator"]').count(),
      0
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
      .locator(".tr")
      .evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
    assert(bottom <= 2, `still pinned after done: ${bottom}`);
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
    assert(
      direct.some((f) => f.indicator && f.faces === 2),
      "reasoning remains mounted while the answer enters"
    );
    assert.equal(await page.locator(".swap .face").count(), 1);
    await page.evaluate(() => {
      window.__traffic.patch({ streaming: "", busy: true });
    });
    await page.waitForTimeout(350);
    await page.evaluate(() => window.__traffic.patch({ busy: false }));
    await page.waitForTimeout(350);
    assert.equal(
      await page.locator('[data-slot="thinking-indicator"]').count(),
      0
    );
    await page.evaluate(() =>
      window.__traffic.thinking("A rapid phase change.")
    );
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
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".swap .face").count(), 1);
    assert(
      (await page.locator(".swap").textContent()).includes(
        "The latest reasoning survives."
      )
    );
    await page.evaluate(() =>
      window.__traffic.patch({ pending: [{ requestId: "permission" }] })
    );
    await page.waitForTimeout(300);
    assert.equal(
      await page.locator('[data-slot="thinking-indicator"]').count(),
      0,
      "permission pauses the active thinking indicator"
    );
    await page.evaluate(() => window.__traffic.patch({ pending: [] }));
    await page.evaluate(() => window.__traffic.thinking(null));
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      const tr = document.querySelector(".tr");
      tr.scrollTop -= 450;
    });
    await page.waitForTimeout(100);
    const before = await page.locator(".tr").evaluate((el) => el.scrollTop);
    await page.evaluate(() =>
      window.__traffic.thinking("Reasoning while the user reads history.")
    );
    await page.waitForTimeout(450);
    const after = await page.locator(".tr").evaluate((el) => el.scrollTop);
    assert(
      Math.abs(after - before) <= 2,
      `reader stays scrolled up: ${before} -> ${after}`
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => {
      document.querySelector(".tr").scrollTop = 1e7;
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__traffic.thinking(null));
    await page.waitForTimeout(100);
    assert.equal(
      await page.locator('[data-slot="thinking-indicator"]').count(),
      0
    );
    await page.evaluate(() => {
      window.__recordThinking = false;
    });
    assert.deepEqual(errors, []);
    results.push({
      mobile,
      typography,
      entryHeights: [...new Set(entryHeights)],
      exitHeights: heights,
      bottom,
      scrollUpDelta: after - before,
      overflow,
      observerCounts: observed.observations.reduce((counts, item) => {
        counts[item.type] = (counts[item.type] ?? 0) + 1;
        return counts;
      }, {}),
      visibleOverflow,
    });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
