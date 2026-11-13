/**
 * A page's words as runs (core reference-faces.ts `referenceRuns`, the one
 * pass the hub reads a program's references by too): its text as written,
 * and each `cawco:` reference in it.
 */
import { referenceRuns } from "@cawco/core/reference-faces";

/** `text`'s runs, in order: one text run when it names no reference. */
export const runsOf = referenceRuns;

/** `text` as words alone, each reference its written label: a name said to a reader (an aria-label). */
export const plainOf = (text: string): string =>
  referenceRuns(text)
    .map((run) => ("href" in run ? run.label : run.text))
    .join("");
