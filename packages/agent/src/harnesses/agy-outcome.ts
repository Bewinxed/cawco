/**
 * How an agy turn really ended. agy answers a prompt Google's API failed
 * with `end_turn` and writes the failure only as an error step in the
 * conversation's own store (`<app-data>/conversations/<id>.db`, its `steps`
 * table), and maps a spent quota to the stop reason `refusal`. So the turn's
 * end reads the steps the prompt added, read-only, and says a spent quota as
 * CawCo's limit stop with its reset time, and any other error in its own
 * words. This follows T3 Code's `AntigravityTurnOutcome.ts` (its step types
 * and the patterns of agy's error text are read from it).
 */
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { AGY_APP_DATA } from "@cawco/core/paths/harnesses";
import { HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import { agyWords } from "@cawco/core/words/agy";
import { Effect } from "effect";

/** `CORTEX_STEP_TYPE_ERROR_MESSAGE` in agy's store. */
const ERROR_STEP = 17;
/** How much of an error step's payload is read: its words lead, a stack trace follows. */
const PAYLOAD_BYTES = 16_384;

const QUOTA_EXHAUSTED = /\breason:QUOTA_EXHAUSTED\b/u;
const RESET_TIMESTAMP = /\bquotaResetTimeStamp:([^\s\]]+)/u;
const RESET_DELAY =
  /\b(?:quotaResetDelay|retryDelay):((?:\d+(?:\.\d+)?(?:ns|us|µs|ms|h|m|s))+)(?=[\s\]])/u;
const RESETS_IN = /\bResets in ((?:\d+(?:\.\d+)?(?:ns|us|µs|ms|h|m|s))+)/u;
const DURATION_PART = /(\d+(?:\.\d+)?)(ns|us|µs|ms|h|m|s)/gu;
const UNIT_MS: Readonly<Record<string, number>> = {
  ns: 1e-6,
  us: 1e-3,
  µs: 1e-3,
  ms: 1,
  s: MINUTE_MS / 60,
  m: MINUTE_MS,
  h: HOUR_MS,
};
/** Google's API error as agy renders it: `Error 429, Message: …, Status: RESOURCE_EXHAUSTED`. */
const API_ERROR =
  /Error (\d{3}), Message: ((?:(?!, Status: ).)+), Status: ([A-Z_]+|\d{3}[^,\n]*)/su;
/** agy 1.5 with a Google account: `STATUS (code NNN): message`. */
const STATUS_ERROR = /(?<![A-Z_])([A-Z_]+) \(code (\d{3})\): (\P{Cc}+)/u;

/** The conversation store of session `sessionId` in agy home `home`. */
const storeOf = (home: string, sessionId: string): string =>
  join(home, AGY_APP_DATA, "conversations", `${sessionId}.db`);

/** `work` on the store read-only, or nothing when it is not there or not readable. */
const reading = <A>(
  file: string,
  work: (database: Database) => A
): A | undefined =>
  Effect.runSync(
    Effect.acquireUseRelease(
      Effect.try(() => new Database(file, { readonly: true })),
      (database) => Effect.try(() => work(database)),
      (database) => Effect.sync(() => database.close())
    ).pipe(Effect.orElseSucceed(() => undefined))
  );

/** The last step's index in session `sessionId`'s store: where a prompt's steps begin after; -1 for none. */
export const lastStep = (home: string, sessionId: string): number =>
  reading(storeOf(home, sessionId), (database) => {
    const row = database
      .query<{ idx: number | null }, []>("SELECT max(idx) AS idx FROM steps")
      .get();
    return row?.idx ?? -1;
  }) ?? -1;

/** The error's words of the last step after `after`, when that step is an error. */
const errorAfter = (
  home: string,
  sessionId: string,
  after: number
): string | undefined =>
  reading(storeOf(home, sessionId), (database) => {
    const row = database
      .query<{ payload: Uint8Array | null; type: number }, [number, number]>(
        "SELECT step_type AS type, substr(step_payload, 1, ?) AS payload FROM steps WHERE idx > ? ORDER BY idx DESC LIMIT 1"
      )
      .get(PAYLOAD_BYTES, after);
    return row?.type === ERROR_STEP && row.payload
      ? new TextDecoder().decode(row.payload)
      : undefined;
  });

/** When the quota resets, ISO, as the error says it: a time, else a delay from now. */
const resetOf = (text: string, now: number): string | undefined => {
  const stamp = RESET_TIMESTAMP.exec(text)?.[1];
  if (stamp && !Number.isNaN(Date.parse(stamp))) {
    return new Date(stamp).toISOString();
  }
  const delay = RESET_DELAY.exec(text)?.[1] ?? RESETS_IN.exec(text)?.[1];
  if (!delay) {
    return;
  }
  let ms = 0;
  for (const [, amount, unit] of delay.matchAll(DURATION_PART)) {
    ms += Number(amount) * (UNIT_MS[unit ?? ""] ?? 0);
  }
  return ms > 0 ? new Date(now + ms).toISOString() : undefined;
};

/** How a turn ended badly, in CawCo's words; none for a turn that did not. */
export type TurnFault =
  | { atLimit: true; words: string }
  | {
      atLimit?: undefined;
      /**
       * Google refused the request as invalid (`INVALID_ARGUMENT`, 400):
       * built from the conversation's history, which agy sends again with
       * every later request, so the conversation fails each turn after it.
       */
      invalid?: true;
      /** Google's own words, when the error said them. */
      said?: string;
      words: string;
    };

/**
 * How the turn of session `sessionId` that began after step `after` ended
 * badly, if it did: agy's stop reason `refusal` or a `QUOTA_EXHAUSTED`
 * error is the account's limit; a 429 from Google's API too; any other
 * error step is said in its own words, a request Google refused as invalid
 * marked so.
 */
export const turnFault = (
  home: string,
  sessionId: string,
  after: number,
  stopReason: string,
  now: number
): TurnFault | undefined => {
  const text = errorAfter(home, sessionId, after);
  if (text === undefined && stopReason !== "refusal") {
    return;
  }
  const said = text ?? "";
  if (stopReason === "refusal" || QUOTA_EXHAUSTED.test(said)) {
    return { atLimit: true, words: agyWords.quota(resetOf(said, now)) };
  }
  const api = API_ERROR.exec(said);
  const status = STATUS_ERROR.exec(said);
  const http = api?.[1] ?? status?.[2];
  const name = api?.[3] ?? status?.[1];
  const message = (api?.[2] ?? status?.[3])?.trim();
  if (http === "429" || name === "RESOURCE_EXHAUSTED") {
    return { atLimit: true, words: agyWords.quota(resetOf(said, now)) };
  }
  return {
    words: message ? agyWords.apiError(message) : agyWords.unknownError,
    ...(message ? { said: message } : {}),
    ...(http === "400" || name === "INVALID_ARGUMENT"
      ? { invalid: true as const }
      : {}),
  };
};
