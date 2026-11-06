/**
 * A seek lands on the words, not just the row. When the transcript seeks to
 * a record (a `?at=` link, Jump's "Where it was said"), the words that
 * matched end up in the band the reader sees: under the bar floating over
 * the transcript's top (its `headRoom`) and above the composer's foot
 * (`[data-slot="foot"]`). Asked with no words, the record's top stands in
 * that band. Open-at's seek used to centre the record's row, and a row taller
 * than the view started at the view's top: the words at the end of a test
 * run's output were left under the composer on a phone, and the record's
 * top under the head.
 *
 * On the traffic bench (/motion/traffic, the real transcript) at 390×844,
 * in Safari's engine: a conversation whose middle is one run of 40 calls,
 * the last a test run with 160 lines of output (drawn open, its output
 * capped and scrolling on its own) and the word "flaky" on its 155th line,
 * a bar 56px over the transcript's top. Each leg loads it whole (at its
 * tail), asks the bench to open it at that call, as `askOpenAt` does for
 * the address, and reads the page once the record is marked:
 *
 *  - words: asked with "flaky", the word's box stands inside the band and
 *    inside the output's own box;
 *  - record: asked with no words, the call's top stands inside the band.
 *
 *   bun scripts/probe-kit/run.ts web seek-words
 */
import type { Page } from "playwright-core";
import { SCROLLER } from "../../frames";
import { open, type Spec } from "../../kit";

/** The bar over the transcript's top: a docked pane's head, near enough. */
const HEAD = 56;
/** The call sought: the run's last, the test run. */
const SOUGHT = "tool-40";
const WORD = "flaky";

/** The conversation, as the hub reads one back. */
const conversation = () => {
  let clock = Date.parse("2026-11-06T09:00:00Z");
  const at = () => {
    clock += 4000;
    return new Date(clock).toISOString();
  };
  const said = (id: string, content: string) => ({
    id,
    type: "assistant",
    content,
    timestamp: at(),
  });
  const lines = Array.from({ length: 160 }, (_, i) =>
    i === 154
      ? "  ✗ transcript-holds › reload far up — flaky: passed on its third try"
      : `  ✓ transcript-holds › leg ${i + 1}: the place holds to the pixel (${(12 + ((i * 7) % 40)).toFixed(0)}ms)`
  );
  const commands = [
    ["Read", "apps/dashboard/src/lib/cawco/transcript/Transcript.svelte"],
    ["Grep", "seekInto"],
    ["Bash", "git diff --stat"],
    ["Read", "apps/dashboard/src/lib/cawco/transcript/open-at.svelte.ts"],
  ] as const;
  const call = (n: number) => {
    const last = n === 40;
    const [tool, arg] = last
      ? (["Bash", "bun run test transcript-holds"] as const)
      : (commands[n % commands.length] as readonly [string, string]);
    return {
      id: `tool-${n}`,
      toolCallId: `call-${n}`,
      type: "tool.use",
      content: "",
      timestamp: at(),
      metadata: {
        toolName: tool,
        toolInput:
          tool === "Bash"
            ? {
                command: arg,
                description: last ? "Run the transcript suite" : "See the diff",
              }
            : { file_path: arg, pattern: arg },
        toolResult: last ? lines.join("\n") : "ok",
        toolStatus: "success",
      },
    };
  };
  return [
    ...Array.from({ length: 8 }, (_, i) =>
      said(
        `before-${i}`,
        `Turn ${i + 1}: the seek's place is read off virtua's sizes, and the row it lands on is marked until the reader moves on.`
      )
    ),
    {
      id: "ask",
      type: "user",
      content: "Run the transcript suite and tell me what failed.",
      timestamp: at(),
    },
    ...Array.from({ length: 40 }, (_, i) => call(i + 1)),
    ...Array.from({ length: 6 }, (_, i) =>
      said(
        `after-${i}`,
        `After the run, ${i + 1}: one leg passed only on its third try, so the suite reads green with one retry.`
      )
    ),
  ];
};

interface Bench {
  head: (length: string | undefined) => void;
  landed: () => boolean;
  load: (blocks: unknown[]) => void;
  open: (call: string) => void;
  seek: (at: string, terms?: string[]) => void;
}

/** What a leg reads once the record is marked, px from the page's top. */
interface Seen {
  band: { top: number; bottom: number };
  /** The output's own box, which clips what it scrolls. */
  clip: { top: number; bottom: number } | null;
  record: { top: number; bottom: number } | null;
  word: { top: number; bottom: number } | null;
}

/** The conversation loaded whole, landed at its tail, then opened at the call. */
async function seek(page: Page, terms: string[]): Promise<Seen> {
  await page.evaluate(
    ([blocks, head]) => {
      const bench = (window as unknown as { __traffic: Bench }).__traffic;
      bench.head(`${head}px`);
      bench.open("call-40");
      bench.load(blocks);
    },
    [conversation(), HEAD] as const
  );
  await page.waitForFunction(
    () => (window as unknown as { __traffic: Bench }).__traffic.landed(),
    null,
    { timeout: 30_000 }
  );
  await page.waitForTimeout(1000);
  await page.evaluate(
    ([at, words]) =>
      (window as unknown as { __traffic: Bench }).__traffic.seek(at, words),
    [SOUGHT, terms] as const
  );
  await page.waitForSelector('[data-marked="on"]', { timeout: 30_000 });
  await page.waitForTimeout(1000);
  return page.evaluate(
    ([scrollerAt, sought, word, head]) => {
      const scroller = document.querySelector(scrollerAt);
      const foot = scroller?.querySelector('[data-slot="foot"]');
      const record = scroller?.querySelector(`[data-message="${sought}"]`);
      if (!(scroller && foot)) {
        throw new Error("no transcript drawn");
      }
      const view = scroller.getBoundingClientRect();
      const band = {
        top: view.top + head,
        bottom: view.bottom - foot.getBoundingClientRect().height,
      };
      let found: Seen["word"] = null;
      let clip: Seen["clip"] = null;
      if (record) {
        const walker = document.createTreeWalker(record, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const index = (node.nodeValue ?? "").indexOf(word);
          if (index < 0) {
            continue;
          }
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + word.length);
          const box = range.getBoundingClientRect();
          found = { top: box.top, bottom: box.bottom };
          const pre = node.parentElement?.closest("pre");
          if (pre) {
            const room = pre.getBoundingClientRect();
            clip = { top: room.top, bottom: room.bottom };
          }
          break;
        }
      }
      const box = record?.getBoundingClientRect();
      return {
        band,
        clip,
        record: box ? { top: box.top, bottom: box.bottom } : null,
        word: found,
      };
    },
    [SCROLLER, SOUGHT, WORD, HEAD] as const
  );
}

const within = (
  box: { top: number; bottom: number },
  room: { top: number; bottom: number }
): boolean => box.top >= room.top - 0.5 && box.bottom <= room.bottom + 0.5;

const px = (box: { top: number; bottom: number } | null): string =>
  box ? `${box.top.toFixed(0)}–${box.bottom.toFixed(0)}` : "none";

const spec: Spec = {
  name: "seek-words",
  group: "iPhone Safari",
  async run(kit) {
    const page = await kit.page("phone", { engine: "webkit", theme: "light" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await open(
      page,
      `${await kit.built()}/motion/traffic`,
      () => "__traffic" in window
    );

    const words = await seek(page, [WORD]);
    kit.check(
      `390: opened at the test run with "${WORD}", the word stands in the band between the head and the composer, and in its output's box`,
      words.word !== null &&
        within(words.word, words.band) &&
        (words.clip === null || within(words.word, words.clip)),
      `word ${px(words.word)}, band ${px(words.band)}, output ${px(words.clip)}`
    );

    const record = await seek(page, []);
    kit.check(
      "390: opened at the test run with no words, the record's top stands in the band, under the head",
      record.record !== null &&
        record.record.top >= record.band.top - 0.5 &&
        record.record.top < record.band.bottom,
      `record ${px(record.record)}, band ${px(record.band)}`
    );

    kit.check(
      "no page error",
      errors.length === 0,
      errors.slice(0, 3).join(" | ")
    );
    await page.close();
  },
};
export default spec;
