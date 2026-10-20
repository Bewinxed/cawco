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
 *
 *   bun scripts/probe-kit/run.ts context-read-slow
 */
import type { Page } from "playwright-core";
import { signal } from "../../../packages/core/src/signal";
import { MACHINE, until } from "../../scratch-fleet";
import { type KitFleet, open, type Spec } from "../kit";

/** The details' context line: a reading ("Context 2% · 3k/200k"), "Reading…", or why there is none. */
const CONTEXT = ".session-details-popover .stats .context";
const READING = /^Context \d+% · /;
const OFFLINE = /may be offline/i;

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
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["done"] }));
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
  },
};

export default spec;
