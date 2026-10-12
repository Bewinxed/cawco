/**
 * A long run's page landing on the traffic bench (/motion/traffic): an older
 * page of 250 tool calls (every one with a body to open) put in front of a
 * held transcript, as the store does (a new message list, the older first),
 * costs no main-thread task over 50ms, and the reader's row holds still to
 * the pixel on every painted frame while it lands. No page or window error.
 */
import { longest, SCROLLER, tell, watch, watched } from "../../frames";
import { open, type Spec } from "../../kit";

const CALLS = 250;
const BUDGET_MS = 50;

const spec: Spec = {
  name: "traffic-longtask",
  run: async (kit) => {
    const page = await kit.page("desk", { init: [watch] });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await open(
      page,
      `${await kit.built()}/motion/traffic`,
      () => "__traffic" in window
    );
    await page.evaluate((calls) => {
      let n = 0;
      let clock = Date.parse("2026-10-01T00:00:00Z");
      const message = (fields: Record<string, unknown>) => {
        n += 1;
        clock += 1000;
        return {
          id: `m-${n}`,
          instanceId: "traffic-bench",
          timestamp: new Date(clock).toISOString(),
          ...fields,
        };
      };
      const call = (label: string) =>
        message({
          type: "tool.use",
          toolCallId: `call-${label}`,
          content: "",
          metadata: {
            toolName: "Bash",
            toolInput: {
              command: `echo ${label}`,
              description: `Print ${label}`,
            },
            toolResult: label,
            toolStatus: "success",
          },
        });
      const older = Array.from({ length: calls }, (_, i) =>
        call(`older-${String(i).padStart(4, "0")}`)
      );
      const held = [
        ...Array.from({ length: 30 }, (_, i) =>
          call(`held-${String(i).padStart(4, "0")}`)
        ),
        message({
          type: "assistant",
          content: "The held conversation goes on under its run of calls.",
        }),
        ...Array.from({ length: 12 }, (_, i) =>
          message({
            type: "assistant",
            content: `held-turn-${i}: ${"A few lines of what the agent said, to give the view something to stand on. ".repeat(3)}`,
          })
        ),
      ];
      const w = window as unknown as {
        __traffic: {
          load: (blocks: unknown[]) => void;
          patch: (next: Record<string, unknown>) => void;
        };
        __land: () => void;
      };
      w.__traffic.load(held);
      w.__land = () => w.__traffic.patch({ messages: [...older, ...held] });
    }, CALLS);
    await page.waitForFunction(
      () =>
        (
          window as unknown as { __traffic: { landed: () => boolean } }
        ).__traffic.landed(),
      null,
      { timeout: 30_000 }
    );
    await page.waitForTimeout(1500);
    // The reader near the top of what is held, as a reader is when a page is
    // asked for: the run's first calls in view.
    await page.evaluate((sel) => {
      const scroller = document.querySelector<HTMLElement>(sel);
      if (scroller) {
        scroller.scrollTop = 0;
      }
    }, SCROLLER);
    await page.waitForTimeout(1000);
    const anchor = await page.evaluate((sel) => {
      const scroller = document.querySelector<HTMLElement>(sel);
      const top = scroller?.getBoundingClientRect().top ?? 0;
      for (const node of scroller?.querySelectorAll("*") ?? []) {
        const label =
          node.children.length === 0 &&
          // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
          node.textContent?.match(/held-\d{4}/)?.[0];
        if (label && node.getBoundingClientRect().top >= top + 40) {
          return label;
        }
      }
      return null;
    }, SCROLLER);
    await tell(page, { anchor, ys: [], tasks: [] });
    const started = await page.evaluate(() => {
      const at = performance.now();
      (window as unknown as { __land: () => void }).__land();
      return at;
    });
    await page.waitForTimeout(3000);
    const seen = await watched(page);
    const task = longest(seen.tasks, started);
    kit.check(
      `${CALLS} calls put in front: the longest main-thread task under ${BUDGET_MS}ms`,
      task.ms < BUDGET_MS,
      task.count === 0
        ? "no task of 50ms or more (the longtask threshold)"
        : `${task.ms.toFixed(0)}ms, ${task.count} long task(s)`
    );
    const drawn = seen.ys.filter(([, y]) => y !== null) as [number, number][];
    const first = drawn[0]?.[1] ?? 0;
    const widest = Math.max(0, ...drawn.map(([, y]) => Math.abs(y - first)));
    kit.check(
      `${anchor} holds still to the pixel while the page lands`,
      drawn.length > 1 && widest < 1,
      `${drawn.length} painted frames (${seen.ys.length - drawn.length} without it), widest move ${widest.toFixed(1)}px`
    );
    const errors = [...seen.errors, ...pageErrors];
    kit.check(
      "no page or window error",
      errors.length === 0,
      errors.slice(0, 3).join(" | ")
    );
  },
};
export default spec;
