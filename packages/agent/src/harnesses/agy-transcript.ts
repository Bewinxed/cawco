/**
 * What a call agy ran said, read from the transcript agy writes, where every
 * result is whole: agy 1.5.18 puts a result in its ACP `tool_call_update`
 * for `run_command` alone, and a timer's end there carries none (the
 * project's `assets/123883c1/tool-updates.txt`). The session's transcript
 * (`transcript_full.jsonl`, one step a line, agy-history.ts) holds each
 * call's result at the step its `PostToolUse` hook names: the hook's
 * payload carries the call's `toolCall.id`, its `stepIdx` and the
 * transcript's `transcriptPath` (`assets/8c459ba3/q2-payloads.txt`). A call
 * agy moved to the background (a command, a timer) holds its start there,
 * `RUNNING`, and its end is a later `SYSTEM_MESSAGE` from its task: the
 * result read back later, so it is the one said live. Such a call's
 * `PostToolUse` comes as its task ends or is cancelled, naming the
 * `RUNNING` step (`assets/b61a7f1b/REPORT.md`). agy writes a step, or a
 * task's end, some tens of milliseconds after the call's end is sent, so it
 * is looked for again until it is there.
 */
import { readFile } from "node:fs/promises";
import { Effect, Option, Schedule, Schema } from "effect";
import { fromPromise } from "../rejected";
import {
  type AgyStep,
  agySteps,
  backgroundTask,
  stepResult,
  taskEnd,
} from "./agy-history";

/** What agy's `PostToolUse` payload names of where the call's result is written. */
const PostToolUse = Schema.Struct({
  hookEventName: Schema.Literal("PostToolUse"),
  stepIdx: Schema.Number,
  transcriptPath: Schema.String,
  toolCall: Schema.Struct({ id: Schema.String }),
});

const decodePostToolUse = Schema.decodeUnknownOption(
  Schema.fromJsonString(PostToolUse)
);

/** Where agy writes the result of one call: its transcript and the step. */
export interface WrittenAt {
  readonly stepIdx: number;
  readonly transcriptPath: string;
}

/** The call one line of CawCo's hook ended and where agy writes its result; none for a line that is no `PostToolUse`. */
export const writtenAt = (
  line: string
): Option.Option<{ readonly id: string; readonly at: WrittenAt }> =>
  Option.map(
    decodePostToolUse(line),
    ({ stepIdx, toolCall, transcriptPath }) => ({
      id: toolCall.id,
      at: { stepIdx, transcriptPath },
    })
  );

/**
 * The steps of a transcript's text from step `index` on, read from its end,
 * where new steps are: agy appends steps in order, so the read stops at the
 * first step before `index`.
 */
const stepsFrom = (text: string, index: number): AgyStep[] => {
  const lines = text.split("\n");
  const steps: AgyStep[] = [];
  for (let at = lines.length - 1; at >= 0; at -= 1) {
    const [step] = agySteps(lines[at] ?? "");
    if (!step) {
      continue;
    }
    if (step.step_index < index) {
      break;
    }
    steps.push(step);
  }
  return steps.reverse();
};

/** A call's result, as its transcript holds it. */
export interface Written {
  readonly content: string;
  readonly isError: boolean;
}

/** Why a call's result is not read yet: its step is not written, or its task has not ended. */
type Unread = "unwritten" | "running";

/**
 * The result the steps from the call's own on hold whole: its step's, or
 * for a call moved to the background the end its task's `SYSTEM_MESSAGE`
 * says.
 */
const resultIn = (
  steps: readonly AgyStep[],
  index: number
): Written | Unread => {
  const [own, ...after] = steps;
  if (own?.step_index !== index) {
    return "unwritten";
  }
  const task = backgroundTask(own);
  if (task === undefined) {
    return stepResult(own);
  }
  for (const step of after) {
    const ended = taskEnd(step);
    if (ended?.task === task) {
      return { content: ended.words, isError: false };
    }
  }
  return "running";
};

/** How long a result agy has not written yet is looked for again. */
const STEP_LOOKS = Schedule.spaced("25 millis").pipe(
  Schedule.upTo({ duration: "1 second" })
);

/**
 * The result of the call agy wrote at `at`, once it has; none for one not
 * written within the looks. A call `cancelled` ended with its task, which
 * then writes no end: none at once.
 */
export const writtenResult = (
  at: WrittenAt,
  cancelled: boolean
): Effect.Effect<Option.Option<Written>> =>
  fromPromise(() => readFile(at.transcriptPath, "utf8")).pipe(
    Effect.map((text) => resultIn(stepsFrom(text, at.stepIdx), at.stepIdx)),
    Effect.flatMap((read) => {
      if (typeof read === "object") {
        return Effect.succeed(Option.some(read));
      }
      return read === "running" && cancelled
        ? Effect.succeedNone
        : Effect.fail(read);
    }),
    Effect.retry(STEP_LOOKS),
    Effect.orElseSucceed(() => Option.none<Written>())
  );
