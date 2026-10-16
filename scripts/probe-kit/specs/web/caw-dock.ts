/**
 * Caw's panel floating over a project's page (CawFloat, CawThread), read
 * from the engine, on a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model) in the built dashboard, at the desk
 * (1440×900, mouse), the iPad (1024×1366, touch) and the phone (390×844,
 * touch). The owner's words on 10-15, each as an assertion:
 *
 * - "a floating panel that has caw as a hero with the suggestion chips
 *   below it, reusing the composer and transcript elements there": the
 *   panel floats over the page, which keeps its width and its scroll under
 *   it; on an empty thread Caw stands at 80 over the title, the project's
 *   starters under him as kit chips with their glyphs; the panel holds the
 *   session Composer and, on a thread, the transcript's own rows
 *   (Transcript's `[data-row]`), and nowhere on the page is there a CawField;
 * - "in the new session dialog there is a harness and model selector, same
 *   for the tab hover menus": no `<select>`, picker, switch or settings in
 *   the panel or in Caw's settings under ⋯; his model is changed in his lead
 *   session's card (SessionDetails, from his name in the panel), and the
 *   hub's lead record (`projects.caw_model`) holds the model picked there;
 * - his earlier threads are the app's conversation rows (SessionRow), not
 *   a dropdown of text lines; no spend anywhere in the panel; every colour
 *   and gap its own elements draw is a token's.
 *
 * The invariant of dcecee4e2 stands too: a message Caw posts to a thread
 * shows in every open view of it within a second of the hub storing it,
 * with no reload: the panel's New thread, the thread it made, a thread
 * chosen from its earlier rows, New thread with Caw on, and a thread tab.
 *
 *   bun scripts/probe-kit/run.ts web caw-dock
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one viewport, one step at a time.
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the token read runs in the page, one self-contained pass (page.evaluate takes no outer helpers).
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page, WebSocketRoute } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../../scratch-fleet";
import { r2 } from "../../geom";
import { contrast } from "../../ink";
import {
  COMPOSER_FIELD,
  type Kit,
  open,
  type Spec,
  settle,
  type View,
} from "../../kit";
import { openCawSettings } from "./caw-seat-pop";

const PANEL = "[data-caw-panel]";
/** The hero's question, the project named in it. */
const HERO_TITLE = /^What's next for .+\?$/;
const HERO = `${PANEL} [data-thread-hero]`;
/** The panel's New thread, in its head while a thread is on show. */
const NEW_THREAD = `${PANEL} [data-caw-head] [aria-label="New thread"]`;

/** A tag in your words that the mock Caw answers by name: `PROBE-REPLY-<tag>`. */
const REPLY_TAG = /PROBE-REPLY-(\w+)/g;

/**
 * The mock model: a title for a side call; a turn that read tagged words
 * answers the newest tag in plain text (posted in its thread as his reply,
 * caw.ts `answerUnreplied`), any other "Ready.".
 */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Plan the launch"] };
  }
  const tag = [...request.last.matchAll(REPLY_TAG)].at(-1)?.[1];
  return { everyMs: 5, words: [tag ? `Answer ${tag}` : "Ready."] };
};

/** How many words `text` has. */
const SPACES = /\s+/;
const wordCount = (text: string): number => text.split(SPACES).length;

/** A 40-word question: the lede wraps at body size and is never clamped. */
const LONG_QUESTION =
  "Before I write the launch notes for the redesigned board, should I cover every surface that changed since the last release, including the settings pages, the phone layout and the new keyboard shortcuts, or only the board and its cards?";
/** A 30-word description under one option. */
const LONG_DESC =
  "Every surface lands in one release: the board, the settings pages, the phone layout and shortcuts, so nobody meets half of the new design next to half of the old.";
/** The eight files of the second question: one an unbroken path, wider than the card. */
const EIGHT = [
  "README.md",
  "CHANGELOG.md",
  "DESIGN.md",
  "apps/dashboard/src/lib/cawco/transcript/Prompt.svelte",
  "WORDS.md",
  "JOURNEY.md",
  "PRODUCT.md",
  "docs/launch-notes-for-the-redesigned-board.md",
];
/**
 * Caw's question card: two described options (and Other), eight options
 * (more than Claude Code's AskUserQuestion takes, as a harness with no such
 * cap asks them), a 40-word question over two bare options (a chip row),
 * and a 30-word description.
 */
const ASKED = [
  {
    question: "Which voice should the launch notes take?",
    header: "Voice",
    multiSelect: false,
    options: [
      { label: "Plain", description: "Short sentences, the facts first." },
      { label: "Warm", description: "Second person, the story first." },
    ],
  },
  {
    question: "Which file should the notes link to first?",
    header: "Link",
    multiSelect: false,
    options: EIGHT.map((label) => ({ label, description: "" })),
  },
  {
    question: LONG_QUESTION,
    header: "Scope",
    multiSelect: false,
    options: [
      { label: "Every surface", description: "" },
      { label: "The board", description: "" },
    ],
  },
  {
    question: "How should the redesign ship?",
    header: "Ship",
    multiSelect: false,
    options: [
      { label: "All at once", description: LONG_DESC },
      { label: "In slices", description: "One surface a week." },
    ],
  },
];
/**
 * The page's socket, routed to the hub as it is, with a way to hand the
 * page Caw's question ({@link ASKED}) parked in `threadId`: the frame his
 * session's AskUserQuestion arrives as, so the panel's composer grows into
 * the real card without a session asking it (a boundary for Caw cannot
 * start inside a workspace).
 */
async function askRoute(page: Page) {
  let route: WebSocketRoute | null = null;
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (ws) => {
      route = ws;
      const server = ws.connectToServer();
      ws.onMessage((message) => server.send(message));
      server.onMessage((message) => ws.send(message));
    }
  );
  return {
    ask(threadId: string, project: string): boolean {
      if (!route) {
        return false;
      }
      route.send(
        JSON.stringify({
          verb: "frames",
          machineId: MACHINE,
          payload: {
            kind: "permission_request",
            requestId: `probe-ask-${threadId}`,
            instanceId: `probe-caw-${threadId}`,
            toolName: "AskUserQuestion",
            input: { questions: ASKED },
            presentation: {
              asker: "Caw",
              changes: [],
              fields: [],
              project,
              summary: "Caw asks",
            },
            threadId,
            raisedAt: Date.now(),
          },
        })
      );
      return true;
    },
  };
}

/**
 * Each glyph `selector` names, as drawn on what stands behind it (the first
 * opaque background up its tree, with any translucent ones over it): the
 * ground, its full-ink layer and its duotone layer (`[opacity]`, at its
 * computed opacity), composited in the page's own canvas, as rgb.
 */
const glyphInks = (
  page: Page,
  selector: string,
  inkAs?: string,
  duoAs?: number
) =>
  page.evaluate(
    ({ sel, as, duo: duoAt0 }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d", {
        willReadFrequently: true,
      }) as CanvasRenderingContext2D;
      const read = (): [number, number, number] => {
        const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
        return [r, g, b];
      };
      const paint = (fill: string, alpha = 1) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, 1, 1);
        ctx.globalAlpha = 1;
      };
      const opaque = (fill: string): boolean => {
        paint("#fff");
        paint(fill);
        const onWhite = read().join();
        paint("#000");
        paint(fill);
        return read().join() === onWhite;
      };
      return [...document.querySelectorAll<SVGElement>(sel)].map((svg) => {
        const grounds: string[] = [];
        for (let el: Element | null = svg; el; el = el.parentElement) {
          const bg = getComputedStyle(el).backgroundColor;
          if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
            grounds.push(bg);
            if (opaque(bg)) {
              break;
            }
          }
        }
        const ground = () => {
          paint("#fff");
          for (const fill of [...grounds].reverse()) {
            paint(fill);
          }
        };
        // `as`: the glyph read in another ink (a token), as it was drawn before.
        if (as) {
          svg.style.color = `var(${as})`;
        }
        const ink = getComputedStyle(svg).color;
        svg.style.color = "";
        const duoAt = svg.querySelector("[opacity]");
        // `duo`: the duotone layer read at another opacity.
        const duoOpacity =
          duoAt0 ?? (duoAt ? Number(getComputedStyle(duoAt).opacity) : 1);
        ground();
        const behind = read();
        paint(ink);
        const full = read();
        ground();
        paint(ink, duoOpacity);
        const duo = read();
        return {
          what: svg.closest("button, li, .rail-row")?.textContent?.trim() ?? "",
          ink,
          duoOpacity,
          behind,
          full,
          duo,
        };
      });
    },
    { sel: selector, as: inkAs, duo: duoAs }
  );

/** The page in `dark` or light, its colours landed. */
async function scheme(page: Page, dark: boolean): Promise<void> {
  await page.evaluate(
    (on) => document.documentElement.classList.toggle("dark", on),
    dark
  );
  await settle(page, 300);
}

/**
 * Each glyph's layers against its ground, in light and in dark (the page
 * put back as it was): the full-ink layer's contrast, the duotone layer's,
 * and the full layer's over the duotone one (a clock's hands on its disc).
 */
async function glyphContrast(
  page: Page,
  selector: string,
  inkAs?: string,
  duoAs?: number
) {
  const was = await page.evaluate(() =>
    document.documentElement.classList.contains("dark")
  );
  const out: {
    scheme: string;
    what: string;
    full: number;
    duo: number;
    fullOverDuo: number;
    duoOpacity: number;
  }[] = [];
  for (const dark of [false, true]) {
    await scheme(page, dark);
    for (const one of await glyphInks(page, selector, inkAs, duoAs)) {
      out.push({
        scheme: dark ? "dark" : "light",
        what: one.what.slice(0, 40),
        full: r2(contrast(one.full, one.behind)),
        duo: r2(contrast(one.duo, one.behind)),
        fullOverDuo: r2(contrast(one.full, one.duo)),
        duoOpacity: one.duoOpacity,
      });
    }
  }
  await scheme(page, was);
  return out;
}

/** The panel's question card, in its composer's grown shape (Composer `.ask`). */
const CARD = `${PANEL} .ask .hitl[aria-label="Question from Caw"]`;

/**
 * The card as it stands: every box of it that reaches past `.ask` across
 * (each by how far), each part of it (title, body, foot) that reaches past
 * it down; each option group's form and its options' labels, the last
 * one's included; each description, scrolled into the body's view, and
 * whether it shows whole there; the long lede's box and type.
 */
const readCard = (page: Page) =>
  page.evaluate(
    ({ panel, descriptions, long }) => {
      const ask = document.querySelector(`${panel} .ask`);
      const card = ask?.querySelector(".hitl");
      const body = card?.querySelector<HTMLElement>(".body");
      if (!(ask && card && body)) {
        return null;
      }
      const a = ask.getBoundingClientRect();
      const label = (el: Element) =>
        `${el.tagName.toLowerCase()}${[...el.classList]
          .slice(0, 2)
          .map((c) => `.${c}`)
          .join("")}`;
      const across: string[] = [];
      for (const el of [card, ...card.querySelectorAll("*")]) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) {
          continue;
        }
        const left = a.left - r.left;
        const right = r.right - a.right;
        if (left > 0.5 || right > 0.5) {
          across.push(
            `${label(el)} past ${Math.round(Math.max(left, right) * 10) / 10}px`
          );
        }
      }
      const down = [...card.children]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.top < a.top - 0.5 || r.bottom > a.bottom + 0.5)
        .map(({ el }) => label(el));
      const groups = [...card.querySelectorAll("[data-toggle-group-root]")].map(
        (group) => ({
          list: group.classList.contains("list"),
          labels: [...group.querySelectorAll(".opt-label")].map(
            (el) => el.textContent?.trim() ?? ""
          ),
        })
      );
      const shownWhole = (el: Element) => {
        el.scrollIntoView({ block: "nearest" });
        const r = el.getBoundingClientRect();
        const b = body.getBoundingClientRect();
        return (
          el.checkVisibility({ opacityProperty: true }) &&
          r.width > 0 &&
          r.top >= b.top - 0.5 &&
          r.bottom <= b.bottom + 0.5 &&
          r.left >= a.left - 0.5 &&
          r.right <= a.right + 0.5
        );
      };
      const descs = [...card.querySelectorAll(".opt-desc")];
      const described = descriptions.map((words) => {
        const el = descs.find((one) => one.textContent?.trim() === words);
        return {
          words: words.slice(0, 24),
          shown: el ? shownWhole(el) : false,
        };
      });
      body.scrollTop = 0;
      const lede = [...card.querySelectorAll<HTMLElement>(".lede")].find(
        (el) => el.textContent?.trim() === long
      );
      const style = lede ? getComputedStyle(lede) : null;
      // The body role's size, resolved as the card resolves it.
      const swatch = document.createElement("span");
      swatch.style.fontSize = "var(--text-body)";
      card.append(swatch);
      const bodySize = getComputedStyle(swatch).fontSize;
      swatch.remove();
      return {
        ask: { w: Math.round(a.width), h: Math.round(a.height) },
        across,
        down,
        groups,
        described,
        lede: lede
          ? {
              lines: Math.round(
                lede.getBoundingClientRect().height /
                  Number.parseFloat(style?.lineHeight ?? "1")
              ),
              clamped: lede.scrollHeight > lede.clientHeight + 1,
              size: style?.fontSize,
              bodySize,
              lineClamp: style?.getPropertyValue("-webkit-line-clamp"),
            }
          : null,
        fades: body.classList.contains("kit-edge-fade-block"),
      };
    },
    {
      panel: PANEL,
      descriptions: ASKED.flatMap((q) =>
        q.options.map((o) => o.description).filter(Boolean)
      ),
      long: LONG_QUESTION,
    }
  );

/** Each question's picked options, by their labels, and the box of the second voice option. */
const picks = (page: Page) =>
  page.evaluate((card) => {
    const root = document.querySelector(card);
    const second = root?.querySelectorAll(
      "[data-toggle-group-root] .kit-chip"
    )[1];
    const r = second?.getBoundingClientRect();
    return {
      picked: [
        ...(root?.querySelectorAll("[data-toggle-group-root]") ?? []),
      ].map((group) =>
        [...group.querySelectorAll(".kit-chip.sel .opt-label")].map(
          (el) => el.textContent?.trim() ?? ""
        )
      ),
      second: r ? { w: r.width, h: r.height } : null,
    };
  }, CARD);

/**
 * Caw's question card, parked in the thread his panel shows ({@link ASKED},
 * through {@link askRoute}), at `view`: every box fits `.ask` whatever its
 * words; every description is drawn and shows whole; described or long
 * questions list their options, Other last, and the bare one keeps its
 * chips; the 40-word question wraps at body size, unclamped, in a body
 * that fades its edges; the digits pick an option on each question in
 * turn, and a pick changes no option's size.
 */
async function checkQuestion(
  kit: Kit,
  base: string,
  project: { id: string; name: string },
  threadId: string,
  view: View,
  name: string
) {
  const page = await kit.page(view);
  page.setDefaultTimeout(60_000);
  const route = await askRoute(page);
  const seat = ".project-head button.caw-seat";
  await open(page, `${base}/project/${project.id}`, seat);
  await settle(page, 400);
  await page.click(seat);
  await page.waitForSelector(`${PANEL} .tx-columns`, { timeout: 30_000 });
  const asked = route.ask(threadId, project.name);
  const shown = await page
    .waitForSelector(CARD, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (
    !kit.check(
      `${name}: Caw's question parked in his thread grows the panel's composer into his card`,
      asked && shown
    )
  ) {
    return;
  }
  await settle(page, 600);
  const card = await readCard(page);
  kit.note(`${name} card: ${JSON.stringify(card)}`);
  if (!kit.check(`${name}: the card stands in .ask`, !!card)) {
    return;
  }
  const read = card as NonNullable<typeof card>;
  kit.check(
    `${name}: no box of the card reaches past .ask (${read.ask.w}px) across, and no part of it down`,
    read.across.length === 0 && read.down.length === 0,
    `across: ${read.across.join("; ")}; down: ${read.down.join("; ")}`
  );
  kit.check(
    `${name}: every description is drawn and shows whole in the card (${read.described.length})`,
    read.described.length > 0 && read.described.every((one) => one.shown),
    JSON.stringify(read.described)
  );
  const want = ASKED.map((q) => [...q.options.map((o) => o.label), "Other"]);
  kit.check(
    `${name}: described and 8-option questions list their options, the bare one keeps its chip row, Other last in each`,
    JSON.stringify(read.groups.map((g) => g.list)) ===
      JSON.stringify([true, true, false, true]) &&
      JSON.stringify(read.groups.map((g) => g.labels)) === JSON.stringify(want),
    JSON.stringify(read.groups)
  );
  kit.check(
    `${name}: the ${wordCount(LONG_QUESTION)}-word question wraps at body size, never clamped, in a body that fades its edges`,
    !!read.lede &&
      read.lede.lines > 1 &&
      !read.lede.clamped &&
      read.lede.size === read.lede.bodySize &&
      read.fades,
    JSON.stringify(read.lede)
  );
  // The digits, from inside the card: each picks on the question in turn.
  const before = await picks(page);
  await page
    .locator(`${CARD} [data-toggle-group-root] [tabindex="0"]`)
    .first()
    .focus();
  for (const key of ["2", "8", "1", "2"]) {
    await page.keyboard.press(key);
    await settle(page, 200);
  }
  const after = await picks(page);
  kit.check(
    `${name}: digits 2, 8, 1, 2 pick Warm, the eighth file, Every surface and In slices, each on its question in turn`,
    JSON.stringify(after.picked) ===
      JSON.stringify([["Warm"], [EIGHT[7]], ["Every surface"], ["In slices"]]),
    JSON.stringify(after.picked)
  );
  kit.check(
    `${name}: a pick changes no option's size`,
    !!before.second &&
      !!after.second &&
      Math.abs(before.second.w - after.second.w) < 0.5 &&
      Math.abs(before.second.h - after.second.h) < 0.5,
    `${JSON.stringify(before.second)} → ${JSON.stringify(after.second)}`
  );
  await page.close();
}

/** A 40-word reason, as the hub's words for a wake that failed say one. */
const LONG_REASON =
  "Caw's session could not start on this machine because the boundary that holds his place exited as it started, and the host's sandbox profile denies every capability to what runs beneath it, so nothing he runs can start there yet.";

/** The not-woken row `row` names, and its reason line, read: its box, the message rows', its glyph and words. */
const readUnread = (page: Page, rowSel: string) =>
  page.evaluate(
    ({ panel, sel }) => {
      const row = document.querySelector<HTMLElement>(sel);
      if (!row) {
        return null;
      }
      const r = row.getBoundingClientRect();
      const reason = row.querySelector(".row-fault .reason");
      const rr = reason?.getBoundingClientRect();
      const lh = reason
        ? Number.parseFloat(getComputedStyle(reason).lineHeight)
        : 1;
      // The transcript's message rows: your words and his, each a `[data-row]`.
      const messages = [
        ...document.querySelectorAll(`${panel} .tx-columns [data-row]`),
      ]
        .filter((el) => !el.querySelector("[data-unread-note], .note"))
        .map((el) => el.getBoundingClientRect().height)
        .filter((h) => h > 0);
      return {
        h: Math.round(r.height * 10) / 10,
        w: Math.round(r.width * 10) / 10,
        messageMin: messages.length ? Math.min(...messages) : null,
        coded:
          row.hasAttribute("data-code") ||
          !!row.closest("[data-code]") ||
          !!row.querySelector("[data-code]"),
        title: row.querySelector(".ftitle")?.textContent?.trim(),
        time: !!row.querySelector("time.eat"),
        reason: reason?.textContent?.trim() ?? null,
        reasonLines: rr ? Math.round(rr.height / lh) : 0,
        reasonInside: rr
          ? rr.left >= r.left - 0.5 && rr.right <= r.right + 0.5
          : false,
        again:
          row.querySelector(".row-fault .again")?.textContent?.trim() ?? null,
      };
    },
    { panel: PANEL, sel: rowSel }
  );

/**
 * Your words in a thread with no machine online: the hub's not-woken note
 * is one row on the transcript's rail, as tall as its message rows, no
 * dashed code box; its clock's darker layer stands at 3:1 or more on the
 * row in light and dark; its title and time, the no-machine reason, and
 * Try again saying "Waking Caw…" while its wake is out. Then the same note
 * with a 40-word reason of the hub's own, which wraps inside the row.
 */
async function checkUnread(
  kit: Kit,
  fleet: Fleet,
  base: string,
  project: { id: string; name: string },
  threadId: string
) {
  // Your words, and the hub's note that no machine was online for them, as
  // the thread keeps them (caw.ts `wakeForYou`): a send the hub took and a
  // wake that found every machine gone. The hub refuses a send outright
  // while none is online, so the note is only ever left by that race; it is
  // written here as the hub writes it, and read back by the real page.
  const now = Date.now();
  const yours = crypto.randomUUID();
  const noteId = crypto.randomUUID();
  fleet.write(
    "INSERT INTO thread_messages (id, thread_id, author, body, created_at) VALUES (?, ?, 'you', ?, ?)",
    yours,
    threadId,
    "Words written as the last machine went away.",
    now
  );
  fleet.write(
    "INSERT INTO thread_messages (id, thread_id, author, body, note_title, event, created_at) VALUES (?, ?, 'event', '', 'Caw · not woken', ?, ?)",
    noteId,
    threadId,
    JSON.stringify({
      kind: "caw",
      what: "not-woken",
      notWoken: {
        message: yours,
        reason: "no-machine",
        words:
          "No machine is online, so Caw can't start. Bring a machine online, then write here.",
      },
    }),
    now + 1
  );
  const seat = ".project-head button.caw-seat";
  const page = await kit.page("desk");
  page.setDefaultTimeout(60_000);
  // Try again's wake, held while the button is read.
  let release: () => void = () => undefined;
  const held = new Promise<void>((done) => {
    release = done;
  });
  await page.route("**/wake", async (route) => {
    await held;
    await route.continue();
  });
  await open(page, `${base}/project/${project.id}`, seat);
  await settle(page, 400);
  await page.click(seat);
  const rowSel = `${PANEL} [data-unread-note="${noteId}"]`;
  await page.waitForSelector(rowSel, { timeout: 30_000 });
  await settle(page, 400);
  const row = await readUnread(page, rowSel);
  kit.note(`not-woken row: ${JSON.stringify(row)}`);
  kit.check(
    "the not-woken note is one row on the rail, at least as tall as the transcript's message rows, with no dashed code box",
    !!row && row.messageMin !== null && row.h >= row.messageMin && !row.coded,
    JSON.stringify(row)
  );
  kit.check(
    "it says “Caw hasn't read this” with its time, and why: no machine was online, he reads it when one is back",
    row?.title === "Caw hasn't read this" &&
      row.time &&
      row.reason ===
        "No machine was online when you wrote. He reads it when one is back.",
    JSON.stringify(row)
  );
  const glyph = `${rowSel} .rail-cell svg`;
  const clock = await glyphContrast(page, glyph);
  kit.note(
    `the clock in ink-muted, as the old note drew its glyph: ${JSON.stringify(await glyphContrast(page, glyph, "--ink-muted"))}`
  );
  kit.note(
    `the clock with its duotone at the status-glyph opacity (0.81): ${JSON.stringify(await glyphContrast(page, glyph, undefined, 0.81))}`
  );
  kit.check(
    "its clock's darker layer stands at 3:1 or more on the row, and its hands at 3:1 or more on its disc, in light and in dark",
    clock.length === 2 &&
      clock.every((one) => one.full >= 3 && one.fullOverDuo >= 3),
    JSON.stringify(clock)
  );
  const again = page.locator(`${rowSel} .row-fault .again`);
  const offered = (await again.count()) > 0;
  if (kit.check("it offers Try again at the end of its reason", offered)) {
    await again.click();
    const pending = await page
      .waitForFunction(
        (sel) =>
          document.querySelector(sel)?.textContent?.includes("Waking Caw…"),
        `${rowSel} .row-fault .again`,
        { timeout: 5000 }
      )
      .then(() => true)
      .catch(() => false);
    kit.check("Try again says “Waking Caw…” while its wake is out", pending);
    release();
    await settle(page, 400);
  }
  await page.close();
  // The same note with a 40-word reason of the hub's own, as the thread's read carries it.
  const long = await kit.page("desk");
  long.setDefaultTimeout(60_000);
  await long.route(
    `**/api/projects/${project.id}/threads/${threadId}`,
    async (route) => {
      const response = await route.fetch();
      const read = (await response.json()) as {
        messages: {
          id: string;
          event?: { notWoken?: { reason: string; words: string } };
        }[];
      };
      for (const message of read.messages) {
        if (message.id === noteId && message.event?.notWoken) {
          message.event.notWoken.reason = "failed";
          message.event.notWoken.words = LONG_REASON;
        }
      }
      await route.fulfill({ response, json: read });
    }
  );
  await open(long, `${base}/project/${project.id}`, seat);
  await settle(long, 400);
  await long.click(seat);
  await long.waitForSelector(`${rowSel} .row-fault .reason`, {
    timeout: 30_000,
  });
  await settle(long, 400);
  const wrapped = await readUnread(long, rowSel);
  kit.check(
    `a ${wordCount(LONG_REASON)}-word reason wraps inside the row`,
    wrapped?.reason === LONG_REASON &&
      wrapped.reasonLines > 1 &&
      wrapped.reasonInside,
    JSON.stringify(wrapped)
  );
  await long.close();
}

/** Words that say money or spend: a currency amount, or the words themselves. */
const MONEY = String.raw`[$€£¥]\s?\d|\d\s?(?:USD|EUR|GBP)\b|\bspen[dt]\b|\bcosts?\b`;

/** What the page draws in `root` that says money or spend: each element's own words. */
const moneyIn = (page: Page, within: string) =>
  page.evaluate(
    ({ root, pattern }) => {
      const re = new RegExp(pattern, "i");
      const hits: string[] = [];
      for (const scope of document.querySelectorAll(root)) {
        for (const el of [scope, ...scope.querySelectorAll("*")]) {
          const own = [...el.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent ?? "")
            .join(" ");
          const label = el.getAttribute("aria-label") ?? "";
          const words = `${own} ${label}`.trim();
          if (words && re.test(words)) {
            hits.push(words.slice(0, 80));
          }
        }
      }
      return hits;
    },
    { root: within, pattern: MONEY }
  );

/**
 * The pickers and popups in `within`: anything that drops down, or a
 * setting. The composer's message field is an editable `role="combobox"`
 * box (its `/` and `@` suggestions, the ARIA combobox pattern for a text
 * field): words are typed into it, nothing is picked from it, so a text
 * field's combobox is not a picker. Every popup trigger is named by what it
 * is: Caw's name (his lead session's card, a dialog), or the composer's
 * Attach (`+`: Attach a file, Draw).
 */
const pickersIn = (page: Page, within: string) =>
  page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) {
      return null;
    }
    const all = (inner: string) => [...root.querySelectorAll(inner)];
    const combos = all(
      '[role="combobox"], [role="listbox"], [data-slot="select-trigger"]'
    );
    const typed = (el: Element) =>
      el instanceof HTMLTextAreaElement ||
      (el as HTMLElement).isContentEditable;
    return {
      selects: all("select").length,
      pickers: combos
        .filter((el) => !typed(el))
        .map((el) => `${el.tagName} ${el.className}`),
      switches: all('[role="switch"], input[type="checkbox"]').length,
      popups: all("[aria-haspopup]").map((el) => ({
        kind: el.getAttribute("aria-haspopup"),
        what: el.classList.contains("name")
          ? "Caw"
          : (el.getAttribute("aria-label") ?? el.className),
      })),
    };
  }, within);

/** The open menu's items: each one's words and whether it draws an svg glyph. */
const menuItems = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[role="menu"][data-state="open"] [role="menuitem"]'
      ),
    ].map((item) => ({
      words: (item.textContent ?? "").replace(/\s+/g, " ").trim(),
      svg: item.querySelector("svg") !== null,
    }))
  );

/**
 * Every colour the panel's own elements draw (ink and fill) and every gap,
 * padding and margin on them, against the token set: each `--*` declared
 * in the page's stylesheets resolved as a colour and as a length. A value
 * that is not a token's is named with its element.
 */
const offTokens = (page: Page, own: string[]) =>
  page.evaluate((selectors) => {
    const names = new Set<string>();
    const walk = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          for (const prop of rule.style) {
            if (prop.startsWith("--")) {
              names.add(prop);
            }
          }
        }
        if ("cssRules" in rule && rule.cssRules) {
          walk(rule.cssRules as CSSRuleList);
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules);
      } catch {
        // A sheet from elsewhere: not the house's.
      }
    }
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    document.querySelector(selectors[0])?.append(probe);
    const colours = new Set<string>();
    const lengths = new Set<number>([0]);
    for (const name of names) {
      probe.style.backgroundColor = "";
      probe.style.backgroundColor = `var(${name})`;
      const colour = getComputedStyle(probe).backgroundColor;
      if (colour && colour !== "rgba(0, 0, 0, 0)") {
        colours.add(colour);
      }
      probe.style.width = "";
      probe.style.width = `var(${name})`;
      const width = Number.parseFloat(getComputedStyle(probe).width);
      if (Number.isFinite(width)) {
        lengths.add(Math.round(width * 100) / 100);
      }
    }
    probe.remove();
    const off: string[] = [];
    let read = 0;
    const SPACING = [
      "row-gap",
      "column-gap",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
    ];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        read += 1;
        const style = getComputedStyle(el);
        for (const prop of ["color", "background-color"]) {
          const value = style.getPropertyValue(prop);
          if (value !== "rgba(0, 0, 0, 0)" && !colours.has(value)) {
            off.push(`${sel} ${prop} ${value}`);
          }
        }
        for (const prop of SPACING) {
          const raw = style.getPropertyValue(prop);
          if (raw === "normal" || raw === "auto") {
            continue;
          }
          const px = Math.round(Number.parseFloat(raw) * 100) / 100;
          // A negative margin pulls back by a token's length.
          if (Number.isFinite(px) && !lengths.has(Math.abs(px))) {
            off.push(`${sel} ${prop} ${raw}`);
          }
        }
      }
    }
    return {
      off,
      read,
      tokens: { colours: colours.size, lengths: lengths.size },
    };
  }, own);

/** The panel's own elements (CawThread, ThreadPane's hero, CawStarters). */
const OWN_HERO = [
  PANEL,
  `${PANEL} [data-caw-head]`,
  `${PANEL} [data-caw-head] .name`,
  `${PANEL} [data-caw-line]`,
  `${HERO} .kit-empty`,
  `${HERO} .kit-empty-title`,
  `${PANEL} .caw-80`,
  `${PANEL} .caw-starters`,
  `${PANEL} .caw-starters .kit-chip`,
];

/** Measured at a size: the panel, the hero, its chips and the composer. */
const measure = (page: Page) =>
  page.evaluate(
    ({ panel, hero, field }) => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) {
          return null;
        }
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x * 10) / 10,
          y: Math.round(r.y * 10) / 10,
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
        };
      };
      const chips = [
        ...document.querySelectorAll(`${panel} .caw-starters .kit-chip`),
      ].map((el) => el.getBoundingClientRect());
      const frame = document.querySelector(panel);
      return {
        vw: document.documentElement.clientWidth,
        vh: window.innerHeight,
        panel: box(panel),
        hero: box(`${hero} .kit-empty`),
        caw: box(`${panel} .caw-80`),
        title: box(`${hero} .kit-empty-title`),
        composer: box(`${panel} [data-keeps-draft] ${field}`),
        chipsInside: frame
          ? chips.every((r) => {
              const c = frame.getBoundingClientRect();
              return r.left >= c.left - 0.5 && r.right <= c.right + 0.5;
            })
          : false,
        chips: chips.length,
        titleFont: (() => {
          const el = document.querySelector(`${hero} .kit-empty-title`);
          return el ? getComputedStyle(el).fontSize : null;
        })(),
        seatOnComposer: document.querySelectorAll(
          `${panel} .composer-dock .seat`
        ).length,
      };
    },
    { panel: PANEL, hero: HERO, field: COMPOSER_FIELD }
  );

/** The hero's assertions, at `name`. */
async function checkHero(kit: Kit, page: Page, name: string) {
  const shown = await page
    .waitForSelector(HERO, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  kit.check(`${name}: an empty thread opens on the hero`, shown);
  if (!shown) {
    return;
  }
  await page.waitForSelector(`${PANEL} .caw-starters .kit-chip`, {
    timeout: 15_000,
  });
  await settle(page, 400);
  const at = await measure(page);
  kit.note(`${name} measured: ${JSON.stringify(at)}`);
  // For the critique, read after the engine's checks.
  await page.screenshot({
    path: join(kit.out, `${name.replace(/[^a-z0-9]+/gi, "-")}.png`),
  });
  const hero = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    return {
      title: root?.querySelector(".kit-empty-title")?.textContent?.trim() ?? "",
      chips: [...(root?.querySelectorAll(".caw-starters .kit-chip") ?? [])].map(
        (el) => el.querySelector("svg") !== null
      ),
      cards: root?.querySelectorAll(".starter-cards").length ?? 0,
    };
  }, HERO);
  kit.check(
    `${name}: the hero is Caw at 80 over its title`,
    !!at.caw &&
      at.caw.w >= 80 &&
      at.caw.h >= 80 &&
      !!at.title &&
      at.caw.y + at.caw.h <= at.title.y + 0.5 &&
      HERO_TITLE.test(hero.title),
    `caw ${JSON.stringify(at.caw)}, title ${JSON.stringify(at.title)} “${hero.title}” at ${at.titleFont}`
  );
  kit.check(
    `${name}: the project's starters stand under him as the kit's chips, each with its glyph`,
    hero.chips.length > 0 && hero.chips.every(Boolean) && hero.cards === 0,
    JSON.stringify(hero)
  );
  const glyphs = `${PANEL} .caw-starters .starter-glyph`;
  const inks = await glyphContrast(page, glyphs);
  kit.note(
    `${name}: starter glyphs as drawn before, in ink-muted: ${JSON.stringify(await glyphContrast(page, glyphs, "--ink-muted"))}`
  );
  kit.check(
    `${name}: every starter's glyph has its darker layer at 3:1 or more on its chip, in light and in dark`,
    inks.length === hero.chips.length * 2 && inks.every((one) => one.full >= 3),
    JSON.stringify(inks)
  );
  kit.check(
    `${name}: Caw stands on the hero, not on the composer, until the first words`,
    at.seatOnComposer === 0 && !!at.composer,
    `seats on the composer ${at.seatOnComposer}, composer ${JSON.stringify(at.composer)}`
  );
  const { panel } = at;
  kit.check(
    `${name}: the panel stands inside the viewport, the hero centred in it and the chips inside it`,
    !!panel &&
      !!at.hero &&
      panel.x >= -0.5 &&
      panel.x + panel.w <= at.vw + 0.5 &&
      panel.y + panel.h <= at.vh + 0.5 &&
      Math.abs(at.hero.x + at.hero.w / 2 - (panel.x + panel.w / 2)) <= 1 &&
      at.chipsInside,
    JSON.stringify({ panel, hero: at.hero, vw: at.vw, vh: at.vh })
  );
  const tokens = await offTokens(page, OWN_HERO);
  kit.check(
    `${name}: the hero's and the panel's colours and spacing are tokens' (${tokens.read} elements, ${tokens.tokens.colours} token colours, ${tokens.tokens.lengths} token lengths)`,
    tokens.read > 0 && tokens.off.length === 0,
    tokens.off.join("; ")
  );
}

/** What every size checks on the panel as it stands: what it is made of, no money, no pickers. */
async function checkPanel(kit: Kit, page: Page, name: string) {
  const made = await page.evaluate(
    ({ panel, field }) => {
      const root = document.querySelector(panel);
      return {
        composers: root?.querySelectorAll(`[data-keeps-draft] ${field}`).length,
        // The transcript's own rows (Transcript's virtual list, each `[data-row]`).
        rows: root?.querySelectorAll(".tx-columns [data-row]").length ?? 0,
        thread: !!root?.querySelector(".tx-columns"),
        cawFields: document.querySelectorAll(".caw-field").length,
      };
    },
    { panel: PANEL, field: COMPOSER_FIELD }
  );
  kit.check(
    `${name}: the panel holds the session Composer${made.thread ? " and the transcript's rows" : ""}, and the page no CawField`,
    (made.composers ?? 0) > 0 &&
      (!made.thread || made.rows > 0) &&
      made.cawFields === 0,
    JSON.stringify(made)
  );
  const money = await moneyIn(page, PANEL);
  kit.check(
    `${name}: nothing in the panel says money or spend`,
    money.length === 0,
    money.join(" | ")
  );
  const pickers = await pickersIn(page, PANEL);
  kit.check(
    `${name}: no <select>, picker combobox, listbox, select trigger or switch in the panel (the composer's text field aside); its popups are Caw's card and the composer's Attach`,
    !!pickers &&
      pickers.selects === 0 &&
      pickers.pickers.length === 0 &&
      pickers.switches === 0 &&
      pickers.popups.every(
        (one) =>
          (one.kind === "dialog" && one.what === "Caw") ||
          (one.kind === "menu" && one.what === "Attach or draw")
      ),
    JSON.stringify(pickers)
  );
  // The composer's Attach menu: its items carry their glyphs too.
  const attach = page.locator(`${PANEL} [aria-label="Attach or draw"]`);
  if (await attach.count()) {
    await attach.click();
    await page.waitForSelector('[role="menu"][data-state="open"]', {
      timeout: 10_000,
    });
    await settle(page, 300);
    const items = await menuItems(page);
    kit.check(
      `${name}: the composer's Attach menu items each have their glyph`,
      items.length > 0 && items.every((item) => item.svg),
      JSON.stringify(items)
    );
    await page.keyboard.press("Escape");
    await settle(page, 300);
  }
}

/** The page's column and its scroller, as they stand: where they are, how wide, how far scrolled. */
const pageColumn = (page: Page) =>
  page.evaluate(() => {
    const read = (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) {
        return null;
      }
      const r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        top: el.scrollTop,
        left: el.scrollLeft,
      };
    };
    return {
      page: read(".project-page"),
      // The view's pane, under the page or in the task split's main side.
      pane: read(".project-page .pane[data-view]"),
    };
  });

/**
 * The page under the panel: it keeps its width and its scroll (the panel
 * floats over it, it is not a split). Each scroller is scrolled as far as it
 * goes (up to 40px) first, so a scroll put back to 0 would show.
 */
async function checkPageStays(
  kit: Kit,
  page: Page,
  name: string,
  seat: string
) {
  await page.evaluate(() => {
    for (const sel of [".project-page", ".project-page .pane[data-view]"]) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) {
        el.scrollTop = 40;
      }
    }
  });
  await settle(page, 200);
  const before = await pageColumn(page);
  await page.click(seat);
  const opened = await page
    .waitForSelector(PANEL, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  await settle(page, 600);
  const after = await pageColumn(page);
  const same = (
    a: typeof before.page | null,
    b: typeof before.page | null
  ): boolean =>
    !!a &&
    !!b &&
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.w - b.w) < 0.5 &&
    Math.abs(a.h - b.h) < 0.5 &&
    a.top === b.top &&
    a.left === b.left;
  kit.check(
    `${name}: pressing Caw's seat opens his panel over the page, and the page's column keeps its box and its scroll under it`,
    opened && same(before.page, after.page) && same(before.pane, after.pane),
    JSON.stringify({ before, after })
  );
  return opened;
}

/** The head's ⋯: every item with its glyph; Caw's settings there hold no picker and say no money. */
async function checkSettings(kit: Kit, page: Page, name: string) {
  await page.click('.project-head [aria-label^="More for"]');
  await page.waitForSelector('[role="menu"][data-state="open"]', {
    timeout: 10_000,
  });
  await settle(page, 300);
  const items = await menuItems(page);
  kit.check(
    `${name}: the head's ⋯ holds Caw settings…, every item with its glyph`,
    items.some((item) => item.words === "Caw settings…") &&
      items.every((item) => item.svg),
    JSON.stringify(items)
  );
  await page.keyboard.press("Escape");
  await settle(page, 300);
  await openCawSettings(page);
  await settle(page, 400);
  const money = await moneyIn(page, ".caw-panel");
  kit.check(
    `${name}: Caw's settings say no money or spend`,
    money.length === 0,
    money.join(" | ")
  );
  const pickers = await pickersIn(page, ".caw-panel");
  kit.check(
    `${name}: Caw's settings hold his switch and no harness or model picker`,
    !!pickers &&
      pickers.selects === 0 &&
      pickers.pickers.length === 0 &&
      pickers.switches === 1 &&
      pickers.popups.length === 0,
    JSON.stringify(pickers)
  );
  await page.keyboard.press("Escape");
  await settle(page, 400);
}

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** A git checkout in the sandbox for a project of its own. */
async function checkout(fleet: Fleet, name: string): Promise<string> {
  const src = join(fleet.sandbox, name);
  await mkdir(src, { recursive: true });
  await Bun.$`git init -q -b main && echo caw > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: fleet.env.HOME as string })
    .quiet();
  return src;
}

/** The composer's field (its measuring twin is no combobox). */
const FIELD = `${COMPOSER_FIELD}[aria-label="Message the project"]`;

/** What the page's sockets received that carries a `thread.message` frame, as sent. */
function threadFrames(page: Page): string[] {
  const heard: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      const words = typeof payload === "string" ? payload : payload.toString();
      if (words.includes('"thread.message"')) {
        heard.push(words);
      }
    });
  });
  return heard;
}

/** What the hub answered your words with: Caw's reply, or its note that he was not woken. */
type Answered =
  | { kind: "reply"; id: string; threadId: string }
  | { kind: "not-woken"; id: string; threadId: string; why: string };

/** The hub's answer to your message `yours`, once it has stored one. */
const answerTo = (fleet: Fleet, yours: string, tag: string) =>
  until<Answered>(
    `the hub's answer to ${tag}`,
    () => {
      const [reply] = fleet.query<{ id: string; threadId: string }>(
        "SELECT id, thread_id AS threadId FROM thread_messages WHERE author = 'caw' AND body = ?",
        `Answer ${tag}`
      );
      if (reply) {
        return { kind: "reply", ...reply };
      }
      const [note] = fleet.query<{ id: string; threadId: string; why: string }>(
        "SELECT id, thread_id AS threadId, json_extract(event, '$.notWoken.words') AS why FROM thread_messages WHERE author = 'event' AND json_extract(event, '$.notWoken.message') = ?",
        yours
      );
      return note ? { kind: "not-woken", ...note } : undefined;
    },
    Boolean,
    90_000
  ).catch(() => undefined);

/** Whether `root` shows `words` with the thread's turn over (no Stop), within a second. */
const showsSettled = (page: Page, root: string, words: string) =>
  page
    .waitForFunction(
      ({ sel, want }) => {
        const view = document.querySelector(sel);
        return (
          !!view?.textContent?.includes(want) &&
          !view.querySelector('button[aria-label="Stop the agent"]')
        );
      },
      { sel: root, want: words },
      { timeout: 1000 }
    )
    .then(
      () => true,
      () => false
    );

/** Whether `root` draws every not-woken note its thread holds (RowFault `data-not-woken`), within a second. */
const notesDrawn = (
  fleet: Fleet,
  page: Page,
  root: string,
  threadId: string
) => {
  const [{ n } = { n: 0 }] = fleet.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM thread_messages WHERE thread_id = ? AND json_extract(event, '$.notWoken.message') IS NOT NULL",
    threadId
  );
  return page
    .waitForFunction(
      ({ sel, want }) =>
        document.querySelectorAll(`${sel} [data-not-woken]`).length === want,
      { sel: root, want: n },
      { timeout: 1000 }
    )
    .then(
      () => `yes (${n})`,
      () => `no (${n} in the thread)`
    );
};

/**
 * Your words sent from the composer in `root`, tagged; the mock Caw answers
 * them in plain text and the hub stores it as his reply. Within a second of
 * the hub storing it, `root` shows it with his turn over, with no reload: a
 * reply that streamed in this view settles under the live row's key
 * (rows.ts `keepLive`), so it is read by its words, and with the turn over
 * those words are the stored message's, since the frame that ends the turn
 * also drops the live words (caw.ts `said`, then the thread's row). Answers
 * the thread it went to.
 */
async function replyLands(
  kit: Kit,
  fleet: Fleet,
  page: Page,
  heard: string[],
  name: string,
  root: string,
  tag: string
): Promise<string | undefined> {
  const words = `Live check: reply with PROBE-REPLY-${tag}.`;
  const field = page.locator(`${root} ${FIELD}`);
  await field.fill(words);
  await field.press("Enter");
  const yours = await until(
    `your words ${tag} in the hub`,
    () =>
      fleet.query<{ id: string }>(
        "SELECT id FROM thread_messages WHERE author = 'you' AND body = ?",
        words
      )[0]?.id,
    Boolean,
    30_000
  ).catch(() => undefined);
  if (!kit.check(`${name}: the hub stores your words`, !!yours)) {
    return;
  }
  const answer = await answerTo(fleet, yours as string, tag);
  const framed = (id: string) => heard.some((frame) => frame.includes(id));
  const tail = async () =>
    (
      await page.evaluate(
        (sel) => document.querySelector(sel)?.textContent?.slice(-240) ?? "",
        root
      )
    ).replace(/\s+/g, " ");
  if (answer?.kind !== "reply") {
    // Caw could not start: the hub's note says so through the same frame,
    // and the view draws every such note the thread holds.
    const noted =
      answer && (await notesDrawn(fleet, page, root, answer.threadId));
    kit.check(
      `${name}: the hub stores Caw's reply`,
      false,
      answer
        ? `Caw was not woken: ${answer.why}; the hub's note ${answer.id} reached the page: ${framed(answer.id)}; the view draws the thread's not-woken notes within a second: ${noted}`
        : "the hub stored neither his reply nor a note"
    );
    return answer?.threadId;
  }
  const drawn = await showsSettled(page, root, `Answer ${tag}`);
  kit.check(
    `${name}: Caw's reply renders in the open view within a second of the hub storing it, no reload`,
    drawn,
    `reply ${answer.id} in thread ${answer.threadId}; its thread.message frame reached the page: ${framed(answer.id)}; the view ends “${await tail()}”`
  );
  return answer.threadId;
}

/**
 * New thread in the panel's head, then, for a title, that thread's row
 * under the hero's chips (SessionRow): a press shows it in the panel.
 */
async function pickThread(page: Page, title: string) {
  const fresh = page.locator(NEW_THREAD);
  if (await fresh.count()) {
    await fresh.click();
    await page.waitForSelector(HERO, { timeout: 15_000 });
    await settle(page, 400);
  }
  if (title === "New thread") {
    return;
  }
  await page
    .locator(`${PANEL} .earlier li`, { hasText: title })
    .first()
    .click();
  await settle(page, 400);
}

/** The hero lists the earlier threads as the app's conversation rows, not a menu of words. */
async function checkEarlier(kit: Kit, page: Page, name: string) {
  const read = await page.evaluate((hero) => {
    const rows = [...document.querySelectorAll(`${hero} .earlier li`)];
    return {
      rows: rows.length,
      links: rows.filter(
        (row) => !!row.querySelector("a[href^='/session/thread:']")
      ).length,
      menus: document.querySelectorAll(`${hero} [role="menu"], ${hero} select`)
        .length,
    };
  }, HERO);
  kit.check(
    `${name}: the hero lists the earlier threads as conversation rows (SessionRow, each a link to its thread), no menu`,
    read.rows > 0 && read.links === read.rows && read.menus === 0,
    JSON.stringify(read)
  );
}

/**
 * Caw's model, changed where any session's model is: his name in the
 * panel opens his lead session's card (SessionDetails), its model chip the
 * models (ModelSection); the model picked there is the hub's lead record
 * (`projects.caw_model`) once it answers.
 */
async function checkModel(
  kit: Kit,
  fleet: Fleet,
  page: Page,
  projectId: string
) {
  const name = page.locator(`${PANEL} [data-caw-head] button.name`);
  const named = await name
    .waitFor({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (
    !kit.check("Caw's name in the panel opens his lead session's card", named)
  ) {
    return;
  }
  await name.click();
  const card = await page
    .waitForSelector(".caw-lead-card .session-details", { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  kit.check("his card is the session card (SessionDetails)", card);
  if (!card) {
    return;
  }
  await settle(page, 400);
  await page.click(".caw-lead-card #details-model");
  await page.waitForSelector(
    "#details-model-popover [role='option'][data-model]",
    { timeout: 30_000 }
  );
  await settle(page, 300);
  const pick = await page.evaluate(() => {
    const rows = [
      ...document.querySelectorAll<HTMLElement>(
        "#details-model-popover [role='option'][data-model]:not([disabled]):not([aria-selected='true'])"
      ),
    ];
    const row =
      rows.find((one) =>
        (one.textContent ?? "").toLowerCase().includes("haiku")
      ) ?? rows[0];
    return row?.dataset.model ?? null;
  });
  if (!kit.check("the card's models list one to pick", !!pick)) {
    return;
  }
  await page.click(
    `#details-model-popover [role='option'][data-model="${pick}"]`
  );
  const stored = await until(
    "the hub's lead record",
    () =>
      fleet.query<{ model: string | null }>(
        "SELECT caw_model AS model FROM projects WHERE id = ?",
        projectId
      )[0]?.model ?? null,
    (model) => model === pick,
    30_000
  ).catch(() => null);
  kit.check(
    `the model picked in his session card (${pick}) is the hub's lead record`,
    stored === pick,
    `caw_model ${stored}`
  );
  const chip = await page
    .locator(".caw-lead-card .model-chip .chip-label")
    .textContent()
    .catch(() => "");
  kit.note(`his card's model chip reads “${chip?.trim()}”`);
  await page.keyboard.press("Escape");
  await settle(page, 300);
}

/**
 * The invariant: a message Caw posts to a thread appears in every open view
 * of it within a second of the hub storing it, with no reload, including a
 * thread the view itself made by sending its first message. In the panel:
 * its New thread, the thread it then shows, a thread chosen from its
 * earlier rows, and New thread with Caw on; in a thread tab: a new thread,
 * then the thread it made. Then his model, from his session card.
 */
async function checkReplies(kit: Kit, fleet: Fleet, base: string) {
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Caw replies",
    machineId: MACHINE,
    cwd: await checkout(fleet, "replies"),
    caw: false,
  });
  // A task on the board: Caw sits in the head (his seat), not over it.
  await fleet.api(`/api/projects/${project.id}/tasks`, { title: "A task" });
  const page = await kit.page("desk");
  page.setDefaultTimeout(60_000);
  const heard = threadFrames(page);
  // What the page threw, or said failed: a pane that throws as it mounts is
  // taken down by its region's boundary, and nothing of its thread shows.
  const thrown: string[] = [];
  page.on("pageerror", (error) => thrown.push(error.message));
  page.on("console", (line) => {
    if (line.type() === "error") {
      thrown.push(line.text().slice(0, 300));
    }
  });
  const seat = ".project-head button.caw-seat";
  await open(page, `${base}/project/${project.id}`, seat);
  await settle(page, 400);
  await page.click(seat);
  await page.waitForSelector(`${PANEL} ${FIELD}`, { timeout: 30_000 });
  // A thread to come back to, so the panel has an earlier row to pick.
  await fleet.api(`/api/projects/${project.id}/threads`, {
    body: "First thread",
  });
  await page.waitForSelector(NEW_THREAD, { timeout: 30_000 });
  await pickThread(page, "New thread");
  await checkEarlier(kit, page, "panel, New thread");
  await replyLands(
    kit,
    fleet,
    page,
    heard,
    "panel, New thread, Caw off",
    PANEL,
    "DOCKNEW"
  );
  await replyLands(
    kit,
    fleet,
    page,
    heard,
    "panel, the thread its first words made",
    PANEL,
    "DOCKMADE"
  );
  await pickThread(page, "First thread");
  await page.waitForSelector(`${PANEL} .tx-columns`, { timeout: 30_000 });
  await replyLands(
    kit,
    fleet,
    page,
    heard,
    "panel, a thread chosen from its earlier rows",
    PANEL,
    "DOCKPICKED"
  );
  await checkPanel(kit, page, "desk, a thread");
  const on = await fetch(`${fleet.base}/api/projects/${project.id}/caw`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ on: true }),
  });
  if (kit.check("Caw turned on", on.ok, `${on.status}`)) {
    await pickThread(page, "New thread");
    await replyLands(
      kit,
      fleet,
      page,
      heard,
      "panel, New thread, Caw on",
      PANEL,
      "DOCKON"
    );
  }
  await checkModel(kit, fleet, page, project.id);
  kit.check(
    "the panel threw nothing as its threads were made, answered and switched",
    thrown.length === 0,
    thrown.join(" | ")
  );
  // A thread tab: its first message makes the thread and re-addresses it.
  const tab = await kit.page("desk");
  tab.setDefaultTimeout(60_000);
  const tabHeard = threadFrames(tab);
  await open(tab, `${base}/session/thread:new:${project.id}`, FIELD, 90_000);
  await replyLands(
    kit,
    fleet,
    tab,
    tabHeard,
    "thread tab, a new thread",
    "body",
    "TABNEW"
  );
  await replyLands(
    kit,
    fleet,
    tab,
    tabHeard,
    "thread tab, the thread it made",
    "body",
    "TABMADE"
  );
}

const spec: Spec = {
  name: "caw-dock",
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
    const home = fleet.env.HOME as string;
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    const src = await checkout(fleet, "src");
    const base = await fleet.dashboard();
    await checkReplies(kit, fleet, base);
    const project = await fleet.api<{ id: string; name: string }>(
      "/api/projects",
      { name: "Caw panel", machineId: MACHINE, cwd: src, caw: false }
    );
    // A task on the board: Caw sits in the head (his seat), not over it.
    await fleet.api(`/api/projects/${project.id}/tasks`, { title: "A task" });
    const url = `${base}/project/${project.id}`;
    const seat = ".project-head button.caw-seat";

    const sizes: { view: View; name: string }[] = [
      { view: "desk", name: "desk 1440" },
      { view: "tablet", name: "iPad 1024" },
      { view: "phone", name: "phone 390" },
    ];
    let threaded = false;
    for (const { view, name } of sizes) {
      const page = await kit.page(view);
      page.setDefaultTimeout(60_000);
      await open(page, url, seat);
      await settle(page, 400);
      if (!(await checkPageStays(kit, page, name, seat))) {
        continue;
      }
      if (threaded) {
        // The panel opens on the project's newest thread; New thread, the hero.
        await page.waitForSelector(`${PANEL} .tx-columns`, { timeout: 30_000 });
        await checkPanel(kit, page, `${name}, a thread`);
        await pickThread(page, "New thread");
        await checkEarlier(kit, page, name);
      }
      await checkHero(kit, page, name);
      await checkPanel(kit, page, `${name}, the hero`);
      if (!threaded) {
        // The project's first thread: the panel, on the hero, takes it as
        // the newest once it lands.
        await fleet.api(`/api/projects/${project.id}/threads`, {
          body: "Hello",
        });
        await until(
          "the thread",
          () =>
            fleet.query<{ n: number }>(
              "SELECT COUNT(*) AS n FROM project_threads WHERE project_id = ?",
              project.id
            )[0]?.n ?? 0,
          (n) => n > 0,
          30_000
        );
        threaded = true;
        const moved = await page
          .waitForSelector(`${PANEL} .tx-columns`, { timeout: 30_000 })
          .then(() => true)
          .catch(() => false);
        kit.check(
          `${name}: the panel on the hero moves to the project's first thread once it lands`,
          moved
        );
        if (moved) {
          await checkPanel(kit, page, `${name}, a thread`);
          await pickThread(page, "New thread");
          await checkEarlier(kit, page, name);
          await checkHero(kit, page, `${name}, New thread`);
        }
      }
      await page.keyboard.press("Escape");
      await settle(page, 500);
      const gone = await page
        .waitForSelector(PANEL, { state: "detached", timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      kit.check(`${name}: Escape puts the panel away`, gone);
      await checkSettings(kit, page, name);
    }
    // His question card and the not-woken note, in the thread the panel
    // opens on (the project's newest).
    const [thread] = fleet.query<{ id: string }>(
      "SELECT id FROM project_threads WHERE project_id = ? ORDER BY rowid DESC LIMIT 1",
      project.id
    );
    if (!kit.check("the panel's project has a thread", !!thread)) {
      return;
    }
    const threadId = (thread as { id: string }).id;
    await checkQuestion(kit, base, project, threadId, "desk", "panel 380");
    await checkQuestion(kit, base, project, threadId, "phone", "phone 390");
    await checkUnread(kit, fleet, base, project, threadId);
  },
};
export default spec;
