/**
 * What a session's delegation tree asked the person, as the session's own
 * screen lists it: the hub's one list (hub artifacts/questions.ts, the same
 * that `open_items` gives the agent), each question open or answered and
 * not yet taken, its own artifacts first, then those of the sessions under
 * it. `GET /api/instances/:id/questions` answers it; the dashboard reads it
 * again on each `artifact.needs` frame, which the hub sends whenever an
 * answer, a take or a new ask changes what needs him.
 */

import type { ArtifactKind } from "./artifact-kinds";
import type { ArtifactStop } from "./artifact-needs";

/** What a question is: a decision card, a canvas or preview to judge, a pin the agent's reply asked on. */
export type SessionQuestionKind = "card" | "judge" | "pin";

/** How he answered: a pick, a note, a value set, a pin or a reply written, a pin resolved. */
export type SessionAnswerHow =
  "pick" | "note" | "value" | "pin" | "reply" | "resolve";

export interface SessionQuestion {
  /** His answer, as the list shows it under the question; null while open. */
  answer: {
    /** When, ISO. */
    at: string;
    by: SessionAnswerHow;
    /** What he said: the options he picked, joined; his words; empty for a resolve. */
    said: string;
  } | null;
  /** The artifact that asks it. */
  artifact: { id: string; kind: ArtifactKind; title: string };
  /** Its key on that artifact: `card:<id>`, `judge`, `pin:<id>`. */
  key: string;
  kind: SessionQuestionKind;
  /** The session under this one that holds it; null when it is this session's own. */
  session: { ended: boolean; id: string; title: string } | null;
  /** Open: it waits on him. Answered: he answered and the agent has not yet acted on it. */
  state: "open" | "answered";
  /** Where the artifact's panel opens to answer it. */
  stop: ArtifactStop;
  /** The question as asked: a card's question, the artifact's ask, the agent's asking reply. */
  words: string;
}

/** `GET /api/instances/:id/questions`. */
export interface SessionQuestionsRead {
  questions: SessionQuestion[];
}
