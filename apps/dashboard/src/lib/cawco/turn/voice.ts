/**
 * Who answers in a transcript, when it is not a harness session's agent: a
 * pane hosting one (ThreadPane, a project's Caw) says so here, and the rows
 * draw it. `face` stands in the speaker line's mark (`live`: the row is the
 * turn in flight); `tasks` draws the tasks a turn is about under it, and
 * `files` the project folder's files it says it wrote; `event` hangs what
 * an event's line carries under it (a not-woken note's reason and Try
 * again), by the event's message id.
 */
import { getContext, type Snippet, setContext } from "svelte";

export interface TranscriptVoice {
  /** Under a thread event's line, by its message id: what the pane draws for it, if anything. */
  event?: Snippet<[string]>;
  face?: Snippet<[boolean]>;
  /** The files, and the id of the message that names them. */
  files?: Snippet<[string[], string]>;
  tasks?: Snippet<[string[]]>;
}

const KEY = Symbol("transcript-voice");

/** The `noteKind` of a thread's event: something that woke a project's Caw. */
export const CAW_EVENT = "caw.event";

export const setVoice = (voice: TranscriptVoice): TranscriptVoice =>
  setContext(KEY, voice);

export const useVoice = (): TranscriptVoice | undefined =>
  getContext<TranscriptVoice | undefined>(KEY);
