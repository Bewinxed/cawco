/**
 * Whether a page keeps answering while something happens in it: the hang a
 * phone's Safari showed ("stop responding and it didn't even show") is a
 * web process that stops answering scripts, then is killed.
 */
import type { Page } from "playwright-core";
import { Gone, readWithin } from "../../packages/core/src/bounded";

/** How long the page is given to answer one question; one it never answers counts as this. */
const ANSWER_MS = 10_000;

/**
 * Asks the page a question every 250ms while `work` runs: the longest it
 * took to answer. A page that never answers again (its web process gone)
 * counts as 10s, and the watch ends.
 */
export async function answering<T>(
  page: Page,
  work: () => Promise<T>
): Promise<{ longest: number; result: T }> {
  let longest = 0;
  let going = true;
  const watch = (async () => {
    while (going) {
      const started = performance.now();
      // biome-ignore lint/performance/noAwaitInLoops: one question at a time, timed
      const asked = await readWithin(ANSWER_MS, () =>
        page
          .evaluate(() => 1)
          .catch((error: unknown) => {
            throw new Gone(`the page's web process: ${error}`);
          })
      );
      switch (asked.kind) {
        case "answered":
          longest = Math.max(longest, performance.now() - started);
          break;
        case "unanswered":
          longest = Math.max(longest, ANSWER_MS);
          return;
        default: {
          const unhandled: never = asked;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
      }
      await Bun.sleep(250);
    }
  })();
  try {
    const result = await work();
    going = false;
    // The question in flight as the work ends is counted too.
    await watch;
    return { result, longest };
  } finally {
    going = false;
    await watch;
  }
}

/** Whether `promise` settled without throwing. */
export const settled = <T>(promise: Promise<T>): Promise<boolean> =>
  promise.then(
    () => true,
    () => false
  );
