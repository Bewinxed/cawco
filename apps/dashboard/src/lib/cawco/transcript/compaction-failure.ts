/**
 * Why a compaction failed, in the reader's words, and what to do about it
 * (WORDS.md, Error formula: what happened, why, how to fix it, what happens
 * next). The line's heading says what happened; this is the rest.
 *
 * The harnesses say why in their own words: Claude Code's `compact_error` as
 * it would print it in its terminal ("Conversation too long. Press esc twice
 * to go up a few messages and try again."), opencode's stored error as its
 * class, status and message ("ProviderAuthError 401: …", the agent's
 * `errorText`). The kinds either can name are said plainly here; anything
 * else keeps the harness's message, without a class name in front of it.
 */

/** A class name and status the agent puts in front of opencode's message. */
const CLASS = /^([A-Za-z]*Error)(?: (\d{3}))?: /;
/** A status code standing in the words themselves. */
const STATUS = /\b(4\d\d|5\d\d)\b/;
/** What each kind sounds like in a harness's own words. */
const AUTH = /api key|unauthori[sz]ed|authentication/i;
const TOO_LONG =
  /too (long|large)|context (window|limit)|exceeds (the )?model/i;
const STOPPED = /\babort|\bcancel+ed\b|\binterrupt/i;
const TOO_SHORT = /not enough messages|nothing to compact/i;
const BUSY = /rate.?limit|overloaded/i;
/** The stops and spaces a sentence ends on. */
const CLOSING = /[.\s]+$/;

interface Kind {
  /** Why, as a sentence with no full stop. */
  cause: (status: number | null) => string;
  /** How to fix it, after "The conversation stays as it was; ". */
  fix: string;
  matches: (kind: string, status: number | null, words: string) => boolean;
}

const coded = (words: string, status: number | null): string =>
  status === null ? words : `${words} (${status})`;

const AGAIN = "send /compact to try again";

const KINDS: Kind[] = [
  {
    matches: (kind, status, words) =>
      kind === "ProviderAuthError" ||
      status === 401 ||
      status === 403 ||
      AUTH.test(words),
    cause: (status) => coded("The provider rejected the API key", status),
    fix: "check the provider's key, then send /compact again",
  },
  {
    matches: (kind, _status, words) =>
      kind === "ContextOverflowError" || TOO_LONG.test(words),
    cause: () => "It's too long for the model to summarise",
    fix: "start a new session to go on with a clean context",
  },
  {
    matches: (kind, _status, words) =>
      kind === "MessageAbortedError" || STOPPED.test(words),
    cause: () => "It was stopped before it finished",
    fix: "send /compact to start it again",
  },
  {
    matches: (kind) => kind === "MessageOutputLengthError",
    cause: () => "The summary ran past the model's output limit",
    fix: AGAIN,
  },
  {
    matches: (_kind, _status, words) => TOO_SHORT.test(words),
    cause: () => "There isn't enough of it to compact yet",
    fix: "it can be compacted once it has grown",
  },
  {
    matches: (_kind, status, words) =>
      status === 429 || status === 529 || BUSY.test(words),
    cause: (status) => coded("The provider is too busy to answer", status),
    fix: "wait a moment, then send /compact again",
  },
  {
    matches: (kind) => kind === "ContentFilterError",
    cause: () => "The provider's content filter stopped the summary",
    fix: AGAIN,
  },
];

/** A sentence's first letter raised, its closing stops dropped. */
const sentence = (words: string): string => {
  const trimmed = words.trim().replace(CLOSING, "");
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

/**
 * The reason a compaction failed and the way on, for the line under
 * "Couldn't compact the conversation".
 */
export function compactionFailure(error: string | undefined): string {
  const raw = (error ?? "").trim();
  const named = CLASS.exec(raw);
  const kind = named?.[1] ?? "";
  const words = named ? raw.slice(named[0].length) : raw;
  const status = Number(named?.[2] ?? STATUS.exec(words)?.[1]) || null;
  const known = KINDS.find((each) => each.matches(kind, status, words));
  if (known) {
    return `${known.cause(status)}. The conversation stays as it was; ${known.fix}.`;
  }
  if (!words) {
    return `The conversation stays as it was; ${AGAIN}.`;
  }
  const cause = sentence(words);
  const shown =
    status !== null && !cause.includes(String(status))
      ? coded(cause, status)
      : cause;
  return `${shown}. The conversation stays as it was; ${AGAIN}.`;
}
