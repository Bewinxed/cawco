/** What an artifact's need says in a notice. */

import {
  type ArtifactNeedNoticePart,
  type ArtifactReason,
  reasonWords,
} from "../artifact-needs";
import { harnessName } from "../harness/kinds";
import { unhandled } from "../unhandled";
import { artifactWords } from "./artifacts";

/** The row's line: every reason ("3 of 9 answered"). */
export const reasonLine = (pending: readonly ArtifactReason[]): string =>
  pending.map(reasonWords).join(" · ");

/** What was never done, as an ended session's notice says it. */
const neverDone = (reason: ArtifactReason, title: string): string =>
  artifactWords.neverAnswered(reason.asked - reason.answered, title);

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
        part.harness ? harnessName(part.harness) : artifactWords.itsSession,
        neverDone(part.reason, title)
      );
    default:
      unhandled("notice", part);
  }
};
