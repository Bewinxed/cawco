/**
 * pi sessions written through pi's own SessionManager, for specs that read
 * stored pi conversations: turns of prompts, assistant messages with tool
 * calls and their results, failed attempts retried, compactions keeping
 * their last entries, background commands' end notices
 * (pi-services `BACKGROUND_SHELL`), and a branch the session left. Seeded:
 * the same seed, the same conversation (pi names its entries at random,
 * so not the same ids).
 *
 * pi writes under `PI_CODING_AGENT_DIR`'s `sessions/`; a spec points that
 * at a folder of its own before it imports anything that reads it.
 */
import { join } from "node:path";
import { BACKGROUND_SHELL } from "../../packages/agent/src/harnesses/pi-services";
import { seeded } from "./claude-transcripts";

/** pi's SessionManager, as the agent resolves it. */
const { SessionManager } = (await import(
  Bun.resolveSync(
    "@earendil-works/pi-coding-agent",
    join(import.meta.dir, "../../packages/agent")
  )
)) as typeof import("../../packages/agent/node_modules/@earendil-works/pi-coding-agent");

type Manager = ReturnType<typeof SessionManager.create>;

const WORDS =
  "a pi session read through its line index a window at a time from the newest back".split(
    " "
  );

const USAGE = {
  input: 10,
  output: 20,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 30,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/** One session being written: pi's manager, a seeded hand, its clock and its counters. */
class PiWriter {
  readonly manager: Manager;
  readonly random: () => number;
  readonly seed: number;
  #clock = Date.UTC(2026, 9, 1);
  #calls = 0;
  readonly shells: { taskId: string; endsAt: number }[] = [];

  constructor(cwd: string, seed: number) {
    this.manager = SessionManager.create(cwd);
    this.random = seeded(seed);
    this.seed = seed;
  }

  words(count: number): string {
    return Array.from(
      { length: count },
      () => WORDS[Math.floor(this.random() * WORDS.length)]
    ).join(" ");
  }

  now(): number {
    this.#clock += 1000;
    return this.#clock;
  }

  call(): string {
    this.#calls += 1;
    return `call_${this.seed}_${this.#calls}`;
  }

  prompt(text: string): string {
    return this.manager.appendMessage({
      role: "user",
      content: text,
      timestamp: this.now(),
    } as never);
  }

  assistant(content: unknown[], extra: Record<string, unknown> = {}): void {
    this.manager.appendMessage({
      role: "assistant",
      content,
      api: "openai-completions",
      provider: "probe",
      model: "probe-1",
      usage: USAGE,
      stopReason: "stop",
      timestamp: this.now(),
      ...extra,
    } as never);
  }
}

/** One assistant step: thinking now and then, words, and a call answered unless it is the last. */
const step = (writer: PiWriter, turn: number, last: boolean): void => {
  const call = last ? undefined : writer.call();
  writer.assistant(
    [
      ...(writer.random() < 0.4
        ? [{ type: "thinking", thinking: writer.words(20) }]
        : []),
      { type: "text", text: writer.words(15) },
      ...(call
        ? [
            {
              type: "toolCall",
              id: call,
              name: "bash",
              arguments: { command: writer.words(4) },
            },
          ]
        : []),
    ],
    last ? {} : { stopReason: "toolUse" }
  );
  if (!call) {
    return;
  }
  writer.manager.appendMessage({
    role: "toolResult",
    toolCallId: call,
    toolName: "bash",
    content: [{ type: "text", text: writer.words(40) }],
    isError: false,
    timestamp: writer.now(),
  } as never);
  if (writer.random() < 0.08) {
    writer.shells.push({
      taskId: `shell-${call}`,
      endsAt: turn + 1 + Math.floor(writer.random() * 3),
    });
  }
};

/** One turn: its prompt, a failed attempt now and then, its steps, the shells that ended, a compaction every 15. */
const turnOf = (writer: PiWriter, turn: number): string => {
  const prompt = writer.prompt(`${turn}: ${writer.words(12)}`);
  if (writer.random() < 0.05) {
    writer.assistant([], { stopReason: "error", errorMessage: "overloaded" });
  }
  const steps = 1 + Math.floor(writer.random() * 4);
  for (let at = 0; at < steps; at += 1) {
    step(writer, turn, at === steps - 1);
  }
  for (const shell of writer.shells.filter((one) => one.endsAt <= turn)) {
    writer.shells.splice(writer.shells.indexOf(shell), 1);
    writer.manager.appendCustomMessageEntry(
      BACKGROUND_SHELL,
      writer.words(6),
      true,
      { taskId: shell.taskId, status: "completed", summary: writer.words(5) }
    );
  }
  if (turn % 15 === 0) {
    const branch = writer.manager.getBranch();
    const kept = branch.at(-Math.min(branch.length, 6));
    if (kept) {
      writer.manager.appendCompaction(
        `Summary of turn ${turn}: ${writer.words(30)}`,
        kept.id,
        100_000 + turn
      );
    }
  }
  return prompt;
};

/** Writes a pi session of `turns` turns for `cwd`; answers its id. */
export function writePiSession(
  cwd: string,
  turns: number,
  seed: number
): string {
  const writer = new PiWriter(cwd, seed);
  let branchFrom: string | undefined;
  for (let turn = 1; turn <= turns; turn += 1) {
    const prompt = turnOf(writer, turn);
    if (turn === Math.floor(turns / 3)) {
      branchFrom = prompt;
    }
  }
  // The session went back to an earlier prompt and on from there: what came
  // after it on the first branch is left behind, and the leaf is the new one.
  if (branchFrom) {
    writer.manager.branch(branchFrom);
    for (let turn = 1; turn <= Math.max(3, Math.floor(turns / 4)); turn += 1) {
      writer.prompt(`again ${turn}: ${writer.words(10)}`);
      writer.assistant([{ type: "text", text: writer.words(12) }]);
    }
  }
  return writer.manager.getSessionId();
}
