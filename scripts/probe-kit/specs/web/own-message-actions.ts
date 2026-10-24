/**
 * A person's own message: its box hugs its words, and its actions stand on
 * its speaker line (the owner's pick, "Actions on the speaker line": Copy,
 * Edit and Fork from here on the "You" line under the pointer or for the
 * keyboard; on a phone one handle at rest opening the sheet "Message"; a
 * queued or failed message's recovery at rest in its well, and no strip).
 * And the highlight rule: the selection pill, the hover ghost and the focus
 * ring take the contour of what they mark, concentric with its container
 * (inner radius = max(0, outer − inset), corner by corner, square where a
 * run opens a part's edge).
 *
 * A scratch fleet (real hub, agent and sessiond against the mock model) and
 * the built dashboard. One Claude Code session holds "hello", a 40-word line
 * and one more, each answered. A second holds a run of three of his
 * messages, read: said one by one and each answered, the answers between
 * them taken out of the transcript the page reads (a route), so the three
 * stand in one run under one header, as a run of his stands in the product.
 *
 * On Chromium and WebKit, at 1440 and 680 (a mouse) and 390 (a finger):
 *  1. at rest each message's well ends on its words: the well's foot is its
 *     words' foot plus its own padding and edge, no band, and nothing of the
 *     actions stands inside the well;
 *  2. (mouse) under the pointer the strip shows on the "You" line, Copy,
 *     Edit and Fork from here where the message offers each, each what a
 *     press at its centre lands on; it meets none of the words, the clock,
 *     the well or the next turn; showing it moves no turn;
 *  3. at rest every later part of the run has its own line with its clock
 *     shown, never an empty line; (mouse) its strip on that line shows for
 *     that part alone;
 *  4. (finger) no strip; the handle stands at rest on the speaker line, and
 *     a press opens the sheet "Message" with Copy, Edit and Fork from here,
 *     each row 44px;
 *  5. (desk) the keyboard reaches the strip by Tab alone: it shows, covers
 *     nothing, the well is chosen and the transcript's selection pill stands
 *     under it in its four corners (a run's middle part: square at top and
 *     foot), the focus
 *     ring on the button its own radius; Enter copies, Edit opens with the
 *     focus in its field, Esc cancels;
 *  6. (mouse) the hover ghost under a context menu's item (the tab's menu,
 *     its edge drawn inside it) takes the item's corners, and the item's are
 *     the menu's 12px less its inset; at the desk Find's rows stand clear of
 *     its card's curve, keep their own 8px, and the ghost under the active
 *     row takes them;
 *  7. on the composer, Send at the shell's end is its 12px less its 8px
 *     inset (the focus ring follows its radius);
 *  8. the page's overflow and overlap scan (journeys/scan.ts): zero, and no
 *     console error on any page.
 * Then, on both engines at 1440: a failed send shows Retry, Edit and Remove
 * at rest under its reason, and no strip under the pointer; a queued message
 * shows Edit in place and Remove from queue at rest and no strip, and
 * Remove from queue takes it out of the queue on the hub. Last (Chromium),
 * Fork from here starts a session, and Send edited message rewinds for real.
 *
 *   bun scripts/probe-kit/run.ts web own-message-actions
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg at a time, as a person takes them
import type { Page } from "playwright-core";
import { shellWords } from "../../../../packages/core/src/words/shell";
import { transcriptWords } from "../../../../packages/core/src/words/transcript";
import { type Reply, type Seen, until } from "../../../scratch-fleet";
import { scan } from "../../journeys/scan";
import {
  buttonNames,
  COMPOSER,
  type Engine,
  type Kit,
  type KitFleet,
  kitsOwnMessage,
  open,
  type Spec,
  settle,
  type View,
} from "../../kit";

const ONE = "hello";
const LONG =
  "Please read the failing build log from last night, find the first test that broke, explain in plain words why it broke, then fix the cause rather than the symptom and tell me which files you changed and why each one";
const AFTER = "and one more thing";
const RUN = ["run one", "run two", "run three"];
/** A turn that stays at work, so a message sent behind it stays queued. */
const HOLD = "hold this turn open";
const QUEUED = "queued words";
const EDITED = "edited words, sent again";
const COST =
  "Sending goes back to this message and replaces everything after it in the conversation.";

const STRIP = "[data-message-actions]";
/** WebKit's word for a ResizeObserver whose answer resized what it watched. */
const LOOP = /ResizeObserver loop/;
const TURN = 'section[data-slot="turn"]';
const ALL = [
  transcriptWords.copyMessage,
  transcriptWords.editMessage,
  transcriptWords.forkFromHere,
];

const respond = (request: Seen): Reply =>
  (request.last.split("<system-reminder>")[0] ?? "").trim() === HOLD
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

interface Block {
  content?: unknown;
  metadata?: object;
  type?: string;
}
type Shape = (blocks: Block[]) => Block[];

/** The person's words in a block, as the transcript read carries them. */
const wordsOf = (block: Block) =>
  typeof block.content === "string" ? block.content.trim() : "";

/** The run: the agent's answers between its first and last message taken out of the read. */
const asRun: Shape = (blocks) => {
  const first = blocks.findIndex(
    (b) => b.type === "user" && wordsOf(b) === RUN[0]
  );
  const last = blocks.findIndex(
    (b) => b.type === "user" && wordsOf(b) === RUN[2]
  );
  return blocks.filter((b, i) => !(i > first && i < last && b.type !== "user"));
};

/** The last message failed, as core transcript-rules.ts writes a failed send's row. */
const asFailed: Shape = (blocks) => {
  const last = blocks.findLastIndex((b) => b.type === "user");
  return blocks.map((b, i) =>
    i === last
      ? {
          ...b,
          state: "failed",
          metadata: {
            ...b.metadata,
            sendFailed: "The machine stopped answering before it read it.",
          },
        }
      : b
  );
};

/** Every console error a page says, the kit's own aside. */
const errorsOf = new WeakMap<Page, string[]>();

async function sessionPage(
  kit: Kit,
  base: string,
  source: string,
  leg: { engine: Engine; view: View },
  shape?: Shape
): Promise<Page> {
  const page = await kit.page(leg.view, { theme: "light", engine: leg.engine });
  const errors: string[] = [];
  errorsOf.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error" && !kitsOwnMessage(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  if (leg.engine === "chromium") {
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  if (shape) {
    await page.route("**/api/instances/*/transcript*", async (route) => {
      const response = await route.fetch();
      const read = (await response.json()) as { blocks?: Block[] };
      await route.fulfill({
        response,
        json: { ...read, blocks: shape(read.blocks ?? []) },
      });
    });
  }
  await page.addInitScript(
    (tree) => {
      localStorage.setItem("cawco-workspace", tree);
    },
    treeOf([source])
  );
  await open(page, `${base}/session/${source}`, `${TURN}[data-you]`, 120_000);
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

const byId = (page: Page, id: string) =>
  page.locator(`${TURN}[data-message="${id}"]`);

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
  /** The well's foot less its words' (its last content's) foot, its padding and its edge. */
  band: number;
  buttons: { name: string; hit: boolean }[];
  clock: Box | null;
  handle: { box: Box; opacity: number } | null;
  /** The strip's line: the turn's own speaker line, or its part's line. */
  line: Box | null;
  next: Box | null;
  note: Box | null;
  opacity: number;
  /** The well's padding at its foot: the room a part above leaves at the seam. */
  pad: number;
  /** A later part of a run: its line stands in the well, on the hairline. */
  part: boolean;
  strip: Box | null;
  /** The strip stands in its line, never among the words. */
  stripInLine: boolean;
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
    turns[one.dataset.message ?? `#${i}`] = {
      top: r.top - origin + lift,
      bottom: r.bottom - origin + lift,
      left: r.left,
      right: r.right,
    };
  });
  const strip = turn.querySelector<HTMLElement>("[data-message-actions]");
  const well = turn.querySelector<HTMLElement>('[data-slot="well"]');
  const line = turn.querySelector<HTMLElement>("[data-turn-who]");
  const handle = turn.querySelector<HTMLElement>('[data-slot="handle"]');
  const buttons = [...(strip?.querySelectorAll("button") ?? [])].map((b) => {
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
  let band = Number.NaN;
  const words = turn.querySelector<HTMLElement>('[data-slot="words"]');
  if (well && words) {
    const last = [...words.children]
      .filter((child) => child.getClientRects().length > 0)
      .at(-1);
    const ws = getComputedStyle(well);
    band =
      well.getBoundingClientRect().bottom -
      (last ?? words).getBoundingClientRect().bottom -
      Number.parseFloat(ws.paddingBottom);
  }
  const index = all.indexOf(turn);
  return {
    band,
    pad: well ? Number.parseFloat(getComputedStyle(well).paddingBottom) : 0,
    buttons,
    clock: box(turn.querySelector('time[data-slot="when"]')),
    handle: handle
      ? {
          box: box(handle) as Box,
          opacity: Number(getComputedStyle(handle).opacity),
        }
      : null,
    line: box(line),
    next: box(all[index + 1]),
    note: box(turn.querySelector('[data-slot="note"]')),
    opacity: strip ? Number(getComputedStyle(strip).opacity) : 0,
    strip: box(strip),
    part: turn.hasAttribute("data-grouped"),
    stripInLine:
      !!strip &&
      !!line?.contains(strip) &&
      !strip.closest("[data-lift-words]") &&
      (turn.hasAttribute("data-grouped")
        ? !!line?.closest('[data-slot="part-line"]')
        : !well?.contains(line)),
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

/** The pointer on the words of the message saying `text`. */
async function hover(page: Page, text: string) {
  const words = turnOf(page, text).locator("[data-lift-words]");
  await words.scrollIntoViewIfNeeded();
  await settle(page, 200);
  await words.hover();
  await settle(page, 350);
}

/** At rest: the well ends on its words, and none of the actions stands in it. */
async function restLeg(kit: Kit, page: Page, label: string, text: string) {
  await page.mouse.move(2, 2);
  await turnOf(page, text).scrollIntoViewIfNeeded();
  await settle(page, 300);
  const at = await page.evaluate(measure, text);
  const name = text.length > 20 ? "the 40-word line" : `"${text}"`;
  const inside = await turnOf(page, text)
    .locator(
      `[data-slot="well"] :is(${STRIP}, [data-slot="handle"]):not([data-slot="part-line"] *)`
    )
    .count();
  kit.check(
    `${label}: at rest ${name}'s well hugs its words (its foot is its words' foot plus its padding, ${at?.band.toFixed(2)}px over), nothing of the actions in it${at?.part ? " but on its part's own line" : ""}`,
    !!at && Math.abs(at.band) <= 1 && inside === 0,
    JSON.stringify({ band: at?.band, inside })
  );
  if (at?.part) {
    // A run's part line says when its message was sent, at rest: its clock
    // shown (or the note standing in its place), never an empty line.
    const line = await turnOf(page, text)
      .locator('[data-slot="part-line"]')
      .evaluate((el) => {
        const said = [
          ...el.querySelectorAll<HTMLElement>(
            'time[data-slot="when"], [data-slot="note"]'
          ),
        ].map((one) => ({
          text: one.textContent?.trim() ?? "",
          opacity: getComputedStyle(one).opacity,
          drawn: one.getClientRects().length > 0,
        }));
        return {
          clock: said.some(
            (one) => one.text !== "" && one.opacity === "1" && one.drawn
          ),
          said,
        };
      });
    kit.check(
      `${label}: at rest ${name}'s part line holds its clock, shown; it never stands empty`,
      line.clock,
      JSON.stringify(line.said)
    );
  }
}

/** Under the pointer: the strip on the speaker line, what it holds, covering nothing, moving nothing. */
async function hoverLeg(
  kit: Kit,
  page: Page,
  label: string,
  text: string,
  expect: string[]
) {
  await page.mouse.move(2, 2);
  await turnOf(page, text).scrollIntoViewIfNeeded();
  await settle(page, 300);
  const before = await page.evaluate(measure, text);
  await hover(page, text);
  const after = await page.evaluate(measure, text);
  const name = text.length > 20 ? "the 40-word line" : `"${text}"`;
  if (!(before && after)) {
    kit.check(`${label}: ${name} is drawn`, false, "not found");
    return;
  }
  kit.check(
    `${label}: under the pointer ${name}'s strip shows on its speaker line with ${expect.join(", ")}, each what a press at its centre lands on`,
    after.opacity === 1 &&
      after.stripInLine &&
      after.buttons.map((b) => b.name).join("|") === expect.join("|") &&
      after.buttons.every((b) => b.hit),
    JSON.stringify({
      opacity: after.opacity,
      inLine: after.stripInLine,
      buttons: after.buttons,
    })
  );
  // A later part's line starts on the hairline from the part above: its
  // strip reaches over the seam no further than the part above's padding,
  // so the words above stay clear, and ends over its own words.
  const clear = after.part
    ? !!(after.strip && after.well) &&
      after.strip.top >= after.well.top - after.pad + EDGE &&
      after.strip.bottom <= (after.words?.top ?? 0) + EDGE
    : !meets(after.strip, after.well);
  kit.check(
    `${label}: ${name}'s strip meets none of the words, the clock, the note, the next turn or ${after.part ? "the words of the part above" : "the well"}`,
    clear &&
      !(
        meets(after.strip, after.words) ||
        meets(after.strip, after.clock) ||
        meets(after.strip, after.note) ||
        meets(after.strip, after.next)
      ),
    JSON.stringify({
      strip: after.strip,
      words: after.words,
      clock: after.clock,
      well: after.well,
      next: after.next,
    })
  );
  const shifted = moved(before.turns, after.turns);
  kit.check(
    `${label}: showing ${name}'s strip moves no turn (${Object.keys(before.turns).length} read)`,
    shifted.length === 0,
    shifted.join(", ")
  );
}

/** One part of the run: its own line with its clock, its strip on that line for it alone. */
async function runLeg(kit: Kit, page: Page, label: string) {
  const parts = await page.evaluate((texts) => {
    const turns = [
      ...document.querySelectorAll<HTMLElement>(
        'section[data-slot="turn"][data-you]'
      ),
    ];
    return texts.map((text) => {
      const turn = turns.find(
        (one) =>
          one.querySelector("[data-lift-words]")?.textContent?.trim() === text
      );
      const line = turn?.querySelector("[data-turn-who]");
      return {
        grouped: turn?.hasAttribute("data-grouped") ?? null,
        clock: !!line?.querySelector('time[data-slot="when"]'),
        strip: !!line?.querySelector("[data-message-actions]"),
        partLine: !!turn?.querySelector(
          '[data-slot="well"] [data-slot="part-line"] [data-turn-who]'
        ),
      };
    });
  }, RUN);
  kit.check(
    `${label}: the run of three stands under one header, each later part with its own line in the well, every part's line with its clock and its strip`,
    parts[0]?.grouped === false &&
      parts.slice(1).every((part) => part.grouped && part.partLine) &&
      parts.every((part) => part.clock && part.strip),
    JSON.stringify(parts)
  );
  for (const text of RUN) {
    await hoverLeg(kit, page, `${label} (run)`, text, ALL);
    const shown = await page.evaluate(
      (texts) =>
        texts.map((one) => {
          const turn = [
            ...document.querySelectorAll<HTMLElement>(
              'section[data-slot="turn"][data-you]'
            ),
          ].find(
            (t) =>
              t.querySelector("[data-lift-words]")?.textContent?.trim() === one
          );
          const strip = turn?.querySelector("[data-message-actions]");
          return strip ? Number(getComputedStyle(strip).opacity) : -1;
        }),
      RUN
    );
    kit.check(
      `${label} (run): the pointer on "${text}" shows its part's strip alone`,
      shown.every((opacity, i) => opacity === (RUN[i] === text ? 1 : 0)),
      shown.join(",")
    );
  }
}

/** A finger: no strip; the handle at rest; a press opens the sheet with its rows. */
async function phoneLeg(kit: Kit, page: Page, label: string) {
  await turnOf(page, LONG).scrollIntoViewIfNeeded();
  await settle(page, 300);
  const at = await page.evaluate(measure, LONG);
  const strips = await turnOf(page, LONG).locator(STRIP).count();
  kit.check(
    `${label}: no strip; the handle stands at rest on the 40-word line's speaker line, clear of the well`,
    strips === 0 &&
      !!at?.handle &&
      at.handle.opacity === 1 &&
      !meets(at.handle.box, at.well) &&
      !meets(at.handle.box, at.words),
    JSON.stringify({ strips, handle: at?.handle, well: at?.well })
  );
  await turnOf(page, LONG)
    .getByRole("button", { name: transcriptWords.messageActions })
    .tap();
  const sheet = page.getByRole("dialog", {
    name: transcriptWords.messageSheet,
  });
  await sheet.waitFor({ state: "visible", timeout: 10_000 });
  await settle(page, 600);
  const rows = await sheet
    .locator('[data-slot="message-sheet"] button')
    .evaluateAll((all) =>
      all.map((b) => ({
        name: b.textContent?.trim(),
        h: b.getBoundingClientRect().height,
      }))
    );
  kit.check(
    `${label}: a press on the handle opens the sheet "Message" with Copy, Edit and Fork from here, each row 44px`,
    rows.map((row) => row.name).join("|") ===
      [
        transcriptWords.copyRow,
        transcriptWords.editRow,
        transcriptWords.forkFromHere,
      ].join("|") && rows.every((row) => Math.abs(row.h - 44) <= 0.5),
    JSON.stringify(rows)
  );
  await sheet.getByRole("button", { name: transcriptWords.copyRow }).tap();
  await sheet.waitFor({ state: "hidden", timeout: 10_000 });
  await settle(page, 400);
}

/** A row's four corners and its container's, as drawn, and the gap between their edges at each. In the page. */
function contour(args: { row: string; layer?: string }) {
  /** A layer of the highlight whose host `args.layer` names: in its shadow root. */
  const layerOf = (at: string) =>
    document
      .querySelector(at)
      ?.shadowRoot?.querySelector('[data-slot="highlight-ghost"]') ?? null;
  const r = (el: Element) => {
    const s = getComputedStyle(el);
    return [
      s.borderTopLeftRadius,
      s.borderTopRightRadius,
      s.borderBottomRightRadius,
      s.borderBottomLeftRadius,
    ].map((one) => Number.parseFloat(one) || 0);
  };
  const row = document.querySelector(args.row);
  if (!row) {
    return null;
  }
  // Its container: the one that declares the rule, else the nearest rounded
  // box holding it.
  let host: Element | null =
    row.parentElement?.closest('[class*="concentric-in"]') ?? null;
  for (let at = row.parentElement; !host && at; at = at.parentElement) {
    if (r(at).some((one) => one > 0)) {
      host = at;
    }
  }
  const own = r(row);
  const layer = args.layer ? layerOf(args.layer) : null;
  if (!host) {
    return { own, host: null, layer: layer ? r(layer) : null, corners: [] };
  }
  const outer = r(host);
  const a = host.getBoundingClientRect();
  const b = row.getBoundingClientRect();
  const gaps = [
    [b.left - a.left, b.top - a.top],
    [a.right - b.right, b.top - a.top],
    [a.right - b.right, a.bottom - b.bottom],
    [b.left - a.left, a.bottom - b.bottom],
  ];
  // A corner the rule speaks of: the same gap in from both edges, inside the
  // outer's curve.
  const corners = gaps.flatMap(([x, y], i) =>
    Math.abs(x - y) <= 0.5 && (x + y) / 2 < (outer[i] ?? 0)
      ? [
          {
            corner: i,
            outer: outer[i] ?? 0,
            inset: Number(((x + y) / 2).toFixed(2)),
            inner: own[i] ?? 0,
          },
        ]
      : []
  );
  return {
    own,
    host: host.getAttribute("data-slot") ?? host.localName,
    layer: layer ? r(layer) : null,
    corners,
  };
}

const concentric = (
  corners: { outer: number; inset: number; inner: number }[]
) =>
  corners.length > 0 &&
  corners.every(
    (c) => Math.abs(c.inner - Math.max(0, c.outer - c.inset)) <= EDGE
  );

/** The chosen well of the person's turn saying `wanted`, the transcript's pill and the focus ring. In the page. */
function chosen(wanted: string) {
  const corners = (el: Element) => {
    const style = getComputedStyle(el);
    return [
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomRightRadius,
      style.borderBottomLeftRadius,
    ].map((one) => Number.parseFloat(one) || 0);
  };
  const edges = (el: Element) => {
    const r = el.getBoundingClientRect();
    return [r.left, r.top, r.right, r.bottom];
  };
  const turn = [
    ...document.querySelectorAll<HTMLElement>(
      'section[data-slot="turn"][data-you]'
    ),
  ].find(
    (t) => t.querySelector("[data-lift-words]")?.textContent?.trim() === wanted
  );
  const well = turn?.querySelector<HTMLElement>('[data-slot="well"]');
  // The transcript's selection pill, in its list's shadow root.
  const pill = document
    .querySelector('[data-slot="listing"]')
    ?.shadowRoot?.querySelector<HTMLElement>('[data-slot="highlight-pill"]');
  const held = document.activeElement ?? document.body;
  if (!(well && pill)) {
    return null;
  }
  return {
    selected: well.hasAttribute("data-selected"),
    well: corners(well),
    pill: corners(pill),
    shown: getComputedStyle(pill).opacity,
    // Its fill steps aside for the pill under it.
    fill: getComputedStyle(well, "::before").backgroundColor,
    boxes: [...edges(well), ...edges(pill)],
    ring: getComputedStyle(held).outlineStyle,
    ringRadius: corners(held),
  };
}

/** The keyboard: Tab to the strip, the pill under the chosen well in its contour, Enter copies and edits, Esc cancels. */
async function keyboardLeg(kit: Kit, page: Page, label: string, run: Page) {
  for (const [where, text] of [
    [page, LONG],
    [run, RUN[1] as string],
  ] as const) {
    await where.bringToFront();
    await where.mouse.move(2, 2);
    await where.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
    });
    const presses = await tabTo(where, text, transcriptWords.copyMessage);
    await settle(where, 400);
    const at = await where.evaluate(measure, text);
    const marks = await where.evaluate(chosen, text);
    const name =
      text === LONG ? "the 40-word line" : `the run's middle "${text}"`;
    kit.check(
      `${label} (keyboard): Tab alone reaches ${name}'s Copy message (${presses ?? "never"} presses), its strip shown on its line and covering nothing`,
      presses !== null &&
        at?.opacity === 1 &&
        at.stripInLine &&
        !(
          meets(at.strip, at.words) ||
          meets(at.strip, at.clock) ||
          meets(at.strip, at.next)
        ),
      JSON.stringify({
        opacity: at?.opacity,
        strip: at?.strip,
        words: at?.words,
      })
    );
    // The pill covers the well whole, its edges at most a pixel out (each
    // edge snapped outward to the device grid, highlight `placeOf`).
    const [wl, wt, wr, wb, pl, pt, pr, pb] = marks?.boxes ?? [];
    const covers =
      !!marks &&
      pl <= wl + 0.01 &&
      pt <= wt + 0.01 &&
      pr >= wr - 0.01 &&
      pb >= wb - 0.01 &&
      wl - pl <= 1 &&
      wt - pt <= 1 &&
      pr - wr <= 1 &&
      pb - wb <= 1;
    const square =
      text === LONG ? true : marks?.well.every((one) => one === 0) === true;
    kit.check(
      `${label} (keyboard): ${name}'s well is chosen: the transcript's selection pill stands under it, covering it to the pixel, in its four corners (${marks?.well.join("/")}px${text === LONG ? "" : ", square where the run opens it"}); the focus ring stands on the button`,
      !!marks &&
        marks.selected &&
        marks.shown === "1" &&
        marks.fill === "rgba(0, 0, 0, 0)" &&
        covers &&
        JSON.stringify(marks.pill) === JSON.stringify(marks.well) &&
        square &&
        marks.ring !== "none",
      JSON.stringify(marks)
    );
  }
  await page.bringToFront();
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
  const toEdit = await tabTo(page, LONG, transcriptWords.editMessage);
  await page.keyboard.press("Enter");
  await settle(page, 300);
  const editing = await page.evaluate(() => ({
    field: document.activeElement?.tagName === "TEXTAREA",
    cost: document
      .querySelector('[data-slot="edit-cost"]')
      ?.textContent?.replace(/\s+/g, " ")
      .trim(),
  }));
  kit.check(
    `${label} (keyboard): Tab reaches Edit message, Enter opens the edit with the focus in its field and the cost said`,
    toEdit !== null && editing.field && editing.cost === COST,
    JSON.stringify(editing)
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

/** Copy on the 40-word line by the pointer, pasted back. */
async function copyLeg(kit: Kit, page: Page, label: string) {
  await hover(page, LONG);
  await turnOf(page, LONG)
    .getByRole("button", { name: transcriptWords.copyMessage })
    .click();
  await settle(page, 200);
  const pasted = await pasteBack(page, false);
  kit.check(
    `${label}: Copy message put the 40-word line on the clipboard (pasted back into the composer)`,
    pasted === LONG,
    pasted
  );
}

/** The ghost under a context menu's item, and the composer's controls and a segmented thumb, held to the formula. */
async function contourLeg(kit: Kit, page: Page, label: string, touch: boolean) {
  const composer = await page.evaluate(contour, {
    row: 'form[data-slot="cin"] button[data-slot="stop"]',
  });
  kit.check(
    `${label}: the composer's Send is its shell's radius less its inset, at each corner it stands in (${JSON.stringify(composer?.corners)})`,
    !!composer && concentric(composer.corners),
    JSON.stringify(composer)
  );
  if (!touch) {
    await page.keyboard.press("Escape");
    const tab = page.getByRole("tab").filter({ visible: true }).first();
    await tab.click({ button: "right" });
    const menu = page.locator(
      '[data-slot="context-menu-content"][data-state="open"]'
    );
    await menu.waitFor({ state: "visible", timeout: 10_000 });
    await settle(page, 400);
    const item = menu.locator("[data-menu-item]").first();
    await item.hover();
    await settle(page, 300);
    const read = await page.evaluate(contour, {
      row: '[data-slot="context-menu-content"][data-state="open"] [data-menu-item]',
      layer: '[data-slot="context-menu-content"][data-state="open"]',
    });
    kit.check(
      `${label}: the hover ghost under a context menu's first item takes its corners, the menu's radius less its inset (${JSON.stringify(read?.corners)})`,
      !!read &&
        concentric(read.corners) &&
        JSON.stringify(read.layer) === JSON.stringify(read.own),
      JSON.stringify(read)
    );
    await page.keyboard.press("Escape");
    await settle(page, 300);
    const jump = page
      .getByRole("button", { name: shellWords.jumpToSession })
      .first();
    if (await jump.isVisible()) {
      await jump.click();
      const row = page
        .locator("[data-find-row]")
        .filter({ visible: true })
        .first();
      await row.waitFor({ state: "visible", timeout: 10_000 });
      await settle(page, 500);
      await row.hover();
      await settle(page, 300);
      const rows = page.locator("[data-find-row]").filter({ visible: true });
      await rows.last().hover();
      await settle(page, 300);
      const find = await page.evaluate(() => {
        const all = [
          ...document.querySelectorAll<HTMLElement>("[data-find-row]"),
        ].filter((one) => one.getClientRects().length > 0);
        const active = all.find((one) => one.hasAttribute("data-active"));
        const list = active?.closest<HTMLElement>('[data-slot="list"]');
        const card = list?.closest<HTMLElement>(
          '[data-slot="popover-content"]'
        );
        const ghost = list?.shadowRoot?.querySelector<HTMLElement>(
          '[data-slot="highlight-ghost"]'
        );
        const corners = (el: Element | null | undefined) => {
          if (!el) {
            return null;
          }
          const st = getComputedStyle(el);
          return [
            st.borderTopLeftRadius,
            st.borderTopRightRadius,
            st.borderBottomRightRadius,
            st.borderBottomLeftRadius,
          ].map((one) => Number.parseFloat(one) || 0);
        };
        const r = active?.getBoundingClientRect();
        const c = card?.getBoundingClientRect();
        const radius = corners(card)?.[2] ?? 0;
        // In the card's curve: a corner standing the same gap in from both
        // of its edges, nearer than its radius.
        const inCurve =
          !!(r && c) &&
          [
            [r.left - c.left, c.bottom - r.bottom],
            [c.right - r.right, c.bottom - r.bottom],
            [r.left - c.left, r.top - c.top],
            [c.right - r.right, r.top - c.top],
          ].some(([x, y]) => Math.abs(x - y) <= 0.5 && (x + y) / 2 < radius);
        return {
          own: corners(active),
          ghost: corners(ghost),
          shown: ghost ? getComputedStyle(ghost).opacity : "none",
          inCurve,
          token: Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
              "--radius-sm"
            )
          ),
        };
      });
      kit.check(
        `${label}: Find's rows stand clear of its card's curve and keep their own radius (${find.own?.join("/")}px); the hover ghost under the row takes its corners`,
        !find.inCurve &&
          find.own?.every((one) => one === find.token) === true &&
          find.shown === "1" &&
          JSON.stringify(find.ghost) === JSON.stringify(find.own),
        JSON.stringify(find)
      );
      await page.keyboard.press("Escape");
      await settle(page, 300);
    }
  }
}

/** The page's spill and overlap scan with the 40-word line's strip shown (a finger: at rest). */
async function scanLeg(page: Page, touch: boolean): Promise<string[]> {
  if (!touch) {
    await hover(page, LONG);
  }
  return page.evaluate(scan);
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
    const runs = await fleet.spawn("claude", "A run of his");
    for (const text of [ONE, ...RUN]) {
      await say(fleet, runs, text);
    }

    const findings: string[] = [];
    const errors: string[] = [];
    const only = process.env.PROBE_LEGS?.split(",");
    for (const leg of LEGS.filter((one) => !only || only.includes(one.label))) {
      const page = await sessionPage(kit, base, source, leg);
      for (const text of [ONE, LONG, AFTER]) {
        await restLeg(kit, page, leg.label, text);
      }
      const run = await sessionPage(kit, base, runs, leg, asRun);
      await turnOf(run, RUN[2] as string).waitFor({ timeout: 60_000 });
      await settle(run, 300);
      for (const text of RUN) {
        await restLeg(kit, run, `${leg.label} (run)`, text);
      }
      if (leg.touch) {
        await phoneLeg(kit, page, leg.label);
      } else {
        await page.bringToFront();
        // The session's first message has no answer above it to rewind to
        // or branch from: Copy alone.
        await hoverLeg(kit, page, leg.label, ONE, [
          transcriptWords.copyMessage,
        ]);
        await hoverLeg(kit, page, leg.label, LONG, ALL);
        await hoverLeg(kit, page, leg.label, AFTER, ALL);
        await copyLeg(kit, page, leg.label);
        await run.bringToFront();
        await runLeg(kit, run, leg.label);
        await page.bringToFront();
      }
      if (leg.view === "desk") {
        await keyboardLeg(kit, page, leg.label, run);
      }
      await page.bringToFront();
      await contourLeg(kit, page, leg.label, leg.touch);
      findings.push(
        ...(await scanLeg(page, leg.touch)).map((one) => `${leg.label}: ${one}`)
      );
      await run.bringToFront();
      findings.push(
        ...(await run.evaluate(scan)).map((one) => `${leg.label} (run): ${one}`)
      );
      for (const [what, one] of [
        ["", page],
        [" (run)", run],
      ] as const) {
        errors.push(
          ...(errorsOf.get(one) ?? []).map((e) => `${leg.label}${what}: ${e}`)
        );
        await one.close();
      }
    }
    kit.check(
      `the page's spill and overlap scan over all ${LEGS.length} legs and both sessions: ${findings.length} findings`,
      findings.length === 0,
      findings.slice(0, 12).join(" | ")
    );

    for (const engine of ["chromium", "webkit"] as const) {
      await failedLeg(kit, base, source, engine, errors);
      await queuedLeg(kit, base, fleet, engine, errors);
    }
    await forkLeg(kit, base, fleet, source, errors);
    await rewindLeg(kit, base, fleet, source, errors);
    const loops = errors.filter((one) => LOOP.test(one));
    kit.check(
      `no "ResizeObserver loop" on any page, the WebKit 1440 session page with the transcript's highlight among them: ${loops.length}`,
      loops.length === 0,
      loops.join(" | ")
    );
    kit.check(
      `no console error on any page: ${errors.length}`,
      errors.length === 0,
      errors.slice(0, 8).join(" | ")
    );
  },
};

/** A failed send: Retry, Edit and Remove at rest under its reason, and no strip under the pointer. */
async function failedLeg(
  kit: Kit,
  base: string,
  source: string,
  engine: Engine,
  errors: string[]
) {
  const page = await sessionPage(
    kit,
    base,
    source,
    { engine, view: "desk" },
    asFailed
  );
  const turn = turnOf(page, AFTER);
  await turn.scrollIntoViewIfNeeded();
  await page.mouse.move(2, 2);
  await settle(page, 600);
  const failure = turn.locator('[data-slot="failure"]');
  const rest = {
    ...(await failure.evaluate((el) => ({
      reason: el.querySelector('[data-slot="reason"]')?.textContent?.trim(),
      shown:
        getComputedStyle(el).opacity === "1" &&
        [...el.querySelectorAll('[data-slot="action"]')].every(
          (b) => b.getClientRects().length > 0
        ),
    }))),
    actions: await buttonNames(failure.locator('[data-slot="actions"]')),
  };
  await hover(page, AFTER);
  const strips = await turn.locator(STRIP).count();
  kit.check(
    `${engine} 1440: a failed send shows Retry, Edit and Remove at rest under its reason, and under the pointer no strip`,
    (rest.reason ?? "").startsWith(transcriptWords.notSent) &&
      rest.actions.join("|") ===
        [
          transcriptWords.retrySend,
          transcriptWords.editFailed,
          transcriptWords.removeFailed,
        ].join("|") &&
      rest.shown &&
      strips === 0,
    JSON.stringify({ rest, strips })
  );
  errors.push(
    ...(errorsOf.get(page) ?? []).map((e) => `${engine} failed: ${e}`)
  );
  await page.close();
}

/**
 * A message queued behind a turn still at work: Edit in place and Remove
 * from queue at rest, no strip; Remove from queue takes it back on the hub.
 */
async function queuedLeg(
  kit: Kit,
  base: string,
  fleet: KitFleet,
  engine: Engine,
  errors: string[]
) {
  const held = await fleet.spawn("claude", `Queued ${engine}`);
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
  const uuid = await fleet.send(held, QUEUED);
  const page = await sessionPage(kit, base, held, { engine, view: "desk" });
  const turn = turnOf(page, QUEUED);
  await turn.waitFor({ timeout: 60_000 });
  await page.mouse.move(2, 2);
  await settle(page, 500);
  const recovery = turn.locator('[data-slot="recovery"]');
  const rest = {
    names: await buttonNames(recovery),
    shown: await recovery
      .locator('[data-slot="action"]')
      .evaluateAll((all) =>
        all.every(
          (b) =>
            Number(getComputedStyle(b).opacity) === 1 &&
            b.getClientRects().length > 0
        )
      ),
  };
  await hover(page, QUEUED);
  const strips = await turn.locator(STRIP).count();
  kit.check(
    `${engine} 1440: a queued message shows Edit in place and Remove from queue at rest, and under the pointer no strip`,
    rest.names.join("|") ===
      [transcriptWords.editInPlace, transcriptWords.removeFromQueue].join(
        "|"
      ) &&
      rest.shown &&
      strips === 0,
    JSON.stringify({ rest, strips })
  );
  await turn
    .getByRole("button", { name: transcriptWords.removeFromQueue })
    .click();
  const gone = await until(
    "the queued message withdrawn",
    async () => ({
      record: fleet.sendRow(uuid)?.state,
      drawn: await turnOf(page, QUEUED).count(),
    }),
    (one) => one.record === "cancelled" && one.drawn === 0,
    30_000
  ).then(
    (one) => one,
    () => ({ record: fleet.sendRow(uuid)?.state, drawn: -1 })
  );
  kit.check(
    `${engine} 1440: Remove from queue takes the message back: cancelled on the hub, gone from the transcript`,
    gone.record === "cancelled" && gone.drawn === 0,
    JSON.stringify(gone)
  );
  errors.push(
    ...(errorsOf.get(page) ?? []).map((e) => `${engine} queued: ${e}`)
  );
  await page.close();
}

/** Fork from here pressed for real by the pointer: a new session on the hub, the page on it. */
async function forkLeg(
  kit: Kit,
  base: string,
  fleet: KitFleet,
  source: string,
  errors: string[]
) {
  const page = await sessionPage(kit, base, source, {
    engine: "chromium",
    view: "desk",
  });
  const rows = () =>
    fleet.query<{ id: string }>("SELECT id FROM instances").length;
  const before = rows();
  await hover(page, LONG);
  await turnOf(page, LONG)
    .getByRole("button", { name: transcriptWords.forkFromHere })
    .click();
  const left = await page
    .waitForURL(
      (url) =>
        url.pathname.startsWith("/session/") && !url.pathname.includes(source),
      { timeout: 120_000 }
    )
    .then(
      () => true,
      () => false
    );
  kit.check(
    "chromium 1440: Fork from here on the speaker line starts a session on the hub and the page goes to it",
    left && rows() === before + 1,
    `${page.url()}; sessions ${before} → ${rows()}`
  );
  errors.push(...(errorsOf.get(page) ?? []).map((e) => `fork: ${e}`));
  await page.close();
}

/** Send edited message for real, last: the edited words stand where the 40-word line was, and a reload says the same. */
async function rewindLeg(
  kit: Kit,
  base: string,
  fleet: KitFleet,
  source: string,
  errors: string[]
) {
  const page = await sessionPage(kit, base, source, {
    engine: "chromium",
    view: "desk",
  });
  await hover(page, LONG);
  const turnRow = byId(page, await idOf(page, LONG));
  await turnRow
    .getByRole("button", { name: transcriptWords.editMessage })
    .click();
  const field = turnRow.getByRole("textbox", {
    name: transcriptWords.editMessage,
  });
  await field.fill(EDITED);
  await turnRow
    .getByRole("button", { name: transcriptWords.sendEdited })
    .click();
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
    "chromium 1440: Send edited message rewinds: the edited words stand after hello and nothing of what followed",
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
  await page.waitForSelector(`${TURN}[data-you]`, { timeout: 60_000 });
  await settle(page, 400);
  const after = await read();
  kit.check(
    "chromium 1440: a reload reads the same: hello, then the edited words, and nothing that followed",
    after.join("|") === `${ONE}|${EDITED}`,
    after.join(" | ")
  );
  errors.push(...(errorsOf.get(page) ?? []).map((e) => `rewind: ${e}`));
  await page.close();
}

export default spec;
