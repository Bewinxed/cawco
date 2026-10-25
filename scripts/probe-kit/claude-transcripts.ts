/**
 * Claude Code transcripts written the way the CLI writes them, for specs that
 * read stored conversations: a turn's assistant message one record per
 * content block under one `message.id`, each tool call answered by a user
 * record carrying its `tool_result` and its `toolUseResult` sidecar, and the
 * lines a long session gathers — `/compact` boundaries with their summaries
 * (`compactMetadata`, `logicalParentUuid`), prompts queued and joined
 * (`queue-operation`), messages read mid-turn (`queued_command`
 * attachments), background commands and subagents ended by a
 * `<task-notification>` turns later, a session-start hook's failures, an
 * edited prompt's abandoned branch, progress and snapshot lines, and tool
 * results of hundreds of kilobytes.
 *
 * Seeded, so a run's transcript is the same transcript each time.
 */
import { closeSync, openSync, writeSync } from "node:fs";

/** A seeded generator (Park–Miller): the same seed, the same transcript. */
export const seeded = (seed: number): (() => number) => {
  const modulus = 2_147_483_647;
  let state = (seed % (modulus - 1)) + 1;
  return () => {
    state = (state * 48_271) % modulus;
    return (state - 1) / (modulus - 1);
  };
};

const WORDS =
  "the session reads its transcript a window at a time from the newest back so opening it costs the window and never the file while the index holds one node a line and every older page reads a byte range".split(
    " "
  );

export interface TranscriptShape {
  /** About how big the file grows, in bytes. */
  bytes: number;
  /** A `/compact` every this many turns (0: none). */
  compactEvery?: number;
  cwd: string;
  /** The biggest tool result, in bytes. */
  resultBytes?: number;
  seed: number;
  sessionId: string;
}

/** A background task running: its call, task id and the turn it ends on. */
interface Task {
  agent: boolean;
  endsAt: number;
  taskId: string;
  toolUseId: string;
}

/** A tool call an assistant step makes. */
interface Call {
  background: boolean;
  id: string;
  name: string;
}

/** Bytes gathered before a write. Ours. */
const WRITE_BYTES = 4 * 1024 * 1024;

/** One transcript being written, a record at a time, its chain kept as the CLI keeps it. */
class TranscriptWriter {
  readonly #shape: TranscriptShape;
  readonly #random: () => number;
  readonly #fd: number;
  #pending: string[] = [];
  #pendingBytes = 0;
  written = 0;
  #ids = 0;
  #clock = Date.UTC(2026, 9, 1);
  /** The chain's last record: the next one's parent. */
  parent: string | null = null;
  /** That record as written. */
  last: Record<string, unknown> | null = null;
  /** The compactions written so far. */
  compactions = 0;
  turn = 0;
  readonly running: Task[] = [];
  /** Sends absorbed mid-turn, one of which the next session start may hand again. */
  readonly absorbed: { source: string; prompt: string }[] = [];

  constructor(path: string, shape: TranscriptShape) {
    this.#shape = shape;
    this.#random = seeded(shape.seed);
    this.#fd = openSync(path, "w");
  }

  chance(odds: number): boolean {
    return this.#random() < odds;
  }

  between(low: number, high: number): number {
    return low + Math.floor(this.#random() * (high - low + 1));
  }

  words(count: number): string {
    return Array.from(
      { length: count },
      () => WORDS[Math.floor(this.#random() * WORDS.length)]
    ).join(" ");
  }

  id(prefix: string): string {
    this.#ids += 1;
    const hex = (this.#ids * 2_654_435_761 + this.#shape.seed)
      .toString(16)
      .padStart(12, "0");
    return prefix === "uuid"
      ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(0, 3)}-8${hex.slice(3, 6)}-${hex.padEnd(12, "0").slice(0, 12)}`
      : `${prefix}_${hex}${this.#ids}`;
  }

  at(): string {
    this.#clock += 500 + Math.floor(this.#random() * 4000);
    return new Date(this.#clock).toISOString();
  }

  line(record: Record<string, unknown>): void {
    const text = `${JSON.stringify(record)}\n`;
    this.#pending.push(text);
    this.#pendingBytes += text.length;
    this.written += Buffer.byteLength(text);
    if (this.#pendingBytes > WRITE_BYTES) {
      this.flush();
    }
  }

  /** A chained record: hung from the chain's last, and the chain's last from now on. */
  chained(record: Record<string, unknown>, keep = true): string {
    const uuid =
      typeof record.uuid === "string" ? record.uuid : this.id("uuid");
    const written = {
      ...this.envelope(this.parent),
      ...record,
      uuid,
      timestamp: this.at(),
    };
    this.line(written);
    if (keep) {
      this.parent = uuid;
      this.last = written;
    }
    return uuid;
  }

  envelope(parentUuid: string | null) {
    return {
      parentUuid,
      isSidechain: false,
      userType: "external",
      cwd: this.#shape.cwd,
      sessionId: this.#shape.sessionId,
      version: "2.1.280",
      gitBranch: "main",
    };
  }

  queue(operation: string, extra: Record<string, unknown> = {}): void {
    this.line({
      type: "queue-operation",
      operation,
      timestamp: this.at(),
      sessionId: this.#shape.sessionId,
      ...extra,
    });
  }

  resultBytes(): number {
    return Math.floor(
      this.#random() *
        this.#random() *
        this.#random() *
        (this.#shape.resultBytes ?? 300_000)
    );
  }

  flush(): void {
    if (this.#pending.length > 0) {
      writeSync(this.#fd, this.#pending.join(""));
      this.#pending = [];
      this.#pendingBytes = 0;
    }
  }

  close(): void {
    this.flush();
    closeSync(this.#fd);
  }
}

const assistantRecord = (
  writer: TranscriptWriter,
  messageId: string,
  block: Record<string, unknown>,
  last: boolean
) => ({
  type: "assistant",
  message: {
    id: messageId,
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [block],
    stop_reason: last ? "end_turn" : null,
    usage: {
      input_tokens: 1000 + writer.turn,
      output_tokens: 200,
      cache_read_input_tokens: 50_000,
    },
  },
  requestId: writer.id("req"),
});

const noticeOf = (writer: TranscriptWriter, task: Task): string =>
  `<task-notification>\n<task-id>${task.taskId}</task-id>\n<tool-use-id>${task.toolUseId}</tool-use-id>\n<status>completed</status>\n<summary>${task.agent ? "Agent" : "Background command"} &quot;${writer.words(3)}&quot; completed</summary>\n<result>${writer.words(30)}</result>\n</task-notification>`;

/** The failure of a session-start hook, right before the first prompt. */
const hookFailure = (writer: TranscriptWriter): void => {
  writer.chained(
    {
      type: "attachment",
      attachment: {
        type: "hook_non_blocking_error",
        hookEvent: "SessionStart",
        hookName: "SessionStart:startup",
        command: "cawco hook session-start",
        exitCode: 1,
        stderr:
          "Failed with non-blocking status code: the fleet's hook had no hub",
        stdout: "",
      },
    },
    false
  );
};

/** Prompts queued behind the last turn, now and then joined into one record. */
const queued = (writer: TranscriptWriter): void => {
  const joined = writer.chance(0.05) ? writer.between(2, 3) : 1;
  for (let q = 0; q < joined; q += 1) {
    writer.queue("enqueue", { content: writer.words(6) });
  }
  for (let q = 0; joined > 1 && q < joined; q += 1) {
    writer.queue("dequeue");
  }
};

/** An edited prompt: the first try's branch, left behind. */
const abandoned = (writer: TranscriptWriter): void => {
  if (!(writer.parent && writer.chance(0.03))) {
    return;
  }
  const kept = writer.parent;
  writer.chained({
    type: "user",
    message: {
      role: "user",
      content: `${writer.turn}: ${writer.words(12)} (first try)`,
    },
  });
  writer.chained(
    assistantRecord(
      writer,
      writer.id("msg"),
      { type: "text", text: writer.words(20) },
      true
    )
  );
  writer.parent = kept;
};

/** The calls one step makes: none on the last, one or two before, now and then in the background. */
const callsOf = (writer: TranscriptWriter, last: boolean): Call[] => {
  if (last) {
    return [];
  }
  return Array.from({ length: writer.between(1, 2) }, () => {
    const agent = writer.chance(0.015);
    const shell = !agent && writer.chance(0.015);
    return {
      id: writer.id("toolu"),
      name: agent
        ? "Agent"
        : (["Bash", "Read", "Edit", "Grep"][writer.between(0, 3)] ?? "Bash"),
      background: agent || shell,
    };
  });
};

/** One call's progress line and its result, a background one's task started. */
const answered = (writer: TranscriptWriter, call: Call): void => {
  writer.chained(
    {
      type: "progress",
      data: { type: "hook_progress", hookEvent: "PostToolUse" },
      toolUseID: call.id,
    },
    false
  );
  const output = call.background
    ? `Command running in background with ID: ${call.id.slice(-6)}`
    : "x".repeat(writer.resultBytes());
  writer.chained({
    type: "user",
    message: {
      role: "user",
      content: [
        {
          tool_use_id: call.id,
          type: "tool_result",
          content: output,
          is_error: false,
        },
      ],
    },
    toolUseResult: { stdout: output, stderr: "", interrupted: false },
    sourceToolAssistantUUID: writer.parent,
  });
  if (call.background) {
    writer.running.push({
      toolUseId: call.id,
      taskId: call.id.slice(-8),
      endsAt: writer.turn + writer.between(1, 4),
      agent: call.name === "Agent",
    });
  }
};

/** What is read at a tool boundary: a task's notification, a message the reader sent mid-turn. */
const midTurn = (writer: TranscriptWriter, ending: Task[]): void => {
  const task = ending.shift();
  if (task) {
    writer.chained({
      type: "attachment",
      attachment: {
        type: "queued_command",
        prompt: noticeOf(writer, task),
        timestamp: writer.at(),
      },
    });
  }
  if (writer.chance(0.04)) {
    const source = writer.id("uuid");
    const prompt = `mid-turn ${writer.words(8)}`;
    writer.queue("enqueue", { content: writer.words(8) });
    writer.chained({
      type: "attachment",
      attachment: {
        type: "queued_command",
        prompt,
        source_uuid: source,
        timestamp: writer.at(),
      },
    });
    writer.absorbed.push({ source, prompt });
    writer.queue("remove", { reason: "absorbed_mid_turn" });
  }
};

/** One assistant step: its blocks a record each, then each call answered. */
const step = (
  writer: TranscriptWriter,
  last: boolean,
  ending: Task[]
): void => {
  const messageId = writer.id("msg");
  const calls = callsOf(writer, last);
  const blocks: Record<string, unknown>[] = [
    ...(writer.chance(0.5)
      ? [
          {
            type: "thinking",
            thinking: writer.words(40),
            signature: writer.id("sig"),
          },
        ]
      : []),
    { type: "text", text: writer.words(writer.between(10, 90)) },
    ...calls.map((call) => ({
      type: "tool_use",
      id: call.id,
      name: call.name,
      input:
        call.name === "Agent"
          ? {
              description: writer.words(3),
              prompt: writer.words(30),
              subagent_type: "general-purpose",
              run_in_background: true,
            }
          : {
              command: writer.words(5),
              ...(call.background ? { run_in_background: true } : {}),
            },
    })),
  ];
  for (const block of blocks) {
    writer.chained(assistantRecord(writer, messageId, block, last));
  }
  for (const call of calls) {
    answered(writer, call);
  }
  if (calls.length > 0) {
    midTurn(writer, ending);
  }
};

/**
 * A `/compact`: the boundary starts a chain of its own, its summary hangs
 * from it, its logical parent the record before it, or one never written
 * (below). Now and then the CLI writes the block again later
 * (anthropics/claude-code#92089): the boundary, the summary and the record
 * it kept, that one now hung from the summary, all under their old uuids.
 * The kept record is the boundary's logical parent, so its later copy leads
 * back to the boundary.
 */
const compaction = (writer: TranscriptWriter): void => {
  const kept = writer.last;
  // Every third one's logical parent is a record the CLI never wrote
  // (anthropics/claude-code#46603, #49996: 9 of a real session's 50).
  writer.compactions += 1;
  const phantom = writer.compactions % 3 === 2;
  const before = phantom ? writer.id("uuid") : writer.parent;
  writer.parent = null;
  writer.chained({
    type: "system",
    subtype: "compact_boundary",
    content: "Conversation compacted",
    logicalParentUuid: before,
    compactMetadata: { trigger: "auto", preTokens: 160_000 + writer.turn },
    level: "info",
  });
  const boundary = writer.last;
  writer.chained({
    type: "user",
    isCompactSummary: true,
    isVisibleInTranscriptOnly: true,
    message: {
      role: "user",
      content: `This session is being continued from a previous conversation that ran out of context. ${writer.words(200)}`,
    },
  });
  const summary = writer.last;
  if (!phantom && kept && boundary && summary && writer.chance(0.3)) {
    writer.line(boundary);
    writer.line(summary);
    const again = { ...kept, parentUuid: summary.uuid };
    writer.line(again);
    writer.parent = kept.uuid as string;
    writer.last = again;
  }
};

/** One turn: what was queued, the prompt (or a task's notification), its steps and its end. */
const turnOf = (writer: TranscriptWriter): void => {
  writer.turn += 1;
  writer.line({
    type: "file-history-snapshot",
    messageId: writer.id("uuid"),
    snapshot: {},
  });
  queued(writer);
  abandoned(writer);
  // Background tasks that finished: the first one's notification opens this
  // turn, the rest are read mid-turn at its tool boundaries.
  const ending = writer.running.filter((task) => task.endsAt <= writer.turn);
  for (const task of ending) {
    writer.running.splice(writer.running.indexOf(task), 1);
  }
  const notice = ending.shift();
  // Now and then a send the CLI absorbed mid-turn is handed again after a
  // restart: a user record under the send's own uuid, the same words (as a
  // real session's hand-off was, an hour after its absorbed line).
  const again =
    !notice && writer.chance(0.3) ? writer.absorbed.shift() : undefined;
  writer.chained({
    type: "user",
    ...(again ? { uuid: again.source } : {}),
    message: {
      role: "user",
      content: notice
        ? noticeOf(writer, notice)
        : (again?.prompt ??
          `${writer.turn}: ${writer.words(writer.between(20, 80))}`),
    },
  });
  const steps = writer.between(1, 6);
  for (let at = 0; at < steps; at += 1) {
    step(writer, at === steps - 1, ending);
  }
  writer.chained({
    type: "system",
    subtype: "turn_duration",
    durationMs: 12_000,
    isMeta: false,
  });
};

/**
 * Writes a transcript of about `shape.bytes` to `path`, a few megabytes at a
 * time so a 400 MB one never sits in the writer's memory. Answers how many
 * turns it wrote and how many bytes.
 */
export function writeClaudeTranscript(
  path: string,
  shape: TranscriptShape
): { turns: number; bytes: number } {
  const writer = new TranscriptWriter(path, shape);
  try {
    hookFailure(writer);
    while (writer.written < shape.bytes) {
      turnOf(writer);
      if (shape.compactEvery && writer.turn % shape.compactEvery === 0) {
        compaction(writer);
      }
    }
  } finally {
    writer.close();
  }
  return { turns: writer.turn, bytes: writer.written };
}
