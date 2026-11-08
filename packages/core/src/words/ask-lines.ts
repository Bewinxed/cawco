/** What the hub answers an agent about an ask: recorded, closed, not shown. */

import { QUESTION_UNSHOWN } from "../ask-tools";
import type { AskAnswer, AskedQuestion, AskRecord } from "../asks";
import { clockWords, dayWords } from "./account-lines";

/** What an ask the hub could not show says to the session that asked it, with why. */
export const unshownAskMessage = (question: boolean, why: string): string =>
  `${question ? QUESTION_UNSHOWN : "This permission request couldn't be shown"} (${why}).`;

/** What an approve ask's call answers at once, in one paragraph. */
export const askRecordedWords = (ask: { id: string; link: string }): string =>
  `Recorded as ${ask.link}: it waits on the person. Carry on with work that doesn't depend on it; the answer arrives as a message that names it. Don't ask it again, and don't do it another way. With nothing else to do, end your turn: the answer wakes you.`;

/** What a question's `ask` call answers at once: what waits on the answer, or what goes ahead. */
export const askQuestionWords = (link: string, asked: AskedQuestion): string =>
  asked.blocks
    ? `Asked as ${link}; ${asked.waiting ?? ""} waits on the person's answer. Don't do that work or anything that rests on it until the answer arrives as a message naming it. Do only work independent of it; with none left, end your turn: the answer wakes you.`
    : `Asked as ${link}. Go ahead with ${asked.meanwhile ?? ""}; if their answer differs, it arrives as a message naming it and you change course.`;

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
  return `That ask was withdrawn: ${ask.withdrawn?.why ?? "its session ended"}.`;
};
