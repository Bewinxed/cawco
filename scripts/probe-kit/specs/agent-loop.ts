/**
 * The agent's loop is never held a second as it comes up into a machine's
 * worth of stored work, nor under a wave of the hub's transcript reads
 * (agent loop-watch.ts says each stall of a second or more, and what ran).
 *
 * 2026-10-23 19:33, obelisk: the agent was held ~75 s (its 10 s bounds said
 * "within 84 s") as it came up with 2,964 stored Claude sessions on disk,
 * 369 OpenCode reattaches and 471 transcript reads asked at once; 317
 * session starts were stopped for it.
 *
 * On a scratch fleet against the mock model: {@link TRANSCRIPTS} stored
 * Claude transcripts of {@link TRANSCRIPT_MB} MB each, and {@link LONG}
 * of {@link LONG_MB} MB (obelisk's longest was 97 MB), are written before
 * the agent starts, so it comes up indexing and scanning them; once it is
 * online, the hub is asked each one's tail ({@link TAIL} entries) at once,
 * as its settle reads ask (server.ts `storedIn`).
 *
 * Their words are drawn from a vocabulary of {@link VOCABULARY} made-up
 * words, as a real corpus's are many: an index's work grows with the
 * distinct terms it writes, and a sentence repeated indexes as one.
 *
 * (a) Coming up into them with its search index empty, the agent indexes
 *     the whole backlog, eight 90 MB transcripts among it, and its loop is
 *     never held a second meanwhile: no `[loop]` line until its first sync
 *     is done (core find.ts `catchingUp` false). The index then answers a
 *     word only the long transcripts hold with each of them. Main failed it:
 *     one 90 MB transcript's documents were one transaction and one COMMIT
 *     (jsonl-parser fts5.ts `#commit`).
 * (b) Under the wave of reads, every read answers and the loop is never
 *     held a second.
 * (c) {@link REATTACHES} OpenCode sessions running, each with a turn behind
 *     it, the agent is killed and started again: it takes every one back
 *     (running, or asleep on its conversation; none failed) with its loop
 *     never held a second.
 *
 *   bun scripts/probe-kit/run.ts agent-loop
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LATE_MS } from "../../../packages/agent/src/loop-watch";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import type { TranscriptAnswer } from "../../../packages/core/src/find";
import { delay, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** Stored Claude transcripts on the machine. */
const TRANSCRIPTS = 120;
/** Each one's size. */
const TRANSCRIPT_MB = 4;
/** Long ones among them, as long sessions grow. */
const LONG = 8;
const LONG_MB = 90;
/** The entries each read asks for: the hub's settle read's (server.ts `STORED_TAIL`). */
const TAIL = 50;
/** The agent's line for a stall (loop-watch.ts). */
const STALL = "[loop] the agent's loop was held";
/** How long the index is given to take the whole backlog in. */
const INDEX_MS = 15 * 60_000;
/** How often the index is asked whether it has. */
const INDEX_LOOK_MS = 5000;
/** OpenCode sessions the agent comes back owing (obelisk's was 369). */
const REATTACHES = 120;
/** Of those started at once. */
const STARTS_AT_ONCE = 8;
/** A session taken back: running again, or at rest on its conversation, which a send resumes. */
const BACK = new Set(["running", "sleeping"]);
/** How long the agent is given to take them all back. */
const REATTACH_MS = 5 * 60_000;
/** Made-up words the transcripts are written in. */
const VOCABULARY = 40_000;
/** Words in each turn. */
const TURN_WORDS = 280;
/** A word only the long transcripts hold, in their first turn. */
const LONG_WORD = "quokkazebrafin";

/** {@link VOCABULARY} made-up words, five to ten letters each. */
const vocabulary = Array.from({ length: VOCABULARY }, () =>
  Array.from({ length: 5 + Math.floor(Math.random() * 6) }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26))
  ).join("")
);

/** One turn's words, drawn from {@link vocabulary}. */
const turnWords = (): string =>
  Array.from(
    { length: TURN_WORDS },
    () => vocabulary[Math.floor(Math.random() * VOCABULARY)]
  ).join(" ");

/** One stored transcript of about `mb` MB: user and assistant turns, chained, under `sessionId`. */
const transcript = (sessionId: string, cwd: string, mb: number): string => {
  const lines: string[] = [];
  let size = 0;
  let parent: string | null = null;
  for (let at = 0; size < mb * 1024 * 1024; at += 1) {
    const uuid = crypto.randomUUID();
    const user = at % 2 === 0;
    const words = `${at === 0 && mb === LONG_MB ? `${LONG_WORD} ` : ""}${turnWords()}`;
    const line = JSON.stringify({
      type: user ? "user" : "assistant",
      uuid,
      parentUuid: parent,
      sessionId,
      cwd,
      timestamp: new Date(Date.UTC(2026, 9, 1) + at * 1000).toISOString(),
      isSidechain: false,
      message: user
        ? { role: "user", content: `${at}: ${words}` }
        : {
            id: `msg_${at}`,
            type: "message",
            role: "assistant",
            model: "claude-haiku-4-5",
            content: [{ type: "text", text: `${at}: ${words}` }],
            usage: { input_tokens: 10, output_tokens: 20 },
          },
    });
    lines.push(line);
    size += line.length + 1;
    parent = uuid;
  }
  return `${lines.join("\n")}\n`;
};

export default {
  group: "Speed",
  name: "agent-loop",
  run: async (kit: Kit) => {
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
      "-probe-agent-loop"
    );
    await mkdir(project, { recursive: true });
    const ids = Array.from({ length: TRANSCRIPTS + LONG }, () =>
      crypto.randomUUID()
    );
    for (const id of ids) {
      // biome-ignore lint/performance/noAwaitInLoops: one file at a time, so the probe's own memory stays one transcript's
      await writeFile(
        join(project, `${id}.jsonl`),
        transcript(id, cwd, ids.indexOf(id) < LONG ? LONG_MB : TRANSCRIPT_MB)
      );
    }
    kit.note(
      `${TRANSCRIPTS} stored transcripts of ${TRANSCRIPT_MB} MB and ${LONG} of ${LONG_MB} MB written under ${project}`
    );

    await comingUp(kit, fleet, ids);
    await readWave(kit, fleet, ids, cwd);
    await reattaches(kit, fleet);
  },
} satisfies Spec;

/** (a) Coming up into the backlog, its index empty. */
const comingUp = async (kit: Kit, fleet: KitFleet, ids: string[]) => {
  const { check } = kit;
  // (a) Coming up into them: the index takes the whole backlog in.
  const agentLog = await fleet.logMark("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  const search = (query: string) =>
    fleet.controlAnswer("searchTranscripts", [query, { limit: 20 }], 60_000);
  const began = Date.now();
  let caughtUp = false;
  while (!caughtUp && Date.now() - began < INDEX_MS) {
    // biome-ignore lint/performance/noAwaitInLoops: one look at a time, until the index says it has taken everything in
    await delay(INDEX_LOOK_MS);
    const asked = await search(LONG_WORD);
    caughtUp =
      asked.ok &&
      (asked.result as TranscriptAnswer | undefined)?.catchingUp === false;
  }
  const indexedIn = Date.now() - began;
  const stalls = (await agentLog.since())
    .split("\n")
    .filter((line) => line.includes(STALL));
  const found = await search(LONG_WORD);
  const sessions = new Set(
    ((found.result as TranscriptAnswer | undefined)?.conversations ?? []).map(
      (one) => one.sessionId
    )
  );
  const long = ids.slice(0, LONG);
  check(
    `a: coming up with its index empty, the agent indexes ${TRANSCRIPTS} stored transcripts of ${TRANSCRIPT_MB} MB and ${LONG} of ${LONG_MB} MB with its loop never held ${LATE_MS / 1000} s, and the index answers a word only the long ones hold with each of them`,
    caughtUp && stalls.length === 0 && long.every((id) => sessions.has(id)),
    `${caughtUp ? `indexed in ${Math.round(indexedIn / 1000)} s` : `still catching up after ${Math.round(indexedIn / 1000)} s`}; ${long.filter((id) => sessions.has(id)).length} of ${LONG} long transcripts found; ${stalls.join("\n") || "no stall"}`
  );
};

/** (b) A wave of the hub's tail reads. */
const readWave = async (
  kit: Kit,
  fleet: KitFleet,
  ids: string[],
  cwd: string
) => {
  const { check } = kit;
  // (b) The wave of reads.
  const waveLog = await fleet.logMark("agent");
  const asked = Date.now();
  const answers = await Promise.all(
    ids.map((id) =>
      fleet.controlAnswer(
        "getSessionMessages",
        [id, { dir: cwd, tail: TAIL }],
        120_000,
        undefined,
        "claude"
      )
    )
  );
  const spent = Date.now() - asked;
  await delay(15_000);
  const wave = (await waveLog.since())
    .split("\n")
    .filter((line) => line.includes(STALL));
  const answered = answers.filter(
    (one) => one.ok && Array.isArray(one.result) && one.result.length > 0
  );
  check(
    `b: ${ids.length} transcript tails asked at once, every one answers and the agent's loop is never held ${LATE_MS / 1000} s`,
    answered.length === ids.length && wave.length === 0,
    `${answered.length} answered in ${spent} ms; ${wave.join("\n") || "no stall"}; ${answers
      .filter((one) => !one.ok)
      .slice(0, 3)
      .map((one) => one.error)
      .join("; ")}`
  );
};

/** (c) Killed and started again, owing OpenCode reattaches. */
const reattaches = async (kit: Kit, fleet: KitFleet) => {
  const { check } = kit;
  // (c) Coming up owing OpenCode reattaches.
  const opencode: string[] = [];
  for (let at = 0; at < REATTACHES; at += STARTS_AT_ONCE) {
    // biome-ignore lint/performance/noAwaitInLoops: a few starts at a time, as a busy machine takes them
    const started = await Promise.all(
      Array.from(
        { length: Math.min(STARTS_AT_ONCE, REATTACHES - at) },
        async (_, one) => {
          const id = await fleet.spawn("opencode", `Reattach ${at + one + 1}`);
          // A turn, so it holds a conversation to come back to, as every
          // session a machine comes back owing does.
          const first = await fleet.send(id, "Hello.");
          await until(
            "its first turn read and its conversation named",
            () =>
              fleet.query<{ session_id: string | null; state: string }>(
                "SELECT i.session_id, m.state FROM instances i, sent_messages m WHERE i.id = ? AND m.uuid = ?",
                id,
                first
              )[0],
            (row) => row.state === "read" && row.session_id !== null
          );
          return id;
        }
      )
    );
    opencode.push(...started);
  }
  await fleet.stop("agent", "SIGKILL");
  const backLog = await fleet.logMark("agent");
  const back = Date.now();
  fleet.launch("agent");
  await fleet.agentUp();
  const statuses = () =>
    opencode.map((id) => fleet.instance(id)?.status ?? "gone");
  let settled = false;
  while (!settled && Date.now() - back < REATTACH_MS) {
    // biome-ignore lint/performance/noAwaitInLoops: one look at a time, until every session is back
    await delay(INDEX_LOOK_MS);
    settled = statuses().every((status) => BACK.has(status));
  }
  const tookBack = Date.now() - back;
  await delay(15_000);
  const reattaching = (await backLog.since())
    .split("\n")
    .filter((line) => line.includes(STALL));
  const counts: Record<string, number> = {};
  for (const status of statuses()) {
    counts[status] = (counts[status] ?? 0) + 1;
  }
  // Why any did not come back, in the hub's words, each said once.
  const why = [
    ...new Set(
      opencode.flatMap((id) => {
        const row = fleet.instance(id);
        return row && !BACK.has(row.status) && row.last_error
          ? [row.last_error.slice(0, 300)]
          : [];
      })
    ),
  ];
  check(
    `c: killed and started again owing ${REATTACHES} OpenCode reattaches, the agent takes every session back with its loop never held ${LATE_MS / 1000} s`,
    settled && reattaching.length === 0,
    `${settled ? `all back in ${Math.round(tookBack / 1000)} s` : `not all back after ${Math.round(tookBack / 1000)} s`}; ${JSON.stringify(counts)}; ${why.join(" | ") || "none failed"}; ${reattaching.join("\n") || "no stall"}`
  );
};
