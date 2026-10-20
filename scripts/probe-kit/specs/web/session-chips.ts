/**
 * A message's link to a session, `[label](cawco:session/<id>)` (core
 * references.ts), draws as the session's chip through the Markdown
 * renderer's one link rule and its kind registry (dashboard references.ts),
 * read from the engine on the built dashboard against a scratch fleet:
 *
 *   bun scripts/probe-kit/run.ts web session-chips
 *
 * Two sessions: "Chip target", which has answered a turn, and a reader. The
 * person's message to the reader links the target, then a session id no
 * one has, then a kind the dashboard does not draw, then the target's link
 * again inside a code span. At 1440 (a mouse) and 390 (a finger):
 *
 *  1. the message holds one chip, the target's, reading its live title,
 *     its words on the line's baseline;
 *  2. the unknown id and the unknown kind are their labels' words, no link,
 *     and the code span is the link's source, no chip;
 *  3. pressing the chip opens the popover with the target's card and its
 *     live tail, and goes nowhere;
 *  4. Escape closes it and the focus is back on the chip;
 *  5. Open session in it opens `/session/<target>`;
 *  6. no page error.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time, in order
import { join } from "node:path";
import type { Page } from "playwright-core";
import type { Reply, Seen } from "../../../scratch-fleet";
import { type Kit, open, settle, type Spec, type View } from "../../kit";

const TARGET_TITLE = "Chip target";
const TARGET_WORDS = "the target's own turn";
/** What the target answers: the line its tail ends on. */
const TARGET_TAIL = "The target's tail line.";
const GONE = "A session no one has";
const OTHER_KIND = "A kind it does not draw";

const respond = (seen: Seen): Reply => ({
  everyMs: 5,
  words: [seen.last.includes(TARGET_WORDS) ? TARGET_TAIL : "ok"],
});

const CHIP = "[data-session-chip]";
const CARD = '[data-session-card][data-state="open"]';

/** What the reader's message draws: its chips, links and code. */
const readMessage = (page: Page) =>
  page.evaluate(
    ({ gone, other, chip }) => {
      const message = [...document.querySelectorAll('[data-slot="msg"]')].find(
        (each) => each.textContent?.includes("Hand it to")
      );
      if (!message) {
        return null;
      }
      const chips = [...message.querySelectorAll<HTMLElement>(chip)].map(
        (each) => ({
          id: each.dataset.sessionChip ?? "",
          words: each.textContent?.trim() ?? "",
          tag: each.tagName,
        })
      );
      const links = [...message.querySelectorAll("a")].map(
        (each) => each.getAttribute("href") ?? ""
      );
      const code = [...message.querySelectorAll("code")].map((each) => ({
        text: each.textContent ?? "",
        chips: each.querySelectorAll(chip).length,
      }));
      const text = message.textContent ?? "";
      return {
        chips,
        links,
        code,
        gone: text.includes(gone),
        other: text.includes(other),
      };
    },
    { gone: GONE, other: OTHER_KIND, chip: CHIP }
  );

const openReader = async (kit: Kit, base: string, view: View, id: string) => {
  const page = await kit.page(view);
  await page.addInitScript(
    ([tab]) => {
      localStorage.setItem(
        "cawco-workspace",
        JSON.stringify({
          v: 1,
          root: { t: "l", id: "pone", tabs: [tab], active: tab, opened: null },
          focusedLeaf: "pone",
        })
      );
    },
    [id] as const
  );
  await open(page, `${base}/session/${id}`, '[data-slot="pane"]');
  await page
    .locator('[data-slot="msg"]', { hasText: "Hand it to" })
    .first()
    .waitFor({ timeout: 30_000 });
  return page;
};

/** The open popover's card: its title, and whether its tail shows the target's line. */
const cardOf = (page: Page) =>
  page.evaluate(
    ({ selector, tail }) => {
      const card = document.querySelector(selector);
      return card
        ? {
            id: card.getAttribute("data-session-card"),
            title:
              card.querySelector('[data-slot="title"]')?.textContent?.trim() ??
              "",
            tail: card.textContent?.includes(tail) ?? false,
          }
        : null;
    },
    { selector: CARD, tail: TARGET_TAIL }
  );

async function leg(
  kit: Kit,
  base: string,
  view: View,
  ids: { reader: string; target: string },
  errors: string[]
) {
  const check = (what: string, ok: boolean, detail = "") =>
    kit.check(`${view}: ${what}`, ok, detail);
  const page = await openReader(kit, base, view, ids.reader);
  page.on("pageerror", (error) => errors.push(`${view}: ${error.message}`));
  const read = await readMessage(page);
  const chips = read?.chips ?? [];
  check(
    "1: the message holds one chip, the target's, reading its live title",
    chips.length === 1 &&
      chips[0]?.id === ids.target &&
      chips[0]?.words === TARGET_TITLE,
    JSON.stringify(chips)
  );
  // A zero-size box on the baseline: one in the chip's words, one in the
  // words before it, read where each stands.
  const drift = await page.evaluate((selector) => {
    const chip = document.querySelector(selector);
    const words = chip?.querySelector("span:not([data-box])");
    const line = chip?.previousSibling;
    if (!(chip && words && line?.parentNode)) {
      return null;
    }
    const mark = () => {
      const box = document.createElement("span");
      box.style.cssText =
        "display:inline-block;inline-size:0;block-size:0;vertical-align:baseline";
      return box;
    };
    const inChip = mark();
    const inLine = mark();
    words.append(inChip);
    line.parentNode.insertBefore(inLine, chip);
    const at =
      inChip.getBoundingClientRect().top - inLine.getBoundingClientRect().top;
    inChip.remove();
    inLine.remove();
    return Math.round(at * 10) / 10;
  }, CHIP);
  check(
    "1: the chip's words stand on the line's baseline (within 1px)",
    drift !== null && Math.abs(drift) <= 1,
    `${drift}px`
  );
  check(
    "2: the unknown id and kind are their words, no link; the code span is its source",
    !!read &&
      read.gone &&
      read.other &&
      read.links.every((href) => !href.startsWith("cawco:")) &&
      read.code.length === 1 &&
      read.code[0]?.text.includes(`cawco:session/${ids.target}`) === true &&
      read.code[0]?.chips === 0,
    JSON.stringify(read && { ...read, chips: undefined })
  );
  if (chips.length === 0) {
    check("3/4/5: a chip to press", false, "no chip drawn");
    await page.close();
    return;
  }
  const chip = page.locator(CHIP).first();
  await chip.scrollIntoViewIfNeeded();
  await page
    .locator('[data-slot="msg"]', { hasText: "Hand it to" })
    .first()
    .screenshot({ path: join(kit.out, `${view}-message.png`) });
  const at = new URL(page.url()).pathname;
  const press = () => (view === "desk" ? chip.click() : chip.tap());

  await press();
  const opened = await page
    .waitForSelector(CARD, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  // Its tail is read as the popover opens: given until it lands.
  await page
    .waitForFunction(
      ({ selector, tail }) =>
        document.querySelector(selector)?.textContent?.includes(tail),
      { selector: CARD, tail: TARGET_TAIL },
      { timeout: 10_000 }
    )
    .catch(() => undefined);
  const card = opened ? await cardOf(page) : null;
  await settle(page);
  await page.screenshot({ path: join(kit.out, `${view}-popover.png`) });
  check(
    "3: pressing the chip opens the target's card with its live tail, and goes nowhere",
    card?.id === ids.target &&
      card.title === TARGET_TITLE &&
      card.tail &&
      new URL(page.url()).pathname === at,
    JSON.stringify({ card, at, now: new URL(page.url()).pathname })
  );

  await page.keyboard.press("Escape");
  const closed = await page
    .waitForFunction(
      ({ selector, chipAt }) =>
        !document.querySelector(selector) &&
        document.activeElement?.matches(chipAt) === true,
      { selector: CARD, chipAt: CHIP },
      { timeout: 5000 }
    )
    .then(() => true)
    .catch(() => false);
  check(
    "4: Escape closes it and the focus is back on the chip",
    closed,
    await page.evaluate(
      () =>
        `${document.activeElement?.tagName} ${document.activeElement?.getAttribute("data-slot")}`
    )
  );

  await press();
  const action = page.locator(CARD).getByRole("link", { name: "Open session" });
  const offered = await action
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (offered) {
    await (view === "desk" ? action.click() : action.tap());
  }
  const went = await page
    .waitForURL(`**/session/${ids.target}`, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  check(
    "5: Open session opens /session/<target>",
    went,
    new URL(page.url()).pathname
  );
  await page.close();
}

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const base = await fleet.dashboard();

  const target = await fleet.spawn("claude", TARGET_TITLE);
  const reader = await fleet.spawn("claude", "Chip reader");
  await fleet.send(target, TARGET_WORDS);
  const link = `[the race fix](cawco:session/${target})`;
  await fleet.send(
    reader,
    `Hand it to ${link} first. Not [${GONE}](cawco:session/${crypto.randomUUID()}), nor [${OTHER_KIND}](cawco:task/tsk-12). Its source: \`${link}\`.`
  );

  const errors: string[] = [];
  for (const view of ["desk", "phone"] as const) {
    await leg(kit, base, view, { reader, target }, errors);
  }
  kit.check("6: no page error", errors.length === 0, errors.join(" | "));
};

const spec: Spec = { name: "session-chips", run };
export default spec;
