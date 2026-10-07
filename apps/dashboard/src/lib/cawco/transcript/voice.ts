/**
 * Who answers in a transcript, when it is not a harness session's agent: a
 * pane hosting one (ThreadPane, a project's Caw) says so here, and the rows
 * draw it. `face` stands in the speaker line's mark (`live`: the row is the
 * turn in flight); `tasks` draws the tasks a turn is about under it.
 */
import { getContext, type Snippet, setContext } from "svelte";

export interface TranscriptVoice {
  face?: Snippet<[boolean]>;
  tasks?: Snippet<[string[]]>;
}

const KEY = Symbol("transcript-voice");

/** The `noteKind` of a thread's event: something that woke a project's Caw. */
export const CAW_EVENT = "caw.event";

export const setVoice = (voice: TranscriptVoice): TranscriptVoice =>
  setContext(KEY, voice);

export const useVoice = (): TranscriptVoice | undefined =>
  getContext<TranscriptVoice | undefined>(KEY);
