/**
 * What a choice in the session tabs lays out, part by part, on the
 * folder-tabs bench (the real PaneTabs, six tabs, no hub), on the desk.
 *
 * Each reading chooses a tab (its link's click, as the bench takes it),
 * lets Svelte's flush run, then times one forced layout; the same again
 * with one thing about the strip changed by a rule laid on before the
 * choice (its own layout forced first), so the difference is that thing's
 * share. A reading, not a gate.
 */
import type { Page } from "playwright-core";
import { traceMain } from "../../frames";
import { type Kit, open, type Spec, settle } from "../../kit";

const ROUTE = "/motion/folder-proof?at=1&work=working";
const STRIP = '[data-strip="session"]';
const VARIANTS = [
  ["nothing changed", ""],
  [
    "every tab's contents out",
    `${STRIP} .ff-tab > * { display: none !important; }`,
  ],
  [
    "the sheets out",
    `${STRIP} .ff-tab > svg.fold { display: none !important; }`,
  ],
  ["the links out", `${STRIP} .ff-tab > .hit { display: none !important; }`],
  [
    "the trails out",
    `${STRIP} .ff-tab > :not(.hit, svg) { display: none !important; }`,
  ],
  [
    "the labels' text out",
    `${STRIP} .ff-tab .label { display: none !important; }`,
  ],
  [
    "the leads out",
    `${STRIP} .ff-tab > .hit > :not(.label) { display: none !important; }`,
  ],
] as const;
const READS = 6;

const choiceLayout = (page: Page, css: string, tab: string) =>
  page.evaluate(
    async ({ rule, id }) => {
      const style = document.createElement("style");
      style.textContent = rule;
      document.head.append(style);
      document.body.getBoundingClientRect();
      document
        .querySelector<HTMLElement>(
          `[data-strip="session"] [data-session-tab="${id}"]`
        )
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
      const flushed = performance.now();
      document.body.getBoundingClientRect();
      const laid = performance.now() - flushed;
      const chosen = document
        .querySelector(
          '[data-strip="session"] [data-slot="tab"][data-chosen] [data-session-tab]'
        )
        ?.getAttribute("data-session-tab");
      style.remove();
      return { laid, switched: chosen === id };
    },
    { rule: css, id: tab }
  );

async function read(kit: Kit): Promise<void> {
  const page = await kit.page("desk", { theme: "light" });
  await open(
    page,
    `${await kit.bench()}${ROUTE}&theme=light`,
    `${STRIP} [data-slot="tab"][data-chosen]`,
    120_000
  );
  await settle(page, 600);
  const ids = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-strip="session"] [data-session-tab]:not([data-session-tab^="run:"])'
      ),
    ].map((el) => el.getAttribute("data-session-tab") ?? "")
  );
  const [a, b] = ids;
  // Three choices traced: each one's longest task, what it laid out again
  // and why, the passes it ran, and what else it spent.
  const main = await traceMain(
    page,
    async () => {
      // The page's own mark: the trace finds the page's thread by it.
      await page.evaluate(() => performance.mark("strip-layout"));
      // The link's own click: no pointer over the strip, so no hover ghost
      // and no card opened by a resting pointer, the choice alone.
      await page.mouse.move(0, 0);
      for (const id of [a, b, a]) {
        // biome-ignore lint/performance/noAwaitInLoops: one choice at a time, settled between
        await page.evaluate(
          (tab) =>
            document
              .querySelector<HTMLElement>(
                `[data-strip="session"] [data-session-tab="${tab}"]`
              )
              ?.click(),
          id
        );
        await settle(page, 600);
      }
    },
    { restyles: true }
  );
  const longest = [...main.tasks].sort((x, y) => y.cpu - x.cpu).slice(0, 3);
  for (const task of longest) {
    kit.note(
      `strip-layout: a choice's task, ${task.cpu.toFixed(1)}ms (${task.ran}): passes ${task.passes
        .filter((pass) => pass.ms >= 0.3)
        .map(
          (pass) =>
            `${pass.name} ${pass.elements || ""} ${pass.ms.toFixed(1)}ms by ${pass.at}${pass.root ? ` from ${pass.root}` : ""}`
        )
        .join("; ")}; laid out again for ${task.relaidOut
        .map(([what, n]) => `${what} ${n}x`)
        .join("; ")}; asked for by ${task.invalidated
        .map(([what, n]) => `${what} ${n}x`)
        .join("; ")}; set off by ${task.scheduled
        .map(([what, n]) => `${what} ${n}x`)
        .join("; ")}; other phases ${task.rendering
        .map(([what, ms]) => `${what} ${ms.toFixed(1)}ms`)
        .join("; ")}`
    );
  }
  for (const [name, css] of VARIANTS) {
    const ms: string[] = [];
    for (let i = 0; i < READS; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one choice at a time, settled between
      const one = await choiceLayout(page, css, i % 2 === 0 ? a : b);
      ms.push(`${one.laid.toFixed(1)}${one.switched ? "" : " (no switch)"}`);
      await settle(page, 500);
    }
    kit.note(`strip-layout: ${name}: ${ms.join(", ")}ms`);
  }
  await page.close();
}

const spec: Spec = {
  name: "strip-layout",
  run: async (kit) => {
    await read(kit);
    kit.check("strip-layout: reads to its end", true, "");
  },
};
export default spec;
