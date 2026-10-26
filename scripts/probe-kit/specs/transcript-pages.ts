/**
 * Opening a stored session of hundreds of megabytes, and paging back through
 * it, costs its machine and the hub the page and never the file: on a
 * scratch fleet (real hub, agent and sessiond), a Claude Code transcript of
 * {@link BIG_MB} MB written as the CLI writes it (claude-transcripts.ts), or
 * the copy `CAWCO_TRANSCRIPT` names, opened through the hub's page route by
 * its stored key, as the dashboard opens it.
 *
 * (a) The newest page answers within {@link FIRST_MS}; what the agent
 *     answers the hub for it (the newest window the hub asks,
 *     server.ts `HISTORY_WINDOW`) is at most {@link FIRST_SOCKET_MB} MB, and
 *     neither the agent nor the hub grew by {@link FIRST_RSS_MB} MB or more.
 * (b) Paging back {@link PAGES} pages, the pages walk back through the
 *     conversation without a block twice. One of them reads past the
 *     newest window the hub holds and has the agent build the file's line
 *     index (which page depends on how many pages that window holds): it
 *     answers within {@link SCAN_MS}, and every other within
 *     {@link PAGE_MS}.
 *     Every picture a page names is served.
 * (c) Meanwhile the hub's loop answers `/health` within {@link HEALTH_MS},
 *     and the agent says no stall of its loop (loop-watch.ts).
 *
 * (d) An OpenCode session of {@link OC_TURNS} turns, read through the same
 *     window protocol from its server's history a page at a time, newest
 *     back and oldest on, joins to the whole conversation, entry for entry.
 *
 * What each costs is said as a note, for the host's run on a real copy.
 *
 *   bun scripts/probe-kit/run.ts transcript-pages
 *   CAWCO_TRANSCRIPT=<copy of a session .jsonl> bun scripts/probe-kit/run.ts transcript-pages
 */
import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  CONTROL_READ_TRANSCRIPT_WINDOW,
  type SessionMessage,
  type TranscriptPage,
  type TranscriptWindow,
  type WindowAsk,
} from "../../../packages/core/src";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import { delay, until } from "../../scratch-fleet";
import { writeClaudeTranscript } from "../claude-transcripts";
import type { Kit, KitFleet, Spec } from "../kit";

const BIG_MB = 406;
const FIRST_MS = 3000;
const FIRST_SOCKET_MB = 32;
const FIRST_RSS_MB = 200;
const PAGES = 12;
const PAGE_MS = 1500;
/** The page whose read builds the agent's line index: a scan of the whole file, yielding as it goes. */
const SCAN_MS = 3000;
const HEALTH_MS = 250;
/** The OpenCode session's turns. */
const OC_TURNS = 7;
/** Its windows: small, so each is a few messages and the walk crosses pages of its history. */
const OC_WINDOW = 3;
/** The window the hub asks for (server.ts `HISTORY_WINDOW`). */
const HISTORY_WINDOW = 300;
/** A process's folder name under /proc. */
const PID = /^\d+$/u;
/** Its resident memory, in /proc's status. */
const VM_RSS = /VmRSS:\s+(\d+)/u;
/** The agent's first memory line, said once its first usage scan and search sync end (daemon.ts `logMemory`). */
const FIRST_SCANS_ENDED = "memory rss=";
/** A stored picture's address on a page (media.ts). */
const MEDIA_URL = /\/api\/media\/[a-f0-9]{64}\.(?:png|jpg|gif|webp)/gu;
/** The agent's line for a stall (loop-watch.ts). */
const STALL = "[loop] the agent's loop was held";

/** The pids of the fleet's `role` (its entry script under this fleet's HOME). */
const pidsOf = async (fleet: KitFleet, entry: string): Promise<number[]> => {
  const pids: number[] = [];
  for (const name of await readdir("/proc")) {
    if (!PID.test(name)) {
      continue;
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one process at a time
      const command = await readFile(`/proc/${name}/cmdline`, "utf8");
      const environ = await readFile(`/proc/${name}/environ`, "utf8");
      if (
        command.includes(entry) &&
        environ.split("\0").includes(`HOME=${fleet.home}`)
      ) {
        pids.push(Number(name));
      }
    } catch {
      // gone, or not ours
    }
  }
  return pids;
};

/** A process's resident memory, MB. */
const rssOf = async (pid: number): Promise<number> => {
  const status = await readFile(`/proc/${pid}/status`, "utf8");
  return Number(VM_RSS.exec(status)?.[1] ?? 0) / 1024;
};

/** `read`, with its time, the agent's and hub's peak memory growth, and the hub's slowest `/health`. */
const watched = async <T>(
  fleet: KitFleet,
  agent: number,
  hub: number,
  read: () => Promise<T>
) => {
  const [agentBefore, hubBefore] = [await rssOf(agent), await rssOf(hub)];
  let agentPeak = agentBefore;
  let hubPeak = hubBefore;
  let health = 0;
  const sampler = new AbortController();
  const sampling = (async () => {
    while (!sampler.signal.aborted) {
      const asked = performance.now();
      // biome-ignore lint/performance/noAwaitInLoops: one look at a time
      await fetch(`${fleet.base}/health`).catch(() => undefined);
      health = Math.max(health, performance.now() - asked);
      agentPeak = Math.max(agentPeak, await rssOf(agent));
      hubPeak = Math.max(hubPeak, await rssOf(hub));
      await Bun.sleep(25);
    }
  })();
  const began = performance.now();
  const value = await read();
  const ms = performance.now() - began;
  sampler.abort();
  await sampling;
  return {
    value,
    ms,
    agentGrewMb: agentPeak - agentBefore,
    hubGrewMb: hubPeak - hubBefore,
    healthMs: health,
  };
};

const said = (cost: Awaited<ReturnType<typeof watched>>): string =>
  `${Math.round(cost.ms)} ms; agent grew ${Math.round(cost.agentGrewMb)} MB, hub ${Math.round(cost.hubGrewMb)} MB at peak; slowest /health ${Math.round(cost.healthMs)} ms`;

/** (d) An OpenCode conversation's windows, walked both ways. */
const openCodeWindows = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  const instanceId = await fleet.spawn("opencode", "Paged", fleet.workdir);
  const keyOf = () =>
    fleet.query<{ session_id: string | null }>(
      "SELECT session_id FROM instances WHERE id = ?",
      instanceId
    )[0]?.session_id ?? undefined;
  const ask = async (method: string, args: unknown[]) => {
    const answer = await fleet.controlAnswer(
      method,
      args,
      60_000,
      undefined,
      "opencode"
    );
    if (!answer.ok) {
      throw new Error(`${method}: ${answer.error}`);
    }
    return answer.result;
  };
  const whole = async (): Promise<SessionMessage[]> => {
    const key = keyOf();
    return key
      ? ((await ask("getSessionMessages", [
          key,
          { dir: fleet.workdir, whole: true },
        ])) as SessionMessage[])
      : [];
  };
  for (let turn = 1; turn <= OC_TURNS; turn += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one turn after another
    await fleet.send(instanceId, `Paged turn ${turn}`);
    await until(
      `OpenCode turn ${turn} stored`,
      whole,
      (entries) =>
        entries.filter((entry) => entry.type === "assistant").length >= turn,
      120_000
    );
  }
  // Read once the last turn is over and its server has finished writing it:
  // an assistant message is stored before its last parts and tokens are, so
  // a read in between differs from the next one.
  await until(
    "the last OpenCode turn over",
    () => fleet.instance(instanceId),
    (row) => row?.turn_open_at === null,
    120_000
  );
  const key = keyOf() as string;
  let all = await whole();
  for (let settled = 0; settled < 10; settled += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each read is compared with the one before it
    const again = await delay(500).then(whole);
    if (JSON.stringify(again) === JSON.stringify(all)) {
      break;
    }
    all = again;
  }
  const window = (asked: WindowAsk) =>
    ask(CONTROL_READ_TRANSCRIPT_WINDOW, [
      key,
      { dir: fleet.workdir, window: asked },
    ]) as Promise<TranscriptWindow>;
  const back: TranscriptWindow[] = [
    await window({ end: "newest", limit: OC_WINDOW }),
  ];
  for (let older = back[0]?.older ?? null; older !== null;) {
    // biome-ignore lint/performance/noAwaitInLoops: each window names the one before it
    const one = await window({ before: older, limit: OC_WINDOW });
    back.push(one);
    ({ older } = one);
  }
  const on: TranscriptWindow[] = [
    await window({ start: null, limit: OC_WINDOW }),
  ];
  for (let newer = on[0]?.newer ?? null; newer !== null;) {
    // biome-ignore lint/performance/noAwaitInLoops: each window names the next
    const one = await window({ start: newer, limit: OC_WINDOW });
    on.push(one);
    ({ newer } = one);
  }
  const same = (windows: TranscriptWindow[]) =>
    JSON.stringify(windows.flatMap((one) => one.entries)) ===
    JSON.stringify(all);
  kit.check(
    `d: an OpenCode session of ${OC_TURNS} turns (${all.length} entries) read in ${back.length} windows newest back, and ${on.length} oldest on, joins to the whole conversation`,
    back.length > 1 && on.length > 1 && same(back.toReversed()) && same(on),
    differing(back.toReversed(), all) ?? differing(on, all)
  );
};

/** The first entry `windows` hold otherwise than `all`, both ways round, for a failure's detail. */
const differing = (
  windows: TranscriptWindow[],
  all: SessionMessage[]
): string | undefined => {
  const joined = windows.flatMap((one) => one.entries);
  if (joined.length !== all.length) {
    return `${joined.length} entries in the windows, ${all.length} whole`;
  }
  const at = joined.findIndex(
    (entry, i) => JSON.stringify(entry) !== JSON.stringify(all[i])
  );
  return at < 0
    ? undefined
    : `entry ${at}: windows ${JSON.stringify(joined[at])} / whole ${JSON.stringify(all[at])}`;
};

export default {
  group: "Speed",
  name: "transcript-pages",
  run: async (kit: Kit) => {
    const { check, note } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    const project = join(
      fleet.home,
      CLAUDE_DIR_NAME,
      "projects",
      "-probe-transcript-pages"
    );
    await mkdir(project, { recursive: true });
    const key = "00000000-0000-4000-8000-000000000406";
    const file = join(project, `${key}.jsonl`);
    const copy = process.env.CAWCO_TRANSCRIPT;
    if (copy) {
      await copyFile(copy, file);
      note(`a copy of ${copy}`);
    } else {
      const made = writeClaudeTranscript(file, {
        bytes: BIG_MB * 1024 * 1024,
        compactEvery: 400,
        seed: 406,
        sessionId: key,
        cwd: fleet.workdir,
      });
      note(
        `a ${Math.round(made.bytes / 1024 / 1024)} MB transcript of ${made.turns} turns written`
      );
    }
    const agentLog = await fleet.logMark("agent");
    fleet.launch("agent");
    await fleet.agentUp();
    const [agent] = await pidsOf(fleet, "packages/agent/src/cli.ts");
    const [hub] = await pidsOf(fleet, "packages/hub/src/index.ts");
    if (agent === undefined || hub === undefined) {
      check(
        "the fleet's agent and hub are found",
        false,
        `agent ${agent}, hub ${hub}`
      );
      return;
    }
    // An agent's start reads every transcript on its machine whole, once:
    // its usage scan and its search index's first sync (daemon.ts), each
    // the file's every byte, and the page that builds the line index ran
    // beside both (r347: 3.2 s, the index alone 1.2 s). They end with its
    // first memory line; what is measured here is paging after them.
    const started = performance.now();
    await until(
      "the agent's first usage scan and search sync ended",
      () => agentLog.since(),
      (log) => log.includes(FIRST_SCANS_ENDED),
      300_000
    );
    note(
      `the agent's first usage scan and search sync of the stored ${Math.round((await stat(file)).size / 1024 / 1024)} MB ended ${Math.round(performance.now() - started)} ms after it was up`
    );
    const pageOf = (cursor?: string) =>
      fleet.api<TranscriptPage>(
        `/api/instances/${key}/transcript?limit=60${cursor ? `&before=${encodeURIComponent(cursor)}` : ""}`
      );

    const first = await watched(fleet, agent, hub, () => pageOf());
    note(`a: the newest page: ${said(first)}`);
    // What crossed the socket for it: the window the hub asked, asked again.
    const answer = await fleet.controlAnswer(
      CONTROL_READ_TRANSCRIPT_WINDOW,
      [
        key,
        {
          dir: fleet.workdir,
          window: { end: "newest", limit: HISTORY_WINDOW },
        },
      ],
      60_000,
      undefined,
      "claude"
    );
    const answerMb =
      Buffer.byteLength(JSON.stringify(answer.result ?? null)) / 1024 / 1024;
    check(
      `a: the newest page of the stored session (${first.value.blocks.length} blocks) answers in ${Math.round(first.ms)} ms (≤ ${FIRST_MS}), the agent answered the hub ${answerMb.toFixed(1)} MB for it (≤ ${FIRST_SOCKET_MB}), the agent grew ${Math.round(first.agentGrewMb)} MB and the hub ${Math.round(first.hubGrewMb)} MB (< ${FIRST_RSS_MB})`,
      answer.ok &&
        first.value.blocks.length > 0 &&
        first.ms <= FIRST_MS &&
        answerMb <= FIRST_SOCKET_MB &&
        first.agentGrewMb < FIRST_RSS_MB &&
        first.hubGrewMb < FIRST_RSS_MB
    );

    const seen = new Set(first.value.blocks.map((block) => block.id));
    let before = first.value.cursor;
    let twice = 0;
    const times: number[] = [];
    let pages = 0;
    let health = first.healthMs;
    const pictures = new Set(
      JSON.stringify(first.value).match(MEDIA_URL) ?? []
    );
    for (let at = 0; at < PAGES && before !== null; at += 1) {
      const cursor: string = before;
      // biome-ignore lint/performance/noAwaitInLoops: each page names the next
      const older = await watched(fleet, agent, hub, () => pageOf(cursor));
      note(`b: page ${at + 2}: ${said(older)}`);
      times.push(older.ms);
      health = Math.max(health, older.healthMs);
      for (const block of older.value.blocks) {
        twice += seen.has(block.id) ? 1 : 0;
        seen.add(block.id);
      }
      for (const url of JSON.stringify(older.value).match(MEDIA_URL) ?? []) {
        pictures.add(url);
      }
      pages += 1;
      before = older.value.cursor;
    }
    // The index is built once, so one page at most pays for it: the slowest.
    const [scan = 0, slowest = 0] = times.toSorted((x, y) => y - x);
    check(
      `b: ${pages} older pages walk back with no block twice; the one that built the line index answered in ${Math.round(scan)} ms (≤ ${SCAN_MS}), every other in ${Math.round(slowest)} ms or less (≤ ${PAGE_MS})`,
      pages > 0 && twice === 0 && scan <= SCAN_MS && slowest <= PAGE_MS,
      `${twice} block(s) twice`
    );
    // The pictures the pages named, each asked as the page shows it, the
    // moment it is named: one whose file is still being written is served
    // from what the hub holds of it (media.ts `writing`).
    const served = await Promise.all(
      [...pictures].map(
        async (url) => (await fetch(`${fleet.base}${url}`)).status
      )
    );
    check(
      `b: the ${pictures.size} picture(s) the pages name are each served`,
      served.every((code) => code === 200),
      served.join(", ")
    );
    const stalls = (await agentLog.since())
      .split("\n")
      .filter((line) => line.includes(STALL));
    await openCodeWindows(kit, fleet);
    check(
      `c: the hub answered /health within ${Math.round(health)} ms throughout (≤ ${HEALTH_MS}), and the agent's loop was never held`,
      health <= HEALTH_MS && stalls.length === 0,
      stalls.join("\n")
    );
  },
} satisfies Spec;
