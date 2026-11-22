/**
 * A line's answer in words: the word a glance reads (S1). Both Outcomes
 * prototypes say an answer the same way, so they read it from here.
 */
export type AnswerKind =
  | { kind: "holds" }
  | { kind: "fails" }
  | { kind: "unknown" }
  | { kind: "held"; on: string }
  | { kind: "failed"; on: string };

export const answerWord = (answer: AnswerKind): string => {
  switch (answer.kind) {
    case "holds":
      return "Holds";
    case "fails":
      return "Does not hold";
    case "unknown":
      return "Not known";
    case "held":
      return `Held on ${answer.on}`;
    case "failed":
      return `Did not hold on ${answer.on}`;
    default:
      return answer satisfies never;
  }
};
