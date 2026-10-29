/**
 * Who answers in a transcript, when it is not a harness session's agent: a
 * pane hosting one (ThreadPane, a project's Caw) says so here, and the rows
 * draw it. `face` stands in the speaker line's mark (`live`: the row is the
 * turn in flight); `tasks` draws the tasks a turn is about under it, and
 * `files` the project folder's files it says it wrote.
 */
import { CAW_EVENT_NOTE } from "@cawco/core/threads";
import { getContext, type Snippet, setContext } from "svelte";

export interface TranscriptVoice {
  face?: Snippet<[boolean]>;
  /** The files, and the id of the message that names them. */
  files?: Snippet<[string[], string]>;
  /** The tasks, and the id of the message that names them (its reasons, whether it landed live). */
  tasks?: Snippet<[string[], string]>;
}

const KEY = Symbol("transcript-voice");

/** The `noteKind` of a thread's event: something that woke a project's Caw (core `CAW_EVENT_NOTE`). */
export const CAW_EVENT = CAW_EVENT_NOTE;

export const setVoice = (voice: TranscriptVoice): TranscriptVoice =>
  setContext(KEY, voice);

export const useVoice = (): TranscriptVoice | undefined =>
  getContext<TranscriptVoice | undefined>(KEY);
