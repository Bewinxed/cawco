import type { PermissionResult, UserAnswers, UserQuestion } from "@cawco/core";
import {
  ASK_USER_QUESTION,
  answeredQuestionInput,
  QUESTION_DISMISSED,
} from "@cawco/core";

const looksLikeQuestion = (value: unknown): value is UserQuestion =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as UserQuestion).question === "string" &&
  Array.isArray((value as UserQuestion).options);

/**
 * What a parked tool call is really asking the reader, when it is asking rather
 * than requesting permission — `null` for every other tool, and for an
 * {@link ASK_USER_QUESTION} whose input does not carry questions to render.
 */
export function questionsOf(
  toolName: string,
  input: Record<string, unknown>
): UserQuestion[] | null {
  if (toolName !== ASK_USER_QUESTION) {
    return null;
  }
  const { questions } = input as { questions?: unknown };
  if (!Array.isArray(questions) || questions.length === 0) {
    return null;
  }
  return questions.every(looksLikeQuestion)
    ? (questions as UserQuestion[])
    : null;
}

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
