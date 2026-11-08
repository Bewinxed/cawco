import {
  answeredQuestionInput,
  QUESTION_DISMISSED,
} from "@cawco/core/question";
import type {
  PermissionResult,
  UserAnswers,
} from "@cawco/core/session-messages";

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

/**
 * How Claude Code's tool result opens for a call it did not run because it
 * was refused or withdrawn. A question the reader dismisses is recorded as
 * `dismissed`; one that ends with this and no outcome was withdrawn (the
 * turn interrupted while it waited).
 */
export const CLI_REJECTED =
  "The user doesn't want to proceed with this tool use.";

/** Walking away from a question, which is a denial — the CLI answers its own the same way. */
export const questionDismissal: PermissionResult = {
  behavior: "deny",
  message: QUESTION_DISMISSED,
};

/**
 * A question standing open on the page: its options, or the answer field a
 * question with no options draws open in their place (Prompt.svelte).
 */
export const QUESTION_STANDING =
  '[data-slot="option-group"], [data-open-answer]';

/** Where a standing question takes the keys: its options' tab stop, or its open field. */
export const QUESTION_KEYS =
  '[data-slot="option-group"] [tabindex="0"], [data-open-answer]';
