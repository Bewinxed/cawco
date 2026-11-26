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
 * (`assets/123883c1/agy-brain-transcript_full.jsonl`). agy waits on the
 * hook's answer before it says the call ended, so the result is read
 * while it waits.
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

/** One step of agy's transcript, as far as a result is read from it. */
const Step = Schema.Struct({
  step_index: Schema.Number,
  content: Schema.optional(Schema.String),
});

const decodeStep = Schema.decodeUnknownOption(Schema.fromJsonString(Step));

/** How long a result agy has not written yet is looked for again. */
const STEP_LOOKS = Schedule.spaced("50 millis").pipe(
  Schedule.upTo({ times: 20 })
);

/** Step `index` of the transcript at `path`, once agy has written it. */
const stepAt = (path: string, index: number) =>
  Effect.tryPromise(() => readFile(path, "utf8")).pipe(
    Effect.map((text) =>
      text
        .split("\n")
        .map((line) => decodeStep(line))
        .flatMap((step) => (Option.isSome(step) ? [step.value] : []))
        .findLast((step) => step.step_index === index)
    ),
    Effect.flatMap(Effect.fromNullishOr),
    Effect.retry(STEP_LOOKS),
    Effect.option
  );

/**
 * The result of the call one line of CawCo's hook ended, as agy wrote it
 * in its transcript: none for a line that is no `PostToolUse`, or a step
 * agy holds no text for.
 */
export const writtenResult = (
  line: string
): Effect.Effect<Option.Option<{ id: string; text: string }>> => {
  const ended = decodePostToolUse(line);
  if (Option.isNone(ended)) {
    return Effect.succeedNone;
  }
  const { stepIdx, toolCall, transcriptPath } = ended.value;
  return stepAt(transcriptPath, stepIdx).pipe(
    Effect.map(
      Option.flatMap(({ content }) =>
        content
          ? Option.some({ id: toolCall.id, text: content })
          : Option.none()
      )
    )
  );
};
