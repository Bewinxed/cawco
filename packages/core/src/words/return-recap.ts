/**
 * The person's return, as a session's transcript draws it (core
 * return-recap.ts): one line counting what moved of its records while they
 * were away, opening to each by its link.
 */
import type { ReturnRecap } from "../return-recap";
import { andList } from "./helpers";

/** `n` of a kind, counted: "1 task moved", "2 tasks moved". */
const counted = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** A commit as the line names it: its first nine characters. */
const shortSha = (sha: string): string => sha.slice(0, 9);

export const returnRecapWords = {
  /** The kind the transcript's line is drawn under. */
  noteKind: "While you were away",
  /** The line: what it holds, counted. */
  title: (recap: ReturnRecap): string =>
    andList([
      ...(recap.waiting.length > 0
        ? [counted(recap.waiting.length, "waiting on you", "waiting on you")]
        : []),
      ...(recap.moved.length > 0
        ? [counted(recap.moved.length, "task moved", "tasks moved")]
        : []),
      ...(recap.landed.length > 0
        ? [counted(recap.landed.length, "delegate landed", "delegates landed")]
        : []),
    ]),
  /** What opens under it: each record by its link; the parts headed only when there are two or more. */
  detail: (recap: ReturnRecap): string => {
    const parts: { heading: string; lines: string[] }[] = [
      ...(recap.waiting.length > 0
        ? [
            {
              heading: "Waiting on you",
              lines: recap.waiting.map((link) => `- ${link}`),
            },
          ]
        : []),
      ...(recap.moved.length > 0
        ? [
            {
              heading: "Tasks moved",
              lines: recap.moved.map(
                ({ task, from, to }) => `- ${task}: ${from} → ${to}`
              ),
            },
          ]
        : []),
      ...(recap.landed.length > 0
        ? [
            {
              heading: "Delegates landed",
              lines: recap.landed.map(
                ({ work, commit, headline }) =>
                  `- ${work}${commit ? ` \`${shortSha(commit)}\`` : ""}${headline ? `: ${headline}` : ""}`
              ),
            },
          ]
        : []),
    ];
    return parts
      .map(({ heading, lines }) =>
        (parts.length > 1 ? [heading, ...lines] : lines).join("\n")
      )
      .join("\n\n");
  },
};
