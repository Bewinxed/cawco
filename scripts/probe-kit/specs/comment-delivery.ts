/**
 * The person's comments go to the session by themselves (the owner's pick,
 * "Go by themselves", 2026-10-23, replacing "On Send"): a few seconds after
 * their last mark, with no Send (artifacts/service.ts `personMarked`,
 * `marked`, `deliverMarks`; server.ts `deliverArtifactMarks`). Send is the
 * page's picks alone.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) and the built dashboard at the desk, read from the hub's own
 * records (`sent_messages`), its journal, what the model was sent, the
 * page's doc and the pane's DOM:
 *
 * 1. A session shows a page in its pane; nothing is unsent, so the head has
 *    no Send.
 * 2. Three comments, each pressed and written, 2 s apart, and no Send ever
 *    in the head: one delivery a few seconds after the third, carrying all
 *    three, each with its number, id, selector, source file:line, text and
 *    the person's words, and their three pictures; the session's turn
 *    starts on it; the transcript draws one quiet line, "Comments on
 *    <page>", and no row of the person's; every pin and entry is stamped
 *    `sentAt`; the hub's journal says it went.
 * 3. A reply to pin 2 later: one more delivery, pin 2 alone.
 * 4. The person resolves pin 3: one more delivery, its resolve line.
 * 5. A pen stroke no pin stands on: one more delivery, the ink over its
 *    element with its box, and the page with the ink as its picture.
 * 6. Everything sent: no Send in the pane's head.
 * 8. A comment the session reads with comment_read before its delivery is
 *    stamped heard and never delivered; the person's later reply on it
 *    still goes, with only the new words.
 * 7. A writer that has ended: a session of a project with Caw makes a page,
 *    and its conversation is gone (the hub's own record, `last_error`, as
 *    the harness sets it when a resume finds nothing). A comment on its
 *    page wakes the project's Caw instead, the delivery naming the pin's
 *    id; his comment_reply lands in that pin's thread, by the agent, where
 *    the person reads it (7a). Caw's own turn needs his place's sandbox:
 *    run from inside a workspace on a host that cannot nest one (core
 *    boundary-nesting.ts), the hub's refusal of his wake is noted, the
 *    writer is checked to be sent nothing, the pin to stay unstamped (owed
 *    for the next delivery), and the writer's transcript to show the
 *    comments line "not sent" with why. Live, the pin is stamped heard. 7b,
 *    the rule through the tool: a session that is not the project's lead is
 *    refused the pin; once the hub's record names it the lead, its
 *    comment_reply lands in the thread.
 * 9. A comment on the whole page (a press in its padding, no content within
 *    reach) stands on the page's body, its pill at the viewport's top-right,
 *    and keeps none of its words; the page's words changing twice leaves it
 *    on the page, never moved aside nor said gone, and it is delivered
 *    once, as a comment on the whole page.
 * 10. The page's own doc socket dropped: once it has stood lost 15 s the
 *    Comments control and its rail say the comments aren't reaching the
 *    agent, with Try again; a comment pressed then opens its composer at
 *    once, and Comment keeps its words in the page's doc; it and an
 *    annotation made then survive a frame reload from the device, the page
 *    lets go of another artifact's stale copy, and with the link back and
 *    Try again the session hears each once, by itself.
 * 11. Pins kept on a page-sized container by its place (one moved aside)
 *    stand on the page as a whole again, written back on its body, and the
 *    session is told nothing new of them.
 * 12. The owner's report: a project's session makes a decision page and
 *    runs a long command. A pin on its card, and no Send: the agent moves
 *    the running command to the background (agent harnesses/claude.ts
 *    `#moveToBackground`) and the delivery joins the turn at that tool
 *    boundary, a few seconds after the pin, long before the command's end;
 *    the journal says it went. A reply during the next long command joins
 *    the same way, with only the new words. A pick on the same page waits
 *    for Send: nothing reaches the session until the head's Send, which
 *    counts it.
 * 13. The same session asleep: a reply on its pin wakes it, the delivery
 *    its turn's first message.
 *
 *   bun scripts/probe-kit/run.ts comment-delivery
 */
import { Database } from "bun:sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Frame, Page, WebSocketRoute } from "playwright-core";
import { wroteLine } from "../../../packages/core/src/comments";
import { CLAUDE_CONVERSATION_GONE } from "../../../packages/core/src/index";
import { artifactToolWords } from "../../../packages/core/src/words/artifact-tools";
import { commonWords } from "../../../packages/core/src/words/common";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, pressAt, pressIn, type Spec, settle } from "../kit";
import { shaped } from "../words";
import {
  docOf,
  dragFromIcon,
  type On,
  pageFrame,
  screenBox,
  strokeOver,
} from "./ink";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const NAME = "comment-delivery";
/** The comments notice (core injected.ts `artifactCommentsNotice`). */
const NOTICE =
  /\[CawCo\] The person commented on the page "comment-delivery" \(artifact [0-9a-f-]{36}\)\./;
const IMAGE_BLOCK = /"type":"image"/g;
/** The hub's quiet after the person's last mark before it delivers them (artifacts/service.ts `COMMENTS_QUIET_MS`). */
const QUIET_MS = 3000;
/** How long a delivery may take to reach the model once it goes: the hub's send, the agent, Claude Code's request. */
const REACH_MS = 12_000;
/** From the person's last mark to the model: the quiet, then the reach. */
const MARK_TO_MODEL_MS = QUIET_MS + REACH_MS;
/** How long after a delivery (or none) the probe watches for one that should not come. */
const STILL_MS = 12_000;

const PARAS = [
  { id: "a", line: 11, text: "Alpha paragraph, the first to pin." },
  { id: "b", line: 12, text: "Bravo paragraph, the second to pin." },
  { id: "c", line: 13, text: "Charlie paragraph, the third to pin." },
  { id: "d", line: 14, text: "Delta paragraph, where a stroke goes." },
  { id: "e", line: 15, text: "Echo paragraph, read before it goes." },
] as const;
const WORDS = ["Make this bold.", "Tighten this line.", "Drop this one."];

const html = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; font: 18px/1.6 system-ui; }
  main { padding: 24px; }
  p { width: 70%; margin: 0 0 40px; }
</style></head>
<body><main>
${PARAS.map((p) => `  <p id="${p.id}" data-insp-path="src/Page.svelte:${p.line}:3">${p.text}</p>`).join("\n")}
</main></body></html>`;

/** The ended writer's page (7). */
const WRITER_PAGE = "ended-writer";
const WRITER_HTML = `<!doctype html><html><body style="margin:0;font:18px/1.6 system-ui"><main style="padding:24px">
  <p id="w" data-insp-path="src/Writer.svelte:7:3" style="width:70%">The writer's paragraph, pinned after it ended.</p>
</main></body></html>`;
const REPLY_TOOL = "mcp__cawco__comment_reply";
const READ_TOOL = "mcp__cawco__comment_read";
/** Step 8's pin, read before the quiet period ends, and the person's later word on it. */
const FIRST_WORDS = "Read this before it goes.";
/** Step 9's pin, on the page as a whole (after pins 1–4), and the person's words in it. */
const WHOLE_PIN = 5;
const WHOLE_WORDS = "So much useless copy everywhere.";
/** Step 10's pin, an annotation made while the page's link is down. */
const DOWN_PIN = 6;
/** Step 10's comment, tapped while the page's link is down, and the person's words in it. */
const DOWN_COMMENT = 7;
const DOWN_WORDS = "Written while the link was down.";
/** Step 11's pins, kept on the page-sized container. */
const OLD_PINS = [8, 9] as const;
/** The page's own doc socket (overlay artifact.ts), never the pane's `/ws/artifact/`. */
const PAGE_SOCKET = /\/__cawco\/artifact\/[0-9a-f-]{36}/;
/** How long a lost link stands before the pane says it (artifact-doc.ts `LINK_DOWN_MS`). */
const LINK_DOWN_MS = 15_000;
/** …and room for it to. */
const SAID_WITHIN_MS = LINK_DOWN_MS + 4000;
/** A device copy of an artifact no one opened there (core doc-link.ts `deviceDocName`, no `cawco-artifact-used:` note): let go on the next join. */
const STALE_COPY = "cawco-artifact:00000000-0000-4000-8000-000000000000";
/** The pane's words while it stands lost (artifact-doc.ts `LINK_DROPPED`). */
const LINK_DROPPED =
  "Comments aren't reaching the agent. The link to the hub dropped.";

/**
 * The page's doc socket, routed through the probe so step 10 can drop it:
 * passed through to the hub while `down` is false, every attempt closed at
 * once while it is true.
 */
const pageLink: { down: boolean; open: Set<WebSocketRoute> } = {
  down: false,
  open: new Set(),
};
const routePageLink = (page: Page) =>
  page.routeWebSocket(PAGE_SOCKET, (ws) => {
    if (pageLink.down) {
      ws.close({ code: 1011, reason: "The probe dropped the page's link." });
      return;
    }
    ws.connectToServer();
    pageLink.open.add(ws);
    ws.onClose(() => {
      pageLink.open.delete(ws);
    });
  });
/** The mode menu's Comment, its shortcut after it. */
const COMMENT_ITEM = /^Comment/;
const LATER_WORDS = "And one more word after you read it.";
/** The delivery routed to Caw: the writer's page, a pin's id, and that it comes to him. */
const ROUTED =
  /The person commented on the page "ended-writer"[\s\S]*?- Pin: ([0-9a-f-]{36})[\s\S]*?so these come to you/;
/** The hub's log lines step 7 reads. */
const HUB_LINE = /caw|artifacts|marks|lead/i;
/** The host's refusal of a sandbox inside another (core boundary-nesting.ts). */
const NESTED = /inside another (bwrap|macOS) sandbox|unpriv_bwrap/;
/** The project's lead's reply in 7b. */
const LEAD_WORDS = "The project's lead: I'll take this one.";
const CAW_WORDS = "Caw here: its writer has ended, so I'll take this one.";
/** Caw's part (7): the pin the delivery named, his reply issued, and its answer. */
const caw: { answer?: string; heard?: string; issued: boolean; pin?: string } =
  { issued: false };

/** Caw's turns on the routed delivery: comment_reply on the pin it names (loaded through ToolSearch first when deferred). */
const cawReply = (request: Seen, routed: RegExpExecArray): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  caw.pin ??= routed[1];
  caw.heard ??= request.last;
  if (caw.issued) {
    if (request.afterTool && !caw.answer) {
      caw.answer = request.last;
    }
    return text("Answered in the pin's thread.");
  }
  if (request.toolNames.includes(REPLY_TOOL)) {
    caw.issued = true;
    return {
      everyMs: 5,
      words: [],
      tool: { name: REPLY_TOOL, input: { pin: caw.pin, text: CAW_WORDS } },
    };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${REPLY_TOOL}`, max_results: 1 },
        },
      }
    : text(`${REPLY_TOOL} is not offered`);
};

/** Step 12's decision page, its program, and the session's long work it is pinned during. */
const BUSY_PAGE = "busy-decision";
const BUSY_PROGRAM = `root = Decisions("Delegates in any folder", [how])
how = Decision("how", "How should a delegate work in a folder that isn't a git repository?", [live, snap], "Both use one mechanism for every folder.")
live = Option("live", "Live folder, private writes", "A private layer over the real folder.", true, [], "Reads are slower on the Mac.")
snap = Option("snapshot", "Frozen copy, private writes", "A frozen copy of the folder.", false, [], "Minutes to make on a full disk.")`;
const BUSY_MARK = "PROBE-BUSY-WORK";
/** The session's two long commands, s each: the pin's delivery joins while the first runs, the reply's while the second does. */
const BUSY_SLEEPS = [45, 30] as const;
const BUSY_PIN_WORDS = "how does this even work";
const BUSY_REPLY_WORDS = "and what's the best practice?";
const BUSY_NOTICE = `The person commented on the page "${BUSY_PAGE}"`;
/** A reason's own full stop, which the line that quotes it puts back. */
const REASON_STOP = /\.$/;
/** The picks' notice (core injected.ts `artifactResponsesNotice`) for the busy page. */
const PICKS_NOTICE = `The page "${BUSY_PAGE}" has new responses`;
/** Step 13's reply, which wakes the sleeping session. */
const WAKE_WORDS = "Are you still there?";
/** The busy session's turn (12): on while the leg runs, each long command's issue time, and every request of it. */
const busyTurn: { active: boolean; heard: Seen[]; issued: number[] } = {
  active: false,
  heard: [],
  issued: [],
};
/** The busy session's turn: a long command, then another at its end, then done. */
const busyReply = (request: Seen): Reply => {
  busyTurn.heard.push(request);
  const next = BUSY_SLEEPS[busyTurn.issued.length];
  if (next === undefined) {
    return { everyMs: 5, words: ["Done with the long work."] };
  }
  busyTurn.issued.push(Date.now());
  return {
    everyMs: 5,
    words: [],
    tool: {
      name: "Bash",
      input: {
        command: `sleep ${next}`,
        description: "A long command",
        timeout: 120_000,
      },
    },
  };
};

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();
/** Every request the model was asked with, in order. */
const heard: Seen[] = [];

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  heard.push(request);
  if (busyTurn.active && request.all.includes(BUSY_MARK)) {
    return busyReply(request);
  }
  if (NOTICE.test(request.last)) {
    return text("Heard the comments.");
  }
  const routed = ROUTED.exec(request.all);
  if (routed) {
    return cawReply(request, routed);
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      // Its whole answer: a delivery may join at the tool's boundary.
      answered.set(marker, request.final);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

/** The session's artifact events since `from` (ms), from the hub's own table. */
const eventsOf = (dbPath: string, session: string, from: number) => {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db
      .query<
        { accepted_at: number; body: string | null; state: string },
        [string]
      >(
        "SELECT body, state, accepted_at FROM sent_messages WHERE instance_id = ? ORDER BY accepted_at"
      )
      .all(session)
      .filter((row) => Number(row.accepted_at) >= from)
      .filter((row) => {
        const body = JSON.parse(row.body ?? "{}") as {
          origin?: { kind?: string; name?: string };
        };
        return (
          body.origin?.kind === "system" && body.origin.name === "artifact"
        );
      });
  } finally {
    db.close();
  }
};

/** The model's requests that are deliveries (the notice is their last message), after index `from`. */
const deliveries = (from = 0) =>
  heard.slice(from).filter((one) => NOTICE.test(one.last) && !one.afterTool);

/** Images a request carries beyond what the request before it in `heard` carried: this delivery's own. */
const ownImages = (request: Seen): number => {
  const at = heard.indexOf(request);
  const before =
    at > 0 ? (heard[at - 1].body.match(IMAGE_BLOCK)?.length ?? 0) : 0;
  return (request.body.match(IMAGE_BLOCK)?.length ?? 0) - before;
};

type Pins = Record<string, Record<string, unknown>>;
const numbered = (pins: Pins, number: number) =>
  Object.values(pins).find((pin) => pin.number === number) as
    | (Record<string, unknown> & {
        heard?: string;
        id: string;
        resolvedAt?: string;
        sentAt?: string;
        thread: { by: string; sentAt?: string; text: string }[];
      })
    | undefined;

const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
/** The Comments rail (DESIGN.md, The Comments rail). */
const RAIL = '[data-slot="comment-rail"]';
/** The composer a press on the page opens (DESIGN.md, Placing a comment). */
const COMPOSE = '[data-slot="pin-composer"]';

/** The pane's Comments rail, beside the page, opened when shut. */
const rowsOf = async (page: Page) => {
  const button = page.locator(`${PANE} button[data-slot="comments"]`);
  if ((await button.getAttribute("aria-expanded")) !== "true") {
    await button.click();
  }
  const list = page.locator(RAIL);
  await list.waitFor({ timeout: 5000 });
  await settle(page, 350);
  return list;
};
/** Pin `number`'s thread, opened from its row in the rail. */
const openRow = async (page: Page, number: number) =>
  (await rowsOf(page))
    .locator(`[data-slot="pin-row"][data-pin-row="${number}"]`)
    .click();
/** The rail shut, when open. */
const shutList = async (page: Page) => {
  const button = page.locator(`${PANE} button[data-slot="comments"]`);
  if ((await button.getAttribute("aria-expanded")) === "true") {
    await button.click();
    await page
      .locator(RAIL)
      .waitFor({ state: "detached", timeout: 3000 })
      .catch(() => undefined);
  }
};
/** The head's Send, while something is unsent: its count, or null when it doesn't stand. */
const sendCount = async (page: Page) =>
  (
    await page
      .locator(`${PANE} [data-slot="send"] [data-slot="send-count"]`)
      .textContent({ timeout: 1000 })
      .catch(() => null)
  )?.trim() ?? null;
/** The person's Send in the head (a page's picks): when it was pressed. */
const sendNow = async (page: Page) => {
  const at = Date.now();
  await page.locator(`${PANE} [data-slot="send"]`).click();
  return at;
};
/**
 * A press at the screen's `x`, `y` in Comment mode: its composer opens,
 * writing nothing; `words` typed and Enter comment, the pin and its first
 * entry written at once. Whether the composer opened.
 */
const commentAt = async (
  page: Page,
  frame: Frame,
  x: number,
  y: number,
  words: string
) => {
  await page.mouse.move(x, y, { steps: 4 });
  await pressAt(frame, { x, y });
  const composer = page.locator(COMPOSE);
  const opened = await composer
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (opened) {
    await composer.getByRole("combobox").fill(words);
    await page.keyboard.press("Enter");
    await composer
      .waitFor({ state: "detached", timeout: 8000 })
      .catch(() => undefined);
  }
  return opened;
};

/** Whether the page stands in the pane's Comment mode. */
const inCommentMode = (frame: Frame) =>
  frame.evaluate(
    () =>
      document
        .querySelector("cawco-overlay")
        ?.shadowRoot?.querySelector(".layer")
        ?.classList.contains("comment") ?? false
  );

/** Until the page has heard the pane's Comment mode. */
const pageInComment = (frame: Frame) =>
  until(
    "the page's Comment mode on",
    () =>
      frame.evaluate(
        () =>
          document
            .querySelector("cawco-overlay")
            ?.shadowRoot?.querySelector(".layer")
            ?.classList.contains("comment") ?? false
      ),
    Boolean,
    5000
  );

/** The next delivery after index `from`, and when it reached the model. */
const nextDelivery = (label: string, from: number, ms: number) =>
  until(label, () => deliveries(from)[0], Boolean, ms).catch(() => undefined);

/** Comments 1–3, each pressed and written, 2 s from one's words to the next; when each one's words were kept. */
const writePins = async (on: On, frame: Frame): Promise<number[]> => {
  const { page } = on;
  const keptAt: number[] = [];
  for (const [i, words] of WORDS.entries()) {
    const number = i + 1;
    if (i > 0) {
      // 2 s from the last pin's words to this pin.
      // biome-ignore lint/performance/noAwaitInLoops: the pins are written one after another, as a person does
      await Bun.sleep(Math.max(0, keptAt[i - 1] + 2000 - Date.now()));
    }
    const b = await screenBox(on, frame, `#${PARAS[i].id}`);
    await commentAt(page, frame, b.x + b.w * 0.3, b.y + b.h / 2, words);
    await until(
      `pin ${number}'s words in the doc`,
      () => docOf(frame),
      (now) => (numbered(now.pins, number)?.thread.length ?? 0) === 1,
      5000
    );
    keptAt.push(Date.now());
  }
  return keptAt;
};

/** Comment mode on in the pane, a press on `selector`, the person's words commented as pin `number`. */
const pinWith = async (
  on: On,
  frame: Frame,
  selector: string,
  number: number,
  words: string
) => {
  const comment = on.page.locator(
    ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
  );
  await comment.focus();
  await on.page.keyboard.press("c");
  await pageInComment(frame);
  // The element in the pane's view, where the person taps it.
  await frame.locator(selector).scrollIntoViewIfNeeded();
  await settle(on.page, 300);
  const b = await screenBox(on, frame, selector);
  if (
    !(await commentAt(on.page, frame, b.x + b.w * 0.3, b.y + b.h / 2, words))
  ) {
    const pins = Object.values((await docOf(frame)).pins).map(
      (pin) => pin.number
    );
    throw new Error(
      `pin ${number}'s composer never opened (the doc holds pins ${pins.join(", ")}; pressed ${selector} at ${JSON.stringify(b)})`
    );
  }
  await until(
    `pin ${number}'s words in the doc`,
    () => docOf(frame),
    (now) => (numbered(now.pins, number)?.thread.length ?? 0) === 1,
    5000
  );
  await on.page.keyboard.press("Escape");
};

/** The person's reply in pin `number`'s thread, opened from its row: when its words were in the doc. */
const replyOn = async (
  page: Page,
  frame: Frame,
  number: number,
  words: string
) => {
  await openRow(page, number);
  const card = page.locator(
    `[data-slot="pin-card"][data-pin-card="${number}"]`
  );
  await card.waitFor({ timeout: 5000 });
  const entries = numbered((await docOf(frame)).pins, number)?.thread.length;
  await card.getByRole("combobox").fill(words);
  await card.getByRole("button", { name: "Reply" }).click();
  await until(
    `the reply in pin ${number}'s thread`,
    () => docOf(frame),
    (now) => (numbered(now.pins, number)?.thread.length ?? 0) > (entries ?? 0),
    5000
  );
  const at = Date.now();
  await page.keyboard.press("Escape");
  await shutList(page);
  return at;
};

/** Until session `id`'s turn is closed on the hub's record. */
const turnClosed = (fleet: On["fleet"], id: string) =>
  until(
    `${id.slice(0, 8)}'s turn closed`,
    () => (fleet.instance(id)?.turn_open_at === null ? true : undefined),
    Boolean,
    60_000
  ).catch(() => undefined);

/** Asks `id` to sleep (again every 15 s: a machine refuses one not at rest) until its row reads sleeping (account-move-asleep's way). */
const asleep = async (fleet: On["fleet"], id: string) => {
  let askedAt = 0;
  return await until(
    `${id.slice(0, 8)} asleep`,
    async () => {
      const status = fleet.instance(id)?.status;
      if (status !== "sleeping" && Date.now() - askedAt > 15_000) {
        askedAt = Date.now();
        await fleet.control(id, "sleep");
      }
      return status;
    },
    (status) => status === "sleeping",
    90_000
  ).catch(() => fleet.instance(id)?.status);
};

/**
 * 8. Read before it goes: a comment the session reads with comment_read
 * inside the hub's quiet is stamped heard and never delivered; the person's
 * later reply on it goes by itself.
 */
const readFirstChecks = async (
  on: On,
  frame: Frame,
  artifact: string,
  callIn: (to: string, tool: string, input: object) => Promise<string>
) => {
  const { kit, page, session } = on;
  const before = heard.length;
  await pinWith(on, frame, "#e", 4, FIRST_WORDS);
  const keptAt = Date.now();
  const read = await callIn(session, READ_TOOL, { artifact });
  const readIn = Date.now() - keptAt;
  await Bun.sleep(Math.max(0, keptAt + MARK_TO_MODEL_MS - Date.now()));
  const pin4 = numbered((await docOf(frame)).pins, 4);
  const early = deliveries(before).filter((one) => one.last.includes("## 4."));
  const offered = await sendCount(page);
  kit.check(
    "8: a comment the session reads with comment_read inside the hub's quiet is stamped heard, is never delivered, and no Send stands",
    read.includes(FIRST_WORDS) &&
      readIn < QUIET_MS &&
      early.length === 0 &&
      !!pin4?.heard &&
      !!pin4.sentAt &&
      offered === null,
    `read ${readIn} ms after the comment; deliveries of pin 4 ${early.length}; Send ${offered}; pin ${JSON.stringify(pin4 && { sentAt: pin4.sentAt, heard: pin4.heard })}; read ${read.slice(0, 200)}`
  );
  const later = heard.length;
  await openRow(page, 4);
  const card = page.locator('[data-slot="pin-card"][data-pin-card="4"]');
  await card.waitFor({ timeout: 5000 });
  await card.getByRole("combobox").fill(LATER_WORDS);
  await card.getByRole("button", { name: "Reply" }).click();
  await until(
    "the later reply in pin 4's thread",
    () => docOf(frame),
    (now) => (numbered(now.pins, 4)?.thread.length ?? 0) === 2,
    5000
  );
  await page.keyboard.press("Escape");
  await shutList(page);
  const next = await nextDelivery(
    "the later reply's delivery",
    later,
    MARK_TO_MODEL_MS + 5000
  );
  const words = next?.last ?? "";
  kit.check(
    "8: the person's later reply on that comment goes by itself, with only the new words",
    words.includes("## 4. comment on #e") &&
      words.includes(wroteLine(LATER_WORDS)) &&
      !words.includes(wroteLine(FIRST_WORDS)),
    words.slice(0, 500) || "no delivery"
  );
};

/**
 * 9. The owner's report (2026-10-21: "if i make a comment on the whole page
 * it keeps saying "the element is gone" ... and doesn't tel lthe gaent i
 * commented"): a tap in the page's own padding, no content within reach,
 * pins the page as a whole. The page's words then change twice, as a
 * mockup's do from state to state: the pin stays on the page, its disc
 * drawn and its card never saying its element is gone, and it reaches the
 * session once, as the page's comment.
 */
const wholePageChecks = async (on: On, frame: Frame) => {
  const { kit, page } = on;
  const before = heard.length;
  const comment = page.locator(
    ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
  );
  await comment.focus();
  await page.keyboard.press("c");
  await pageInComment(frame);
  await frame.locator("#c").scrollIntoViewIfNeeded();
  await settle(page, 300);
  // Beside #c, past the paragraphs' 70% and far from any of them: the page's own box.
  const pageBox = await screenBox(on, frame, "main");
  const c = await screenBox(on, frame, "#c");
  await commentAt(
    page,
    frame,
    pageBox.x + pageBox.w * 0.95,
    c.y + c.h / 2,
    WHOLE_WORDS
  );
  await until(
    `pin ${WHOLE_PIN}'s words in the doc`,
    () => docOf(frame),
    (now) => (numbered(now.pins, WHOLE_PIN)?.thread.length ?? 0) === 1,
    5000
  );
  await page.keyboard.press("Escape");
  const made = numbered((await docOf(frame)).pins, WHOLE_PIN) as
    | (ReturnType<typeof numbered> & {
        anchor?: { selector?: string; text?: string };
      })
    | undefined;
  kit.check(
    "9: a press in the page's padding, no content within reach, comments on the whole page: its anchor is the page's body, keeping none of the page's words",
    made?.anchor?.selector === "body" && !made.anchor.text,
    JSON.stringify(made?.anchor)
  );
  // The page's words change, twice, as a mockup's do from state to state.
  for (const words of ["Showing state two", "Showing state three"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one state after the other, each drawn
    await frame.evaluate((said) => {
      const main = document.querySelector("main");
      const line =
        document.querySelector("#state-line") ?? document.createElement("p");
      line.id = "state-line";
      line.textContent = said;
      main?.prepend(line);
    }, words);
    await settle(page, 1000);
  }
  const after = numbered((await docOf(frame)).pins, WHOLE_PIN);
  // A comment on the whole page stands at the viewport's top-right, fixed to it.
  const disc = await frame
    .locator(`svg[data-cawco-pins-fixed] g[data-pin="${WHOLE_PIN}"]`)
    .count();
  await openRow(page, WHOLE_PIN);
  const opened = page.locator(
    `[data-slot="pin-card"][data-pin-card="${WHOLE_PIN}"]`
  );
  await opened.waitFor({ timeout: 5000 });
  const gone = await opened.locator('[data-slot="gone"]').count();
  await page.keyboard.press("Escape");
  await shutList(page);
  kit.check(
    "9: after the page's words change twice the page's comment stays on the page: never moved aside, its pill drawn at the viewport's top-right, its thread not saying its element is gone",
    !!after && !after.movedAt && disc === 1 && gone === 0,
    `movedAt ${String(after?.movedAt)}; discs ${disc}; gone lines ${gone}`
  );
  await Bun.sleep(MARK_TO_MODEL_MS + STILL_MS);
  const went = deliveries(before).filter((one) =>
    one.last.includes(`## ${WHOLE_PIN}.`)
  );
  const words = went[0]?.last ?? "";
  const stamped = numbered((await docOf(frame)).pins, WHOLE_PIN);
  kit.check(
    "9: the page's comment reaches the session by itself exactly once, through the page's words changing twice, as a comment on the whole page with the person's words and its id, never as gone, and is stamped sent",
    went.length === 1 &&
      words.includes(`## ${WHOLE_PIN}. comment on the whole page`) &&
      words.includes(wroteLine(WHOLE_WORDS)) &&
      words.includes(`- Pin: ${stamped?.id}`) &&
      !words.includes("gone from the page") &&
      !!stamped?.sentAt &&
      stamped.thread.every((entry) => !!entry.sentAt),
    `${went.length} deliveries of pin ${WHOLE_PIN}; stamped ${String(stamped?.sentAt)}; heard ${words.slice(0, 500) || "nothing"}`
  );
};

/**
 * 10. The owner's report (2026-10-21: his Comments panel read "The hub
 * closed the link (1006)" while his page drew pins 23 and 24 the hub never
 * had): the page's own doc socket dropped; within the lost link's wait the
 * Comments control and its panel say the comments aren't reaching the
 * agent; an annotation made then, the frame reloaded while still down,
 * comes back from the device; Try again with the link back takes it to the
 * hub, and the session hears it once, by itself.
 */
const linkDownChecks = async (on: On, frame: Frame) => {
  const { kit, page } = on;
  const before = heard.length;
  const control = page.locator(
    ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[data-slot="comments"]'
  );
  pageLink.down = true;
  for (const ws of pageLink.open) {
    // biome-ignore lint/performance/noAwaitInLoops: each socket the page holds, closed
    await ws.close({
      code: 1011,
      reason: "The probe dropped the page's link.",
    });
  }
  const droppedAt = Date.now();
  const told = await until(
    "the Comments control saying the link is down",
    async () =>
      (await control.getAttribute("data-link-down")) === ""
        ? await control.getAttribute("aria-label")
        : undefined,
    Boolean,
    SAID_WITHIN_MS + 5000
  ).catch(() => null);
  const saidIn = Date.now() - droppedAt;
  await rowsOf(page);
  const line = page.locator(`${RAIL} [data-pin-list-down]`);
  const lineWords = (await line.count()) > 0 ? await line.innerText() : "";
  kit.check(
    "10: the page's link dropped: once it has stood lost, the Comments control says the comments aren't reaching the agent, and its rail says why with Try again",
    !!told?.includes("Comments aren't reaching the agent") &&
      saidIn >= LINK_DOWN_MS - 1000 &&
      lineWords.includes(LINK_DROPPED) &&
      lineWords.includes(commonWords.tryAgain),
    `control ${String(told)} after ${saidIn} ms; panel ${JSON.stringify(lineWords)}`
  );
  await shutList(page);

  // An annotation, made on the page while its link is down.
  await frame.locator("#c").scrollIntoViewIfNeeded();
  await settle(page, 300);
  await strokeOver(on, frame, "#c");
  await page.waitForTimeout(350);
  await dragFromIcon(on, frame, -90, 40);
  const made = await until(
    `pin ${DOWN_PIN}, an annotation, in the page's doc`,
    () => docOf(frame),
    (now) => numbered(now.pins, DOWN_PIN)?.kind === "annotation",
    5000
  ).catch(() => null);
  const madeId = made ? numbered(made.pins, DOWN_PIN)?.id : undefined;

  // A comment pressed while the link is down: its composer opens at once,
  // and Comment keeps its words in the page's doc; its thread draws them.
  const comment = page.locator(
    ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
  );
  // The annotation counts on Send even while it stands only on the page, so
  // the head may fold its mode into one button: C reaches the pane anyway.
  if (await comment.isVisible().catch(() => false)) {
    await comment.focus();
    await page.keyboard.press("c");
  } else {
    // The mode folded into one button: it opens the three, and Comment is one of them.
    await page
      .locator(
        ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-label^="Mode: "]'
      )
      .click();
    await page.getByRole("menuitemradio", { name: COMMENT_ITEM }).click();
  }
  await pageInComment(frame);
  await frame.locator("#b").scrollIntoViewIfNeeded();
  await settle(page, 300);
  const b = await screenBox(on, frame, "#b");
  const tappedAt = Date.now();
  await page.mouse.move(b.x + b.w * 0.75, b.y + b.h / 2, { steps: 4 });
  await pressAt(frame, { x: b.x + b.w * 0.75, y: b.y + b.h / 2 });
  const composer = page.locator(COMPOSE);
  const opened = await composer
    .waitFor({ timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  const openedIn = Date.now() - tappedAt;
  if (opened) {
    await composer.getByRole("combobox").fill(DOWN_WORDS);
    await page.keyboard.press("Enter");
  }
  const written = await until(
    `pin ${DOWN_COMMENT}'s words in the page's doc`,
    () => docOf(frame),
    (now) => numbered(now.pins, DOWN_COMMENT)?.thread[0]?.text === DOWN_WORDS,
    5000
  ).catch(() => null);
  await openRow(page, DOWN_COMMENT).catch(() => undefined);
  const card = page.locator(
    `[data-slot="pin-card"][data-pin-card="${DOWN_COMMENT}"]`
  );
  await card.waitFor({ timeout: 5000 }).catch(() => undefined);
  const shown = await card
    .locator('[data-slot="thread"]')
    .innerText()
    .catch(() => "");
  await page.keyboard.press("Escape");
  await shutList(page);
  await page.keyboard.press("Escape");
  const commentId = written
    ? numbered(written.pins, DOWN_COMMENT)?.id
    : undefined;
  kit.check(
    "10: a comment pressed while the link is down opens its composer at once; Comment keeps the person's words in the page's doc, and its thread draws them",
    opened && !!commentId && shown.includes(DOWN_WORDS),
    `composer ${opened ? `open in ${openedIn} ms` : "never opened"}; words in the page's doc ${written ? "yes" : "no"}; thread ${JSON.stringify(shown.slice(0, 120))}`
  );

  // Its write to the device lands, and a copy of another artifact no one
  // opened there stands beside it (no note of its use); then the frame
  // reloads, the link still down.
  await page.waitForTimeout(1000);
  await frame.evaluate(
    (name) =>
      new Promise<void>((resolve) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => resolve();
      }),
    STALE_COPY
  );
  await frame.evaluate(() => location.reload());
  const back = await until(
    `pin ${DOWN_PIN} back in the reloaded page's doc`,
    () => docOf(frame),
    (now) =>
      numbered(now.pins, DOWN_PIN)?.id === madeId &&
      numbered(now.pins, DOWN_COMMENT)?.thread[0]?.text === DOWN_WORDS,
    20_000
  ).catch(() => null);
  const early = deliveries(before).filter(
    (one) =>
      one.last.includes(`## ${DOWN_PIN}.`) ||
      one.last.includes(`## ${DOWN_COMMENT}.`)
  ).length;
  const copies = await until(
    "the stale copy let go",
    () =>
      frame.evaluate(async () =>
        (await indexedDB.databases()).map((one) => one.name ?? "")
      ),
    (names) => !names.includes(STALE_COPY),
    10_000
  ).catch(() => null);
  kit.check(
    "10: an annotation and a comment's words made while the link is down, the frame reloaded with the link still down: the page's doc holds both again, from the device, and the session has heard nothing of them",
    !!madeId && !!back && early === 0,
    `made ${String(madeId)}; back ${back ? "yes" : "no"}; heard early ${early}`
  );
  kit.check(
    "10: the page keeps its own artifact's copy on the device, and lets go of another artifact's no one has opened there lately",
    !!copies &&
      copies.some(
        (name) => name.startsWith("cawco-artifact:") && name !== STALE_COPY
      ) &&
      !copies.includes(STALE_COPY),
    JSON.stringify(copies)
  );

  // The link back, and the panel's Try again.
  pageLink.down = false;
  const backAt = Date.now();
  await rowsOf(page);
  await page
    .locator(`${RAIL} [data-pin-list-down]`)
    .getByRole("button", { name: commonWords.tryAgain })
    .click()
    .catch(() => undefined);
  const cleared = await until(
    "the Comments control clear again",
    async () =>
      (await control.getAttribute("data-link-down")) === null
        ? true
        : undefined,
    Boolean,
    15_000
  ).catch(() => false);
  await shutList(page);
  // The page's doc reaches the hub, and the hub delivers what it held by itself.
  await Bun.sleep(
    Math.max(0, backAt + MARK_TO_MODEL_MS + STILL_MS - Date.now())
  );
  const offered = await sendCount(page);
  const went = deliveries(before).filter((one) =>
    one.last.includes(`## ${DOWN_PIN}.`)
  );
  const words = went[0]?.last ?? "";
  const said = deliveries(before).filter((one) =>
    one.last.includes(`## ${DOWN_COMMENT}.`)
  );
  const saidWords = said[0]?.last ?? "";
  const after = (await docOf(frame)).pins;
  const stamped = numbered(after, DOWN_PIN);
  const stampedComment = numbered(after, DOWN_COMMENT);
  kit.check(
    "10: with the link back and Try again, the annotation reaches the hub and the session hears it exactly once by itself, stamped sent, no Send standing, and the control says nothing more",
    cleared === true &&
      offered === null &&
      went.length === 1 &&
      words.includes(`## ${DOWN_PIN}. annotation on #c`) &&
      words.includes(`- Pin: ${madeId}`) &&
      !!stamped?.sentAt,
    `cleared ${String(cleared)}; Send ${String(offered)}; ${went.length} deliveries of pin ${DOWN_PIN}; stamped ${String(stamped?.sentAt)}; heard ${words.slice(0, 400) || "nothing"}`
  );
  kit.check(
    "10: the comment written while the link was down reaches the session exactly once, with the person's words and its id, stamped sent",
    said.length === 1 &&
      saidWords.includes(`## ${DOWN_COMMENT}. comment on #b`) &&
      saidWords.includes(wroteLine(DOWN_WORDS)) &&
      saidWords.includes(`- Pin: ${commentId}`) &&
      !!stampedComment?.sentAt,
    `${said.length} deliveries of pin ${DOWN_COMMENT}; stamped ${String(stampedComment?.sentAt)}; heard ${saidWords.slice(0, 400) || "nothing"}`
  );
};

/**
 * 11. Pins kept before a press in the page's padding named its body (the
 * owner's #10 and #21 on 729b1a67): each on the page-sized container by its
 * place, with the words that container said then and its page-sized box,
 * one of them in the moved tray. Both stand on the page as a whole again,
 * written back on its body, out of the tray, each disc drawn, and the
 * session is told nothing new of either.
 */
const oldPageAnchorChecks = async (on: On, frame: Frame) => {
  const { kit } = on;
  const before = heard.length;
  const ids = await frame.evaluate(
    ({ numbers }) => {
      const main = document.querySelector("main");
      const r = main?.getBoundingClientRect();
      const { doc } = (
        window as unknown as {
          cawcoArtifact: {
            doc: {
              getMap: (n: string) => { set: (k: string, v: unknown) => void };
              transact: (f: () => void) => void;
            };
          };
        }
      ).cawcoArtifact;
      const at = new Date().toISOString();
      const made = numbers.map((number, i) => ({
        id: crypto.randomUUID(),
        number,
        kind: "comment",
        anchor: {
          selector: "body > main:nth-of-type(1)",
          source: null,
          text: "Words the page said in a state long gone.",
          box: {
            x: Math.round(r?.x ?? 0),
            y: Math.round((r?.y ?? 0) + scrollY),
            w: Math.round(r?.width ?? 0),
            h: Math.round(r?.height ?? 0),
          },
        },
        at,
        by: "person",
        elements: [],
        point: { x: 0.9, y: 0.2 + i * 0.1 },
        thread: [
          {
            id: crypto.randomUUID(),
            by: "person",
            text: `An old page comment ${number}.`,
            at,
            sentAt: at,
          },
        ],
        sentAt: at,
        ...(i === 0 ? { movedAt: at } : {}),
      }));
      doc.transact(() => {
        for (const pin of made) {
          doc.getMap("pins").set(pin.id, pin);
        }
      });
      return made.map((pin) => pin.id);
    },
    { numbers: [OLD_PINS[0], OLD_PINS[1]] }
  );
  const stood = await until(
    "both old page pins standing on the body",
    () => docOf(frame),
    (now) =>
      [OLD_PINS[0], OLD_PINS[1]].every((number) => {
        const pin = numbered(now.pins, number) as
          | (ReturnType<typeof numbered> & {
              anchor?: { selector?: string };
              movedAt?: string;
            })
          | undefined;
        return pin?.anchor?.selector === "body" && !pin.movedAt;
      }),
    10_000
  ).catch(() => null);
  const discs = await frame
    .locator(
      `svg[data-cawco-pins-fixed] :is(g[data-pin="${OLD_PINS[0]}"], g[data-pin="${OLD_PINS[1]}"])`
    )
    .count();
  await Bun.sleep(MARK_TO_MODEL_MS + 2000);
  const told = deliveries(before).filter(
    (one) =>
      one.last.includes(`## ${OLD_PINS[0]}.`) ||
      one.last.includes(`## ${OLD_PINS[1]}.`)
  ).length;
  kit.check(
    "11: pins kept on a page-sized container by its place, its old words and box (one in the moved tray) stand on the page as a whole again: written back on body, out of the tray, both pills drawn at the viewport's top-right, nothing new told",
    ids.length === 2 && !!stood && discs === 2 && told === 0,
    `stood ${stood ? "yes" : "no"}; discs ${discs}; told ${told}; pins ${JSON.stringify(
      [OLD_PINS[0], OLD_PINS[1]].map((number) => {
        const pin = stood && numbered(stood.pins, number);
        return (
          pin && {
            anchor: (pin as { anchor?: unknown }).anchor,
            movedAt: (pin as { movedAt?: unknown }).movedAt,
          }
        );
      })
    )}`
  );
};

/**
 * 12. The owner's report (2026-10-23: "when i add comments u don't seem to
 * pick it up", a pin and a reply on the orchestrator's decision page while
 * it worked): a project's session makes a decision page, then runs a long
 * command. The person pins a card, and presses no Send: a few seconds on,
 * the agent moves the running command to the background and the delivery
 * joins the turn at that tool boundary, long before the command's end; the
 * hub's journal says it went. The person's reply while the next long
 * command runs joins the same way, with only the new words. A pick on the
 * page waits for Send: nothing of it reaches the session until the head's
 * Send, which counts it. 13: the session asleep, a reply on its pin wakes
 * it, the delivery its turn's first message.
 */
const busyDecisionChecks = async (
  desk: On,
  base: string,
  callIn: (to: string, tool: string, input: object) => Promise<string>
) => {
  const { fleet, kit } = desk;
  const place = join(fleet.sandbox, "decider-place");
  await mkdir(place, { recursive: true });
  await writeFile(join(place, "README.md"), "The decider's place.\n");
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Busy decider",
    machineId: MACHINE,
    cwd: place,
    caw: false,
  });
  const decider = await fleet.spawn("claude", "Decider", place, {
    projectId: project.id,
  });
  const made = await callIn(decider, CREATE, {
    kind: "page",
    does: "pick",
    ask: "Pick how a delegate works in any folder",
    name: BUSY_PAGE,
    program: BUSY_PROGRAM,
  });
  const artifact = made.match(ANSWERED_ID)?.[1];
  if (!artifact) {
    kit.check("12: the decision page is made", false, made.slice(0, 300));
    return;
  }
  /** The hub's journal lines naming this artifact and each of `ids`, matched by what they name, not their wording. */
  const hubSaid = async (...ids: string[]) =>
    (await fleet.logs("hub"))
      .split("\n")
      .filter(
        (line) =>
          line.includes(artifact) && ids.every((one) => line.includes(one))
      );
  const tab = await kit.page("desk");
  const on: On = { ...desk, page: tab, session: decider };
  await open(tab, `${base}/session/${decider}`, "[data-artifact-trigger]");
  const frame = await pageFrame(on);
  await frame.waitForSelector("#decision-how", { timeout: 60_000 });
  await settle(tab, 600);

  // The session at work: a long command running.
  busyTurn.active = true;
  await fleet.send(decider, BUSY_MARK);
  await until(
    "the decider's first long command issued",
    () => busyTurn.issued.length,
    (n) => n >= 1,
    60_000
  );
  const busy = await until(
    "the decider's pulse reads it working",
    async () =>
      (await fleet.api<Record<string, { busy?: boolean }>>("/api/pulses"))[
        decider
      ]?.busy === true,
    Boolean,
    20_000
  ).catch(() => false);

  // A pin on the card, and no Send: it joins the turn at the next tool boundary.
  const before = busyTurn.heard.length;
  await pinWith(on, frame, "#decision-how", 1, BUSY_PIN_WORDS);
  const pinnedAt = Date.now();
  const firstEnds = busyTurn.issued[0] + BUSY_SLEEPS[0] * 1000;
  const boundary = await until(
    "the request answering the long command",
    () => busyTurn.heard.at(before),
    Boolean,
    MARK_TO_MODEL_MS + 10_000
  ).catch(() => undefined);
  const pinned = numbered((await docOf(frame)).pins, 1);
  const offered = await sendCount(tab);
  const rows = fleet.query<{
    reason: string | null;
    state: string;
    uuid: string;
  }>(
    "SELECT state, reason, uuid FROM sent_messages WHERE instance_id = ? AND body LIKE ?",
    decider,
    `%${BUSY_NOTICE.replaceAll('"', "%")}%`
  );
  kit.check(
    "12: a pin on a working session's decision page, no Send pressed or standing: a few seconds on it joins the turn at a tool boundary (the running command moved to the background), long before the command's end, carrying the pin's words and id",
    busy === true &&
      offered === null &&
      !!boundary &&
      boundary.afterTool &&
      boundary.at - pinnedAt <= MARK_TO_MODEL_MS &&
      boundary.at < firstEnds &&
      boundary.all.includes(BUSY_NOTICE) &&
      boundary.all.includes(wroteLine(BUSY_PIN_WORDS)) &&
      boundary.all.includes(`- Pin: ${pinned?.id}`) &&
      rows.length === 1 &&
      rows[0].state !== "failed",
    `busy ${String(busy)}; Send ${String(offered)}; boundary ${boundary ? `${boundary.at - pinnedAt} ms after the pin, ${firstEnds - boundary.at} ms before the command's end, afterTool ${boundary.afterTool}, command backgrounded ${boundary.body.includes("backgrounded")}` : "never"}; rows ${JSON.stringify(rows)}; heard ${boundary?.last.slice(0, 500) ?? "-"}`
  );
  // The service's line names the pin and its session; the send path's, the session and the message it went as.
  const carriedLines = await hubSaid(pinned?.id ?? "-", decider);
  const messageLines = await hubSaid(decider, rows[0]?.uuid ?? "-");
  const stamped = numbered((await docOf(frame)).pins, 1);
  kit.check(
    "12: the pin is stamped sent, and the hub's journal says the delivery went: what it carried for which session, and the message it went as",
    !!stamped?.sentAt && carriedLines.length > 0 && messageLines.length > 0,
    `sentAt ${String(stamped?.sentAt)}; carried ${JSON.stringify(carriedLines)}; message ${JSON.stringify(messageLines)}`
  );

  // The person's reply while the next long command runs.
  await until(
    "the decider's second long command issued",
    () => busyTurn.issued.length,
    (n) => n >= 2,
    10_000
  ).catch(() => undefined);
  const beforeReply = busyTurn.heard.length;
  const repliedAt = await replyOn(tab, frame, 1, BUSY_REPLY_WORDS);
  const secondEnds = (busyTurn.issued[1] ?? 0) + BUSY_SLEEPS[1] * 1000;
  const next = await until(
    "the request answering the second long command",
    () => busyTurn.heard.at(beforeReply),
    Boolean,
    MARK_TO_MODEL_MS + 10_000
  ).catch(() => undefined);
  const repliedRows = fleet.query<{ state: string }>(
    "SELECT state FROM sent_messages WHERE instance_id = ? AND body LIKE ?",
    decider,
    `%${BUSY_NOTICE.replaceAll('"', "%")}%`
  );
  kit.check(
    "12: the reply, written while the next command runs, joins the turn by itself at a tool boundary before that command's end, with only the new words",
    !!next &&
      next.afterTool &&
      next.at - repliedAt <= MARK_TO_MODEL_MS &&
      next.at < secondEnds &&
      next.last.includes(BUSY_NOTICE) &&
      next.last.includes(wroteLine(BUSY_REPLY_WORDS)) &&
      !next.last.includes(wroteLine(BUSY_PIN_WORDS)) &&
      repliedRows.length === 2 &&
      repliedRows.every((row) => row.state !== "failed"),
    `next ${next ? `${next.at - repliedAt} ms after the reply, ${secondEnds - next.at} ms before the command's end, afterTool ${next.afterTool}, command backgrounded ${next.body.includes("backgrounded")}` : "never"}; rows ${JSON.stringify(repliedRows)}; heard ${next?.last.slice(0, 500) ?? "-"}`
  );

  // A pick on the same page waits for Send.
  await turnClosed(fleet, decider);
  const beforePick = busyTurn.heard.length;
  if (await inCommentMode(frame)) {
    await tab.keyboard.press("Escape");
  }
  await pressIn(frame, '[data-option="snapshot"]');
  await until(
    "the pick in the page's state",
    () => sendCount(tab),
    (count) => count !== null,
    10_000
  ).catch(() => null);
  await Bun.sleep(MARK_TO_MODEL_MS + STILL_MS);
  const heldPick = busyTurn.heard
    .slice(beforePick)
    .filter((one) => one.all.includes(PICKS_NOTICE)).length;
  const counted = await sendCount(tab);
  const pickSentAt = await sendNow(tab);
  const picked = await until(
    "the picks' notice at the model",
    () =>
      busyTurn.heard
        .slice(beforePick)
        .find((one) => one.last.includes(PICKS_NOTICE)),
    Boolean,
    REACH_MS + 10_000
  ).catch(() => undefined);
  kit.check(
    "12: a pick on the same page waits for Send: nothing of it reaches the session past the comments' quiet, the head's Send counts it, and one press tells the session",
    heldPick === 0 && counted === "1" && !!picked && picked.at >= pickSentAt,
    `before Send ${heldPick}; Send counted ${String(counted)}; notice ${picked ? `${picked.at - pickSentAt} ms after Send` : "never"}`
  );

  // 13. The session asleep: a reply on its pin wakes it.
  await turnClosed(fleet, decider);
  const slept = await asleep(fleet, decider);
  const beforeWake = busyTurn.heard.length;
  const wokenAt = await replyOn(tab, frame, 1, WAKE_WORDS);
  const woke = await until(
    "the sleeping decider woken by the reply",
    () =>
      busyTurn.heard
        .slice(beforeWake)
        .find((one) => one.last.includes(WAKE_WORDS)),
    Boolean,
    MARK_TO_MODEL_MS + 60_000
  ).catch(() => undefined);
  kit.check(
    "13: a sleeping session wakes on a reply on its page's pin, by itself: its turn starts on the delivery, with only the new words",
    slept === "sleeping" &&
      !!woke &&
      !woke.afterTool &&
      woke.last.includes(BUSY_NOTICE) &&
      !woke.last.includes(wroteLine(BUSY_REPLY_WORDS)) &&
      fleet.instance(decider)?.status !== "sleeping",
    `slept ${String(slept)}; woke ${woke ? `${woke.at - wokenAt} ms after the reply, afterTool ${woke.afterTool}` : "never"}; status ${String(fleet.instance(decider)?.status)}; heard ${woke?.last.slice(0, 400) ?? "-"}`
  );
  busyTurn.active = false;
  await tab.close();
};

/** 7. A writer that has ended: its page's pin goes to the project's Caw, whose reply lands in the pin's thread. */
const endedWriterChecks = async (
  desk: On,
  base: string,
  callIn: (to: string, tool: string, input: object) => Promise<string>
) => {
  const { fleet, kit } = desk;
  const place = join(fleet.sandbox, "writer-place");
  await mkdir(place, { recursive: true });
  await writeFile(join(place, "README.md"), "The writer's place.\n");
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Ended writer",
    machineId: MACHINE,
    cwd: place,
    caw: true,
  });
  const writer = await fleet.spawn("claude", "Writer", place, {
    projectId: project.id,
  });
  const made = await callIn(writer, CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: WRITER_PAGE,
    html: WRITER_HTML,
  });
  if (!made.match(ANSWERED_ID)) {
    kit.check("7: the writer's page is made", false, made.slice(0, 300));
    return;
  }
  // The writer has ended: its conversation is gone, as the hub records it.
  // One write beside the running hub's, waiting for its lock.
  const db = new Database(fleet.env.CAWCO_DB_PATH as string);
  try {
    db.exec("PRAGMA busy_timeout = 15000");
    db.query(
      "UPDATE instances SET last_error = ?, last_error_kind = 'conversation-gone' WHERE id = ?"
    ).run(CLAUDE_CONVERSATION_GONE, writer);
  } finally {
    db.close();
  }
  // The writer's session in a tab of its own, as the person opens it.
  const tab = await kit.page("desk");
  const on: On = { ...desk, page: tab, session: writer };
  await open(tab, `${base}/session/${writer}`, "[data-artifact-trigger]");
  const frame = await pageFrame(on);
  await frame.waitForSelector("#w", { timeout: 60_000 });
  await settle(on.page, 600);
  // No Send: the comment goes by itself.
  await pinWith(on, frame, "#w", 1, "Who picks this up now?");
  const pin = numbered((await docOf(frame)).pins, 1);
  const hubLines = async () =>
    (await fleet.logs("hub")).split("\n").filter((line) => HUB_LINE.test(line));
  // Caw's reply in the thread; or, on a host whose sandbox cannot nest his
  // (core boundary-nesting.ts), the hub's word that his wake could not start.
  const outcome: {
    nested: string | undefined;
    pin: ReturnType<typeof numbered>;
  } = await until(
    "Caw's reply in the pin's thread, or his wake refused by the host",
    async () => ({
      pin: numbered((await docOf(frame)).pins, 1),
      nested: (await hubLines()).find(
        (line) =>
          shaped(artifactToolWords.marksOwed).test(line) && NESTED.test(line)
      ),
    }),
    (now) =>
      !!now.nested ||
      (now.pin?.thread ?? []).some((entry) => entry.by === "agent"),
    240_000
  ).catch(async () => ({
    pin: numbered((await docOf(frame)).pins, 1),
    nested: undefined,
  }));
  const lead = fleet.query<{ lead_instance_id: string | null }>(
    "SELECT lead_instance_id FROM projects WHERE id = ?",
    project.id
  )[0]?.lead_instance_id;
  // The writer's comment events: none taken, and a refused one kept as not sent.
  const writerRows = fleet.query<{ reason: string | null; state: string }>(
    "SELECT state, reason FROM sent_messages WHERE instance_id = ? AND body LIKE '%commented on the page%'",
    writer
  );
  const writerEvents = writerRows.filter(
    (row) => row.state !== "failed"
  ).length;
  const unheard = (now: ReturnType<typeof numbered>) =>
    !!now &&
    !now.sentAt &&
    !now.heard &&
    now.thread.every((entry) => entry.by !== "person" || !entry.sentAt);
  /**
   * Pin 1's thread opened from its row, read once it draws the agent's
   * `words` (its entries draw as the thread does, the card coming in
   * beside its pill): what the agent's entries say, or what they said when
   * the wait ran out.
   */
  const readCard = async (words: string) => {
    await openRow(tab, 1);
    const entries = tab.locator(
      '[data-slot="pin-card"][data-pin-card="1"] [data-slot="entry"][data-by="agent"]'
    );
    const said = await until(
      "the agent's words in pin 1's thread",
      async () => (await entries.allInnerTexts()).join(" | "),
      (now) => now.includes(words),
      5000
    ).catch(async () => (await entries.allInnerTexts()).join(" | "));
    await tab.keyboard.press("Escape");
    await shutList(tab);
    return said;
  };
  if (outcome.nested) {
    kit.note(
      `7a: Caw's own turn cannot run here: ${outcome.nested.slice(0, 400)} Run this spec outside a workspace for 7a's live turn.`
    );
    kit.check(
      "7a: the ended writer is sent nothing; its pin's delivery goes to the project's Caw (his wake, which this host's nested sandbox refuses)",
      writerEvents === 0 && !!pin,
      `writer's comment events taken ${writerEvents}; hub ${outcome.nested.slice(0, 300)}`
    );
    // No one took it: the pin stays owed, and the person reads why.
    const still = numbered((await docOf(frame)).pins, 1);
    const line = tab.locator("[data-artifact-responses]");
    await line
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => undefined);
    const drawn = (await line.allInnerTexts()).map((words) =>
      words.replace(/\s+/g, " ").trim()
    );
    const failed = writerRows.find((row) => row.state === "failed");
    kit.check(
      "7a: Caw's wake refused, the pin stays unstamped (no sentAt, no heard, its words unsent), and the writer's transcript shows the comments line not sent with why",
      unheard(still) &&
        !!failed?.reason?.includes("the project's Caw couldn't take them") &&
        drawn.some(
          (words) =>
            words.includes(`Comments on ${WRITER_PAGE}`) &&
            words.includes("not sent") &&
            words.includes("Caw couldn't take them")
        ),
      `pin ${JSON.stringify(still && { sentAt: still.sentAt, heard: still.heard, thread: still.thread })}; failed row ${JSON.stringify(failed)}; lines ${JSON.stringify(drawn)}`
    );
    // The person sees it on the pin, not silence: its row says why, with Try again.
    const pinRow = (await rowsOf(tab)).locator(
      'li:has([data-slot="pin-row"][data-pin-row="1"])'
    );
    const notSentLine = pinRow.locator("[data-not-sent]");
    const lineWords = async () =>
      (await notSentLine.count()) > 0
        ? ((await notSentLine.first().textContent()) ?? "").trim()
        : "";
    // The hub's reason, as the pin keeps it, is what its row says.
    const why = String(
      (still?.notSent as { why?: string } | undefined)?.why ?? ""
    ).replace(REASON_STOP, "");
    const rowSays = await until(
      "pin 1's row saying why it wasn't sent",
      lineWords,
      (words) => !!why && words.includes(why),
      10_000
    ).catch(lineWords);
    const retry = await pinRow.locator('[data-slot="pin-retry"]').count();
    await shutList(tab);
    kit.check(
      "7a: the pin no one took says so where the person reads it: its row says why, in the hub's words, and offers Try again",
      !!why && rowSays.includes(why) && retry === 1,
      `row ${JSON.stringify(rowSays)}; Try again ${retry}; notSent ${JSON.stringify(still?.notSent)}`
    );
  } else {
    const agentSaid = outcome.pin?.thread.find((entry) => entry.by === "agent");
    kit.check(
      "7a: a comment on an ended writer's page goes by itself and wakes the project's Caw, the delivery naming the pin's id",
      !!pin &&
        writerEvents === 0 &&
        caw.pin === pin.id &&
        !!caw.heard?.includes(`- Pin: ${pin.id}`) &&
        !!lead &&
        lead !== writer,
      `pin ${pin?.id}; Caw heard pin ${caw.pin}; lead ${lead}; writer's comment events ${writerEvents}; heard ${caw.heard?.slice(0, 500)}; hub ${(await hubLines()).slice(-8).join(" | ")}`
    );
    const inCard = await readCard(CAW_WORDS);
    kit.check(
      "7a: Caw's comment_reply lands in that pin's thread, by the agent, and the person reads it in the pin's card; the pin is stamped heard",
      agentSaid?.text === CAW_WORDS &&
        inCard.includes(CAW_WORDS) &&
        !!outcome.pin?.sentAt &&
        !!outcome.pin.heard,
      `thread ${JSON.stringify(outcome.pin?.thread)}; card ${JSON.stringify(inCard)}; tool answered ${caw.answer?.slice(0, 300)}`
    );
  }

  // 7b. The rule itself (artifacts/service.ts `answerable`), through the
  // tool: a session of no part in the project is refused the pin; once the
  // hub's record names it the project's lead, its reply lands in the thread.
  if (!pin) {
    return;
  }
  const refused = await callIn(desk.session, REPLY_TOOL, {
    pin: pin.id,
    text: "A sibling's word.",
  });
  const write = new Database(fleet.env.CAWCO_DB_PATH as string);
  try {
    write.exec("PRAGMA busy_timeout = 15000");
    write
      .query("UPDATE projects SET lead_instance_id = ? WHERE id = ?")
      .run(desk.session, project.id);
  } finally {
    write.close();
  }
  const leadReply = await callIn(desk.session, REPLY_TOOL, {
    pin: pin.id,
    text: LEAD_WORDS,
  });
  const landed = await until(
    "the lead's reply in the pin's thread",
    async () => numbered((await docOf(frame)).pins, 1),
    (now) => (now?.thread ?? []).some((entry) => entry.text === LEAD_WORDS),
    10_000
  ).catch(() => numbered({}, 1));
  await settle(tab, 600);
  const card = await readCard(LEAD_WORDS);
  kit.check(
    "7b: a session that is not the project's lead is refused the writer's pin, and no word of it lands",
    refused.includes(artifactToolWords.noPin(pin.id)) &&
      !(landed?.thread ?? []).some(
        (entry) => entry.text === "A sibling's word."
      ),
    refused.slice(0, 300)
  );
  kit.check(
    "7b: the project's lead's comment_reply on the ended writer's pin lands in its thread, by the agent, and the person reads it in the pin's card",
    (landed?.thread ?? []).some(
      (entry) => entry.by === "agent" && entry.text === LEAD_WORDS
    ) && card.includes(LEAD_WORDS),
    `tool ${leadReply.slice(0, 200)}; thread ${JSON.stringify(landed?.thread)}; card ${JSON.stringify(card)}`
  );
};

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
  const session = await fleet.spawn("claude", "Comment delivery", fleet.repo);
  const dbPath = fleet.env.CAWCO_DB_PATH ?? "";
  let sent = 0;
  const callIn = async (
    to: string,
    tool: string,
    input: object
  ): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, {
      name: tool,
      // The hub's record of the answer, which this spec reads (mcp-tool.ts).
      input: { response_format: "detailed", ...input },
    });
    await fleet.send(to, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };
  const call = (tool: string, input: object) => callIn(session, tool, input);
  const made = await call(CREATE, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: NAME,
    html,
  });
  const id = made.match(ANSWERED_ID)?.[1];
  if (!id) {
    kit.check("the page is made", false, made.slice(0, 300));
    return;
  }
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  await routePageLink(page);
  const said: string[] = [];
  page.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
  await open(page, `${base}/session/${session}`, "[data-artifact-trigger]");
  const cdp = await page.context().newCDPSession(page);
  const on: On = { call, cdp, fleet, kit, page, said, session };
  const frame = await pageFrame(on);
  await frame.waitForSelector("#d", { timeout: 60_000 });
  await settle(page, 600);

  // 1. No Send control in the pane's head.
  const sendControls = () =>
    page
      .locator(
        ':is([data-slot="preview-pane"], [data-side-card="preview"]) [data-slot="send"]'
      )
      .count();
  const atStart = await sendControls();
  kit.check(
    "1: the session's page is in its pane; nothing is unsent, so the pane's head has no Send",
    atStart === 0,
    `${atStart} Send control(s)`
  );

  // 2. Three comments, 2 s apart, each pressed and written.
  const startedAt = Date.now();
  const comment = page.locator(
    ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']'
  );
  await comment.focus();
  await page.keyboard.press("c");
  await pageInComment(frame);
  await settle(page, 300);
  const keptAt = await writePins(on, frame);
  await page.keyboard.press("Escape");
  const [, , third] = keptAt;
  // No Send: the head never offers one for comments, and they go by themselves.
  const counted = await sendCount(page);
  const first = await nextDelivery(
    "the delivery of the three comments",
    0,
    MARK_TO_MODEL_MS + 8000
  );
  const arrived = first ? first.at - third : Number.NaN;
  await Bun.sleep(STILL_MS);
  const all = deliveries();
  const events = eventsOf(dbPath, session, startedAt);
  const doc = await docOf(frame);
  const pins = [1, 2, 3].map((n) => numbered(doc.pins, n));
  // The journal's line for it names the artifact, the session and each pin it carried.
  const wentLines = (await fleet.logs("hub"))
    .split("\n")
    .filter(
      (entry) =>
        entry.includes(id) &&
        entry.includes(session) &&
        pins.every((pin) => !!pin && entry.includes(pin.id))
    );

  const sections = pins.map((pin, i) => {
    const p = PARAS[i];
    const words = first?.last ?? "";
    return (
      !!pin &&
      words.includes(`## ${i + 1}. comment on #${p.id}`) &&
      words.includes(`- Source: src/Page.svelte:${p.line}`) &&
      words.includes(`- Text: ${JSON.stringify(p.text)}`) &&
      words.includes(wroteLine(WORDS[i])) &&
      words.includes(`- Pin: ${pin.id}`)
    );
  });
  kit.check(
    "2: three comments written 2 s apart, no Send standing for them in the head, go by themselves as exactly one delivery, a few seconds after the third, and the hub's journal says it went",
    counted === null &&
      all.length === 1 &&
      events.length === 1 &&
      arrived >= QUIET_MS - 1000 &&
      arrived <= MARK_TO_MODEL_MS &&
      wentLines.length > 0,
    `Send ${String(counted)}; ${all.length} deliveries at the model, ${events.length} artifact event(s) in sent_messages; the first ${arrived} ms after the third comment (comments kept at +${keptAt.map((at) => at - keptAt[0]).join(", +")} ms); journal ${JSON.stringify(wentLines.slice(0, 3))}`
  );
  kit.check(
    "2: it carries all three, each with its number, selector, source file:line, text, the person's words and its id, and the three pins' pictures",
    sections.every(Boolean) && !!first && ownImages(first) === 3,
    `sections ${JSON.stringify(sections)}; pictures ${first ? ownImages(first) : "-"}; heard ${first?.last.slice(0, 900)}`
  );
  kit.check(
    "2: the session's turn starts on it: the model is asked with the delivery as its last message",
    !!first && !first.afterTool,
    first ? `asked at +${first.at - startedAt} ms` : "never asked"
  );
  kit.check(
    "2: every pin and entry is stamped sentAt",
    pins.every(
      (pin) =>
        !!pin?.sentAt &&
        pin.thread.every((entry) => entry.by !== "person" || !!entry.sentAt)
    ),
    JSON.stringify(
      pins.map((pin) => pin && { sentAt: pin.sentAt, thread: pin.thread })
    )
  );
  const line = page.locator("[data-artifact-responses]");
  await line
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => undefined);
  await settle(page, 400);
  const drawn = await page.evaluate(() => ({
    lines: Array.from(
      document.querySelectorAll<HTMLElement>("[data-artifact-responses]")
    ).map((row) => row.innerText.replace(/\s+/g, " ").trim()),
    person: Array.from(
      document.querySelectorAll<HTMLElement>('[data-slot="turn"][data-you]')
    )
      .map((row) => row.innerText)
      .filter((words) => words.includes("[CawCo]") || words.includes("Pin:")),
  }));
  kit.check(
    "2: the transcript draws one quiet line, Comments on the page, and no row of the person's",
    drawn.lines.length === 1 &&
      drawn.lines[0].includes(`Comments on ${NAME}`) &&
      drawn.person.length === 0,
    JSON.stringify(drawn)
  );
  await page.screenshot({ path: join(kit.out, "comment-delivery-first.png") });

  // 3. A reply to pin 2 later: one more delivery by itself, pin 2 alone.
  const before3 = heard.length;
  const events3 = events.length;
  await openRow(page, 2);
  const card2 = page.locator('[data-slot="pin-card"][data-pin-card="2"]');
  await card2.waitFor({ timeout: 5000 });
  await card2.getByRole("combobox").fill("On second thought, keep the weight.");
  await card2.getByRole("button", { name: "Reply" }).click();
  await until(
    "the reply in pin 2's thread",
    () => docOf(frame),
    (now) => (numbered(now.pins, 2)?.thread.length ?? 0) === 2,
    5000
  );
  const repliedAt = Date.now();
  await page.keyboard.press("Escape");
  await shutList(page);
  const second = await nextDelivery(
    "the reply's delivery",
    before3,
    MARK_TO_MODEL_MS + 5000
  );
  await Bun.sleep(STILL_MS);
  const after3 = eventsOf(dbPath, session, startedAt).length - events3;
  const words2 = second?.last ?? "";
  kit.check(
    "3: a reply to pin 2 later is one more delivery by itself, a few seconds on, with pin 2 alone and the reply",
    deliveries(before3).length === 1 &&
      after3 === 1 &&
      !!second &&
      second.at - repliedAt <= MARK_TO_MODEL_MS &&
      words2.includes("## 2. comment on #b") &&
      words2.includes(wroteLine("On second thought, keep the weight.")) &&
      !words2.includes(wroteLine(WORDS[1])) &&
      !words2.includes("## 1.") &&
      !words2.includes("## 3."),
    `${deliveries(before3).length} at the model, ${after3} event(s); ${second ? second.at - repliedAt : "-"} ms after the reply; heard ${words2.slice(0, 600)}`
  );

  // 4. The person resolves pin 3: its one resolve line.
  const before4 = heard.length;
  await openRow(page, 3);
  await page
    .locator('[data-slot="pin-card"][data-pin-card="3"]')
    .getByRole("button", { name: "Resolve" })
    .click();
  await until(
    "pin 3 resolved",
    () => docOf(frame),
    (now) => !!numbered(now.pins, 3)?.resolvedAt,
    5000
  );
  await page.keyboard.press("Escape");
  await shutList(page);
  const pin3 = numbered((await docOf(frame)).pins, 3);
  const resolved = await nextDelivery(
    "the resolve's delivery",
    before4,
    MARK_TO_MODEL_MS + 5000
  );
  const words4 = resolved?.last ?? "";
  kit.check(
    "4: the person's resolve of pin 3 goes by itself, its one line",
    deliveries(before4).length === 1 &&
      words4.includes(`## 3. Resolved by the person (pin ${pin3?.id})`) &&
      !words4.includes("## 2."),
    words4.slice(0, 400)
  );

  // 8, before the stroke: a comment read before its delivery.
  await readFirstChecks(on, frame, id, callIn);

  // 5. A pen stroke no pin stands on.
  const before5 = heard.length;
  await strokeOver(on, frame, "#d");
  const inked = await until(
    "the stroke group in the doc",
    () => docOf(frame),
    (now) => Object.keys(now.ink).length > 0,
    10_000
  ).catch(() => docOf(frame));
  const ink = await nextDelivery(
    "the ink's delivery",
    before5,
    MARK_TO_MODEL_MS + 8000
  );
  const words5 = ink?.last ?? "";
  kit.check(
    "5: a pen stroke no pin stands on goes by itself: the ink over #d with its box, and the page with the ink as its picture",
    Object.keys(inked.ink).length === 1 &&
      deliveries(before5).length === 1 &&
      words5.includes("## Ink over #d") &&
      words5.includes("- Source: src/Page.svelte:14") &&
      words5.includes("- Box: ") &&
      !!ink &&
      ownImages(ink) === 1,
    `groups ${Object.keys(inked.ink).length}; pictures ${ink ? ownImages(ink) : "-"}; heard ${words5.slice(0, 500)}`
  );
  await page.screenshot({ path: join(kit.out, "comment-delivery-last.png") });

  // 9. A comment on the page as a whole, whose words then change.
  await wholePageChecks(on, frame);

  // 10. A pin made while the page's link is down, the frame reloaded, the link back.
  await linkDownChecks(on, frame);

  // 11. Pins kept on the page-sized container before the body was the page's.
  await oldPageAnchorChecks(on, frame);

  // 6. Everything sent: no Send.
  const atEnd = await sendControls();
  kit.check(
    "6: with everything sent, the pane's head has no Send",
    atEnd === 0,
    `${atEnd} Send control(s)`
  );
  // 12. A pin and a reply on a decision page whose session is in a long command.
  await busyDecisionChecks(on, base, callIn);
  await endedWriterChecks(on, base, callIn);
  kit.check(
    "the page said no error",
    said.length === 0,
    said.slice(0, 4).join(" | ") || "none"
  );
};

const spec: Spec = { name: "comment-delivery", run };
export default spec;
