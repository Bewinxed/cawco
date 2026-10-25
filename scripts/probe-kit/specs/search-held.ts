/**
 * No transcript search holds the agent: a search runs in the agent's search
 * process (agent search/process.ts), which a question past its limit, or one
 * the hub lets go, ends with SIGKILL; the agent answers everything else
 * meanwhile, and the next search is answered by the process started in its
 * place.
 *
 * 2026-10-25, obelisk: the agent's main thread was held 26 minutes inside
 * "search index: query" (jsonl-parser fts5.ts), four hangs in ten minutes,
 * each taking the machine's sessions with it. Agents' `find` asked long
 * queries; every word required, they matched almost only the hub's
 * summariser prompts (whole transcripts quoted in one turn, up to 739 KB),
 * and FTS5's `snippet()` over those is quadratic in their matches: a 34-word
 * query took 87 s.
 *
 * On a scratch fleet whose agent holds a copy of that index (`--index`, a
 * `VACUUM INTO` copy of obelisk's, 1.47M documents; copied again for each
 * run, since the agent writes it), with the agent's busy probe and a stored
 * session listing (its stores thread) asked every {@link PROBE_EVERY_MS}
 * from start to end:
 * (a) the 34-word query that took 87 s answers, as an agent's `find` asks it
 *     and as the person's Find does through the hub, inside the hub's 1.5 s;
 * (b) its search process held (SIGSTOP, as a thread inside `sqlite3_step()`
 *     holds it: nothing it is sent is answered), a search is refused at its
 *     limit and the process killed; another opens the index;
 * (c) that one held, the person's Find asks through the hub, which stops
 *     waiting at its 1.5 s and tells the agent, which kills the process long
 *     before the limit; the hub's log names who asked;
 * (c2) the third held, a Find the browser drops (the person typed on) is
 *     stopped on the machine at once, before the hub's own 1.5 s;
 * (d) a search answers again;
 * (e) throughout, every busy probe and every listing answered under
 *     {@link ANSWER_MS}.
 *
 *   bun scripts/probe-kit/run.ts search-held --index <copy of transcript-index.db>
 */
import { copyFile, mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { READ_LIMIT_MS } from "../../../packages/agent/src/search/process";
import type {
  FindAnswer,
  TranscriptAnswer,
} from "../../../packages/core/src/find";
import { listedPid, signal } from "../../../packages/core/src/signal";
import { searchWords } from "../../../packages/core/src/words/search";
import { delay, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const args = process.argv.slice(2);
const PID = /^\d+$/;
/** The search process, run from source or as the binary's verb. */
const SEARCH_HOST = /search\/host\.ts|search-host/;
const INDEX = args[args.indexOf("--index") + 1];
/** The query that took 87 s on main (an agent's `find`, its words as the hub splits them). */
const Q34 =
  "what did the owner say about the way the find tool and the search index should work when it is slow or when the hub has to wait for an answer from a machine";
/** How an agent's `find` asks a machine (hub find-tool.ts). */
const AS_FIND_TOOL = { limit: 50, toolOutput: true, context: true };
/** How often the busy probe and the listing are asked. */
const PROBE_EVERY_MS = 100;
/** The bar for each: the brief's. */
const ANSWER_MS = 1000;
/** When the person's next keystroke drops the Find the browser asked, ms. */
const SUPERSEDED_AFTER_MS = 300;
/** The hub's window on a machine's search (hub find.ts `TRANSCRIPT_ANSWER_MS`). */
const HUB_WINDOW_MS = 1500;

/** The agent's search processes, by the fleet's HOME in their environment. */
const searchProcesses = async (home: string): Promise<number[]> => {
  const found: number[] = [];
  for (const entry of await readdir("/proc")) {
    if (!PID.test(entry)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one process's files at a time
    const read = await Promise.all([
      readFile(`/proc/${entry}/cmdline`, "utf8"),
      readFile(`/proc/${entry}/environ`, "utf8"),
    ]).catch(() => null);
    if (
      read &&
      SEARCH_HOST.test(read[0]) &&
      read[1].split("\0").includes(`HOME=${home}`)
    ) {
      found.push(Number(entry));
    }
  }
  return found;
};

/** The one search process, once it is there. */
const theProcess = (home: string, not?: number) =>
  until(
    "the agent's search process",
    async () => (await searchProcesses(home)).filter((pid) => pid !== not),
    (pids) => pids.length === 1
  ).then((pids) => pids[0] as number);

/** Whether `pid` still runs: there, and not a zombie its parent has yet to reap. */
const running = async (pid: number): Promise<boolean> => {
  const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "");
  // The state follows the command's closing parenthesis: "1234 (bun) S …".
  const state = stat.slice(
    stat.lastIndexOf(")") + 2,
    stat.lastIndexOf(")") + 3
  );
  return state !== "" && state !== "Z" && state !== "X";
};

/** The busy probe and the stores thread's listing, asked every {@link PROBE_EVERY_MS} until stopped: each answer's time. */
const probing = (fleet: KitFleet) => {
  const times = { busy: [] as number[], listing: [] as number[] };
  const failed: string[] = [];
  let on = true;
  const ask = async (kind: "busy" | "listing") => {
    while (on) {
      const at = performance.now();
      // biome-ignore lint/performance/noAwaitInLoops: one probe at a time, each timed
      const answer = await fleet
        .controlAnswer(
          kind === "busy" ? "agentBusy" : "listSessions",
          kind === "busy" ? [] : [{}],
          30_000
        )
        .catch((error: unknown) => ({ ok: false, error: String(error) }));
      times[kind].push(performance.now() - at);
      if (!answer.ok) {
        failed.push(`${kind}: ${answer.error}`);
      }
      await delay(PROBE_EVERY_MS);
    }
  };
  const done = Promise.all([ask("busy"), ask("listing")]);
  return {
    times,
    failed,
    stop: async () => {
      on = false;
      await done;
    },
  };
};

const worst = (times: number[]) => Math.round(Math.max(0, ...times));

export default {
  name: "search-held",
  run: async (kit: Kit) => {
    const { check } = kit;
    if (!INDEX || INDEX.startsWith("--")) {
      throw new Error(
        "search-held reads a copy of a machine's transcript index: --index <path>"
      );
    }
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    const dataDir = join(fleet.home, ".local", "share", "cawco");
    await mkdir(dataDir, { recursive: true });
    await copyFile(INDEX, join(dataDir, "transcript-index.db"));
    kit.note(`${INDEX} copied into the fleet's HOME`);
    fleet.launch("agent");
    await fleet.agentUp();
    const search = (query: string, options: object, ms = 30_000) =>
      fleet.controlAnswer("searchTranscripts", [query, options], ms);
    // The index opened and synced once (the fleet's own transcripts: none).
    await until(
      "the index answers",
      () => search("the", { limit: 5 }),
      (answer) => answer.ok
    );
    const agentLog = await fleet.logMark("agent");
    const hubLog = await fleet.logMark("hub");
    const probes = probing(fleet);

    // (a) The query that took 87 s.
    let at = performance.now();
    const direct = await search(Q34, AS_FIND_TOOL);
    const directMs = performance.now() - at;
    at = performance.now();
    const viaHub = await fleet.api<FindAnswer>(
      `/api/find?q=${encodeURIComponent(Q34)}&limit=20`
    );
    const viaHubMs = performance.now() - at;
    const [hubCoverage] = viaHub.coverage.machines;
    check(
      `a: the 34-word query that held main's agent 87 s answers as an agent's find asks it and through the hub's Find, each inside the hub's ${HUB_WINDOW_MS / 1000} s`,
      direct.ok &&
        Array.isArray((direct.result as TranscriptAnswer).conversations) &&
        directMs < HUB_WINDOW_MS &&
        hubCoverage?.answered === true,
      `find tool's shape: ${direct.ok ? `${(direct.result as TranscriptAnswer).conversations.length} conversations, query ${(direct.result as TranscriptAnswer).queryMs} ms` : direct.error} in ${Math.round(directMs)} ms; the hub's Find: ${hubCoverage?.answered ? "answered" : `not answered (${hubCoverage?.reason})`} in ${Math.round(viaHubMs)} ms (machine ${hubCoverage?.tookMs} ms)`
    );

    // (b) Held: refused at its limit, the process killed, another opened.
    const held = await theProcess(fleet.home);
    signal(listedPid(held), "SIGSTOP");
    at = performance.now();
    const refused = await search("fix the bug", { limit: 20 });
    const refusedMs = performance.now() - at;
    const after = await theProcess(fleet.home, held);
    const heldRuns = await running(held);
    check(
      `b: its search process held, a search is refused at its ${READ_LIMIT_MS / 1000} s limit, that process is killed and another opens the index`,
      !refused.ok &&
        (refused.error ?? "").includes(
          searchWords.pastLimit(READ_LIMIT_MS / 1000)
        ) &&
        refusedMs >= READ_LIMIT_MS - 100 &&
        refusedMs < READ_LIMIT_MS + 1500 &&
        !heldRuns &&
        after !== held,
      `${refused.ok ? "answered" : `refused: "${refused.error}"`} after ${Math.round(refusedMs)} ms; process ${held} ${heldRuns ? "still runs" : "gone"}, now ${after}`
    );

    // (c) Held again, the person's Find through the hub: it stops waiting,
    // tells the agent, and the agent kills the process before the limit.
    // Held once it has opened the index, as a query holds it.
    await until(
      "the new process answers",
      () => search("the", { limit: 5 }),
      (answer) => answer.ok
    );
    signal(listedPid(after), "SIGSTOP");
    at = performance.now();
    const abandoned = await fleet.api<FindAnswer>(
      "/api/find?q=fix%20the%20bug&limit=20"
    );
    const abandonedMs = performance.now() - at;
    const gone = await until(
      "the held process killed",
      async () => !(await running(after)),
      (stopped) => stopped,
      READ_LIMIT_MS
    ).then(
      () => performance.now() - at,
      () => Number.POSITIVE_INFINITY
    );
    await delay(500);
    const agentSaid = await agentLog.since();
    const hubSaid = await hubLog.since();
    const hubLine = hubSaid
      .split("\n")
      .find((line) =>
        line.includes(
          "didn't answer searchTranscripts for the dashboard's Find"
        )
      );
    check(
      "c: held again, the hub's Find stops waiting at its 1.5 s and tells the agent, which kills the process before its limit; the hub's log names who asked",
      abandoned.coverage.machines[0]?.answered === false &&
        abandonedMs < HUB_WINDOW_MS + 1000 &&
        gone < READ_LIMIT_MS - 1000 &&
        agentSaid.includes(
          searchWords.stopped(`search ${searchWords.letGo}`)
        ) &&
        hubLine !== undefined,
      `the hub answered in ${Math.round(abandonedMs)} ms (${abandoned.coverage.machines[0]?.reason}); the process killed ${Number.isFinite(gone) ? `${Math.round(gone)} ms` : "never"} after the ask; hub: ${hubLine?.trim() ?? "no line naming the caller"}`
    );

    // (c2) Held again, the person types on: the browser drops the request,
    // and the hub tells the agent at once, inside its own 1.5 s.
    const third = await theProcess(fleet.home, after);
    await until(
      "the third process answers",
      () => search("the", { limit: 5 }),
      (answer) => answer.ok
    );
    signal(listedPid(third), "SIGSTOP");
    const typedOn = new AbortController();
    at = performance.now();
    const dropped = fetch(`${fleet.base}/api/find?q=fix%20the%20bug&limit=20`, {
      signal: typedOn.signal,
    }).catch(() => "dropped");
    await delay(SUPERSEDED_AFTER_MS);
    typedOn.abort();
    await dropped;
    const killedAfter = await until(
      "the superseded search's process killed",
      async () => !(await running(third)),
      (stopped) => stopped,
      READ_LIMIT_MS
    ).then(
      () => performance.now() - at,
      () => Number.POSITIVE_INFINITY
    );
    check(
      `c2: held again, a Find the browser drops after ${SUPERSEDED_AFTER_MS} ms (a newer keystroke) is stopped on the machine before the hub's own ${HUB_WINDOW_MS / 1000} s`,
      killedAfter < HUB_WINDOW_MS,
      `the process killed ${Number.isFinite(killedAfter) ? `${Math.round(killedAfter)} ms` : "never"} after the ask`
    );

    // (d) The work carries on.
    await theProcess(fleet.home, third);
    at = performance.now();
    const again = await search("fix the bug", { limit: 20 });
    check(
      "d: a search answers again, from the process started in their place",
      again.ok && (again.result as TranscriptAnswer).conversations.length > 0,
      again.ok
        ? `${(again.result as TranscriptAnswer).conversations.length} conversations in ${Math.round(performance.now() - at)} ms`
        : String(again.error)
    );

    await probes.stop();
    check(
      `e: throughout, every busy probe and every stored-session listing answered under ${ANSWER_MS} ms`,
      worst(probes.times.busy) < ANSWER_MS &&
        worst(probes.times.listing) < ANSWER_MS &&
        probes.failed.length === 0,
      `${probes.times.busy.length} busy probes, the worst ${worst(probes.times.busy)} ms; ${probes.times.listing.length} listings, the worst ${worst(probes.times.listing)} ms; ${probes.failed.slice(0, 3).join("; ") || "none failed"}`
    );
  },
} satisfies Spec;
