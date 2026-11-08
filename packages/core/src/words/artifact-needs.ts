/** What an artifact's need says in a notice. */

import {
  type ArtifactNeedNoticePart,
  type ArtifactReason,
  reasonWords,
} from "../artifact-needs";
import { unhandled } from "../unhandled";
import { accountsWords } from "./accounts";
import { artifactWords } from "./artifacts";

/** The row's line: every reason, strongest first ("3 of 9 answered · 1 new answer"). */
export const reasonLine = (pending: readonly ArtifactReason[]): string =>
  pending
    .map((reason) => reasonWords(reason, pending.length === 1))
    .join(" · ");

/** What was never done, as an ended session's notice says it. */
const neverDone = (reason: ArtifactReason, title: string): string => {
  switch (reason.kind) {
    case "unopened":
      return artifactWords.neverOpened(title);
    case "answers":
      return artifactWords.neverAnswered(reason.asked - reason.answered, title);
    case "answer":
      return artifactWords.neverRead(reason.count, title);
    default:
      unhandled("reason", reason);
  }
};

/** One part of a notice in words: its row's line. */
export const noticePartWords = (
  part: ArtifactNeedNoticePart,
  title: string
): string => {
  switch (part.kind) {
    case "changed":
      return artifactWords.changedSince(title, part.count);
    case "closed":
      return artifactWords.closedAnswers(title, part.count, part.pin);
    case "ended":
      return artifactWords.ended(
        part.harness
          ? accountsWords.harnesses[part.harness]
          : artifactWords.itsSession,
        neverDone(part.reason, title)
      );
    default:
      unhandled("notice", part);
  }
};
