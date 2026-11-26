/**
 * What a press on a conversation's row of Caw's panel does: it opens that
 * conversation with its newest waiting ask up on its composer (live, home/
 * chat-asks `liveAnswers`; a states fixture, its own). CawPanel provides
 * it; ConversationRow and NeedsCard read it.
 */

import { getContext, setContext } from "svelte";
import type { ConversationItem } from "./home-state.svelte";

export interface NeedsAnswers {
  /** The lane holds more than one project's rows: each names its project. */
  readonly manyProjects?: boolean;
  /** A conversation's row pressed: it opens with its newest ask up on its composer, and the panel closes. */
  press: (conversation: ConversationItem) => void;
}

const KEY = Symbol("needs-answers");

export const provideAnswers = (answers: () => NeedsAnswers | null): void => {
  setContext(KEY, answers);
};

/** The panel's answers, read at a component's start: call what it returns to read them now. */
export const answersHere = (): (() => NeedsAnswers | null) =>
  getContext<(() => NeedsAnswers | null) | undefined>(KEY) ?? (() => null);
