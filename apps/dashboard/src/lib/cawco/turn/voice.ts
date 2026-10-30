/**
 * Who answers in a transcript, when it is not a harness session's agent: a
 * pane hosting a project's conversation (SessionPane) says it is Caw here,
 * and the rows draw it. `face` stands in the speaker line's mark (`live`:
 * the row is the turn in flight).
 */
import { CAW_EVENT_NOTE } from "@cawco/core/project-conversation";
import { getContext, type Snippet, setContext } from "svelte";

export interface TranscriptVoice {
  face?: Snippet<[boolean]>;
}

const KEY = Symbol("transcript-voice");

/** The `noteKind` of a project note's line (core `CAW_EVENT_NOTE`). */
export const CAW_EVENT = CAW_EVENT_NOTE;

export const setVoice = (voice: TranscriptVoice): TranscriptVoice =>
  setContext(KEY, voice);

export const useVoice = (): TranscriptVoice | undefined =>
  getContext<TranscriptVoice | undefined>(KEY);
