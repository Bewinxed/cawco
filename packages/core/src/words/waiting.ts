/**
 * What a session waits on the person for, on the session's own screen: the
 * questions its delegation tree put to him (core session-questions.ts) and
 * the asks its tree's turns are parked on (a permission, a question, a
 * sign-in).
 */
import type { SessionAnswerHow } from "../session-questions";

export const waitingWords = {
  /**
   * The list's title: what waits on him; once all he was asked is answered,
   * whose move it is now, the agent's (the same words as the answered part's
   * head).
   */
  title: (open: number, agent: string) =>
    open > 0 ? "Waiting on you" : `Waiting on ${agent}`,
  /** The trigger's figure while something is open: "3"; its word beside it, which folds away where the row is narrow. */
  needYouWord: (n: number) => (n === 1 ? "needs you" : "need you"),
  /** The trigger's word once all are answered and some not yet taken: "2 answered". */
  answeredWord: "answered",
  /** The trigger, for a screen reader. */
  triggerLabel: (open: number, answered: number) =>
    [
      open > 0 ? `${open} waiting on you` : "",
      answered > 0 ? `${answered} answered, not yet taken up` : "",
    ]
      .filter(Boolean)
      .join(", "),
  /**
   * The second part's heading: what he answered that the agent has not
   * acted on yet is the agent's move, said as the list's title says his.
   */
  answeredHead: (agent: string) => `Waiting on ${agent}`,
  /** His answer, under an answered question. */
  yourAnswer: (by: SessionAnswerHow, said: string): string => {
    switch (by) {
      case "pick":
        return `You picked ${said}`;
      case "value":
        return `You set ${said}`;
      case "resolve":
        return "You resolved it";
      case "note":
      case "pin":
      case "reply":
        return `You wrote “${said}”`;
    }
  },
  /** Each kind, its glyph's name. */
  kind: {
    card: "Decision",
    judge: "To judge",
    pin: "Pin",
    permission: "Permission",
    question: "Question",
    connect: "Sign-in",
  },
  /** Each state, its glyph's name. */
  state: {
    open: "Waiting on you",
    answered: "Answered, not yet taken up by the agent",
  },
  /** Where a delegate's question comes from. */
  fromSession: (title: string) => `From ${title}`,
  /** A delegate's that ended: its parent takes it up. */
  fromEnded: (title: string) => `From ${title}, ended`,
  /** A row, for a screen reader: what pressing it does. */
  open: (words: string) => `Open: ${words}`,
  /** A parked ask's row: it is answered where it stands, in the composer or the transcript. */
  showAsk: (summary: string) => `Show the ask: ${summary}`,
  /** The list could not be read. */
  readFailed: (why: string) =>
    `What this session asked could not be read: ${why}.`,
  tryAgain: "Try again",
};
