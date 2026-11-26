/**
 * An Antigravity conversation as a transcript, read from the file agy
 * writes for it: `<app-data>/brain/<id>/.system_generated/logs/
 * transcript_full.jsonl`, the path its hooks are handed as
 * `transcriptPath`. One step a line, appended and never rewritten
 * (the project's `assets/b5b3ca96/REPORT.md` §4, `assets/b3380ec3/
 * agy-harness-parity.md` §P-m):
 *
 * - `USER_INPUT` (`USER_EXPLICIT`): the person's words inside
 *   `<USER_REQUEST>`, agy's own metadata after them.
 * - `PLANNER_RESPONSE` (`MODEL`): the model's thinking, its reply and its
 *   tool calls, by name and arguments, with no id.
 * - `GENERIC` (`MODEL`): one tool call's result, in the order of the calls
 *   before it; `RUNNING` for a command moved to the background or a timer,
 *   whose end is a later `SYSTEM_MESSAGE` from `<conversation>/task-<n>`.
 * - `SYSTEM_MESSAGE` (`SYSTEM`): a background command's end, a wake-up's
 *   prompt, agy's own notices and reminders.
 * - `CHECKPOINT` (`SYSTEM`): a compaction, its summary whole.
 * - `ERROR_MESSAGE` (`SYSTEM`): an error agy ended a turn on.
 *
 * A background command or a timer's result is drawn where it ended, as the
 * live stream draws it (agy's `tool_call_update completed` comes then), so
 * a transcript read back and the live one agree. CawCo's own stops of the
 * conversation (agy-notes.ts) are drawn where they happened.
 *
 * A call agy ended without a result reads {@link agyWords.callCancelled},
 * as it does live: agy writes no step for a call a cancel or its own end
 * stopped, a timer, a command in the background or one part-way
 * (`assets/b61a7f1b/REPORT.md` §3). Such a call is closed at the first of:
 * a cancel CawCo noted (agy-notes.ts `cancels`), after the last step agy
 * had made when it was sent; agy's notice that it stopped its background
 * tasks (`[Notice] All your subagents and background tasks have been
 * stopped due to …`, written after the next prompt's step,
 * `assets/b5b3ca96/REPORT.md` §3, §8), before that prompt; and, for a call
 * that had not moved to the background, the next prompt.
 */
import { readFile } from "node:fs/promises";
import { unlessGone } from "@cawco/core/absent";
import {
  REPEATED_FAILURE,
  type SessionMessage,
} from "@cawco/core/session-messages";
import type { TranscriptWindow, WindowAsk } from "@cawco/core/transcript-types";
import { agyWords } from "@cawco/core/words/agy";
import { Option, Schema } from "effect";
import type { TranscriptSpan } from "../harness";
import { withoutHookNotice } from "./agy-frames";
import { windowOf } from "./codex-history";

const ToolCallSchema = Schema.Struct({
  name: Schema.String,
  args: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

const StepSchema = Schema.Struct({
  step_index: Schema.Number,
  source: Schema.optional(Schema.String),
  type: Schema.String,
  status: Schema.optional(Schema.String),
  created_at: Schema.optional(Schema.String),
  content: Schema.optional(Schema.String),
  thinking: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  tool_calls: Schema.optional(Schema.Array(ToolCallSchema)),
});

/** One step of agy's transcript. */
export type AgyStep = typeof StepSchema.Type;

const decodeStep = Schema.decodeUnknownOption(
  Schema.fromJsonString(StepSchema)
);

/** Every step of the file `text`, in order; a line that is no step (one cut off as agy writes it) is passed by. */
export const agySteps = (text: string): AgyStep[] =>
  text
    .split("\n")
    .flatMap((line) => (line.trim() ? Option.toArray(decodeStep(line)) : []));

const USER_REQUEST = /<USER_REQUEST>\n?([\s\S]*?)\n?<\/USER_REQUEST>/u;

/** The person's own words of a `USER_INPUT` step: what `<USER_REQUEST>` holds, without agy's metadata. */
export const agyRequestOf = (content: string): string =>
  USER_REQUEST.exec(content)?.[1] ?? content;

/** A `SYSTEM_MESSAGE`'s sender and what it says (`[Message] … sender=<s> priority=<p> content=<c>`). */
const SYSTEM_SAYS =
  /\[Message\][^\n]*?sender=(\S+) priority=\S+ content=([\s\S]*?)\n?<\/SYSTEM_MESSAGE>/u;

/** agy's notice that a cancel or its restart stopped every background task, as `SYSTEM_SAYS`'s content opens. */
const TASKS_STOPPED =
  /^\[Notice\] All your subagents and background tasks have been stopped/u;

/** When a `SYSTEM_MESSAGE` was sent, as its `[Message]` line names it. */
const SAID_AT = /\[Message\] timestamp=(\S+)/u;

/** A background command's end, as its `SYSTEM_MESSAGE` opens. */
const TASK_ENDED = /^Task id "[^"]*" finished with result:\n?/u;

/** The task a `RUNNING` result moved to the background, as its words name it. */
const TASK_STARTED = /task id: (\S+\/task-\d+)/u;

/** The task a call's result step moved to the background (a command, a timer), whose end is a later step ({@link taskEnd}); none for a result that is whole. */
export const backgroundTask = (step: AgyStep): string | undefined =>
  step.type === "GENERIC" && step.status === "RUNNING"
    ? TASK_STARTED.exec(step.content ?? "")?.[1]
    : undefined;

/** A background task's end, a command's or a timer's (a wake-up's prompt), as a `SYSTEM_MESSAGE` from it says it: the task and its result. */
export const taskEnd = (
  step: AgyStep
): { readonly task: string; readonly words: string } | undefined => {
  if (step.type !== "SYSTEM_MESSAGE") {
    return undefined;
  }
  const said = SYSTEM_SAYS.exec(step.content ?? "");
  const task = said?.[1];
  return task?.includes("/task-")
    ? {
        task,
        words: withoutHookNotice(
          (said?.[2] ?? "").replace(TASK_ENDED, "").trim()
        ),
      }
    : undefined;
};

/** A call's result step that is whole, as its result: its error for one that failed, else its content, without CawCo's notice. */
export const stepResult = (
  step: AgyStep
): { readonly content: string; readonly isError: boolean } => {
  const isError = step.status === "ERROR" || step.status === "INVALID";
  return {
    content: withoutHookNotice(
      isError ? (step.error ?? step.content ?? "") : (step.content ?? "")
    ),
    isError,
  };
};

/** One cancel CawCo made of the conversation's turn (agy-notes.ts `AgyNote.cancels`): when, and the last step agy had made then. */
interface AgyCancel {
  readonly after: number;
  readonly at: number;
}

/** One stop CawCo made of the conversation (agy-notes.ts `AgyNote.stops`). */
interface AgyStop {
  readonly at: number;
  readonly words: string;
}

/** What the reader needs of the conversation beyond its steps. */
interface ReadAs {
  readonly cancels?: readonly AgyCancel[];
  readonly sessionId: string;
  readonly stops?: readonly AgyStop[];
}

const entry = (
  sessionId: string,
  type: SessionMessage["type"],
  uuid: string,
  message: unknown,
  at: string | undefined,
  extra: Partial<SessionMessage> = {}
): SessionMessage => ({
  type,
  uuid,
  session_id: sessionId,
  message,
  parent_tool_use_id: null,
  parent_agent_id: null,
  ...(at ? { timestamp: new Date(at).toISOString() } : {}),
  ...extra,
});

/** A tool call's result. */
const resultEntry = (
  sessionId: string,
  uuid: string,
  toolUseId: string,
  content: string,
  isError: boolean,
  at: string | undefined
): SessionMessage =>
  entry(
    sessionId,
    "user",
    uuid,
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content,
          is_error: isError,
        },
      ],
    },
    at
  );

/** CawCo's stop of the conversation, as the live stream drew it. */
const stopEntry = (sessionId: string, stop: AgyStop): SessionMessage => {
  const uuid = `cawco-stop-${stop.at}`;
  return entry(
    sessionId,
    "system",
    uuid,
    {
      type: "system",
      subtype: REPEATED_FAILURE,
      uuid,
      session_id: sessionId,
      content: stop.words,
    },
    new Date(stop.at).toISOString()
  );
};

/** What a read carries from one step to the next. */
interface Reading {
  /** The calls of the last response whose results have not come yet, in order. */
  awaiting: string[];
  readonly entries: SessionMessage[];
  /** Where the last prompt's entry stands in {@link entries}: what a notice written after it closes goes before it. */
  input: number | undefined;
  /** When the last step was made. */
  lastAt: string | undefined;
  readonly sessionId: string;
  /** The calls moved to the background, by agy's task id. */
  readonly tasks: Map<string, string>;
}

/** A call agy ended with no result written, as its result {@link agyWords.callCancelled}. */
const cancelledEntry = (
  read: Reading,
  toolUseId: string,
  at: string | undefined
): SessionMessage =>
  resultEntry(
    read.sessionId,
    `${toolUseId}:result`,
    toolUseId,
    agyWords.callCancelled,
    true,
    at
  );

/** Every call still running closed as cancelled, `before` the entry at that place, else last; `tasks` too, the calls moved to the background. */
const cutOff = (
  read: Reading,
  at: string | undefined,
  { tasks, before }: { tasks: boolean; before?: number }
): void => {
  const cut = [...read.awaiting, ...(tasks ? read.tasks.values() : [])];
  read.awaiting = [];
  if (tasks) {
    read.tasks.clear();
  }
  const closed = cut.map((toolUseId) => cancelledEntry(read, toolUseId, at));
  read.entries.splice(before ?? read.entries.length, 0, ...closed);
  if (
    before !== undefined &&
    read.input !== undefined &&
    read.input >= before
  ) {
    read.input += closed.length;
  }
};

const userInput = (read: Reading, step: AgyStep, id: string): void => {
  // A call of the last response with no result yet was cut off part-way.
  cutOff(read, read.lastAt, { tasks: false });
  read.input = read.entries.length;
  read.entries.push(
    entry(
      read.sessionId,
      "user",
      id,
      { role: "user", content: agyRequestOf(step.content ?? "") },
      step.created_at
    )
  );
};

const plannerResponse = (read: Reading, step: AgyStep, id: string): void => {
  const { sessionId, entries } = read;
  const at = step.created_at;
  const calls = step.tool_calls ?? [];
  if (step.thinking) {
    entries.push(
      entry(
        sessionId,
        "assistant",
        `${id}:thinking`,
        {
          role: "assistant",
          content: [{ type: "thinking", thinking: step.thinking }],
        },
        at
      )
    );
  }
  if (step.content) {
    entries.push(
      entry(
        sessionId,
        "assistant",
        id,
        {
          role: "assistant",
          ...(step.model ? { model: step.model } : {}),
          content: [{ type: "text", text: step.content }],
        },
        at,
        calls.length === 0 ? { turnEnd: true } : {}
      )
    );
  }
  read.awaiting = calls.map((_, index) => `${id}-${index}`);
  calls.forEach((call, index) => {
    entries.push(
      entry(
        sessionId,
        "assistant",
        `${id}-${index}:call`,
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: `${id}-${index}`,
              name: call.name,
              input: { ...call.args },
            },
          ],
        },
        at
      )
    );
  });
};

const toolResult = (read: Reading, step: AgyStep): void => {
  const toolUseId = read.awaiting.shift();
  if (!toolUseId) {
    return;
  }
  const task = backgroundTask(step);
  if (task) {
    // Drawn where it ends ({@link systemMessage}).
    read.tasks.set(task, toolUseId);
    return;
  }
  const { content, isError } = stepResult(step);
  read.entries.push(
    resultEntry(
      read.sessionId,
      `${toolUseId}:result`,
      toolUseId,
      content,
      isError,
      step.created_at
    )
  );
};

/**
 * A background command's end or a wake-up, as its call's result; agy's
 * notice that it stopped its background tasks, each of them as cancelled,
 * before the prompt the notice follows; agy's other notices and reminders
 * to its model, nothing.
 */
const systemMessage = (read: Reading, step: AgyStep, id: string): void => {
  const said = SYSTEM_SAYS.exec(step.content ?? "");
  if (said?.[1] === "system" && TASKS_STOPPED.test(said[2] ?? "")) {
    const stamp = SAID_AT.exec(step.content ?? "")?.[1];
    cutOff(read, stamp ?? step.created_at, {
      tasks: true,
      ...(read.input === undefined ? {} : { before: read.input }),
    });
    return;
  }
  const ended = taskEnd(step);
  if (!ended) {
    return;
  }
  const { task: sender, words } = ended;
  const toolUseId = read.tasks.get(sender);
  if (toolUseId) {
    read.tasks.delete(sender);
    read.entries.push(
      resultEntry(
        read.sessionId,
        `${toolUseId}:result`,
        toolUseId,
        words,
        false,
        step.created_at
      )
    );
    return;
  }
  // A task whose start this read did not see (a compaction between).
  read.entries.push(
    entry(
      read.sessionId,
      "system",
      id,
      {
        type: "system",
        subtype: "task_notification",
        uuid: id,
        session_id: read.sessionId,
        task_id: sender,
        status: "completed",
        summary: words,
      },
      step.created_at
    )
  );
};

const checkpoint = (read: Reading, step: AgyStep, id: string): void => {
  read.awaiting = [];
  read.entries.push(
    entry(
      read.sessionId,
      "system",
      `${id}:boundary`,
      {
        type: "system",
        subtype: "compact_boundary",
        uuid: `${id}:boundary`,
        session_id: read.sessionId,
        compact_metadata: { trigger: "manual" },
      },
      step.created_at
    ),
    entry(
      read.sessionId,
      "user",
      id,
      { role: "user", content: step.content ?? "" },
      step.created_at,
      { compactSummary: true }
    )
  );
};

const errorMessage = (read: Reading, step: AgyStep, id: string): void => {
  const words = step.error ?? step.content ?? "";
  read.entries.push(
    entry(
      read.sessionId,
      "assistant",
      id,
      { role: "assistant", content: [{ type: "text", text: words }] },
      step.created_at,
      { error: words }
    )
  );
};

/** Each step type's rows; a type agy 1.5.18 does not write has none. */
const STEP_ROWS: Readonly<
  Record<string, (read: Reading, step: AgyStep, id: string) => void>
> = {
  USER_INPUT: userInput,
  PLANNER_RESPONSE: plannerResponse,
  GENERIC: toolResult,
  SYSTEM_MESSAGE: systemMessage,
  CHECKPOINT: checkpoint,
  ERROR_MESSAGE: errorMessage,
};

/**
 * The steps as transcript entries, oldest first, every compaction where it
 * happened. A tool call's id is CawCo's own (`agy-<step>-<n>`): agy stores
 * none, and its results follow its calls in their order.
 */
export const agyEntries = (
  steps: readonly AgyStep[],
  as: ReadAs
): SessionMessage[] => {
  const read: Reading = {
    sessionId: as.sessionId,
    entries: [],
    awaiting: [],
    input: undefined,
    lastAt: undefined,
    tasks: new Map(),
  };
  const stops = [...(as.stops ?? [])].sort((a, b) => a.at - b.at);
  const stopsUntil = (until: number) => {
    while (stops.length > 0 && (stops[0]?.at ?? until) <= until) {
      const stop = stops.shift();
      if (stop) {
        read.entries.push(stopEntry(as.sessionId, stop));
      }
    }
  };
  // A cancel is placed by the last step agy had made when it was sent, as a
  // step's time is whole seconds: a prompt sent in the cancel's own second
  // is after it.
  const cancels = [...(as.cancels ?? [])].sort((a, b) => a.after - b.after);
  const cancelsBefore = (index: number) => {
    while (cancels.length > 0 && (cancels[0]?.after ?? index) < index) {
      const cancel = cancels.shift();
      if (cancel) {
        cutOff(read, new Date(cancel.at).toISOString(), { tasks: true });
      }
    }
  };
  for (const step of steps) {
    const at = step.created_at ? Date.parse(step.created_at) : Number.NaN;
    if (!Number.isNaN(at)) {
      stopsUntil(at);
    }
    cancelsBefore(step.step_index);
    STEP_ROWS[step.type]?.(read, step, `agy-${step.step_index}`);
    read.lastAt = step.created_at ?? read.lastAt;
  }
  stopsUntil(Number.POSITIVE_INFINITY);
  cancelsBefore(Number.POSITIVE_INFINITY);
  return read.entries;
};

/** The steps of the transcript at `path`; none when it is not there. */
export const readAgySteps = async (path: string): Promise<AgyStep[]> =>
  agySteps(await readFile(path, "utf8").catch(unlessGone("")));

/**
 * The span asked of `entries`: `whole`, every one; `chain`, what the model
 * holds now, from its last compaction's summary on.
 */
export const agySpan = (
  entries: SessionMessage[],
  span: TranscriptSpan
): SessionMessage[] => {
  if (span === "whole") {
    return entries;
  }
  const last = entries.findLastIndex((one) => one.compactSummary);
  return last >= 0 ? entries.slice(last) : entries;
};

/** The window `ask` names of `entries`, widened back to a turn's start (codex-history.ts `windowOf`). */
export const agyWindow = (
  entries: SessionMessage[],
  ask: WindowAsk
): TranscriptWindow => windowOf(entries, ask);
