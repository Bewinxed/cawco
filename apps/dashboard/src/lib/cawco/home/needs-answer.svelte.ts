/**
 * What Needs you does when its asks are answered in the conversation he is
 * in (shaping tsk-521, his pick): the panel stays the short list of what
 * waits, and a press on a row brings that ask up on his conversation's
 * composer, his last conversation when he is in none. CawPanel provides it;
 * NeedsCard reads it.
 */

import { getContext, setContext } from "svelte";
import type { NeedsEntry } from "./home-state.svelte";

export interface NeedsAnswers {
  /** The lane holds more than one project's rows: each names its project. */
  readonly manyProjects?: boolean;
  /** A row pressed: its ask comes up on his conversation's composer, and the panel closes. */
  press: (key: string) => void;
}

const KEY = Symbol("needs-answers");

export const provideAnswers = (answers: () => NeedsAnswers | null): void => {
  setContext(KEY, answers);
};

/** The panel's answers, read at a component's start: call what it returns to read them now. */
export const answersHere = (): (() => NeedsAnswers | null) =>
  getContext<(() => NeedsAnswers | null) | undefined>(KEY) ?? (() => null);

/** Whether a press on `item` brings it up in his conversation: an ask (not a sign-in), or an artifact waiting on a pick. */
export const answeredInPlace = (
  answers: NeedsAnswers | null,
  item: NeedsEntry
): boolean => {
  if (!answers) {
    return false;
  }
  if (item.kind === "ask") {
    return !item.request.connectAsk;
  }
  return item.kind === "artifact";
};
