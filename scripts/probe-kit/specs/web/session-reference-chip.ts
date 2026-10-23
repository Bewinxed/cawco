/**
 * A session's reference in a chat message is its chip, and its press opens
 * the session's card, wherever the app draws markdown (markdown-fleet.ts:
 * the app's layout hands in the live references). On the delegate-tray
 * bench (no hub), an agent's reply naming the bench's own session by its
 * link, at 1440 and 390 in Chromium:
 *
 * - the link draws as the session's chip (SessionReference): its mark and
 *   its label, the session's name, standing inside its message's row and
 *   inside the row's text column, no taller than two of the words' lines;
 * - a press on it opens the session's card (HoverPanel, SessionCard): a
 *   dialog named for the session, its name in it, wholly inside the
 *   viewport;
 * - nothing reaches the page's error reporter.
 *
 *   bun scripts/probe-kit/run.ts web session-reference-chip
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one width at a time, on its own page
import type { Page } from "playwright-core";
import { type Kit, open, type Spec, settle, type View } from "../../kit";

const BENCH = "/motion/delegate-tray?case=4";
const SESSION = "delegate-tray-bench";
const LOG = '[data-slot="tr"][role="log"]';
const MESSAGE = `${SESSION}-reference`;
/** An agent's message, and the words that find the one this spec writes. */
const MSG = '[data-slot="msg"]';
const PHRASE = "watch them land";
const CHIP = `[data-session-chip="${SESSION}"]`;

interface Box {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

/** Appends an agent's reply naming the bench's session by its link, and scrolls to it. */
const say = (page: Page) =>
  page.evaluate(
    ([id, message]) => {
      const debug = (
        globalThis as unknown as {
          __cawcoDebug: {
            state: {
              sessions: Record<string, { messages: unknown[] }>;
            };
          };
        }
      ).__cawcoDebug;
      const session = debug.state.sessions[id];
      if (!session) {
        throw new Error(`no session ${id}`);
      }
      // Written whole, as the client writes a session's messages.
      session.messages = [
        ...session.messages,
        {
          id: message,
          instanceId: id,
          type: "assistant",
          content: `The tray's chips now line up; [the bench](cawco:session/${id}) has the twelve delegates if you want to watch them land.`,
          timestamp: new Date().toISOString(),
        },
      ];
    },
    [SESSION, MESSAGE] as const
  );

/** The chip, its label, its message and the words' line height, as laid out. */
const readChip = (page: Page) =>
  page.evaluate(
    ([chipAt, msg, phrase]) => {
      const box = (el: Element | null): Box | null => {
        const rect = el?.getBoundingClientRect();
        return rect
          ? {
              top: rect.top,
              left: rect.left,
              right: rect.right,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            }
          : null;
      };
      const row =
        [...document.querySelectorAll(msg)].find((el) =>
          el.textContent?.includes(phrase)
        ) ?? null;
      const chip = row?.querySelector(chipAt) ?? null;
      const words = chip?.closest("p");
      return {
        chip: box(chip),
        mark: box(chip?.querySelector('[data-slot="mark"]') ?? null),
        label:
          chip?.querySelector('[data-slot="label"]')?.textContent?.trim() ?? "",
        row: box(row),
        column: box(words ?? null),
        line: words ? Number.parseFloat(getComputedStyle(words).lineHeight) : 0,
      };
    },
    [CHIP, MSG, PHRASE] as const
  );

const said = (box: Box | null) =>
  box
    ? `${box.left.toFixed(1)},${box.top.toFixed(1)} ${box.width.toFixed(1)}×${box.height.toFixed(1)}`
    : "none";

const inside = (inner: Box | null, outer: Box | null) =>
  !!inner &&
  !!outer &&
  inner.left >= outer.left - 0.5 &&
  inner.right <= outer.right + 0.5 &&
  inner.top >= outer.top - 0.5 &&
  inner.bottom <= outer.bottom + 0.5;

async function leg(kit: Kit, base: string, view: View, name: string) {
  const page = await kit.page(view);
  const thrown: string[] = [];
  page.on("pageerror", (error) => thrown.push(error.message.slice(0, 300)));
  await open(page, `${base}${BENCH}`, LOG, 120_000);
  await page.waitForSelector(`${LOG} [data-message]`, { timeout: 30_000 });
  await settle(page, 600);
  await say(page);
  const chipHere = page.locator(MSG, { hasText: PHRASE }).locator(CHIP);
  await chipHere.waitFor({ state: "attached", timeout: 15_000 });
  await chipHere.scrollIntoViewIfNeeded();
  await settle(page, 600);
  const read = await readChip(page);
  kit.check(
    `${name}: the session's link draws as its chip, its mark and its name, inside its message's words, no taller than two of their lines`,
    !!read.chip &&
      !!read.mark &&
      read.label.length > 0 &&
      inside(read.chip, read.column) &&
      inside(read.chip, read.row) &&
      read.chip.height <= read.line * 2,
    `chip ${said(read.chip)} "${read.label}", mark ${said(read.mark)}, words ${said(read.column)} (line ${read.line}px), row ${said(read.row)}`
  );

  await chipHere.click();
  const card = page.locator(`[role="dialog"][aria-label="${read.label}"]`);
  await card.waitFor({ state: "visible", timeout: 15_000 });
  await settle(page, 600);
  const opened = await card.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      box: {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      text: el.textContent?.replace(/\s+/g, " ").trim() ?? "",
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  const screen: Box = {
    top: 0,
    left: 0,
    right: opened.viewport.width,
    bottom: opened.viewport.height,
    width: opened.viewport.width,
    height: opened.viewport.height,
  };
  kit.check(
    `${name}: a press on the chip opens the session's card, named for it, its name in it, inside the viewport`,
    opened.box.width > 0 &&
      opened.text.includes(read.label) &&
      inside(opened.box, screen),
    `card ${said(opened.box)} in ${opened.viewport.width}×${opened.viewport.height}: "${opened.text.slice(0, 120)}"`
  );
  kit.check(
    `${name}: nothing reaches the page's error reporter`,
    thrown.length === 0,
    thrown.join(" | ")
  );
  await page.close();
}

const run = async (kit: Kit) => {
  const base = await kit.bench();
  await leg(kit, base, "desk", "1440");
  await leg(kit, base, "phone", "390");
};

const spec: Spec = { name: "session-reference-chip", run };
export default spec;
