/** What the hub answers an agent about an ask: recorded, closed, not shown. */

import { QUESTION_UNSHOWN } from "../ask-tools";
import type { AskAnswer, AskedQuestion, AskRecord } from "../asks";
import { clockWords, dayWords } from "./account-lines";

/** What an ask the hub could not show says to the session that asked it, with why. */
export const unshownAskMessage = (question: boolean, why: string): string =>
  `${question ? QUESTION_UNSHOWN : "This permission request couldn't be shown"} (${why}).`;

/** Why the hub could not show an ask whose fields it could not read, said to the session that sent it; `fields` are dotted paths. */
export const unreadAskWords = (fields: readonly string[]): string =>
  `the hub could not read the ask: ${fields.join(", ") || "its whole body"} ${fields.length > 1 ? "are" : "is"} missing or of the wrong kind`;

/**
 * What a session is told of an ask of its whose stored record no longer
 * reads (hub asks.ts `boot`): withdrawn unanswered, nothing it asked ran,
 * and asking again puts it to the person afresh.
 */
export const askUnreadWords = (id: string): string =>
  `Your ask ${id} was withdrawn unanswered: its stored record no longer reads, so it can't be shown or answered. Nothing it asked ran. If you still need it, ask again.`;

/** What an approve ask's call answers at once, in one paragraph. */
export const askRecordedWords = (ask: { id: string; link: string }): string =>
  `Recorded as ${ask.link}: it waits on the person. Carry on with work independent of it; the answer arrives as a message that names it, and the hub runs the call once he approves. With nothing else to do, end your turn: the answer wakes you.`;

/**
 * What a question's `ask` call answers at once: where it went (the person,
 * or a delegate's parent), its request id, the open questions of the asker
 * it replaced, and what waits on the answer or what goes ahead.
 */
export const askQuestionWords = (
  link: string,
  asked: AskedQuestion,
  how: { id: string; replaced: readonly string[]; routed: boolean }
): string => {
  const to = how.routed
    ? "your parent session, which answers it or forwards it to the person"
    : "the person";
  const replaced =
    how.replaced.length > 0
      ? ` It replaces your earlier ${how.replaced.join(", ")}, now closed.`
      : "";
  const head = `Asked ${to} as ${link} (request ${how.id}).${replaced}`;
  return asked.blocks
    ? `${head} ${asked.waiting ?? ""} waits on the answer, which arrives as a message naming it. Meanwhile do only work independent of it; with none left, end your turn: the answer wakes you. If it stops applying, withdraw it with question_close.`
    : `${head} Go ahead with ${asked.meanwhile ?? ""}; if the answer differs, it arrives as a message naming it and you change course.`;
};

/** The line a question's card and push carry: whether work waits on it. */
export const askStanceLine = (asked: {
  blocks: boolean;
  meanwhile?: string;
  waiting?: string;
}): string =>
  asked.blocks
    ? `Blocks work · ${asked.waiting ?? ""} is paused until you answer`
    : `Work goes on · ${asked.meanwhile ?? ""}`;

/** Who gave an answer, as a refusal names them. */
const answererWords = (by: AskAnswer): string => {
  if (by.name) {
    return by.name;
  }
  switch (by.via) {
    case "page":
      return "a dashboard";
    case "app":
      return "the app";
    case "session":
      return "a session";
    case "harness":
      return "the harness";
    case "fullSend":
      return "Full Send";
    case "words":
      return "a session quoting the person";
    default:
      return by.via satisfies never;
  }
};

/** Why a second answer to an ask is refused. */
export const askClosedWords = (ask: AskRecord): string => {
  if (ask.answer) {
    const { at, by } = ask.answer;
    return `That ask was already answered by ${answererWords(by)} at ${dayWords(at)} ${clockWords(at)}.`;
  }
  return `That ask was closed: ${ask.withdrawn?.why ?? "its session ended"}.`;
};
