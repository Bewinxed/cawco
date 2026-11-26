/**
 * What a session said in its agy conversation, kept by CawCo so a new
 * conversation can carry it on. agy holds a conversation's history itself
 * and offers no edit of it over ACP (1.5.18: `session/new`, `load`,
 * `resume`, `list`, `close`; its TUI's rewind is not exposed), and a
 * resumed or loaded conversation sends the same history again. So when
 * Google refuses a conversation's history as invalid (a picture it can't
 * read, kept from an earlier prompt), the session goes on in a new agy
 * conversation whose first prompt carries this record, in CawCo's own
 * words (agy-runtime.ts).
 *
 * One JSON line per message: the person's prompts (their pictures counted,
 * not kept) and agy's replies, in a file per conversation under the
 * account's agy home, beside agy's own store, so a host started again on a
 * stored session reads what the one before it kept.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeFolderSync } from "@cawco/core/folders";
import { Effect, Option, Schema } from "effect";

/** One message as kept. */
const Carried = Schema.Struct({
  who: Schema.Literals(["person", "agent"]),
  text: Schema.String,
  pictures: Schema.optional(Schema.Number),
});
export type Carried = typeof Carried.Type;

const decodeLine = Schema.decodeUnknownOption(Schema.fromJsonString(Carried));

/** Where conversation `sessionId` of agy home `home` is kept. */
const fileOf = (home: string, sessionId: string): string =>
  join(home, "cawco-carry", `${sessionId}.jsonl`);

/** `lines` added to what conversation `sessionId` keeps; a write that fails is said and dropped, as the record is the session's aid, not its truth. */
export const keepCarried = (
  home: string,
  sessionId: string,
  lines: readonly Carried[]
): void => {
  if (lines.length === 0) {
    return;
  }
  const file = fileOf(home, sessionId);
  Effect.runSync(
    Effect.try(() => {
      makeFolderSync(join(home, "cawco-carry"));
      appendFileSync(
        file,
        lines.map((line) => `${JSON.stringify(line)}\n`).join("")
      );
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(() =>
          console.warn(`[agy] keeping ${file} failed: ${String(error.cause)}`)
        )
      )
    )
  );
};

/** What conversation `sessionId` keeps, oldest first; none when it keeps nothing. */
export const carriedOf = (home: string, sessionId: string): Carried[] =>
  Effect.runSync(
    Effect.try(() => readFileSync(fileOf(home, sessionId), "utf8")).pipe(
      Effect.map((text) =>
        text.split("\n").flatMap((line) => Option.toArray(decodeLine(line)))
      ),
      Effect.orElseSucceed(() => [])
    )
  );

/** Characters to a token, as Google counts Gemini's ("A token is equivalent to about 4 characters", ai.google.dev/gemini-api/docs/tokens). */
const CHARS_PER_TOKEN = 4;

/**
 * The carried record as the new conversation's first words: its newest
 * messages that fit the context window agy last reported (all of them when
 * it reported none), then the person's new message after it.
 */
export const carriedWords = (
  lines: readonly Carried[],
  window: number | undefined
): string => {
  const room = window ? window * CHARS_PER_TOKEN : Number.POSITIVE_INFINITY;
  const kept: string[] = [];
  let used = 0;
  for (const line of [...lines].reverse()) {
    const pictures = line.pictures
      ? ` [${line.pictures} picture${line.pictures === 1 ? "" : "s"}, not carried]`
      : "";
    const said = `<${line.who}>${pictures}\n${line.text}\n</${line.who}>`;
    used += said.length;
    if (used > room) {
      break;
    }
    kept.unshift(said);
  }
  return [
    "This conversation goes on from an earlier one in this CawCo session, which Google refused as invalid, most likely for a picture it could not read. Its pictures and tool calls are not carried. Here is what the person and you said in it, oldest first:",
    "<earlier-conversation>",
    ...kept,
    "</earlier-conversation>",
    "The person's new message follows.",
  ].join("\n");
};
