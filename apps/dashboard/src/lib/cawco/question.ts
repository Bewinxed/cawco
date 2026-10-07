import type { PermissionResult, UserAnswers } from "@cawco/core";
import { answeredQuestionInput, QUESTION_DISMISSED } from "@cawco/core";

/**
 * The reader's choices, back the way the tool reads them: its own input with
 * the answers folded in. Allowing without them runs the tool as unanswered.
 */
export function questionAnswer(
  input: Record<string, unknown>,
  answers: UserAnswers
): PermissionResult {
  return {
    behavior: "allow",
    updatedInput: answeredQuestionInput(input, answers),
  };
}

/** Walking away from a question, which is a denial — the CLI answers its own the same way. */
export const questionDismissal: PermissionResult = {
  behavior: "deny",
  message: QUESTION_DISMISSED,
};
