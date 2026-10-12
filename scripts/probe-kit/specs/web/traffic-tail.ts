/**
 * The transcript's tail on the traffic bench (/motion/traffic, the real
 * `Transcript` driven from `window.__traffic`, no hub), kept mounted while
 * rows arrive, settle and go: no step writes a `NaN` style or raises a
 * window error (a ResizeObserver loop among them), and the page raises none.
 *
 * Steps: land 14 rows; three rounds of five sends, each followed by a tool
 * call and an answer; six rows in one flush; a reasoning block, a tool
 * glance and streamed text settling into one row; two queued sends read;
 * the rows replaced in place by four; a remount on five.
 */
import { watch, watched } from "../../frames";
import { open, type Spec } from "../../kit";

const landed = () =>
  (
    window as unknown as { __traffic: { landed: () => boolean } }
  ).__traffic.landed();

const spec: Spec = {
  name: "traffic-tail",
  run: async (kit) => {
    const page = await kit.page("desk", { init: [watch] });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await open(
      page,
      `${await kit.built()}/motion/traffic`,
      () => "__traffic" in window
    );
    const drive = (script: string) => page.evaluate(script);
    const pause = (ms: number) => page.waitForTimeout(ms);
    /** One step's NaN styles and window errors since the last, as a check. */
    const step = async (name: string) => {
      await pause(600);
      const seen = await page.evaluate(() => {
        const w = (
          window as unknown as { __kit: { nan: string[]; errors: string[] } }
        ).__kit;
        return { nan: w.nan.splice(0), errors: w.errors.splice(0) };
      });
      kit.check(
        `${name}: no NaN style, no window error`,
        seen.nan.length === 0 && seen.errors.length === 0,
        `${seen.nan.length} NaN${seen.nan[0] ? ` (${seen.nan[0]})` : ""}, ${seen.errors.length} errors${seen.errors[0] ? ` (${seen.errors[0]})` : ""}`
      );
    };

    await drive("__traffic.reset(14)");
    await page.waitForFunction(landed, null, { timeout: 30_000 });
    await step("landed on 14 rows");
    for (let round = 1; round <= 3; round += 1) {
      for (let i = 0; i < 5; i += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: the rows land one at a time, as a conversation's do
        await drive(`__traffic.user("send ${round}.${i}")`);
        await pause(150);
        await drive(`__traffic.tool("Bash", "call ${round}.${i}")`);
        await pause(150);
        await drive(`__traffic.assistant("answer ${round}.${i}")`);
        await pause(150);
      }
      await step(`grow, round ${round}: five sends, calls and answers`);
    }
    await drive(
      `(() => { for (let i = 0; i < 6; i += 1) __traffic.assistant("burst " + i); })()`
    );
    await step("grow: six rows in one flush");
    await drive(`__traffic.thinking("pondering")`);
    await pause(200);
    await drive("__traffic.thinking(null)");
    await drive(`__traffic.glance("Bash", "ls")`);
    await pause(200);
    await drive(`__traffic.streaming("streaming words here")`);
    await pause(300);
    await drive(
      `(() => { __traffic.glance("Bash", null); __traffic.streaming(""); __traffic.assistant("streaming words here, settled"); })()`
    );
    await step("shrink: the live rows settle into one");
    await drive(
      `(() => { const a = __traffic.send("q1"); const b = __traffic.send("q2"); window.__queued = [a, b]; })()`
    );
    await pause(300);
    await drive(
      `(() => { for (const id of window.__queued) __traffic.read(id); __traffic.assistant("read both"); })()`
    );
    await step("queued sends read");
    await drive(
      `__traffic.patch({ messages: Array.from({ length: 4 }, (_, i) => ({ id: "p" + i, instanceId: "traffic-bench", type: "assistant", content: "replaced " + i, timestamp: new Date().toISOString() })) })`
    );
    await step("shrink in place: the rows replaced by four");
    await drive(
      `__traffic.load(Array.from({ length: 5 }, (_, i) => ({ id: "l" + i, type: "assistant", content: "loaded " + i, timestamp: new Date().toISOString() })))`
    );
    await page.waitForFunction(landed, null, { timeout: 30_000 });
    await step("remount on five rows");
    const { frames } = await watched(page);
    kit.check(
      "no page error",
      pageErrors.length === 0,
      pageErrors.length === 0
        ? `${frames} frames watched`
        : pageErrors.join(" | ")
    );
  },
};
export default spec;
