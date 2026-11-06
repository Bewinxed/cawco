/**
 * The rows of what a session waits on the person for, in the order he
 * meets them: the asks its tree's turns are parked on (a permission, a
 * question, a sign-in: they hold the work still), then the questions its tree put to
 * him and he has not answered, its own first, then those he answered that
 * the agent has not taken up yet. Each row is one question: a page of four
 * cards is four rows, each opening at its card.
 */
import type { ArtifactStop } from "@cawco/core/artifact-needs";
import type {
  SessionQuestion,
  SessionQuestionKind,
} from "@cawco/core/session-questions";

/**
 * A parked ask's kind: a permission or the agent's own question, which the
 * composer grows into (a question folds to its bar on the tray row), or a
 * sign-in its card in the transcript asks for.
 */
type WaitingAskKind = "permission" | "question" | "connect";

/** The kind a row's glyph tells: a question's, or a parked ask's. */
export type WaitingKind = SessionQuestionKind | WaitingAskKind;

interface RowBase {
  /** The session under this one that asked it; null when it is this session's own. */
  from: { ended: boolean; id: string; title: string } | null;
  key: string;
  /** The question as asked, the row's words. */
  words: string;
}

export type WaitingRow =
  | (RowBase & {
      kind: SessionQuestionKind;
      state: "open" | "answered";
      artifact: SessionQuestion["artifact"];
      /** His answer, once he gave it; null while it waits on him. */
      answer: SessionQuestion["answer"];
      stop: ArtifactStop;
    })
  | (RowBase & {
      kind: WaitingAskKind;
      state: "open";
      /** The ask's request id: pressing the row brings the ask into view, in the composer or the transcript. */
      requestId: string;
    });

/** A parked ask as the row reads it. */
export interface WaitingAsk {
  from: RowBase["from"];
  kind: WaitingAskKind;
  requestId: string;
  summary: string;
}

/** Whether `row` is a parked ask, answered where it stands rather than in an artifact's panel. */
export const isAsk = (
  row: WaitingRow
): row is Extract<WaitingRow, { requestId: string }> => "requestId" in row;

/** The rows of `questions` and `asks`: asks, then open questions, then answered ones. */
export const waitingRows = (
  questions: readonly SessionQuestion[],
  asks: readonly WaitingAsk[]
): WaitingRow[] => {
  const asked = (question: SessionQuestion): WaitingRow => ({
    key: `${question.artifact.id}/${question.key}`,
    kind: question.kind,
    state: question.state,
    words: question.words,
    from: question.session,
    artifact: question.artifact,
    answer: question.answer,
    stop: question.stop,
  });
  return [
    ...asks.map((ask): WaitingRow => ({
      key: `ask/${ask.requestId}`,
      kind: ask.kind,
      state: "open",
      words: ask.summary,
      from: ask.from,
      requestId: ask.requestId,
    })),
    ...questions.filter((one) => one.state === "open").map(asked),
    ...questions.filter((one) => one.state === "answered").map(asked),
  ];
};

/** How many rows wait on him, and how many he answered that wait on the agent. */
export const waitingCounts = (
  rows: readonly WaitingRow[]
): { answered: number; open: number } => ({
  open: rows.filter((row) => row.state === "open").length,
  answered: rows.filter((row) => row.state === "answered").length,
});
