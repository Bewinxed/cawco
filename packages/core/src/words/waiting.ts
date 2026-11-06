/**
 * What a session waits on the person for, on the session's own screen: the
 * questions its delegation tree put to him (core session-questions.ts) and
 * the asks its tree's turns are parked on (a permission, a question, a
 * sign-in).
 */
import type { SessionAnswerHow } from "../session-questions";

/** The verb the whole card says: "1 needs you", "3 need Claude Code". */
const needs = (n: number, who: string) =>
  n === 1 ? `1 needs ${who}` : `${n} need ${who}`;

/**
 * One verb, two subjects: everything on the chip and the card says whom an
 * item needs, the person or the agent, in the fleet's own Needs you words
 * (common.ts `needsYou`).
 */
export const waitingWords = {
  /** The card's title: what needs him; once all he was asked is answered, what needs the agent (the answered part's head). */
  title: (open: number, agent: string) =>
    open > 0 ? "Needs you" : `Needs ${agent}`,
  /** The chip's word beside its figure while something needs him ("3 need you"), which folds away where the row is narrow. */
  needYouWord: (n: number) => (n === 1 ? "needs you" : "need you"),
  /** The chip's word beside its figure once all he was asked is answered and the agent has not taken some up ("2 need Claude Code"). */
  needAgentWord: (n: number, agent: string) =>
    n === 1 ? `needs ${agent}` : `need ${agent}`,
  /** The chip, for a screen reader: both counts in the same words. */
  triggerLabel: (open: number, answered: number, agent: string) =>
    [
      open > 0 ? needs(open, "you") : "",
      answered > 0 ? needs(answered, agent) : "",
    ]
      .filter(Boolean)
      .join(", "),
  /** The answered part's head: what he answered that the agent has not acted on yet needs the agent. */
  answeredHead: (agent: string) => `Needs ${agent}`,
  /** His answer, under an answered question. */
  yourAnswer: (by: SessionAnswerHow, said: string): string => {
    switch (by) {
      case "pick":
        return `You picked “${said}”`;
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
  /** A row's state, for a screen reader: whom it needs, in the card's own words. */
  state: (state: "open" | "answered", agent: string) =>
    state === "open" ? "Needs you" : `Needs ${agent}`,
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
