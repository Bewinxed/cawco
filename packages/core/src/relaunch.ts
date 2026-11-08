/**
 * How a session with no process comes back, and why a failed one never
 * does: its failure's kind, the words a person reads, and the relaunch every
 * revive decides by. Imported alone by a reader of it; core's index
 * re-exports it.
 */

/**
 * A missing Claude conversation is terminal; restarting cannot recreate its
 * history. The words a person reads; what CawCo decides by is the kind
 * `conversation-gone` ({@link LastErrorKind}).
 */
export const CLAUDE_CONVERSATION_GONE =
  "This Claude Code conversation is gone and cannot be resumed. Start a new session to continue working.";

/**
 * What a session's failure was, typed where it is found, beside the words
 * (`lastError`) a person reads. Every decision about a failed row reads this,
 * never the words:
 * - `conversation-gone` — the conversation it would resume is gone
 *   ({@link CLAUDE_CONVERSATION_GONE}): it never runs on it again;
 * - `restart-lost` — its daemon restarted and it left nothing to resume from
 *   ({@link RESTART_LOST});
 * - `start-refused` — the hub would not restore it: its account or its
 *   settings cannot run on its machine (hub server.ts `restore`). It stays
 *   so, unrestored, until they can.
 * A failure no producer typed has none.
 */
export type LastErrorKind =
  "conversation-gone" | "restart-lost" | "start-refused";

/** An error that carries its {@link LastErrorKind} from where it is made to the row it fails. */
export class KindedError extends Error {
  readonly lastErrorKind: LastErrorKind;
  constructor(lastErrorKind: LastErrorKind, message: string) {
    super(message);
    this.name = "KindedError";
    this.lastErrorKind = lastErrorKind;
  }
}

/** A Claude conversation that is gone: its words, and its kind. */
export const conversationGone = (): KindedError =>
  new KindedError("conversation-gone", CLAUDE_CONVERSATION_GONE);

/**
 * Whether a row the hub refused to restore still stands refused: filed
 * `error` with the kind `start-refused`, whatever words its refusal said
 * then or says now. Its restore fails it once, not on every boot.
 */
export const startRefused = (row: {
  lastErrorKind?: LastErrorKind | null;
  status: string;
}): boolean => row.status === "error" && row.lastErrorKind === "start-refused";

/** Every {@link LastErrorKind}, for a reader of one off the wire. */
const LAST_ERROR_KINDS: ReadonlySet<string> = new Set<LastErrorKind>([
  "conversation-gone",
  "restart-lost",
  "start-refused",
]);

/** `value` as a {@link LastErrorKind}, when it is one. */
export const asLastErrorKind = (value: unknown): LastErrorKind | undefined =>
  typeof value === "string" && LAST_ERROR_KINDS.has(value)
    ? (value as LastErrorKind)
    : undefined;

/** The {@link LastErrorKind} an error carries, when its maker typed it. */
export const lastErrorKindOf = (error: unknown): LastErrorKind | undefined =>
  error instanceof KindedError ? error.lastErrorKind : undefined;

/**
 * How a session with no process comes back: on its conversation by its key;
 * fresh under the same id when its harness never began one (no key: it never
 * said init), so there is nothing to lose; or not at all when its
 * conversation existed and is gone, or a continuation took its work item on
 * ({@link InstanceRow.continuedInto}): two sessions never work one item in
 * one workspace. The one decision for every revive: a relaunch or rewind
 * from the dashboard, the hub's wake for a send, and a relaunch on another
 * account at a limit.
 */
export type Relaunch =
  | { kind: "resume"; sessionKey: string }
  | { kind: "fresh" }
  | { kind: "refused"; reason: string };

/** Why a session whose work a continuation took on never runs again. */
export const continuedWords = (continuedInto: string): string =>
  `This session was continued in session ${continuedInto.slice(0, 8)}, which carries its work on; it doesn't run again. Write to ${continuedInto.slice(0, 8)}.`;

/**
 * Where a continued session's work went, as its page says it in its
 * composer's place (the words before the new session's title, a link to
 * it), and as the hub refuses a person's message to it: a moved
 * conversation points onward, it never takes a message on silently.
 */
export const CONTINUED_IN = "Continued in";

/** {@link CONTINUED_IN} with the new session's title, as one sentence. */
export const continuedInWords = (title: string): string =>
  `${CONTINUED_IN} ${title}`;

export const relaunchOf = (row: {
  continuedInto?: string | null;
  lastErrorKind?: LastErrorKind | null;
  sessionId: string | null;
}): Relaunch => {
  if (row.continuedInto) {
    return { kind: "refused", reason: continuedWords(row.continuedInto) };
  }
  if (row.lastErrorKind === "conversation-gone") {
    return { kind: "refused", reason: CLAUDE_CONVERSATION_GONE };
  }
  return row.sessionId
    ? { kind: "resume", sessionKey: row.sessionId }
    : { kind: "fresh" };
};
