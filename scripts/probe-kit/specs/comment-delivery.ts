/**
 * The person's pins reach the session by themselves (artifacts/service.ts
 * `deliverMarks`, server.ts `deliverArtifactMarks`). The owner: "this part
 * where i type a comment and i have to type them all and then have to tell
 * you to read them is getting tedious".
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) and the built dashboard at the desk, read from the hub's own
 * records (`sent_messages`), what the model was sent, the page's doc and
 * the pane's DOM:
 *
 * 1. A session shows a page in its pane; the pane's head has no Send control.
 * 2. Three pins, each tapped and written in, 2 s apart: exactly one delivery
 *    to the session, about the quiet period (10 s) after the third; it
 *    carries all three, each with its number, id, selector, source
 *    file:line, text and the person's words, and their three pictures; the
 *    session's turn starts on it (the model is asked with it as the last
 *    message); the transcript draws one quiet line, "Comments on <page>",
 *    and no row of the person's; every pin and entry is stamped `sentAt`.
 * 3. A reply to pin 2 later: one more delivery, pin 2 alone with the reply.
 * 4. The person resolves pin 3: one more delivery, its one resolve line.
 * 5. A pen stroke no pin stands on: one more delivery, the ink over its
 *    element with its box, and the page with the ink as its picture.
 * 6. Still no Send control in the pane.
 * 8. A pin the session reads with comment_read before the quiet period ends
 *    is not delivered to it (it is stamped heard as read); the person's
 *    later reply on it still delivers, with only the new words.
 * 7. A writer that has ended: a session of a project with Caw makes a page,
 *    and its conversation is gone (the hub's own record, `last_error`, as
 *    the harness sets it when a resume finds nothing). A pin on its page
 *    wakes the project's Caw instead, the delivery naming the pin's id; his
 *    comment_reply lands in that pin's thread, by the agent, where the
 *    person reads it (7a). Caw's own turn needs his place's sandbox: run
 *    from inside a workspace on a host that cannot nest one (core
 *    boundary-nesting.ts), the hub's refusal of his wake is noted, the
 *    writer is checked to be sent nothing, the pin to stay unstamped (owed
 *    for the next delivery), and the writer's transcript to show the
 *    comments line "not sent" with why. Live, the pin is stamped heard. 7b, the rule through the tool:
 *    a session that is not the project's lead is refused the pin; once the
 *    hub's record names it the lead, its comment_reply lands in the thread.
 *
 *   bun scripts/probe-kit/run.ts comment-delivery
 */
import { Database } from "bun:sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Frame, Page } from "playwright-core";
import { CLAUDE_CONVERSATION_GONE } from "../../../packages/core/src/index";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";
import { docOf, type On, pageFrame, screenBox, strokeOver } from "./ink";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const NAME = "comment-delivery";
/** The comments notice (core injected.ts `artifactCommentsNotice`). */
const NOTICE =
  /\[CawCo\] The person commented on the page "comment-delivery" \(artifact [0-9a-f-]{36}\)\./;
const IMAGE_BLOCK = /"type":"image"/g;
/** The hub's quiet period (artifacts/service.ts `MARKS_QUIET_MS`). */
const QUIET_MS = 10_000;
/** How far past the quiet period a delivery may reach the model: the hub's send, the agent, Claude Code's request. */
const REACH_MS = 6000;
/** How long after a delivery the probe watches for another that should not come. */
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
const LATER_WORDS = "And one more word after you read it.";
/** The delivery routed to Caw: the writer's page, a pin's id, and that it comes to him. */
const ROUTED =
  /The person commented on the page "ended-writer"[\s\S]*?- Pin: ([0-9a-f-]{36})[\s\S]*?so these come to you/;
/** The hub's log lines step 7 reads. */
const HUB_LINE = /caw|artifacts|marks|lead/i;
/** The host's refusal of a sandbox inside another (core boundary-nesting.ts). */
const NESTED = /inside another bwrap sandbox|unpriv_bwrap/;
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
      answered.set(marker, request.last);
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

/** The pane's pin list: in the Comments popover hung from the well, opened when shut. */
const rowsOf = async (page: Page) => {
  const button = page.locator(
    ':is([data-slot="preview-pane"], [data-side-surface-class~="preview-pane"]) button[data-slot="comments"]'
  );
  if ((await button.getAttribute("aria-expanded")) !== "true") {
    await button.click();
  }
  const list = page.locator('[data-pin-list-pop] [data-slot="pin-list"]');
  await list.waitFor({ timeout: 5000 });
  return list;
};
/** Pin `number`'s card, opened from its row in the Comments popover. */
const openRow = async (page: Page, number: number) =>
  (await rowsOf(page))
    .locator(`[data-slot="pin-row"][data-pin-row="${number}"]`)
    .click();
/** The Comments popover shut, when open. */
const shutList = async (page: Page) => {
  const button = page.locator(
    ':is([data-slot="preview-pane"], [data-side-surface-class~="preview-pane"]) button[data-slot="comments"]'
  );
  if ((await button.getAttribute("aria-expanded")) === "true") {
    await button.click();
    await page
      .locator("[data-pin-list-pop]")
      .waitFor({ state: "detached", timeout: 3000 })
      .catch(() => undefined);
  }
};

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

/** Pins 1–3, each tapped and written in, 2 s from one's words to the next; when each one's words were kept. */
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
    await page.mouse.click(b.x + b.w * 0.3, b.y + b.h / 2);
    const card = page.locator(
      `[data-slot="pin-card"][data-pin-card="${number}"]`
    );
    await card.waitFor({ timeout: 5000 });
    await card.getByRole("textbox").fill(words);
    await card.getByRole("button", { name: "Reply" }).click();
    await until(
      `pin ${number}'s words in the doc`,
      () => docOf(frame),
      (now) => (numbered(now.pins, number)?.thread.length ?? 0) === 1,
      5000
    );
    keptAt.push(Date.now());
    await page.keyboard.press("Escape");
  }
  return keptAt;
};

/** Comment mode on in the pane, a tap on `selector`, the person's words in pin `number`'s card. */
const pinWith = async (
  on: On,
  frame: Frame,
  selector: string,
  number: number,
  words: string
) => {
  const comment = on.page.locator(
    ':is([data-slot="preview-pane"], [data-side-surface-class~="preview-pane"]) button[aria-keyshortcuts=\'C\']'
  );
  await comment.focus();
  await on.page.keyboard.press("c");
  await pageInComment(frame);
  // The element in the pane's view, where the person taps it.
  await frame.locator(selector).scrollIntoViewIfNeeded();
  await settle(on.page, 300);
  const b = await screenBox(on, frame, selector);
  await on.page.mouse.click(b.x + b.w * 0.3, b.y + b.h / 2);
  const card = on.page.locator(
    `[data-slot="pin-card"][data-pin-card="${number}"]`
  );
  await card.waitFor({ timeout: 5000 }).catch(async (error: unknown) => {
    const pins = Object.values((await docOf(frame)).pins).map(
      (pin) => pin.number
    );
    throw new Error(
      `pin ${number}'s card never opened (the doc holds pins ${pins.join(", ")}; tapped ${selector} at ${JSON.stringify(b)}): ${error instanceof Error ? error.message : String(error)}`
    );
  });
  await card.getByRole("textbox").fill(words);
  await card.getByRole("button", { name: "Reply" }).click();
  await until(
    `pin ${number}'s words in the doc`,
    () => docOf(frame),
    (now) => (numbered(now.pins, number)?.thread.length ?? 0) === 1,
    5000
  );
  await on.page.keyboard.press("Escape");
  await on.page.keyboard.press("Escape");
};

/**
 * 8. Read before it goes: a pin the session reads with comment_read inside
 * the quiet period is not delivered to it; the person's later reply is.
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
  await Bun.sleep(
    Math.max(0, keptAt + QUIET_MS + REACH_MS + 4000 - Date.now())
  );
  const pin4 = numbered((await docOf(frame)).pins, 4);
  const early = deliveries(before).filter((one) => one.last.includes("## 4."));
  kit.check(
    "8: a pin the session reads with comment_read before the quiet period ends is not delivered to it, and is stamped heard",
    readIn < QUIET_MS &&
      read.includes(FIRST_WORDS) &&
      early.length === 0 &&
      !!pin4?.heard &&
      !!pin4.sentAt,
    `read ${readIn} ms after the pin's words; deliveries of pin 4 ${early.length}; pin ${JSON.stringify(pin4 && { sentAt: pin4.sentAt, heard: pin4.heard })}; read ${read.slice(0, 200)}`
  );
  const later = heard.length;
  await openRow(page, 4);
  const card = page.locator('[data-slot="pin-card"][data-pin-card="4"]');
  await card.getByRole("textbox").fill(LATER_WORDS);
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
    QUIET_MS + REACH_MS + 5000
  );
  const words = next?.last ?? "";
  kit.check(
    "8: the person's later reply on that pin still delivers, with only the new words",
    words.includes("## 4. comment on #e") &&
      words.includes(`- I wrote: ${JSON.stringify(LATER_WORDS)}`) &&
      !words.includes(`- I wrote: ${JSON.stringify(FIRST_WORDS)}`),
    words.slice(0, 500) || "no delivery"
  );
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
    db.query("UPDATE instances SET last_error = ? WHERE id = ?").run(
      CLAUDE_CONVERSATION_GONE,
      writer
    );
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
        (line) => line.includes("marks reached no one") && NESTED.test(line)
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
  const readCard = async () => {
    await openRow(tab, 1);
    const said = await tab
      .locator(
        '[data-slot="pin-card"][data-pin-card="1"] [data-slot="entry"][data-by="agent"]'
      )
      .allInnerTexts();
    await tab.keyboard.press("Escape");
    await shutList(tab);
    return said.join(" | ");
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
  } else {
    const agentSaid = outcome.pin?.thread.find((entry) => entry.by === "agent");
    kit.check(
      "7a: a pin on an ended writer's page wakes the project's Caw, the delivery naming the pin's id",
      !!pin &&
        writerEvents === 0 &&
        caw.pin === pin.id &&
        !!caw.heard?.includes(`- Pin: ${pin.id}`) &&
        !!lead &&
        lead !== writer,
      `pin ${pin?.id}; Caw heard pin ${caw.pin}; lead ${lead}; writer's comment events ${writerEvents}; heard ${caw.heard?.slice(0, 500)}; hub ${(await hubLines()).slice(-8).join(" | ")}`
    );
    const inCard = await readCard();
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
  const card = await readCard();
  kit.check(
    "7b: a session that is not the project's lead is refused the writer's pin, and no word of it lands",
    refused.includes(`No artifact of this session holds pin ${pin.id}`) &&
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
    asks.set(marker, { name: tool, input });
    await fleet.send(to, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${tool} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };
  const call = (tool: string, input: object) => callIn(session, tool, input);
  const made = await call(CREATE, { kind: "page", name: NAME, html });
  const id = made.match(ANSWERED_ID)?.[1];
  if (!id) {
    kit.check("the page is made", false, made.slice(0, 300));
    return;
  }
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
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
        ':is([data-slot="preview-pane"], [data-side-surface-class~="preview-pane"]) [data-slot="send"]'
      )
      .count();
  const atStart = await sendControls();
  kit.check(
    "1: the session's page is in its pane, and the pane's head has no Send control",
    atStart === 0,
    `${atStart} Send control(s)`
  );

  // 2. Three pins, 2 s apart, each tapped and written in.
  const startedAt = Date.now();
  const comment = page.locator(
    ':is([data-slot="preview-pane"], [data-side-surface-class~="preview-pane"]) button[aria-keyshortcuts=\'C\']'
  );
  await comment.focus();
  await page.keyboard.press("c");
  await pageInComment(frame);
  await settle(page, 300);
  const keptAt = await writePins(on, frame);
  await page.keyboard.press("Escape");
  const [, , third] = keptAt;
  const first = await nextDelivery(
    "the delivery of the three pins",
    0,
    QUIET_MS + REACH_MS + 5000
  );
  const arrived = first ? first.at - third : Number.NaN;
  await Bun.sleep(STILL_MS);
  const all = deliveries();
  const events = eventsOf(dbPath, session, startedAt);
  const doc = await docOf(frame);
  const pins = [1, 2, 3].map((n) => numbered(doc.pins, n));
  const sections = pins.map((pin, i) => {
    const p = PARAS[i];
    const words = first?.last ?? "";
    return (
      !!pin &&
      words.includes(`## ${i + 1}. comment on #${p.id}`) &&
      words.includes(`- Source: src/Page.svelte:${p.line}`) &&
      words.includes(`- Text: ${JSON.stringify(p.text)}`) &&
      words.includes(`- I wrote: ${JSON.stringify(WORDS[i])}`) &&
      words.includes(`- Pin: ${pin.id}`)
    );
  });
  kit.check(
    "2: three pins written 2 s apart reach the session as exactly one delivery, about the quiet period after the third",
    all.length === 1 &&
      events.length === 1 &&
      arrived >= QUIET_MS - 1000 &&
      arrived <= QUIET_MS + REACH_MS,
    `${all.length} deliveries at the model, ${events.length} artifact event(s) in sent_messages; the first ${arrived} ms after the third pin's words (pins kept at +${keptAt.map((at) => at - keptAt[0]).join(", +")} ms)`
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

  // 3. A reply to pin 2 later: one more delivery, pin 2 alone.
  const before3 = heard.length;
  const events3 = events.length;
  await openRow(page, 2);
  const card2 = page.locator('[data-slot="pin-card"][data-pin-card="2"]');
  await card2.getByRole("textbox").fill("On second thought, keep the weight.");
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
    QUIET_MS + REACH_MS + 5000
  );
  await Bun.sleep(STILL_MS);
  const after3 = eventsOf(dbPath, session, startedAt).length - events3;
  const words2 = second?.last ?? "";
  kit.check(
    "3: a reply to pin 2 later is one more delivery, about the quiet period after it, with pin 2 alone and the reply",
    deliveries(before3).length === 1 &&
      after3 === 1 &&
      !!second &&
      second.at - repliedAt >= QUIET_MS - 1000 &&
      words2.includes("## 2. comment on #b") &&
      words2.includes('- I wrote: "On second thought, keep the weight."') &&
      !words2.includes(`- I wrote: ${JSON.stringify(WORDS[1])}`) &&
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
    QUIET_MS + REACH_MS + 5000
  );
  const words4 = resolved?.last ?? "";
  kit.check(
    "4: the person's resolve of pin 3 is one more delivery, its one line",
    deliveries(before4).length === 1 &&
      words4.includes(`## 3. Resolved by the person (pin ${pin3?.id})`) &&
      !words4.includes("## 2."),
    words4.slice(0, 400)
  );

  // 8, before the stroke: a pin read before the quiet period ends.
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
    QUIET_MS + REACH_MS + 8000
  );
  const words5 = ink?.last ?? "";
  kit.check(
    "5: a pen stroke no pin stands on is one more delivery: the ink over #d with its box, and the page with the ink as its picture",
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

  // 6. Still no Send control.
  const atEnd = await sendControls();
  kit.check(
    "6: no Send control in the pane after all of it",
    atEnd === 0,
    `${atEnd} Send control(s)`
  );
  await endedWriterChecks(on, base, callIn);
  kit.check(
    "the page said no error",
    said.length === 0,
    said.slice(0, 4).join(" | ") || "none"
  );
};

const spec: Spec = { name: "comment-delivery", run };
export default spec;
