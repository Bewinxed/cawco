/**
 * What a call agy ran said, read from the transcript agy writes. agy 1.5.18
 * puts a result in its ACP `tool_call_update` for `run_command` alone: an
 * MCP tool's call and a `read_file` end with no `content` and no
 * `rawOutput` (the project's `assets/123883c1/tool-updates.txt`). The
 * result is in the session's transcript (`transcript_full.jsonl`, one step
 * a line), at the step its `PostToolUse` hook names: the hook's payload
 * carries the call's `toolCall.id`, its `stepIdx` and the transcript's
 * `transcriptPath` (`assets/8c459ba3/q2-payloads.txt`), and the step there
 * holds the result as its `content`
 * (`assets/123883c1/agy-brain-transcript_full.jsonl`). agy writes that step
 * only after its hook is answered and the call's end is sent, some
 * milliseconds behind it, so the step is looked for again until it is
 * there.
 */
import { readFile } from "node:fs/promises";
import { Effect, Option, Schedule, Schema } from "effect";

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

/** One step of agy's transcript, as far as a result is read from it. */
const Step = Schema.Struct({
  step_index: Schema.Number,
  status: Schema.optional(Schema.String),
  content: Schema.optional(Schema.String),
});

const decodeStep = Schema.decodeUnknownOption(Schema.fromJsonString(Step));

/**
 * Step `index` of a transcript's text, read from its end, where a new
 * step is: agy appends steps in order, so one before `index` means it is
 * not written yet.
 */
const stepIn = (
  text: string,
  index: number
): Option.Option<typeof Step.Type> => {
  const lines = text.split("\n");
  for (let at = lines.length - 1; at >= 0; at -= 1) {
    const step = decodeStep(lines[at] ?? "");
    if (Option.isNone(step)) {
      continue;
    }
    if (step.value.step_index <= index) {
      return step.value.step_index === index ? step : Option.none();
    }
  }
  return Option.none();
};

/** How long a result agy has not written yet is looked for again. */
const STEP_LOOKS = Schedule.spaced("20 millis").pipe(
  Schedule.upTo({ times: 50 })
);

/** The result agy wrote at `at`, once it has; none for a step it holds no text for, or one not written within a second. */
export const writtenResult = (
  at: WrittenAt
): Effect.Effect<Option.Option<string>> =>
  Effect.tryPromise(() => readFile(at.transcriptPath, "utf8")).pipe(
    Effect.map((text) => stepIn(text, at.stepIdx)),
    Effect.flatMap(Effect.fromOption),
    Effect.retry(STEP_LOOKS),
    Effect.option,
    Effect.map(
      // A call agy moved to the background (a command, a timer) holds its
      // start at that step, `RUNNING`, never its end, which agy writes as a
      // later message (agy-history.ts): no result is read from it.
      Option.flatMap(({ content, status }) =>
        Option.fromNullishOr(
          status === "RUNNING" ? undefined : content || undefined
        )
      )
    )
  );
