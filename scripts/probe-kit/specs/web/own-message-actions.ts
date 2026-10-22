/**
 * A person's own message offers its actions in one row under it, at its
 * end (the owner, on the edit pen drawn over his message's time: "the edit
 * icon shows behind the text and timestamp", then "refer to the best ux
 * practice"). A scratch fleet (real hub, agent and sessiond against the mock
 * model) and the built dashboard. One Claude Code session holds a message
 * alone ("hello") and a 40-word line, each answered. A second holds a run
 * of three: queued behind a turn that is still working, as a person's run
 * of messages stands in the product, one run in one well under one header
 * (Claude Code answers a turn with nothing to show by asking for one, so a
 * read run has an answer between its messages).
 *
 * On Chromium and WebKit, at 1440 and 680 (a mouse) and 390 (a finger):
 *  1. each message's row is revealed by the leg's own input (hover, a tap)
 *     and holds Copy message, Edit message where the message can be
 *     rewound or is queued, and Fork from here where it can branch, each
 *     what a press at its centre lands on;
 *  2. its box meets neither the header's clock, its note, the words, nor the
 *     next turn; it stands under the words, inside the well, its last glyph
 *     ending on the words' end; and every turn's box is the same before and
 *     after it shows (it changes paint only);
 *  3. Copy puts the message's words on the clipboard (pasted back into the
 *     composer), its glyph turning to the drawn check;
 *  4. Edit message opens the edit state, which says the rewind's cost before
 *     Send edited message, and Cancel edit puts the words back;
 *  5. the page holds the overflow and overlap scan (journeys/scan.ts) with
 *     the row shown: zero findings over every leg.
 * At 1440, on both engines, the keyboard reaches the row from the page's
 * start by Tab alone, shows it, and Enter copies and opens Edit (Esc
 * cancels). Fork from here runs for real by a mouse (Chromium 1440), a
 * finger (WebKit 390) and the keyboard (WebKit 1440): a new session on the
 * hub, the page on it. Edit message on a queued message lifts its words
 * into the composer. A failed send's recovery (Send again) stands
 * in its failure block only, never in the row. Last, Send edited message
 * rewinds for real: the edited words stand where the 40-word line was,
 * nothing after it, and a reload says the same.
 *
 *   bun scripts/probe-kit/run.ts web own-message-actions
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time, as a person takes them
import type { Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../../scratch-fleet";
import { scan } from "../../journeys/scan";
import {
  COMPOSER,
  type Engine,
  type Kit,
  type KitFleet,
  open,
  type Spec,
  settle,
  type View,
} from "../../kit";

const ONE = "hello";
const LONG =
  "Please read the failing build log from last night, find the first test that broke, explain in plain words why it broke, then fix the cause rather than the symptom and tell me which files you changed and why each one";
/** Said after the 40-word line, so the rewind has something to replace. */
const AFTER = "and one more thing";
const RUN = ["run one", "run two", "run three"];
/** A turn that stays at work through every leg, so the run stays queued behind it. */
const HOLD = "hold this turn open";
const EDITED = "edited words, sent again";
const COST =
  "Sending goes back to this message and replaces everything after it in the conversation.";

const ROW = "[data-message-actions]";
const TURN = 'section[data-slot="turn"]';

/**
 * The mock's answers: a word, or for HOLD one word and then a space every
 * 20s for 40 minutes, so its live line keeps its height while the stream
 * stays alive.
 */
const respond = (request: Seen): Reply =>
  request.last.trim() === HOLD
    ? { everyMs: 20_000, words: ["Working.", ...new Array(120).fill(" ")] }
    : { everyMs: 20, words: ["Ready."] };

const LEGS: { engine: Engine; view: View; label: string; touch: boolean }[] = [
  { engine: "chromium", view: "desk", label: "chromium 1440", touch: false },
  {
    engine: "chromium",
    view: "narrowDesk",
    label: "chromium 680",
    touch: false,
  },
  { engine: "chromium", view: "phone", label: "chromium 390", touch: true },
  { engine: "webkit", view: "desk", label: "webkit 1440", touch: false },
  { engine: "webkit", view: "narrowDesk", label: "webkit 680", touch: false },
  { engine: "webkit", view: "phone", label: "webkit 390", touch: true },
];

/** A workspace of one group holding `tabs`, the first in front, as workspace.svelte.ts stores it. */
const treeOf = (tabs: string[]) =>
  JSON.stringify({
    v: 1,
    root: { t: "l", id: "pone", tabs, active: tabs[0], opened: null },
    focusedLeaf: "pone",
  });

/** Sends `text` to `source` and waits for the turn it opens to close. */
async function say(fleet: KitFleet, source: string, text: string) {
  const uuid = await fleet.send(source, text);
  await until(
    `"${text}" read`,
    () => fleet.sendRow(uuid),
    (one) => one?.state === "read",
    120_000
  );
  await until(
    `"${text}" answered`,
    () =>
      fleet.query<{ session_id: string | null; turn_open_at: number | null }>(
        "SELECT session_id, turn_open_at FROM instances WHERE id = ?",
        source
      )[0],
    (one) => Boolean(one?.session_id) && one?.turn_open_at === null,
    120_000
  );
}

async function sessionPage(
  kit: Kit,
  base: string,
  source: string,
  leg: { engine: Engine; view: View }
): Promise<Page> {
  const page = await kit.page(leg.view, { theme: "light", engine: leg.engine });
  if (leg.engine === "chromium") {
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  await page.addInitScript(
    (tree) => {
      localStorage.setItem("cawco-workspace", tree);
    },
    treeOf([source])
  );
  await open(page, `${base}/session/${source}`, ROW, 120_000);
  await settle(page, 400);
  return page;
}

/** The person's turn whose words are `text`, as a locator. */
const turnOf = (page: Page, text: string) =>
  page
    .locator(`${TURN}[data-you]`)
    .filter({
      has: page.locator("[data-lift-words]", {
        hasText: new RegExp(
          `^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`
        ),
      }),
    })
    .first();

/** The turn showing message `id`, whatever its words are doing (an edit holds them in a field). */
const byId = (page: Page, id: string) =>
  page.locator(`${TURN}[data-message="${id}"]`);

/** The message id of the person's turn whose words are `text`. */
async function idOf(page: Page, text: string): Promise<string> {
  const id = await turnOf(page, text).getAttribute("data-message", {
    timeout: 30_000,
  });
  if (!id) {
    throw new Error(`the turn saying "${text}" names no message`);
  }
  return id;
}

interface Box {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

interface Measure {
  buttons: { name: string; hit: boolean }[];
  clock: Box | null;
  /** The last glyph's end less the words' end (the well's content edge), css px. */
  endOffset: number | null;
  next: Box | null;
  note: Box | null;
  opacity: number;
  row: Box | null;
  /** Every drawn turn's box in the scroller's content, by its message. */
  turns: Record<string, Box>;
  well: Box | null;
  words: Box | null;
}

/** Reads the turn whose words are `text` and every drawn turn's box, in the page. */
function measure(text: string): Measure | null {
  const box = (el: Element | null | undefined): Box | null => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return { top: r.top, right: r.right, bottom: r.bottom, left: r.left };
  };
  const all = [
    ...document.querySelectorAll<HTMLElement>('section[data-slot="turn"]'),
  ].filter((one) => one.getClientRects().length > 0);
  const turn = all.find(
    (one) =>
      one.hasAttribute("data-you") &&
      one.querySelector("[data-lift-words]")?.textContent?.trim() === text
  );
  if (!turn) {
    return null;
  }
  let scroller: HTMLElement | null = turn.parentElement;
  while (scroller && scroller.scrollHeight <= scroller.clientHeight + 1) {
    scroller = scroller.parentElement;
  }
  const origin = scroller?.getBoundingClientRect().top ?? 0;
  const lift = scroller?.scrollTop ?? 0;
  const turns: Record<string, Box> = {};
  all.forEach((one, i) => {
    const r = one.getBoundingClientRect();
    const key = one.dataset.message ?? `#${i}`;
    turns[key] = {
      top: r.top - origin + lift,
      bottom: r.bottom - origin + lift,
      left: r.left,
      right: r.right,
    };
  });
  const row = turn.querySelector<HTMLElement>("[data-message-actions]");
  const well = turn.querySelector<HTMLElement>('[data-slot="well"]');
  const buttons = [...(row?.querySelectorAll("button") ?? [])].map((b) => {
    const r = b.getBoundingClientRect();
    const at = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2
    );
    return {
      name: b.getAttribute("aria-label") ?? "",
      hit: !!at && b.contains(at),
    };
  });
  let endOffset: number | null = null;
  const last = row?.querySelector("button:last-of-type");
  if (last && well) {
    const r = last.getBoundingClientRect();
    const icon = Number.parseFloat(
      getComputedStyle(last).getPropertyValue("--btn-icon")
    );
    const glyphEnd = r.left + r.width / 2 + icon / 2;
    const ws = getComputedStyle(well);
    const contentEnd =
      well.getBoundingClientRect().right - Number.parseFloat(ws.paddingRight);
    endOffset = glyphEnd - contentEnd;
  }
  const index = all.indexOf(turn);
  return {
    buttons,
    clock: box(turn.querySelector('time[data-slot="when"]')),
    endOffset,
    next: box(all[index + 1]),
    note: box(turn.querySelector('[data-slot="note"]')),
    opacity: row ? Number(getComputedStyle(row).opacity) : 0,
    row: box(row),
    turns,
    well: box(well),
    words: box(turn.querySelector("[data-lift-words]")),
  };
}

const EDGE = 0.5;
const meets = (a: Box | null, b: Box | null): boolean =>
  !!a &&
  !!b &&
  a.left < b.right - EDGE &&
  b.left < a.right - EDGE &&
  a.top < b.bottom - EDGE &&
  b.top < a.bottom - EDGE;

/** The turns drawn in both reads whose box moved, by more than half a pixel. */
const moved = (
  before: Record<string, Box>,
  after: Record<string, Box>
): string[] =>
  Object.keys(before)
    .filter((key) => after[key])
    .filter((key) => {
      const a = before[key] as Box;
      const b = after[key] as Box;
      return (
        Math.abs(a.top - b.top) > EDGE ||
        Math.abs(a.bottom - b.bottom) > EDGE ||
        Math.abs(a.left - b.left) > EDGE ||
        Math.abs(a.right - b.right) > EDGE
      );
    });

/** The leg's own way of showing a message's row: the pointer on its words, or a finger's tap. */
async function reveal(page: Page, text: string, touch: boolean) {
  const words = turnOf(page, text).locator("[data-lift-words]");
  await words.scrollIntoViewIfNeeded();
  await settle(page, 200);
  if (touch) {
    await words.tap();
  } else {
    await words.hover();
  }
  await settle(page, 350);
}

/** The composer's words after a paste of the clipboard into it, then emptied again. */
async function pasteBack(page: Page, touch: boolean): Promise<string> {
  const field = page.locator(COMPOSER).filter({ visible: true }).first();
  if (touch) {
    await field.tap();
  } else {
    await field.click();
  }
  await page.keyboard.press("ControlOrMeta+V");
  await settle(page, 250);
  const pasted = (await field.innerText()).trim();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await settle(page, 150);
  return pasted;
}

/** Tab from where the focus is until it lands on `name` in the turn saying `text`; how many presses. */
async function tabTo(
  page: Page,
  text: string,
  name: string,
  most = 600
): Promise<number | null> {
  for (let press = 1; press <= most; press += 1) {
    await page.keyboard.press("Tab");
    const there = await page.evaluate(
      (wanted) => {
        const held = document.activeElement;
        const turn = held?.closest('section[data-slot="turn"]');
        return (
          held?.getAttribute("aria-label") === wanted.name &&
          turn?.querySelector("[data-lift-words]")?.textContent?.trim() ===
            wanted.text
        );
      },
      { text, name }
    );
    if (there) {
      return press;
    }
  }
  return null;
}

/** One message's row, read and held to the layout rules, in one leg. */
async function rowLeg(
  kit: Kit,
  page: Page,
  label: string,
  text: string,
  expect: string[],
  touch: boolean
) {
  await turnOf(page, text).scrollIntoViewIfNeeded();
  await settle(page, 200);
  const before = await page.evaluate(measure, text);
  await reveal(page, text, touch);
  const after = await page.evaluate(measure, text);
  const name = text.length > 20 ? "the 40-word line" : `"${text}"`;
  if (!(before && after)) {
    kit.check(`${label}: ${name} is drawn`, false, "not found");
    return;
  }
  kit.check(
    `${label}: ${name}'s row shows (${touch ? "a tap" : "the pointer"}) with ${expect.join(", ")}, each what a press at its centre lands on`,
    after.opacity === 1 &&
      after.buttons.map((b) => b.name).join("|") === expect.join("|") &&
      after.buttons.every((b) => b.hit),
    JSON.stringify({ opacity: after.opacity, buttons: after.buttons })
  );
  kit.check(
    `${label}: ${name}'s row meets neither the clock, the note, the words nor the next turn`,
    !(
      meets(after.row, after.clock) ||
      meets(after.row, after.note) ||
      meets(after.row, after.words) ||
      meets(after.row, after.next)
    ),
    JSON.stringify({
      row: after.row,
      clock: after.clock,
      note: after.note,
      words: after.words,
      next: after.next,
    })
  );
  const row = after.row as Box;
  const well = after.well as Box;
  const words = after.words as Box;
  kit.check(
    `${label}: ${name}'s row stands under the words inside the well, its last glyph on the words' end`,
    row.top >= words.bottom - EDGE &&
      row.left >= well.left - EDGE &&
      row.right <= well.right + EDGE &&
      row.bottom <= well.bottom + EDGE &&
      Math.abs(after.endOffset ?? 99) <= 1,
    JSON.stringify({ row, well, words, endOffset: after.endOffset })
  );
  const shifted = moved(before.turns, after.turns);
  kit.check(
    `${label}: showing ${name}'s row moves no turn (${Object.keys(before.turns).length} read)`,
    shifted.length === 0,
    shifted.join(", ")
  );
}

/** Copy on the 40-word line by the leg's input, pasted back; then Edit's state and its Cancel. */
async function copyEditLeg(
  kit: Kit,
  page: Page,
  label: string,
  touch: boolean
) {
  await reveal(page, LONG, touch);
  const turn = byId(page, await idOf(page, LONG));
  const copy = turn.getByRole("button", { name: "Copy message" });
  if (touch) {
    await copy.tap();
  } else {
    await copy.click();
  }
  await settle(page, 200);
  // PendingContent's drawn check, up for --dur-hold (1.2s) after the copy.
  const checked = await copy.evaluate(
    (b) => b.querySelector('[data-slot="tick"][data-on]') !== null
  );
  kit.check(
    `${label}: Copy message turns its glyph to the drawn check`,
    checked
  );
  const pasted = await pasteBack(page, touch);
  kit.check(
    `${label}: Copy message put the 40-word line on the clipboard (pasted back into the composer)`,
    pasted === LONG,
    pasted
  );
  await reveal(page, LONG, touch);
  const edit = turn.getByRole("button", { name: "Edit message" });
  if (touch) {
    await edit.tap();
  } else {
    await edit.click();
  }
  await settle(page, 300);
  const state = await turn.evaluate((el) => {
    const field = el.querySelector("textarea");
    const cost = el.querySelector('[data-slot="edit-cost"]');
    const send = [...el.querySelectorAll("button")].find(
      // A pending button keeps both its words in one cell: its text starts with its label.
      (b) => b.textContent?.trim().startsWith("Send edited message")
    );
    const c = cost?.getBoundingClientRect();
    const s = send?.getBoundingClientRect();
    return {
      value: field?.value ?? null,
      cost: cost?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      above: !!(c && s) && c.bottom <= s.top + 0.5,
      shown:
        !!c &&
        c.height > 0 &&
        getComputedStyle(cost as Element).opacity === "1",
      described:
        field?.getAttribute("aria-describedby") === cost?.id && !!cost?.id,
    };
  });
  kit.check(
    `${label}: Edit message opens the words in place, the cost said above Send edited message`,
    state.value === LONG &&
      state.cost === COST &&
      state.above &&
      state.shown &&
      state.described,
    JSON.stringify(state)
  );
  const cancel = turn.getByRole("button", { name: "Cancel edit" });
  if (touch) {
    await cancel.tap();
  } else {
    await cancel.click();
  }
  await settle(page, 300);
  kit.check(
    `${label}: Cancel edit puts the words back`,
    (await turn.locator("textarea").count()) === 0 &&
      (await turn.locator("[data-lift-words]").innerText()).trim() === LONG
  );
}

/** The page's spill and overlap scan with the row of the message saying `text` shown: its findings. */
async function scanLeg(
  page: Page,
  text: string,
  touch: boolean
): Promise<string[]> {
  await reveal(page, text, touch);
  return page.evaluate(scan);
}

/** The keyboard alone: Tab from the page's start to the row, Enter to copy, Enter to edit, Esc. */
async function keyboardLeg(kit: Kit, page: Page, label: string) {
  await page.mouse.move(2, 2);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  const presses = await tabTo(page, LONG, "Copy message");
  await settle(page, 350);
  const shown = await page.evaluate(measure, LONG);
  kit.check(
    `${label} (keyboard): Tab alone reaches the 40-word line's Copy message (${presses ?? "never"} presses), its row shown and covering nothing`,
    presses !== null &&
      shown?.opacity === 1 &&
      !(
        meets(shown.row, shown.clock) ||
        meets(shown.row, shown.words) ||
        meets(shown.row, shown.next)
      ),
    JSON.stringify(shown?.opacity)
  );
  await page.keyboard.press("Enter");
  await settle(page, 200);
  const pasted = await pasteBack(page, false);
  kit.check(
    `${label} (keyboard): Enter on Copy message put the words on the clipboard`,
    pasted === LONG,
    pasted
  );
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur()
  );
  const toEdit = await tabTo(page, LONG, "Edit message");
  await page.keyboard.press("Enter");
  await settle(page, 300);
  const editing = await page.evaluate(
    () => document.activeElement?.tagName === "TEXTAREA"
  );
  kit.check(
    `${label} (keyboard): Tab reaches Edit message, Enter opens the edit with the focus in its field`,
    toEdit !== null && editing
  );
  const editingId = await page.evaluate(
    () =>
      document.activeElement
        ?.closest<HTMLElement>('section[data-slot="turn"]')
        ?.getAttribute("data-message") ?? ""
  );
  await page.keyboard.press("Escape");
  await settle(page, 300);
  const turn = byId(page, editingId);
  kit.check(
    `${label} (keyboard): Esc cancels the edit, the words back`,
    editingId !== "" &&
      (await turn.locator("textarea").count()) === 0 &&
      (await turn.locator("[data-lift-words]").innerText()).trim() === LONG
  );
}

/** Fork from here pressed for real, by `how`: a new session on the hub, the page on it. */
async function forkLeg(
  kit: Kit,
  page: Page,
  fleet: KitFleet,
  label: string,
  source: string,
  how: "click" | "tap" | "keyboard"
) {
  const rows = () =>
    fleet.query<{ id: string }>("SELECT id FROM instances").length;
  const before = rows();
  if (how === "keyboard") {
    await page.mouse.move(2, 2);
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur()
    );
    await tabTo(page, LONG, "Fork from here");
    await page.keyboard.press("Enter");
  } else {
    await reveal(page, LONG, how === "tap");
    const fork = turnOf(page, LONG).getByRole("button", {
      name: "Fork from here",
    });
    if (how === "tap") {
      await fork.tap();
    } else {
      await fork.click();
    }
  }
  const left = await page
    .waitForURL(
      (url) =>
        url.pathname.startsWith("/session/") && !url.pathname.includes(source),
      {
        timeout: 120_000,
      }
    )
    .then(
      () => true,
      () => false
    );
  kit.check(
    `${label} (${how}): Fork from here starts a session on the hub and the page goes to it`,
    left && rows() === before + 1,
    `${page.url()}; sessions ${before} → ${rows()}`
  );
}

const spec: Spec = {
  name: "own-message-actions",
  async run(kit) {
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
    const source = await fleet.spawn("claude", "Own message actions");
    for (const text of [ONE, LONG, AFTER]) {
      await say(fleet, source, text);
    }
    // The run: three messages queued behind a turn still at work.
    const held = await fleet.spawn("claude", "Queued run");
    await say(fleet, held, ONE);
    await fleet.send(held, HOLD);
    await until(
      "the held turn at work",
      () =>
        fleet.query<{ turn_open_at: number | null }>(
          "SELECT turn_open_at FROM instances WHERE id = ?",
          held
        )[0],
      (one) => one?.turn_open_at !== null,
      60_000
    );
    for (const text of RUN) {
      await fleet.send(held, text);
    }

    const findings: string[] = [];
    const full = ["Copy message", "Edit message", "Fork from here"];
    const queued = ["Copy message", "Edit message"];
    for (const leg of LEGS) {
      const page = await sessionPage(kit, base, source, leg);
      // The session's first message has no answer above it to rewind to or
      // branch from: Copy alone.
      await rowLeg(kit, page, leg.label, ONE, ["Copy message"], leg.touch);
      await rowLeg(kit, page, leg.label, LONG, full, leg.touch);
      await rowLeg(kit, page, leg.label, AFTER, full, leg.touch);
      await copyEditLeg(kit, page, leg.label, leg.touch);
      const found = await scanLeg(page, LONG, leg.touch);
      findings.push(...found.map((one) => `${leg.label}: ${one}`));
      if (leg.view === "desk") {
        await keyboardLeg(kit, page, leg.label);
      }
      if (leg.engine === "chromium" && leg.view === "desk") {
        await forkLeg(kit, page, fleet, leg.label, source, "click");
      } else if (leg.engine === "webkit" && leg.view === "phone") {
        await forkLeg(kit, page, fleet, leg.label, source, "tap");
      } else if (leg.engine === "webkit" && leg.view === "desk") {
        await forkLeg(kit, page, fleet, leg.label, source, "keyboard");
      }
      await page.close();

      const run = await sessionPage(kit, base, held, leg);
      await turnOf(run, RUN[2] as string).waitFor({ timeout: 60_000 });
      // The held turn's live line stands between its message and the run.
      await run
        .getByText("Working.", { exact: true })
        .first()
        .waitFor({ timeout: 60_000 });
      await settle(run, 300);
      const grouped = await run.evaluate(
        (texts) =>
          texts.map((text) => {
            const one = [
              ...document.querySelectorAll<HTMLElement>(
                'section[data-slot="turn"][data-you]'
              ),
            ].find(
              (turn) =>
                turn.querySelector("[data-lift-words]")?.textContent?.trim() ===
                text
            );
            return one ? one.hasAttribute("data-grouped") : null;
          }),
        RUN
      );
      // The first of them heads the run, or joins the held message's when
      // the tail was first drawn bare (rows.ts, "THE TAIL KEEPS THE ORDER
      // IT WAS DRAWN IN"); either way the later two are the same run's.
      kit.check(
        `${leg.label}: the three queued messages stand in one run, the later two grouped under its one header (first ${grouped[0] ? "joins the held message's run" : "heads the run"})`,
        grouped[1] === true && grouped[2] === true,
        grouped.join(",")
      );
      for (const text of RUN) {
        await rowLeg(kit, run, leg.label, text, queued, leg.touch);
      }
      const inRun = await scanLeg(run, RUN[1] as string, leg.touch);
      findings.push(...inRun.map((one) => `${leg.label} (run): ${one}`));
      await run.close();
    }
    kit.check(
      `the page's spill and overlap scan with a row shown, over all ${LEGS.length} legs and both sessions: ${findings.length} findings`,
      findings.length === 0,
      findings.slice(0, 12).join(" | ")
    );

    await failedLeg(kit, base, source);
    await liftLeg(kit, base, held);
    await rewindLeg(kit, base, fleet, source);
  },
};

/**
 * A failed send (the hub's record: `state: "failed"` with its reason, as
 * core transcript-rules.ts writes one): its row holds Copy alone, and Send
 * again stands in its failure block, under the reason.
 */
async function failedLeg(kit: Kit, base: string, source: string) {
  const page = await kit.page("desk", { theme: "light" });
  await page.route("**/api/instances/*/transcript*", async (route) => {
    const response = await route.fetch();
    const read = (await response.json()) as {
      blocks?: { metadata?: object; type?: string; content?: unknown }[];
    };
    const blocks = read.blocks ?? [];
    const last = blocks.findLastIndex((block) => block.type === "user");
    await route.fulfill({
      response,
      json: {
        ...read,
        blocks: blocks.map((block, i) =>
          i === last
            ? {
                ...block,
                state: "failed",
                metadata: {
                  ...block.metadata,
                  sendFailed:
                    "The machine stopped answering before it read it.",
                },
              }
            : block
        ),
      },
    });
  });
  await page.addInitScript(
    (tree) => {
      localStorage.setItem("cawco-workspace", tree);
    },
    treeOf([source])
  );
  await open(page, `${base}/session/${source}`, ROW, 120_000);
  await settle(page, 400);
  await reveal(page, AFTER, false);
  const turn = turnOf(page, AFTER);
  const row = await turn
    .locator(ROW)
    .getByRole("button")
    .evaluateAll((all) => all.map((b) => b.getAttribute("aria-label")));
  const failure = await turn
    .locator('[data-slot="failure"]')
    .evaluate((el) => ({
      reason: el.querySelector('[data-slot="reason"]')?.textContent?.trim(),
      actions: [...el.querySelectorAll("button")].map((b) =>
        b.textContent?.trim()
      ),
    }));
  kit.check(
    "1440: a failed send's row holds Copy message alone; Send again stands in its failure block under the reason",
    row.join("|") === "Copy message" &&
      failure.actions.some((one) => one?.startsWith("Send again")) &&
      (failure.reason ?? "").startsWith("Couldn't send that message."),
    JSON.stringify({ row, failure })
  );
  await page.close();
}

/** Edit message on a queued message (the run's last) lifts its words into the composer. */
async function liftLeg(kit: Kit, base: string, held: string) {
  const text = RUN[2] as string;
  const page = await sessionPage(kit, base, held, {
    engine: "chromium",
    view: "desk",
  });
  await reveal(page, text, false);
  await turnOf(page, text)
    .getByRole("button", { name: "Edit message" })
    .click();
  const field = page.locator(COMPOSER).filter({ visible: true }).first();
  const lifted = await until(
    "the queued words in the composer",
    async () => (await field.innerText()).trim(),
    (words) => words === text,
    15_000
  ).then(
    () => true,
    () => false
  );
  kit.check(
    "1440: Edit message on a queued message lifts its words into the composer",
    lifted,
    (await field.innerText()).trim()
  );
  await page.close();
}

/**
 * Send edited message for real, last (it replaces what follows): the edited
 * words stand where the 40-word line was and nothing after it, and a reload
 * reads the same from the hub.
 */
async function rewindLeg(
  kit: Kit,
  base: string,
  fleet: KitFleet,
  source: string
) {
  const page = await sessionPage(kit, base, source, {
    engine: "chromium",
    view: "desk",
  });
  await reveal(page, LONG, false);
  const turnRow = byId(page, await idOf(page, LONG));
  await turnRow.getByRole("button", { name: "Edit message" }).click();
  const field = turnRow.getByRole("textbox", { name: "Edit message" });
  await field.fill(EDITED);
  await turnRow.getByRole("button", { name: "Send edited message" }).click();
  const read = () =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          'section[data-slot="turn"][data-you] [data-lift-words]'
        ),
      ].map((one) => one.textContent?.trim() ?? "")
    );
  const landed = await until(
    "the edited words in the transcript",
    read,
    (words) => words.includes(EDITED) && !words.includes(AFTER),
    120_000
  ).then(
    () => true,
    () => false
  );
  kit.check(
    "1440: Send edited message rewinds: the edited words stand after hello and nothing of what followed",
    landed,
    (await read()).join(" | ")
  );
  await until(
    "the rewound turn answered",
    () =>
      fleet.query<{ turn_open_at: number | null }>(
        "SELECT turn_open_at FROM instances WHERE id = ?",
        source
      )[0],
    (one) => one?.turn_open_at === null,
    120_000
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(ROW, { timeout: 60_000 });
  await settle(page, 400);
  const after = await read();
  kit.check(
    "1440: a reload reads the same: hello, then the edited words, and nothing that followed",
    after.join("|") === `${ONE}|${EDITED}`,
    after.join(" | ")
  );
  await page.close();
}

export default spec;
