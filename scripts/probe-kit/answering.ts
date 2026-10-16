/**
 * Whether a page keeps answering while something happens in it: the hang a
 * phone's Safari showed ("stop responding and it didn't even show") is a
 * web process that stops answering scripts, then is killed.
 */
import type { Page } from "playwright-core";

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
      const answered = await Promise.race([
        page
          .evaluate(() => 1)
          .then(
            () => true,
            () => false
          ),
        Bun.sleep(10_000).then(() => false),
      ]);
      longest = Math.max(
        longest,
        answered ? performance.now() - started : 10_000
      );
      if (!answered) {
        return;
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
