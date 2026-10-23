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
 * (a) Coming up into them, the agent's loop is never held a second: no
 *     `[loop]` line.
 * (b) Under the wave of reads, every read answers and the loop is never
 *     held a second.
 *
 *   bun scripts/probe-kit/run.ts agent-loop
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LATE_MS } from "../../../packages/agent/src/loop-watch";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import { delay } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

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
/** How long the agent is given to come up into them and settle, before the wave. */
const SETTLE_MS = 90_000;

/** One stored transcript of about `mb` MB: user and assistant turns, chained, under `sessionId`. */
const transcript = (sessionId: string, cwd: string, mb: number): string => {
  const words = "the agent reads a stored transcript line by line ".repeat(36);
  const lines: string[] = [];
  let size = 0;
  let parent: string | null = null;
  for (let at = 0; size < mb * 1024 * 1024; at += 1) {
    const uuid = crypto.randomUUID();
    const user = at % 2 === 0;
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
  name: "agent-loop",
  run: async (kit: Kit) => {
    const { check } = kit;
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

    // (a) Coming up into them.
    const agentLog = await fleet.logMark("agent");
    fleet.launch("agent");
    await fleet.agentUp();
    await delay(SETTLE_MS);
    const comingUp = (await agentLog.since())
      .split("\n")
      .filter((line) => line.includes(STALL));
    check(
      `a: coming up into ${TRANSCRIPTS} stored transcripts of ${TRANSCRIPT_MB} MB and ${LONG} of ${LONG_MB} MB, the agent's loop is never held ${LATE_MS / 1000} s`,
      comingUp.length === 0,
      comingUp.join("\n") || "no stall"
    );

    // (b) The wave of reads.
    const waveLog = await fleet.logMark("agent");
    const began = Date.now();
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
    const spent = Date.now() - began;
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
  },
} satisfies Spec;
