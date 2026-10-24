/**
 * ONLY THE PERSON'S WORDS ARE THE PERSON'S MESSAGE (core transcript-rules.ts
 * `sendRow`, `cawcoRow`; dashboard rows.ts `noticeRunAt`, NoticeRun.svelte).
 * A send's record says who it is from; a send from anyone but the person is
 * drawn as its kind: CawCo's notices as one quiet row that opens to the
 * text the agent read (a run of them with no turn between as one row),
 * another session's words as its peer row, a report as its card, an
 * artifact notice as its line. The agent reads exactly what it was sent.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), with no workspace: it runs inside one.
 *
 * - A real leak: the session's command leaves `sleep 600.0971` in a session
 *   of its own and ends; the agent's leak watch finds it and the hub tells
 *   the session (agent leak-watch.ts, hub server.ts `tellLeak`).
 * - Every other kind, each as the hub writes it, through the one send path
 *   (`deliverSend`), all quiet so the turn that reads them reads them
 *   together: a carry-on after the limit and a wake about its work item (two
 *   notices in a row), a hand-off from another session, a delegate's
 *   report, a delegate's ask, a rule, an artifact's responses notice and a
 *   peer's words with no marker; then the person's own words, which start
 *   the turn.
 *
 * On Chromium and WebKit at 1440 and 390, with the pages open while they
 * arrive and again after a reload:
 * - none of them is drawn in the person's message shape (`[data-you]`);
 * - each is drawn as its kind: the leak as a notice row of one, saying "1
 *   process left running"; the carry-on and the wake as one notice row of
 *   two; the hand-off, report, ask, rule and plain peer as peer rows; the
 *   artifact notice as its line;
 * - the person's two messages are drawn in the person's shape;
 * - opened, the leak's row shows the text the agent read, naming the
 *   process;
 * - the agent read each one's text exactly as sent;
 * - no console error.
 *
 *   bun scripts/probe-kit/run.ts cawco-notices
 */
import type { Page } from "playwright-core";
import type { NeutralOrigin } from "../../../packages/core/src/harness";
import {
  artifactResponsesNotice,
  delegateAskText,
  handoffMarker,
  reportMarker,
} from "../../../packages/core/src/injected";
import { commandLines } from "../../../packages/core/src/process-identity";
import { ruleMarker } from "../../../packages/core/src/rules";
import {
  listedPid,
  signal as signalPid,
} from "../../../packages/core/src/signal";
import { leakWords } from "../../../packages/core/src/words/leaks";
import {
  noticeLine,
  noticeWords,
} from "../../../packages/core/src/words/notices";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import {
  type Engine,
  type Kit,
  type KitFleet,
  open,
  type Spec,
  type View,
} from "../kit";

/** Only these sessions' words carry it. */
const MARK = "PROBE-NOTICES";
const LEFT_TAG = "PROBE-NOTICES-LEFT";
const SLOW = "PROBE-NOTICES-SLOW";
const LEFTOVER = "600.0971";
/** A `sleep` left in a session of its own, its streams its own, and a command that ends 15 s on. */
const LEAVE = `setsid sleep ${LEFTOVER} < /dev/null > /dev/null 2>&1 & sleep 15; echo LEFT-DONE`;
/** How long the leftover is waited on after its command ends: the grace, two looks, and room. */
const LEFT_WAIT_MS = 120_000;
/** The views every page is read at, on each engine. */
const PAGES: readonly { engine: Engine; view: View }[] = [
  { engine: "chromium", view: "desk" },
  { engine: "chromium", view: "phone" },
  { engine: "webkit", view: "desk" },
  { engine: "webkit", view: "phone" },
];
const READY = "[data-transcript-shown] [data-you]";
/** The artifact the crafted responses notice names. */
const ARTIFACT = "art-probe-notices";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

let left = false;
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (!request.all.includes(MARK)) {
    return text("ok");
  }
  if (request.afterTool) {
    return text("Left it.");
  }
  // A turn long enough that what is sent while it runs is read together after it.
  if (request.last.includes(SLOW)) {
    return {
      everyMs: 250,
      words: Array.from({ length: 24 }, () => "thinking "),
    };
  }
  if (request.last.includes(LEFT_TAG) && !left) {
    left = true;
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: {
          command: LEAVE,
          description: "Leave a process behind",
          timeout: 120_000,
        },
      },
    };
  }
  return text("Noted.");
};

/** What a row on the page is: the person's, a notice row, a peer row, an artifact line, or none drawn. */
type Shape = "you" | "notice" | "peer" | "artifact" | "none";

interface Read {
  /** The artifact lines drawn, by the artifact they name. */
  artifacts: string[];
  /** Each message's shape, by its id; a notice's row also by how many it holds and what it says. */
  by: Record<
    string,
    { count?: number; line?: string; shape: Shape; text?: string }
  >;
}

/**
 * Every row the transcript on screen draws, read top to bottom: the list is
 * virtual, so it is scrolled through a part at a time and each mounted
 * row read as it stands.
 */
const readRows = (page: Page): Promise<Read> =>
  page.evaluate(async () => {
    const shown = document.querySelector("[data-transcript-shown]");
    const scroller = shown?.closest('[role="log"]') as HTMLElement | null;
    const by: Read["by"] = {};
    const artifacts = new Set<string>();
    const words = (node: Element | null | undefined) =>
      node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const all = (selector: string) => [
      ...(shown?.querySelectorAll(selector) ?? []),
    ];
    const look = () => {
      for (const one of all("[data-you][data-message]")) {
        by[one.getAttribute("data-message") ?? ""] = { shape: "you" };
      }
      for (const one of all(".group\\/peer[data-message]")) {
        by[one.getAttribute("data-message") ?? ""] = {
          shape: "peer",
          text: words(one.querySelector('[data-slot="peer-label"]')),
        };
      }
      for (const one of all("[data-notice-run]")) {
        const ids = (one.getAttribute("data-messages") ?? "").split(" ");
        const line = words(one.querySelector('button [data-slot="words"]'));
        for (const id of ids) {
          by[id] = {
            shape: "notice",
            count: ids.length,
            line,
            text: words(one),
          };
        }
      }
      for (const one of all("[data-artifact-responses]")) {
        artifacts.add(one.getAttribute("data-artifact-responses") ?? "");
      }
    };
    const atEnd = (box: HTMLElement) =>
      box.scrollTop + box.clientHeight >= box.scrollHeight - 2;
    if (scroller) {
      scroller.scrollTop = 0;
    }
    for (let at = 0; at < 60; at += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one part of the list at a time
      await new Promise((done) => setTimeout(done, 150));
      look();
      if (!scroller || atEnd(scroller)) {
        break;
      }
      scroller.scrollTop += Math.max(100, scroller.clientHeight * 0.5);
    }
    return { by, artifacts: [...artifacts] };
  });

/** Everything `page` said went wrong: its console errors and uncaught errors. */
const errorsOf = (page: Page): string[] => {
  const said: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      said.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    said.push(`${error.message}\n${error.stack ?? ""}`);
  });
  return said;
};

/** A send to `id` from `origin`, as the hub's own are made, through the one send path; its uuid. */
const sendAs = async (
  fleet: KitFleet,
  id: string,
  content: string,
  origin: NeutralOrigin
): Promise<string> => {
  const uuid = crypto.randomUUID();
  await fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "send",
    machineId: MACHINE,
    sessionId: id,
    payload: {
      instanceId: id,
      message: {
        type: "user",
        uuid,
        message: { role: "user", content },
        parent_tool_use_id: null,
        origin,
        shouldQuery: false,
      },
    },
  });
  return uuid;
};

interface Block {
  content: string;
  id: string;
  metadata?: { notice?: string; noteTitle?: string; subtype?: string };
  type: string;
}

/** `id`'s transcript, as a fresh read serves it. */
const blocksOf = async (fleet: KitFleet, id: string): Promise<Block[]> =>
  (
    await fleet.api<{ blocks: Block[] }>(
      `/api/instances/${id}/transcript?limit=400`
    )
  ).blocks;

/** What each crafted send is, and how it must be drawn. */
interface Sent {
  content: string;
  shape: Shape;
  what: string;
}

/** Every kind the hub sends but a leak, each as the hub writes it, `sender` the session another session's words are from. */
const craftedFor = (
  sender: string
): { origin: NeutralOrigin; sent: Sent }[] => {
  const label = `Sender#${sender.slice(0, 8)}`;
  const peer: NeutralOrigin = {
    kind: "peer",
    from: sender,
    name: "Sender",
    fromSession: sender,
  };
  return [
    {
      origin: {
        kind: "system",
        name: "limit",
        line: noticeWords.carryOn.limit,
      },
      sent: {
        what: "a carry-on after the limit",
        shape: "notice",
        content: `${MARK} The usage limit that stopped your last turn no longer applies. Carry on from where you stopped.`,
      },
    },
    {
      origin: { kind: "system", name: "work-item" },
      sent: {
        what: "a wake about its work item",
        shape: "notice",
        content: `${MARK} Your work item is still open: continue it.`,
      },
    },
    {
      origin: peer,
      sent: {
        what: "a hand-off from another session",
        shape: "peer",
        content: `${handoffMarker("Sender", sender)}${MARK} handed over.`,
      },
    },
    {
      origin: peer,
      sent: {
        what: "a delegate's report",
        shape: "peer",
        content: `${reportMarker(label, false, false, "Probe headline")}From Sender.\n\n${MARK} the report.`,
      },
    },
    {
      origin: peer,
      sent: {
        what: "a delegate's ask",
        shape: "peer",
        content: delegateAskText({
          label,
          body: `${MARK} may I run it?`,
          instance: sender,
          request: "probe-request",
          instruction: "Answer it with the answer_delegate tool.",
        }),
      },
    },
    {
      origin: { kind: "system", name: "rule:Probe rule" },
      sent: {
        what: "a rule",
        shape: "peer",
        content: `${ruleMarker("Probe rule")}${MARK} the rule's reply.`,
      },
    },
    {
      origin: { kind: "system", name: "artifact" },
      sent: {
        what: "an artifact's responses notice",
        shape: "artifact",
        content: artifactResponsesNotice({
          id: "art-probe-notices",
          kind: "page",
          name: "Probe page",
          since: 0,
        }),
      },
    },
    {
      origin: peer,
      sent: {
        what: "a peer's words with no marker",
        shape: "peer",
        content: `${MARK} words from another session.`,
      },
    },
  ];
};

/** What a page must draw: the crafted sends, the leak's notice, the person's two messages. */
interface Want {
  hello: string;
  ids: { id: string; sent: Sent }[];
  leak: Block | undefined;
  mine: string;
}

/** Opens the notice row holding `id` in place, and answers what opened under it. */
const openNotice = (
  page: Page,
  id: string
): Promise<{ spill: number; text: string }> =>
  page.evaluate(async (held) => {
    const selector = `[data-transcript-shown] [data-messages~="${held}"]`;
    const scroller = document
      .querySelector("[data-transcript-shown]")
      ?.closest('[role="log"]') as HTMLElement | null;
    // The list is virtual: a row scrolled out of view is not mounted, so it
    // is looked for from the top a part at a time.
    if (scroller && !document.querySelector(selector)) {
      scroller.scrollTop = 0;
    }
    for (let at = 0; at < 60 && !document.querySelector(selector); at += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one part of the list at a time
      await new Promise((done) => setTimeout(done, 150));
      if (scroller && !document.querySelector(selector)) {
        scroller.scrollTop += Math.max(100, scroller.clientHeight * 0.5);
      }
    }
    document.querySelector(selector)?.scrollIntoView({ block: "center" });
    await new Promise((done) => setTimeout(done, 150));
    const button = document.querySelector(selector)?.querySelector("button");
    if (button?.getAttribute("aria-expanded") !== "true") {
      button?.click();
    }
    for (let at = 0; at < 40; at += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: until it has opened
      await new Promise((done) => setTimeout(done, 100));
      const body = document
        .querySelector(selector)
        ?.querySelector('[data-slot="transcript-brief"]');
      if (body) {
        // How far anything opened reaches past the row's own box, px.
        const edge = body.closest("[data-notice-run]")?.getBoundingClientRect();
        const spill = Math.max(
          0,
          ...[...body.querySelectorAll("*")].map(
            (one) => one.getBoundingClientRect().right - (edge?.right ?? 0)
          )
        );
        return {
          spill,
          text: body.textContent?.replace(/\s+/g, " ").trim() ?? "",
        };
      }
    }
    return { spill: 0, text: "" };
  }, id);

/** Waits until `page` draws every row `want` names, then answers what it drew. */
const drawnRows = (page: Page, what: string, want: Want): Promise<Read> =>
  until(
    `${what}: every row drawn`,
    () => readRows(page),
    (r) =>
      r.by[want.mine]?.shape === "you" &&
      want.ids.every(
        ({ id, sent }) => sent.shape === "artifact" || r.by[id] !== undefined
      ) &&
      (!want.leak || r.by[want.leak.id] !== undefined),
    30_000
  ).catch(() => readRows(page));

/** Holds what `page` draws to `want`, in `what`'s words. */
const judge = async (
  kit: Kit,
  page: Page,
  what: string,
  errors: string[],
  want: Want
) => {
  const { hello, ids, leak, mine } = want;
  const rows = await drawnRows(page, what, want);
  const youShaped = [
    ...ids.map(({ id, sent }) => ({ id, said: sent.what })),
    ...(leak ? [{ id: leak.id, said: "the leak" }] : []),
  ].filter(({ id }) => rows.by[id]?.shape === "you");
  kit.check(
    `${what}: none of CawCo's or another session's messages is drawn in the person's message shape`,
    youShaped.length === 0,
    youShaped.map(({ said }) => said).join(", ") || "none"
  );
  const wrong = ids.filter(({ id, sent }) =>
    sent.shape === "artifact"
      ? !rows.artifacts.includes(ARTIFACT)
      : rows.by[id]?.shape !== sent.shape
  );
  kit.check(
    `${what}: each is drawn as its kind (notices as notice rows, the hand-off, report, ask, rule and peer as peer rows, the artifact notice as its line)`,
    wrong.length === 0,
    JSON.stringify(
      wrong.map(({ id, sent }) => ({ what: sent.what, drawn: rows.by[id] }))
    )
  );
  const leakRow = leak ? rows.by[leak.id] : undefined;
  kit.check(
    `${what}: the leak is one notice row saying ${JSON.stringify(noticeWords.leftRunning(1, null))}`,
    leakRow?.shape === "notice" &&
      leakRow.count === 1 &&
      leakRow.line === noticeWords.leftRunning(1, null),
    JSON.stringify(leakRow ?? null)
  );
  const first = rows.by[ids[0]?.id ?? ""];
  const second = rows.by[ids[1]?.id ?? ""];
  const pairLine = noticeLine({ name: "work-item" });
  kit.check(
    `${what}: two notices with no turn between them fold into one row of two, its newest's line and "${noticeWords.more(1)}"`,
    first?.shape === "notice" &&
      first.count === 2 &&
      second?.count === 2 &&
      first.line === pairLine &&
      !!first.text?.includes(`· ${noticeWords.more(1)}`),
    JSON.stringify({ first, second, want: pairLine })
  );
  kit.check(
    `${what}: the person's own two messages are drawn in the person's message shape`,
    rows.by[hello]?.shape === "you" && rows.by[mine]?.shape === "you",
    JSON.stringify({ hello: rows.by[hello], mine: rows.by[mine] })
  );
  const opened = leak
    ? await openNotice(page, leak.id)
    : { spill: 0, text: "" };
  kit.check(
    `${what}: opened in place, the leak's row shows what the agent was sent, naming the process, nothing reaching past the row (its long path wraps)`,
    opened.text.startsWith(noticeWords.sent) &&
      opened.text.includes(`sleep ${LEFTOVER}`) &&
      opened.spill <= 0.5,
    `spill ${opened.spill}px: ${opened.text.slice(0, 300)}`
  );
  kit.check(
    `${what}: no console error`,
    errors.length === 0,
    JSON.stringify(errors.slice(0, 5))
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
  try {
    const sender = await fleet.spawn("claude", "Sender", fleet.repo);
    const one = await fleet.spawn("claude", "Notices", fleet.repo);
    const hello = await fleet.send(one, `${MARK}: hello`);
    await until(
      "the first turn answered",
      () => fleet.instance(one)?.turn_open_at,
      (turnAt) =>
        turnAt === null && fleet.seen.some((r) => r.all.includes(MARK)),
      120_000
    );

    const base = await fleet.dashboard();
    const pages: { errors: string[]; label: string; page: Page }[] = [];
    for (const { engine, view } of PAGES) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time
      const page = await kit.page(view, { engine });
      const errors = errorsOf(page);
      await open(page, `${base}/session/${one}`, READY);
      pages.push({ page, errors, label: `${engine} ${view}` });
    }

    // A real leftover, told by the agent's leak watch and the hub.
    await fleet.send(one, `${MARK} ${LEFT_TAG}: leave a process behind.`);
    const leakRead = await until(
      "the session told of its leftover",
      () =>
        fleet.seen.find(
          (r) =>
            r.last.includes(leakWords.leftBehind) &&
            r.last.includes(`sleep ${LEFTOVER}`)
        ),
      Boolean,
      LEFT_WAIT_MS
    ).catch(() => undefined);
    const leak = await until(
      "the leak's notice in its transcript",
      async () =>
        (await blocksOf(fleet, one)).find((b) => b.metadata?.notice === "leak"),
      Boolean,
      60_000
    ).catch(() => undefined);
    await until(
      "the leak's turn answered",
      () => fleet.instance(one)?.turn_open_at,
      (turnAt) => turnAt === null,
      120_000
    ).catch(() => undefined);
    kit.check(
      "the hub tells the session of the process it left, as a notice whose line says what happened, and the agent reads the text it was sent",
      !!leak &&
        leak.type === "ui.system_note" &&
        leak.metadata?.noteTitle === noticeWords.leftRunning(1, null) &&
        !!leakRead?.last.includes(leak.content),
      JSON.stringify({
        block: leak && { ...leak, content: leak.content.slice(0, 300) },
        read: leakRead?.last.slice(0, 300) ?? null,
      })
    );

    // Every other kind, sent while a turn runs, so the turn after it reads
    // them together, the person's own words last.
    await fleet.send(one, `${MARK} ${SLOW}: think a while.`);
    await until(
      "the long turn running",
      () => fleet.instance(one)?.turn_open_at,
      (turnAt) => turnAt !== null && turnAt !== undefined,
      60_000
    );
    const ids: { id: string; sent: Sent }[] = [];
    for (const { origin, sent } of craftedFor(sender)) {
      // biome-ignore lint/performance/noAwaitInLoops: in order, as the hub sends them
      ids.push({ id: await sendAs(fleet, one, sent.content, origin), sent });
    }
    const mine = await fleet.send(one, `${MARK}: and mine`);
    await until(
      "the person's turn after them answered",
      () => fleet.instance(one)?.turn_open_at,
      (turnAt) =>
        turnAt === null &&
        fleet.seen.some((r) => r.last.includes(`${MARK}: and mine`)),
      120_000
    ).catch(() => undefined);
    const read = fleet.seen.map((r) => r.all).join("\n");
    const unread = ids.filter(({ sent }) => !read.includes(sent.content));
    kit.check(
      "the agent read every one of them exactly as sent",
      unread.length === 0,
      unread.map(({ sent }) => sent.what).join(", ") || "all read"
    );

    const want: Want = { hello, ids, leak, mine };
    for (const { page, errors, label } of pages) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time
      await judge(kit, page, `${label} live`, errors, want);
    }
    for (const { page, errors, label } of pages) {
      errors.length = 0;
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(READY, { timeout: 60_000 });
      await judge(kit, page, `${label} after a reload`, errors, want);
      await page.close();
    }
  } finally {
    const leftovers = (await commandLines()).filter((line) =>
      line.command.startsWith(`sleep ${LEFTOVER}`)
    );
    for (const { pid } of leftovers) {
      signalPid(listedPid(pid), "SIGKILL");
    }
  }
};

export default {
  name: "cawco-notices",
  run,
} satisfies Spec;
