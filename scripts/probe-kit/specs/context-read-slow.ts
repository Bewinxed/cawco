/**
 * A session's details never say its machine "may be offline" while the hub
 * holds that machine's link, and the context reading they ask for answers
 * once nothing holds it: read on a scratch fleet with the real Claude Code
 * against the mock model, through the built dashboard.
 *
 * (a) Anthropic's token-count API slow: the mock holds every `count_tokens`
 *     answer. The details still show the session's reading, within the
 *     dashboard's 15 s, and never "may be offline". (Before the fix, the
 *     agent asked Claude Code for its full count, one `count_tokens` call per
 *     category, and the read ran out of time on a live machine.)
 * (b) The session's own process held: Claude Code stopped (SIGSTOP), its
 *     machine online on the hub. The details' read misses, and says that this
 *     session didn't report its context and when it is asked again, never
 *     "may be offline".
 * (c) The process let go (SIGCONT) and its next turn ended: the details show
 *     the reading, and the miss's words are gone.
 * (d) Three live sessions open as tabs (so this tab streams all three), the
 *     details of one shown. One turn's end each: the shown one's context is
 *     read once, and its answer lands in its details; the two nothing shows
 *     are not read. Counted on the tab's socket, every `getContextUsage` it
 *     sends the hub for the agent.
 * (e) A send handed to the machine mid-command, then withdrawn: a context
 *     read behind the withdrawal is answered within the dashboard's 15 s.
 * (f) A session read while shown, then given a turn that moves its reading
 *     while nothing shows it: Usage's Sessions export writes its current
 *     reading, never the one this tab took before.
 *

 *   bun scripts/probe-kit/run.ts context-read-slow
 */
import { readFile } from "node:fs/promises";
import type { Page } from "playwright-core";
import { signal } from "../../../packages/core/src/signal";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type KitFleet, open, type Spec } from "../kit";

/** The details' context line: a reading ("Context 2% · 3k/200k"), "Reading…", or why there is none. */
const CONTEXT = ".session-details-popover .stats .context";
const READING = /^Context \d+% · /;
const OFFLINE = /may be offline/i;
/** A turn the mock answers with a long command, for (e)'s withdrawal to wait in. */
const SLOW_TOOL = "Run the long command.";
const SLOW_TOOL_S = 60;
/** A turn the mock reports as reading this many tokens, so (f)'s session's reading moves. */
const BIG_TURN = "A turn that fills the window.";
const BIG_TURN_TOKENS = 150_000;
/** The figure in a context line ("Context 48% · …"). */
const PERCENT = /(\d+)%/;

/** Every turn answers "done"; (e)'s runs a long command first, (f)'s reports a full window. */
const respond = (request: Seen): Reply => {
  if (request.last.includes(SLOW_TOOL) && !request.afterTool) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: {
          command: `sleep ${SLOW_TOOL_S}`,
          description: "A long command in the turn",
          timeout: 600_000,
        },
      },
    };
  }
  if (request.last.includes(BIG_TURN)) {
    return {
      everyMs: 5,
      words: ["done"],
      usage: { prompt: BIG_TURN_TOKENS, completion: 2 },
    };
  }
  return { everyMs: 5, words: ["done"] };
};

/** The details card of `id` opened on `page`: the tab hovered, then pinned by a press inside it. */
const openDetails = async (
  page: Page,
  base: string,
  id: string
): Promise<void> => {
  await open(
    page,
    `${base}/session/${id}`,
    `[data-session-tab="${id}"]`,
    120_000
  );
  await page
    .locator(`[data-session-tab="${id}"]`)
    .filter({ visible: true })
    .first()
    .hover();
  await page.waitForSelector(CONTEXT, { timeout: 15_000 });
  await page.locator(CONTEXT).click();
};

/** Every distinct line the details' context showed, read every 200 ms, until `done` holds or `ms` passes. */
const watch = async (
  page: Page,
  ms: number,
  done: (line: string) => boolean
): Promise<string[]> => {
  const lines: string[] = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // biome-ignore lint/performance/noAwaitInLoops: one read of the page per tick
    const line = await page.evaluate(
      (selector) =>
        document
          .querySelector(selector)
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? "",
      CONTEXT
    );
    if (line && lines.at(-1) !== line) {
      lines.push(line);
    }
    if (done(line)) {
      break;
    }
    await Bun.sleep(200);
  }
  return lines;
};

/** The hub's word on the machine: its row on /api/agents. */
const machineStatus = async (fleet: KitFleet): Promise<string | undefined> =>
  (
    await fleet.api<{ machineId: string; status: string }[]>("/api/agents")
  ).find((agent) => agent.machineId === MACHINE)?.status;

/** No turn open on the hub, no busy pulse. */
const atRest = (fleet: KitFleet, id: string) =>
  until(
    "the session at rest",
    async () => {
      const [row] = fleet.query<{ turn_open_at: number | null }>(
        "SELECT turn_open_at FROM instances WHERE id = ?",
        id
      );
      const pulses =
        await fleet.api<Record<string, { busy?: boolean }>>("/api/pulses");
      return row?.turn_open_at === null && !pulses[id]?.busy;
    },
    Boolean,
    120_000
  );

const spec: Spec = {
  name: "context-read-slow",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const id = await fleet.spawn("claude", "Context reads");
    await fleet.send(id, "First turn, so the session has a reading.");
    await atRest(fleet, id);
    const base = await fleet.dashboard();

    // (a) Anthropic's token count held.
    const release = fleet.holdCountTokens();
    const countedBefore = fleet.countTokensAsked();
    const first = await kit.page("desk");
    await openDetails(first, base, id);
    const slowCount = await watch(
      first,
      25_000,
      (line) => READING.test(line) || OFFLINE.test(line)
    );
    const counted = fleet.countTokensAsked() - countedBefore;
    release();
    kit.note(
      `(a) the details read ${JSON.stringify(slowCount)}; the read asked count_tokens ${counted} times`
    );
    check(
      "(a) with the token count held, the details show the session's reading",
      READING.test(slowCount.at(-1) ?? ""),
      JSON.stringify(slowCount)
    );
    check(
      "(a) with the token count held, the details never say the machine may be offline",
      !slowCount.some((line) => OFFLINE.test(line)),
      JSON.stringify(slowCount)
    );

    // (b) The session's own process held.
    const pid = await fleet.sessionPid(id);
    if (pid === undefined) {
      check("(b) the session has a process to hold", false, "no pid");
      return;
    }
    signal(pid, "SIGSTOP");
    const second = await kit.page("desk");
    let held: string[] = [];
    let status: string | undefined;
    try {
      await openDetails(second, base, id);
      held = await watch(
        second,
        25_000,
        (line) => !(line === "" || line.startsWith("Reading"))
      );
      status = await machineStatus(fleet);
    } finally {
      signal(pid, "SIGCONT");
    }
    const said = held.at(-1) ?? "";
    kit.note(`(b) machine ${status}; the details read ${JSON.stringify(held)}`);
    check(
      "(b) the hub holds the machine online while its session is held",
      status === "online",
      String(status)
    );
    check(
      "(b) the details never say the machine may be offline",
      !held.some((line) => OFFLINE.test(line)),
      JSON.stringify(held)
    );
    check(
      "(b) the details say this session didn't report its context, and when it is asked again",
      said.includes("this session didn't report its context") &&
        said.includes("asked again when its turn ends"),
      said
    );

    // (c) Let go: the next turn's end reads it.
    await fleet.send(id, "Second turn, after the hold.");
    await atRest(fleet, id);
    const after = await watch(second, 30_000, (line) => READING.test(line));
    kit.note(`(c) the details read ${JSON.stringify(after)}`);
    check(
      "(c) once the session answers, the details show its reading in place of the miss",
      READING.test(after.at(-1) ?? ""),
      JSON.stringify(after)
    );

    // (d) Three live sessions, all open as tabs (so all streamed), one
    // shown: only the shown one's turn end reads its context.
    const others = [
      await fleet.spawn("claude", "Context reads, unseen 1"),
      await fleet.spawn("claude", "Context reads, unseen 2"),
    ];
    const third = await kit.page("desk");
    const asked: { at: number; id: string; requestId: string }[] = [];
    const answered = new Map<string, boolean>();
    third.on("websocket", (socket) => {
      socket.on("framesent", ({ payload }) => {
        const frame = parsed(payload);
        if (frame?.payload?.method === "getContextUsage" && frame.instanceId) {
          asked.push({
            at: Date.now(),
            id: frame.instanceId,
            requestId: String(frame.requestId),
          });
        }
      });
      socket.on("framereceived", ({ payload }) => {
        const frame = parsed(payload);
        if (frame?.payload?.kind === "control_result") {
          answered.set(
            String(frame.payload.requestId),
            frame.payload.ok === true
          );
        }
      });
    });
    for (const other of others) {
      // biome-ignore lint/performance/noAwaitInLoops: each opens its tab in turn
      await open(
        third,
        `${base}/session/${other}`,
        `[data-session-tab="${other}"]`,
        120_000
      );
      // Its tab written to the tree the next page load restores.
      await Bun.sleep(1500);
    }
    await openDetails(third, base, id);
    const tabs = await third.evaluate(
      (ids) =>
        ids.filter((one) =>
          document.querySelector(`[data-session-tab="${one}"]`)
        ).length,
      [id, ...others]
    );
    await watch(third, 20_000, (line) => READING.test(line));
    const turnsFrom = Date.now();
    for (const one of [id, ...others]) {
      // biome-ignore lint/performance/noAwaitInLoops: one turn at a time, each to its end
      await fleet.send(one, `A turn that ends: ${one.slice(0, 8)}`);
      await atRest(fleet, one);
    }
    // The reads a turn's end sets off go out within a moment of it.
    await Bun.sleep(5000);
    const per = Object.fromEntries(
      [id, ...others].map((one) => [
        one.slice(0, 8),
        asked.filter((ask) => ask.id === one && ask.at >= turnsFrom).length,
      ])
    );
    const shownRead = asked.find((ask) => ask.id === id && ask.at >= turnsFrom);
    const shownLine = await watch(third, 10_000, (line) => READING.test(line));
    kit.note(
      `(d) ${tabs} of 3 sessions open as tabs; getContextUsage per session after one turn end each: ${JSON.stringify(per)}; the shown one's read answered ${shownRead ? answered.get(shownRead.requestId) : "(none asked)"}; its details read ${JSON.stringify(shownLine)}`
    );
    check(
      "(d) all three sessions are open as tabs, so all three stream",
      tabs === 3,
      String(tabs)
    );
    check(
      "(d) a turn's end reads no context of a session nothing on screen shows",
      others.every((one) => per[one.slice(0, 8)] === 0),
      JSON.stringify(per)
    );
    check(
      "(d) the shown session's turn end reads its context once, and the answer lands in its details",
      per[id.slice(0, 8)] === 1 &&
        shownRead !== undefined &&
        answered.get(shownRead.requestId) === true &&
        READING.test(shownLine.at(-1) ?? ""),
      JSON.stringify({ per, shownLine })
    );

    // (e) A withdrawal waiting on the CLI mid-turn: a context read behind it
    // is answered within the dashboard's bound.
    const busy = others[0] as string;
    await fleet.send(busy, `${SLOW_TOOL} now`);
    await until(
      "the mock handing the session its long command",
      () =>
        fleet.seen.find(
          (seen) => seen.last.includes(SLOW_TOOL) && !seen.afterTool
        ),
      Boolean,
      120_000
    );
    // The command is running in the turn.
    await Bun.sleep(3000);
    const queued = await fleet.send(busy, "Words sent while it works.");
    // Handed to the machine (no longer owed on the hub), so the withdrawal
    // is the agent's to make (hub server.ts `withdrawPending`).
    const handed = await until(
      "the send handed to the machine",
      () => fleet.sendRow(queued),
      (sent) => sent !== undefined && sent.owed === null,
      20_000
    ).catch(() => fleet.sendRow(queued));
    await fleet.post({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "send.withdraw",
      machineId: MACHINE,
      sessionId: busy,
      payload: { instanceId: busy, sendId: queued },
    });
    await Bun.sleep(300);
    const readFrom = performance.now();
    const read = await fleet
      .controlAnswer("getContextUsage", [], 30_000, busy)
      .then((answer) => ({ ok: answer.ok, error: answer.error }))
      .catch((error: unknown) => ({ ok: false, error: String(error) }));
    const tookMs = Math.round(performance.now() - readFrom);
    const withdrawn = fleet.sendRow(queued);
    kit.note(
      `(e) the send read ${JSON.stringify(handed)} as it was withdrawn; the read behind the withdrawal answered ${JSON.stringify(read)} after ${tookMs} ms; the send reads ${JSON.stringify(withdrawn)}`
    );
    check(
      "(e) the withdrawn send had been handed to the machine",
      handed?.owed === null,
      JSON.stringify(handed)
    );
    check(
      "(e) a context read behind a pending withdrawal is answered within 15 s",
      read.ok && tookMs < 15_000,
      `${tookMs} ms, ${JSON.stringify(read)}`
    );

    // (f) The Sessions export writes each live session's current context:
    // read once while shown, then moved by a turn while nothing shows it.
    const moved = others[1] as string;
    const fourth = await kit.page("desk");
    await openDetails(fourth, base, moved);
    const before = (await watch(fourth, 20_000, (line) => READING.test(line)))
      .at(-1)
      ?.match(PERCENT)?.[1];
    // To Usage inside the app, so this tab keeps the reading it took.
    await fourth.evaluate(() => {
      const link = document.createElement("a");
      link.href = "/usage";
      document.body.append(link);
      link.click();
    });
    const exporter = fourth.getByRole("button", { name: "Export CSV" });
    await exporter.waitFor({ timeout: 60_000 });
    // The details card put away: nothing in this tab draws the session now.
    await fourth.keyboard.press("Escape");
    const unshown = await fourth
      .waitForSelector(CONTEXT, { state: "detached", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (
      !check(
        "(f) nothing in the tab draws the session's context before its turn",
        unshown,
        "the details card unmounted"
      )
    ) {
      return;
    }
    // A range that starts without an account's usage window (the scratch
    // account reports none), then its list read (WhereItGoes `view`): an
    // export before it is empty.
    await fourth.getByRole("tab", { name: "Today" }).click();
    const listed = await fourth
      .waitForFunction(
        () => {
          const card = document.querySelector(
            '[data-slot="where-it-goes-card"]'
          );
          return Boolean(
            card?.querySelector('[data-slot="list"]') ||
            card?.textContent?.includes("Nothing recorded in this range.")
          );
        },
        null,
        { timeout: 60_000 }
      )
      .then(() => true)
      .catch(() => false);
    if (
      !check(
        "(f) Usage's sessions list is read, so it can be exported",
        listed,
        await fourth.evaluate(
          () =>
            document
              .querySelector('[data-slot="where-it-goes-card"]')
              ?.textContent?.replace(/\s+/g, " ")
              .trim() ?? "(no card)"
        )
      )
    ) {
      return;
    }
    const sentAt = Date.now();
    await fleet.send(moved, BIG_TURN);
    // The turn reached the model, so "at rest" is after it, not before it opened.
    await until(
      "the mock answering the turn that fills the window",
      () =>
        fleet.seen.find(
          (seen) => seen.at >= sentAt && seen.last.includes(BIG_TURN)
        ),
      Boolean,
      120_000
    );
    await atRest(fleet, moved);
    const current = await fleet.controlAnswer(
      "getContextUsage",
      [],
      30_000,
      moved
    );
    const now = Math.round(
      (current.result as { percentage?: number } | undefined)?.percentage ?? -1
    );
    const [download] = await Promise.all([
      fourth.waitForEvent("download", { timeout: 60_000 }),
      exporter.click(),
    ]);
    const csvText = await readFile((await download.path()) as string, "utf8");
    const row = csvText
      .split("\n")
      .find((line) => line.startsWith('"Context reads, unseen 2"'));
    const exported = row?.split('","')[4] ?? null;
    kit.note(
      `(f) shown at ${before}%, then a turn while unshown; its reading now ${now}%; the export's row: ${row ?? `(none) in ${JSON.stringify(csvText)}`}`
    );
    check(
      "(f) the turn moved the session's reading",
      before !== undefined && Number(before) !== now,
      `${before}% then ${now}%`
    );
    check(
      "(f) the export's Context is the session's current reading",
      exported === `${now}%`,
      `exported ${exported}, current ${now}%`
    );
  },
};

/** A socket frame as JSON, or null. */
const parsed = (
  payload: string | Buffer
): {
  instanceId?: string;
  payload?: {
    kind?: string;
    method?: string;
    ok?: boolean;
    requestId?: string;
  };
  requestId?: string;
} | null => {
  try {
    return JSON.parse(String(payload));
  } catch {
    return null;
  }
};

export default spec;
