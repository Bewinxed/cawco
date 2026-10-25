/**
 * `find` reads what the machines' transcript indexes hold, never a session's
 * stored transcript (hub find-tool.ts), on a scratch fleet (real hub, agent
 * and sessiond; Claude Code against the mock model).
 *
 * Seeded: a session where the person types a sentence of their own, with a
 * made-up password in it far from the word "password"; a second session
 * handed the hub's summariser prompt (hub continuation.ts
 * `summariserPrompt`) that quotes the same sentence; a third handed it
 * too, then made the hub's own summariser (its row's kind `summariser`, as
 * a continuation's `summariserRun` starts one). Then the first
 * session's stored transcript loses the person's turn (its line cut out, as
 * a compaction or an account move leaves a transcript), and the machine's
 * agent restarts.
 *
 * a. `find` with `by: "person"` answers the person's turn as its top hit,
 *    its words shown, and the summariser's prompt is no
 *    hit of the person's; without `by`, the person's turn ranks above it.
 * b. The password in that turn comes back [redacted] in the hit and in
 *    `around`, which reads the turn from the index: the turn is the centre.
 * c. After the agent's restart the machine says nothing of indexing (no
 *    "catching up", no "indexed through") within {@link INDEXED_WITHIN_MS}.
 * d. The summariser session is no hit of an agent's find, with `by` or
 *    without, nor of the person's (`GET /api/find`), though its machine's
 *    index holds the sentence (db find.ts `hubMade`).
 * e. Highlights mark whole tokens only, every query word the excerpt holds:
 *    the person's line "i'm unable to comment on this stupi canvas …"
 *    found by itself, by a query with an apostrophe, and by one of short
 *    words ("comment to a canvas"); no mark inside a word, no query word
 *    left unmarked.
 * f. The person's "we literally removed the slot pool yesterday" is the top
 *    hit for those words, its excerpt the phrase; an agent's session that
 *    quotes it (a brief full of "the", and two turns quoting it again)
 *    ranks below it, and its excerpt is the quote, not a window of "the"
 *    alone. As live: the person's turn and session ten hours old
 *    (find-names.ts `rankOf` recency) and their session asleep, as one idle
 *    that long is; the agent's minutes old and working on a turn when asked.
 *
 *   bun scripts/probe-kit/run.ts find-index
 */

import { Database } from "bun:sqlite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { toolRecord } from "../../lib/tool-call";
import {
  type Fleet,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** A made-up password, password-shaped (secret-filter.ts `passwordShaped`): never a real one. */
const PASSWORD = "Wm4$kTq8Rz";
const WORDS = "heron slot pool";
const MARK = "PROBE-IDX-MINE";
/** The person's words: the password more than 16 words past "password", outside an index snippet's window. */
const MINE = `${MARK} we literally retired the ${WORDS} yesterday; my password for the build box that we set up last spring on the shared rack beside the old printer near the window is ${PASSWORD} until the ${WORDS} returns.`;
/** The hub's summariser prompt, its opening as continuation.ts writes it, quoting the person's words. */
const SUMMARISER = `Below is the transcript of a coding-agent session, up to its last few turns. Old tool output is hidden; failed calls keep the head of their error. A section labelled as compacted by the source session is that session's own earlier summary.\n\n<transcript>\nperson: ${MINE}\n</transcript>\n\nUse no tools. Reply only with the summary.`;
/** How long the machine may take, from its agent's restart, to answer without a word of indexing. */
const INDEXED_WITHIN_MS = 30_000;
/** How long the machine's index may take to hold a turn. */
const HELD_MS = 120_000;

interface Hit {
  excerpt?: string;
  id: string;
  ref?: string;
  title?: string;
  when?: string | null;
  who?: string;
}
interface Answer {
  hits?: Hit[];
  turns?: { here?: true; text: string; who: string }[];
  unsearched?: string[];
}

/** The person's line about the canvas, as the owner typed it. */
const CANVAS =
  "i'm unable to comment on this stupi canvas it selects the whole page did u design it as a single element or an image?";
/** The queries leg e finds it by: itself, an apostrophe's, short words'. */
const CANVAS_QUERIES = [
  "i'm unable to comment on this stupi canvas it selects the whole page",
  "i'm unable",
  "comment to a canvas",
];
const SLOT_QUERY = "we literally removed the slot pool yesterday";
/** The person's line, as the owner typed it. */
const SLOT = `${SLOT_QUERY} and AGAIN you add it`;
const BRIEF_ASK = "PROBE-IDX-BRIEF write the brief";
/** An agent's turn quoting the person amid a brief full of "the": what a delegate's brief or a test run says. */
const FILLER =
  "Paths under the clone mean the same path in your clone; there the scratch dir is the one temp files go to, and the host's caches are read-only. ";
const BRIEF = `${FILLER.repeat(8)}He wrote "${SLOT_QUERY}" in my session. ${FILLER.repeat(8)}`;
/** Two asks the agent answers by quoting the person again, each its own turn. */
const QUOTES: Record<string, string> = {
  "PROBE-IDX-QUOTE-ONE what did he say": `He said: ${SLOT_QUERY}.`,
  "PROBE-IDX-QUOTE-TWO say it again": `Quoting the owner once more: "${SLOT_QUERY}".`,
};
/** An ask the agent answers slowly: its session is working while find is asked. */
const WORK_ASK = "PROBE-IDX-WORK keep going";
/** How long the person's turn and session are made old, as live. */
const PERSON_AGE_MS = 10 * 3_600_000;

const respond = (request: Seen): Reply => {
  if (request.last.includes(BRIEF_ASK)) {
    return { everyMs: 1, words: [BRIEF] };
  }
  for (const [ask, quote] of Object.entries(QUOTES)) {
    if (request.last.includes(ask)) {
      return { everyMs: 1, words: [quote] };
    }
  }
  if (request.last.includes(WORK_ASK)) {
    return {
      everyMs: 1000,
      words: Array.from({ length: 120 }, () => "working "),
    };
  }
  return {
    everyMs: 5,
    words: [request.last.includes(MARK) ? "Noted." : "ok"],
  };
};

const WORD_CHAR = /[\p{L}\p{N}]/u;
const WORD_RUNS = /[\p{L}\p{N}]+/gu;
const MARKED = /「([^」]*)」/g;

/**
 * Whether an excerpt's marks are whole tokens of the query, every query word
 * it holds marked: why not, in words, or null.
 */
const highlightFault = (excerpt: string, query: string): string | null => {
  const words = new Set(
    (query.toLowerCase().match(WORD_RUNS) ?? []).map(String)
  );
  for (const match of excerpt.matchAll(MARKED)) {
    const marked = (match[1] ?? "").toLowerCase().match(WORD_RUNS) ?? [];
    // A stem the index matched ("removed" for "remove") is the word.
    const stray = marked.filter(
      (term) =>
        !(
          words.has(term) ||
          [...words].some(
            (word) =>
              Math.min(word.length, term.length) >= 4 &&
              (term.startsWith(word) || word.startsWith(term))
          )
        )
    );
    if (stray.length > 0) {
      return `a mark on no query word: 「${match[1]}」`;
    }
    const before = excerpt[match.index - 1] ?? "";
    const after = excerpt[match.index + match[0].length] ?? "";
    if (WORD_CHAR.test(before) || WORD_CHAR.test(after)) {
      return `a mark inside a word: …${excerpt.slice(Math.max(0, match.index - 8), match.index + match[0].length + 8)}…`;
    }
  }
  const unmarked = excerpt.replace(MARKED, " ");
  const missed = (unmarked.toLowerCase().match(WORD_RUNS) ?? []).filter(
    (word) => words.has(word)
  );
  return missed.length > 0
    ? `query words left unmarked: ${missed.join(", ")}`
    : null;
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
  const cwd = join(fleet.workdir, "find-index");
  await mkdir(cwd, { recursive: true });
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Find index probe",
    machineId: MACHINE,
    cwd,
    caw: false,
  });
  /** A session in the project, its credential read from its process. */
  const session = async (title: string) => {
    const id = await fleet.spawn("claude", title, cwd, {
      projectId: project.id,
    });
    const credential = await fleet.sessionCredential(id);
    return { id, credential };
  };
  /** One session's words, answered and its turn closed. */
  const say = async (id: string, words: string) => {
    await fleet.send(id, words);
    await until(
      `the reply to ${words.slice(0, 30)}`,
      () =>
        fleet.seen.some((request) =>
          request.last.includes(words.slice(0, 60))
        ) && fleet.instance(id)?.turn_open_at === null,
      Boolean,
      60_000
    ).catch(() => false);
  };
  const talker = await session("Heron log");
  const summariser = await session("Summary stand-in");
  const hubs = await session("Summary of Heron log");
  const asker = await session("Asker");
  const canvas = await session("Canvas gripe");
  const slot = await session("Slot pool");
  const brief = await session("Brief writer");
  await say(talker.id, MINE);
  await say(summariser.id, SUMMARISER);
  await say(hubs.id, SUMMARISER);
  await say(canvas.id, CANVAS);
  await say(slot.id, SLOT);
  await say(brief.id, BRIEF_ASK);
  for (const ask of Object.keys(QUOTES)) {
    // biome-ignore lint/performance/noAwaitInLoops: one turn after the other
    await say(brief.id, ask);
  }
  const find = async (args: Record<string, unknown>) => {
    const read = await toolRecord<Answer>(
      { base: fleet.base, id: asker.id, credential: asker.credential },
      "find",
      args
    );
    return read.refused
      ? { text: read.text, answer: {} as Answer }
      : { text: read.text, answer: read.record };
  };
  const everyone = () => find({ query: WORDS, project: "all", limit: 20 });
  const held = await until(
    "the three sessions' turns in the machine's index",
    everyone,
    ({ answer }) =>
      [talker.id, summariser.id, hubs.id].every((id) =>
        (answer.hits ?? []).some((hit) => hit.id === id && hit.ref)
      ),
    HELD_MS
  ).catch(() => undefined);
  kit.check(
    `the machine's index holds the three turns within ${HELD_MS / 1000} s`,
    held !== undefined,
    held ? held.text.slice(0, 900) : (await everyone()).text.slice(0, 900)
  );
  // The third, the hub's own summariser from here on.
  fleet.write("UPDATE instances SET kind = 'summariser' WHERE id = ?", hubs.id);
  const [made] = fleet.query<{ session_id: string | null }>(
    "SELECT session_id FROM instances WHERE id = ?",
    hubs.id
  );
  /** Whether `id` names the summariser session: as the hub holds it, or as a session it never started. */
  const isHubs = (id: string) =>
    id === hubs.id || id.endsWith(`:${made?.session_id ?? hubs.id}`);

  // The person's turn, gone from the stored transcript.
  const [row] = fleet.query<{ session_id: string | null }>(
    "SELECT session_id FROM instances WHERE id = ?",
    talker.id
  );
  const glob = new Bun.Glob(`**/${row?.session_id ?? "none"}.jsonl`);
  const files = await Array.fromAsync(
    glob.scan({ cwd: fleet.home, dot: true, absolute: true })
  );
  for (const file of files) {
    // biome-ignore lint/performance/noAwaitInLoops: one transcript, rewritten whole
    const lines = (await readFile(file, "utf8")).split("\n");
    await writeFile(
      file,
      lines.filter((line) => !line.includes(MARK)).join("\n")
    );
  }
  const left = await Promise.all(files.map((file) => readFile(file, "utf8")));
  kit.check(
    "the person's turn is gone from the session's stored transcript",
    files.length > 0 && left.every((text) => !text.includes(MARK)),
    `${files.length} transcript file(s): ${files.join(", ")}`
  );

  // The agent restarts.
  await fleet.stop("agent");
  const restarted = Date.now();
  fleet.launch("agent");
  await fleet.agentUp();
  const whole = await until(
    "the machine answering with nothing said of its index",
    everyone,
    ({ answer }) =>
      answer.unsearched === undefined &&
      (answer.hits ?? []).some((hit) => hit.id === talker.id),
    INDEXED_WITHIN_MS
  ).catch(() => undefined);
  const tookS = Math.round((Date.now() - restarted) / 100) / 10;
  kit.check(
    `c: after its agent restarts, the machine says nothing of indexing within ${INDEXED_WITHIN_MS / 1000} s`,
    whole !== undefined,
    whole
      ? `answered whole ${tookS} s after the restart`
      : (await everyone()).text.slice(0, 900)
  );

  const mine = await find({ query: WORDS, by: "person", project: "all" });
  const hits = mine.answer.hits ?? [];
  const [top] = hits;
  kit.check(
    "a: by person, the person's turn is the top hit with its words, and the summariser's prompt is no hit of theirs",
    top?.id === talker.id &&
      top.who === "person" &&
      (top.excerpt ?? "").replace(/[「」]/g, "").includes(`the ${WORDS}`) &&
      !hits.some((hit) => hit.id === summariser.id),
    mine.text.slice(0, 1200)
  );
  const all = (await everyone()).answer.hits ?? [];
  const at = (id: string) => all.findIndex((hit) => hit.id === id);
  kit.check(
    "a: without by, the person's turn ranks above the summariser's prompt",
    at(talker.id) >= 0 && at(talker.id) < at(summariser.id),
    JSON.stringify(all.map((hit) => [hit.id, hit.who])).slice(0, 900)
  );
  const around = top?.ref ? await find({ around: top.ref }) : undefined;
  const here = around?.answer.turns?.find((turn) => turn.here);
  kit.check(
    "b: the password comes back [redacted] in the hit and in around, which reads the turn from the index",
    Boolean(top?.excerpt?.includes("[redacted]")) &&
      !mine.text.includes(PASSWORD) &&
      Boolean(here?.text.includes(`retired the ${WORDS}`)) &&
      Boolean(here?.text.includes("[redacted]")) &&
      !around?.text.includes(PASSWORD),
    `hit: ${top?.excerpt}\naround: ${around?.text.slice(0, 900)}`
  );
  const route = (await (
    await fetch(
      `${fleet.base}/api/find?${new URLSearchParams({ q: WORDS, limit: "50" })}`
    )
  ).json()) as { results: { id: string; kind: string }[] };
  kit.check(
    "d: the hub's summariser session is no hit of an agent's find, by person or not, nor of the person's GET /api/find, while the same words in a session of its own are",
    at(summariser.id) >= 0 &&
      !all.some((hit) => isHubs(hit.id)) &&
      !hits.some((hit) => isHubs(hit.id)) &&
      route.results.some((result) => result.id === talker.id) &&
      !route.results.some((result) => isHubs(result.id)),
    `summariser ${hubs.id} (session ${made?.session_id})\nagent: ${JSON.stringify(all.map((hit) => hit.id))}\nby person: ${JSON.stringify(hits.map((hit) => hit.id))}\nroute: ${JSON.stringify(route.results.map((result) => `${result.kind}:${result.id}`))}`
  );

  await highlightLegs(kit, find, canvas.id);
  await phraseLeg(kit, fleet, find, slot.id, brief.id);
};

/** One `find` call as the asker, its record read. */
type FindCall = (
  args: Record<string, unknown>
) => Promise<{ answer: Answer; text: string }>;

/** e: highlights, whole tokens only. */
const highlightLegs = async (kit: Kit, find: FindCall, canvasId: string) => {
  for (const query of CANVAS_QUERIES) {
    // biome-ignore lint/performance/noAwaitInLoops: one query at a time, each read whole
    const found = await until(
      `the canvas line for "${query}"`,
      () => find({ query, by: "person", project: "all" }),
      ({ answer }) => (answer.hits ?? []).some((each) => each.id === canvasId),
      HELD_MS
    ).catch(() => undefined);
    const hit = found?.answer.hits?.find((each) => each.id === canvasId);
    const fault = hit?.excerpt ? highlightFault(hit.excerpt, query) : "no hit";
    kit.check(
      `e: "${query}": the excerpt marks whole tokens only, every query word it holds`,
      fault === null,
      `${fault ?? "whole"}\nexcerpt: ${hit?.excerpt}`
    );
  }
};

/** An excerpt's words, its marks left out. */
const plain = (excerpt: string | undefined) =>
  (excerpt ?? "").replace(/[「」]/g, "");

/** The rank's parts besides the match (find-names.ts `rankOf`), as the probe reads a result: what the detail says each scored. */
const rankParts = (result: FindRouteResult, now: number) => {
  const hours = Math.max(0, now - (result.lastActivity ?? now)) / 3_600_000;
  const state: Record<string, number> = {
    "needs-you": 22,
    working: 20,
    idle: 10,
    sleeping: 6,
    unknown: 3,
    ended: 0,
  };
  const recency = 30 * Math.exp(-hours / 36);
  const live = state[result.state ?? ""] ?? 0;
  return `score ${result.score.toFixed(1)} = the match's part (and whose words) ${(result.score - recency - live - 6).toFixed(1)} + recency ${recency.toFixed(1)} (${hours.toFixed(1)} h) + ${result.state} ${live} + parentage 6`;
};

/** A result of `GET /api/find`, as leg f reads its rank. */
interface FindRouteResult {
  id: string;
  kind: string;
  lastActivity: number | null;
  score: number;
  state?: string;
  title: string;
}

/**
 * Makes the person's line and its session ten hours old, as live: asleep,
 * as a session idle past its half hour is put to sleep (hub server.ts
 * `sleepFinished`: "rather than at the end of an idle half hour"); the
 * machine's index dates the turn then, and the session's row last moved then.
 * The row is written beside the hub, then renamed through the hub, which
 * re-reads it for find and keeps its age ("A rename alone is not the session
 * moving").
 */
const ageThePerson = async (fleet: Fleet, slotId: string) => {
  await fleet.control(slotId, "sleep");
  await until(
    "the person's session asleep",
    () => fleet.instance(slotId)?.status,
    (status) => status === "sleeping",
    60_000
  ).catch(() => undefined);
  const then = Date.now() - PERSON_AGE_MS;
  const index = new Database(
    join(fleet.home, ".local", "share", "cawco", "transcript-index.db")
  );
  try {
    index.exec("PRAGMA busy_timeout = 15000");
    index
      .query("UPDATE docs SET ts = ? WHERE text = ?")
      .run(new Date(then).toISOString(), SLOT);
  } finally {
    index.close();
  }
  fleet.write("UPDATE instances SET updated_at = ? WHERE id = ?", then, slotId);
  await fetch(`${fleet.base}/api/instances/${slotId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Slot pool line" }),
  });
};

/** f: the phrase, and whose saying of it ranks first, the agent's session working and the person's ten hours old. */
const phraseLeg = async (
  kit: Kit,
  fleet: Fleet,
  find: FindCall,
  slotId: string,
  briefId: string
) => {
  await until(
    "the slot pool line and the brief quoting it",
    () => find({ query: SLOT_QUERY, project: "all", limit: 20 }),
    ({ answer }) =>
      [slotId, briefId].every((id) =>
        (answer.hits ?? []).some((hit) => hit.id === id)
      ),
    HELD_MS
  ).catch(() => undefined);
  await ageThePerson(fleet, slotId);
  await fleet.send(briefId, WORK_ASK);
  await until(
    "the brief writer working on a turn",
    () => fleet.instance(briefId)?.turn_open_at,
    (open) => open !== null && open !== undefined,
    60_000
  ).catch(() => undefined);
  const phrase = await find({ query: SLOT_QUERY, project: "all", limit: 20 });
  const route = (await (
    await fetch(
      `${fleet.base}/api/find?${new URLSearchParams({ q: SLOT_QUERY, limit: "50" })}`
    )
  ).json()) as { results: FindRouteResult[] };
  const now = Date.now();
  const parts = [slotId, briefId].map((id) => {
    const result = route.results.find((each) => each.id === id);
    return result
      ? `${result.title}: ${rankParts(result, now)}`
      : `${id}: no result`;
  });
  const slotHits = phrase.answer.hits ?? [];
  const spoken = slotHits.find((hit) => hit.id === slotId);
  const quoted = slotHits.find((hit) => hit.id === briefId);
  kit.check(
    "f: with the agent's session minutes old and working and the person's ten hours old and asleep, the person's words are the top hit for them, their excerpt the phrase; the agent's quoting them ranks below, its excerpt the quote",
    slotHits[0]?.id === slotId &&
      spoken?.who === "person" &&
      plain(spoken.excerpt).includes(SLOT_QUERY) &&
      quoted?.who === "agent" &&
      slotHits.indexOf(quoted) > 0 &&
      plain(quoted.excerpt).includes(SLOT_QUERY) &&
      highlightFault(spoken.excerpt ?? "", SLOT_QUERY) === null &&
      highlightFault(quoted.excerpt ?? "", SLOT_QUERY) === null,
    `${JSON.stringify(slotHits.map((hit) => [hit.title, hit.who, hit.when]))}\n${parts.join("\n")}\nperson: ${spoken?.excerpt}\nagent: ${quoted?.excerpt}`
  );
};

export default { name: "find-index", run } satisfies Spec;
