/**
 * How a session with no process comes back, and why a failed one never
 * does: its failure's kind, the words a person reads, and the relaunch every
 * revive decides by.
 */

import { continuedWords } from "./words/relaunch";
import { CONVERSATION_GONE } from "./words/session-ends";

/**
 * What a session's failure was, typed where it is found, beside the words
 * (`lastError`) a person reads. Every decision about a failed row reads this,
 * never the words:
 * - `conversation-gone` — the conversation it would resume is gone from
 *   its harness's store ({@link CONVERSATION_GONE}): it never runs on it
 *   again, and a new session is how its work goes on;
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

/**
 * A conversation its harness no longer stores, which restarting cannot
 * bring back: its words, and its kind. Claude Code's missing transcript and
 * OpenCode's session no database on its machine holds are both this.
 */
export const conversationGone = (): KindedError =>
  new KindedError("conversation-gone", CONVERSATION_GONE);

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
const LAST_ERROR_KINDS: readonly LastErrorKind[] = [
  "conversation-gone",
  "restart-lost",
  "start-refused",
];

/** `value` as a {@link LastErrorKind}, when it is one. */
export const asLastErrorKind = (value: unknown): LastErrorKind | undefined =>
  LAST_ERROR_KINDS.find((kind) => kind === value);

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

export const relaunchOf = (row: {
  continuedInto?: string | null;
  lastErrorKind?: LastErrorKind | null;
  sessionId: string | null;
}): Relaunch => {
  if (row.continuedInto) {
    return { kind: "refused", reason: continuedWords(row.continuedInto) };
  }
  if (row.lastErrorKind === "conversation-gone") {
    return { kind: "refused", reason: CONVERSATION_GONE };
  }
  return row.sessionId
    ? { kind: "resume", sessionKey: row.sessionId }
    : { kind: "fresh" };
};
