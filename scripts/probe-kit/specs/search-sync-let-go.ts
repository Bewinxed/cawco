/**
 * A search let go never stops the index's sync: the sync runs in the
 * index's writer (agent search/host.ts), a search in its reader, and only
 * the reader is killed when the hub stops waiting. The sync runs to its end,
 * and the next search answers inside the hub's window.
 *
 * 2026-11-05, obelisk (about 20 GB of transcripts): every `find` said
 * "obelisk-of-light: it didn't answer within 2 s", and the index was hours
 * behind. One process held both the sync and the searches; a search waited
 * up to a second for the sync it started, then queued behind the sync's
 * steps, and the hub let it go at its 1.5 s. Letting it go killed the
 * process, and the sync with it ("transcript index sync failed: search was
 * let go by its asker"), so no sync on a store that size ever finished.
 *
 * On a scratch fleet against the mock model, {@link TRANSCRIPTS} stored
 * Claude transcripts of {@link TRANSCRIPT_MB} MB and {@link LONG} of
 * {@link LONG_MB} MB are planted before the agent starts, so it comes up
 * catching up on them:
 * (a) mid-catch-up, its reader held (SIGSTOP, as a query inside
 *     `sqlite3_step()` holds it), the person's Find through the hub is let
 *     go at the hub's window: the reader is killed and another started, and
 *     the writer, the same process, syncs on;
 * (b) the catch-up runs to its end in that same writer, no sync failed, and
 *     the index answers a word only the long transcripts hold with each;
 * (c) a new {@link LONG_MB} MB transcript is planted, and once the index is
 *     older than a search's freshness the reader is held again and the
 *     person's Find asks: it starts the sync, waits its share, and is let go
 *     at the hub's window; that sync runs to its end in the same writer and
 *     takes the new transcript in;
 * (d) the next searches answer inside the hub's window, through the hub and
 *     directly, the slowest query of {@link QUERIES} said;
 * (e) a few turns appended to a transcript are found by the next search, its
 *     sync inside its share of the window;
 * (f) throughout, the agent's loop is never held a second.
 *
 *   bun scripts/probe-kit/run.ts search-sync-let-go
 */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import {
  TRANSCRIPT_ANSWER_MS,
  TRANSCRIPT_QUERY_MS,
  type TranscriptAnswer,
} from "../../../packages/core/src/find";
import { LATE_MS } from "../../../packages/core/src/loop-watch";
import { listedPid, signal } from "../../../packages/core/src/signal";
import { searchWords } from "../../../packages/core/src/words/search";
import { delay, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { running, theProcess } from "../search-processes";

/** Stored Claude transcripts on the machine. */
const TRANSCRIPTS = 100;
/** Each one's size. */
const TRANSCRIPT_MB = 4;
/** Long ones among them, as long sessions grow. */
const LONG = 4;
const LONG_MB = 90;
/** Made-up words the transcripts are written in: an index's work grows with the distinct terms it writes. */
const VOCABULARY = 40_000;
/** Words in each turn. */
const TURN_WORDS = 280;
/** A word only the planted long transcripts hold. */
const LONG_WORD = "quokkazebrafin";
/** A word only the transcript planted in (c) holds. */
const LATE_WORD = "wombatquillarc";
/** A word only the turns appended in (e) hold. */
const FEW_WORD = "pangolinvesper";
/** How far behind the transcripts a search may answer (agent search/index.ts `SEARCH_FRESH_MS`), and a second more. */
const STALE_MS = 11_000;
/** What a search's sync is given of the window (agent search/index.ts `SYNC_WAIT_MS`). */
const SYNC_SHARE_MS = TRANSCRIPT_ANSWER_MS - TRANSCRIPT_QUERY_MS - 200;
/** How long the index is given to take a backlog in. */
const INDEX_MS = 15 * 60_000;
/** How often the index is asked whether it has. */
const INDEX_LOOK_MS = 5000;
/** The agent's line for a stall (loop-watch.ts). */
const STALL = "[loop] the agent's loop was held";
/** The agent's line for a sync that failed (search/index.ts). */
const SYNC_FAILED = "[search] transcript index sync failed";
/** Searches timed in (d), each a word of the vocabulary or two. */
const QUERIES = 20;

/** {@link VOCABULARY} made-up words, five to ten letters each. */
const vocabulary = Array.from({ length: VOCABULARY }, () =>
  Array.from({ length: 5 + Math.floor(Math.random() * 6) }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26))
  ).join("")
);

/** A word of {@link vocabulary}, at random. */
const aWord = (): string =>
  vocabulary[Math.floor(Math.random() * VOCABULARY)] ?? "word";

/** One turn's words, drawn from {@link vocabulary}. */
const turnWords = (): string =>
  Array.from({ length: TURN_WORDS }, aWord).join(" ");

/** One line of a transcript: turn `at` of `sessionId`, saying `words`. */
const turnLine = (
  sessionId: string,
  cwd: string,
  at: number,
  words: string
): string => {
  const user = at % 2 === 0;
  return JSON.stringify({
    type: user ? "user" : "assistant",
    uuid: crypto.randomUUID(),
    parentUuid: null,
    sessionId,
    cwd,
    timestamp: new Date(Date.UTC(2026, 9, 1) + at * 1000).toISOString(),
    isSidechain: false,
    message: user
      ? { role: "user", content: `${at}: ${words}` }
      : {
          id: `msg_${sessionId}_${at}`,
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5",
          content: [{ type: "text", text: `${at}: ${words}` }],
          usage: { input_tokens: 10, output_tokens: 20 },
        },
  });
};

/** One stored transcript of about `mb` MB, its first turn saying `word` when given. */
const transcript = (
  sessionId: string,
  cwd: string,
  mb: number,
  word?: string
): string => {
  const lines: string[] = [];
  let size = 0;
  for (let at = 0; size < mb * 1024 * 1024; at += 1) {
    const line = turnLine(
      sessionId,
      cwd,
      at,
      `${at === 0 && word ? `${word} ` : ""}${turnWords()}`
    );
    lines.push(line);
    size += line.length + 1;
  }
  return `${lines.join("\n")}\n`;
};

/** The sessions a direct search's answer found. */
const sessionsOf = (answer: { result?: unknown }): Set<string> =>
  new Set(
    ((answer.result as TranscriptAnswer | undefined)?.conversations ?? []).map(
      (one) => one.sessionId
    )
  );

/** The person's Find through the hub: its answer, and the machine's coverage. */
const findViaHub = async (fleet: KitFleet, query: string) => {
  const at = performance.now();
  const answer = await fleet.api((hub) =>
    hub.api.find.get({ query: { q: query, limit: "20" } })
  );
  return {
    ms: Math.round(performance.now() - at),
    machine: answer.coverage.machines[0],
  };
};

/**
 * The reader held, the person's Find asks through the hub: it is let go at
 * the hub's window, the held reader killed. Answers what the hub said, how
 * long the reader took to go, and the reader started in its place.
 */
const letGoHeld = async (fleet: KitFleet, query: string) => {
  // The reader the last search left, open: no search is asked here, so the
  // person's Find is the one that finds the index stale and starts its sync.
  const reader = await theProcess(fleet.home, "read");
  signal(listedPid(reader), "SIGSTOP");
  const at = performance.now();
  const hub = await findViaHub(fleet, query);
  const gone = await until(
    "the held reader killed",
    async () => !(await running(reader)),
    (stopped) => stopped,
    10_000
  ).then(
    () => Math.round(performance.now() - at),
    () => Number.POSITIVE_INFINITY
  );
  const next = await theProcess(fleet.home, "read", reader);
  return { hub, gone, reader, next };
};

/** Asked until a direct search for `word` finds every one of `ids` and its index is whole, or {@link INDEX_MS} passes. */
const untilFound = async (fleet: KitFleet, word: string, ids: string[]) => {
  const began = Date.now();
  for (;;) {
    const asked = await fleet.controlAnswer(
      "searchTranscripts",
      [word, { limit: 20 }],
      60_000
    );
    const found = sessionsOf(asked);
    const whole =
      asked.ok &&
      (asked.result as TranscriptAnswer | undefined)?.catchingUp === false;
    if (
      (whole && ids.every((id) => found.has(id))) ||
      Date.now() - began > INDEX_MS
    ) {
      return {
        found: ids.filter((id) => found.has(id)).length,
        whole,
        ms: Date.now() - began,
      };
    }
    await delay(INDEX_LOOK_MS);
  }
};

/** The fleet's agent's transcripts, planted before it starts, and what it says from then on. */
interface Planted {
  agentLog: Awaited<ReturnType<KitFleet["logMark"]>>;
  cwd: string;
  fleet: KitFleet;
  ids: string[];
  long: string[];
  project: string;
  /** The index's writer as the agent came up: the one every leg expects still. */
  writer: number;
}

/** The fleet, its store planted, its agent up and catching up. */
const plant = async (kit: Kit): Promise<Planted> => {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  const cwd = fleet.workdir;
  const project = join(
    fleet.home,
    CLAUDE_DIR_NAME,
    "projects",
    "-probe-search-sync"
  );
  await mkdir(project, { recursive: true });
  const ids = Array.from({ length: TRANSCRIPTS + LONG }, () =>
    crypto.randomUUID()
  );
  for (const [at, id] of ids.entries()) {
    await writeFile(
      join(project, `${id}.jsonl`),
      at < LONG
        ? transcript(id, cwd, LONG_MB, LONG_WORD)
        : transcript(id, cwd, TRANSCRIPT_MB)
    );
  }
  kit.note(
    `${TRANSCRIPTS} stored transcripts of ${TRANSCRIPT_MB} MB and ${LONG} of ${LONG_MB} MB written under ${project}`
  );
  const agentLog = await fleet.logMark("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  const writer = await theProcess(fleet.home, "write");
  return {
    agentLog,
    cwd,
    fleet,
    ids,
    long: ids.slice(0, LONG),
    project,
    writer,
  };
};

/** The first line of `log` that says a sync failed, or that none did. */
const syncFailure = (log: string): string =>
  log.split("\n").find((line) => line.includes(SYNC_FAILED)) ??
  "no sync failed";

/** (a) and (b): mid-catch-up, a held reader let go; the catch-up runs to its end. */
const catchUp = async (kit: Kit, planted: Planted) => {
  const { check } = kit;
  const { agentLog, fleet, long, writer } = planted;
  const first = await fleet.controlAnswer("searchTranscripts", [
    LONG_WORD,
    { limit: 20 },
  ]);
  const midCatchUp =
    first.ok &&
    (first.result as TranscriptAnswer | undefined)?.catchingUp === true;
  const a = await letGoHeld(fleet, "fix the bug");
  const aLog = await agentLog.since();
  const writerRuns = await running(writer);
  check(
    `a: mid-catch-up, its reader held, the person's Find is let go at the hub's ${TRANSCRIPT_ANSWER_MS / 1000} s; the reader is killed and another started, and the writer syncs on, the same process`,
    midCatchUp &&
      a.hub.machine?.answered === false &&
      a.gone < TRANSCRIPT_ANSWER_MS + 1500 &&
      a.next !== a.reader &&
      writerRuns &&
      aLog.includes(searchWords.stopped(`search ${searchWords.letGo}`)) &&
      !aLog.includes(SYNC_FAILED),
    `catching up when asked: ${midCatchUp}; the hub answered in ${a.hub.ms} ms (${a.hub.machine?.reason ?? "answered"}); the reader killed ${a.gone} ms after; reader ${a.reader} → ${a.next}; writer ${writer} ${writerRuns ? "still runs" : "gone"}; ${syncFailure(aLog)}`
  );

  const b = await untilFound(fleet, LONG_WORD, long);
  const bLog = await agentLog.since();
  const writerNow = await theProcess(fleet.home, "write");
  check(
    `b: the catch-up runs to its end in the same writer, no sync failed, and the index answers a word only the ${LONG} long transcripts hold with each`,
    b.whole &&
      b.found === LONG &&
      writerNow === writer &&
      !bLog.includes(SYNC_FAILED),
    `${b.whole ? `whole after ${Math.round(b.ms / 1000)} s more` : `still catching up after ${Math.round(b.ms / 1000)} s`}; ${b.found} of ${LONG} found; writer ${writer} → ${writerNow}; ${syncFailure(bLog)}`
  );
};

/** (c) A search's own sync, its search let go. */
const ownSync = async (kit: Kit, planted: Planted) => {
  const { check } = kit;
  const { cwd, fleet, project, writer } = planted;
  const late = crypto.randomUUID();
  await writeFile(
    join(project, `${late}.jsonl`),
    transcript(late, cwd, LONG_MB, LATE_WORD)
  );
  await delay(STALE_MS);
  const log = await fleet.logMark("agent");
  const c = await letGoHeld(fleet, LATE_WORD);
  const lateFound = await untilFound(fleet, LATE_WORD, [late]);
  const said = await log.since();
  const writerAfter = await theProcess(fleet.home, "write");
  check(
    `c: a new ${LONG_MB} MB transcript planted and the index stale, the person's Find starts a sync and is let go at the hub's window with its reader held; that sync runs to its end in the same writer and takes the new transcript in`,
    c.hub.machine?.answered === false &&
      c.next !== c.reader &&
      lateFound.found === 1 &&
      writerAfter === writer &&
      said.includes(searchWords.stopped(`search ${searchWords.letGo}`)) &&
      !said.includes(SYNC_FAILED),
    `the hub answered in ${c.hub.ms} ms (${c.hub.machine?.reason ?? "answered"}); reader ${c.reader} → ${c.next}; the new transcript ${lateFound.found === 1 ? `found ${Math.round(lateFound.ms / 1000)} s later` : "never found"}; writer ${writer} → ${writerAfter}; ${syncFailure(said)}`
  );
};

/** (d) The next searches answer inside the window. */
const inWindow = async (kit: Kit, planted: Planted) => {
  const { fleet } = planted;
  const viaHub = await findViaHub(fleet, LATE_WORD);
  const timed: { error?: string; ms: number; queryMs: number }[] = [];
  for (let at = 0; at < QUERIES; at += 1) {
    const query = at % 2 === 0 ? aWord() : `${aWord()} ${aWord()}`;
    const began = performance.now();
    const asked = await fleet.controlAnswer("searchTranscripts", [
      query,
      { limit: 20 },
    ]);
    timed.push({
      ...(asked.ok ? {} : { error: `${query}: ${asked.error}` }),
      ms: performance.now() - began,
      queryMs: asked.ok
        ? (asked.result as TranscriptAnswer).queryMs
        : Number.POSITIVE_INFINITY,
    });
  }
  const slowest = Math.round(Math.max(...timed.map((one) => one.ms)));
  const slowestQuery = Math.max(...timed.map((one) => one.queryMs));
  kit.check(
    `d: the next searches answer inside the hub's ${TRANSCRIPT_ANSWER_MS / 1000} s, through the hub and directly, each query inside ${TRANSCRIPT_QUERY_MS} ms`,
    viaHub.machine?.answered === true &&
      viaHub.ms < TRANSCRIPT_ANSWER_MS &&
      slowest < TRANSCRIPT_ANSWER_MS &&
      slowestQuery < TRANSCRIPT_QUERY_MS,
    `the hub's Find ${viaHub.machine?.answered ? "answered" : `not answered (${viaHub.machine?.reason})`} in ${viaHub.ms} ms (machine ${viaHub.machine?.tookMs} ms); ${QUERIES} direct searches, the slowest ${slowest} ms, its slowest query ${slowestQuery} ms; ${
      timed.flatMap((one) => (one.error ? [one.error] : [])).join("; ") ||
      "none refused"
    }`
  );
};

/** (e) A few turns appended: the next search finds them, its sync quick. */
const fewTurns = async (kit: Kit, planted: Planted) => {
  const { cwd, fleet, ids, project } = planted;
  const grown = ids[LONG] ?? "";
  await appendFile(
    join(project, `${grown}.jsonl`),
    `${[0, 1, 2, 3]
      .map((at) =>
        turnLine(grown, cwd, 100_000 + at, `${FEW_WORD} ${turnWords()}`)
      )
      .join("\n")}\n`
  );
  await delay(STALE_MS);
  const began = performance.now();
  const few = await fleet.controlAnswer("searchTranscripts", [
    FEW_WORD,
    { limit: 20 },
  ]);
  const fewMs = Math.round(performance.now() - began);
  const answer = few.result as TranscriptAnswer | undefined;
  const found = sessionsOf(few).has(grown);
  kit.check(
    `e: four turns appended to a ${TRANSCRIPT_MB} MB transcript, the next search syncs them inside its ${SYNC_SHARE_MS} ms share and finds them, inside the hub's window`,
    found &&
      (answer?.syncMs ?? Number.POSITIVE_INFINITY) < SYNC_SHARE_MS &&
      fewMs < TRANSCRIPT_ANSWER_MS,
    `${found ? "found" : "not found"} in ${fewMs} ms (sync ${answer?.syncMs} ms, query ${answer?.queryMs} ms)`
  );
};

export default {
  group: "Speed",
  name: "search-sync-let-go",
  run: async (kit: Kit) => {
    const planted = await plant(kit);
    await catchUp(kit, planted);
    await ownSync(kit, planted);
    await inWindow(kit, planted);
    await fewTurns(kit, planted);
    const stalls = (await planted.agentLog.since())
      .split("\n")
      .filter((line) => line.includes(STALL));
    kit.check(
      `f: throughout, the agent's loop is never held ${LATE_MS / 1000} s`,
      stalls.length === 0,
      stalls.join("\n") || "no stall"
    );
  },
} satisfies Spec;
