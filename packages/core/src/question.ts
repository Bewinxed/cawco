import type { PermissionResult, UserAnswers, UserQuestion } from "./harness";
import { ASK_USER_QUESTION } from "./index";

const looksLikeQuestion = (value: unknown): value is UserQuestion =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as UserQuestion).question === "string" &&
  Array.isArray((value as UserQuestion).options);

/**
 * What a parked tool call is really asking the reader, when it is asking rather
 * than requesting permission: null for every other tool, and for an
 * {@link ASK_USER_QUESTION} whose input does not carry questions to render.
 * The one reading the dashboard, the Telegram bridge and a lead's thread share.
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
 * The reader's choices, back the way the tool reads them: the question tool's
 * own input with the answers folded in — never the answers on their own.
 *
 * An `AskUserQuestion` is still validated against its whole schema when the
 * answered input goes back to the harness, so an `updatedInput` of `{ answers }`
 * alone is refused ("The required parameter `questions` is missing") and the
 * tool call dies with it. The dashboard has always answered this way
 * (`questionAnswer` in apps/dashboard/src/lib/cawco/question.ts, which calls
 * this); everything that answers from somewhere the original input never
 * reached — a parent's `answer_delegate`, the relay route — has to come back
 * through {@link settledQuestionResult} before its answer meets a harness.
 */
export function answeredQuestionInput(
  input: Record<string, unknown>,
  answers: UserAnswers
): Record<string, unknown> {
  return { ...input, answers };
}

/** What a question denied with nothing said is: the reader walked away from it. */
export const QUESTION_DISMISSED =
  "The user dismissed the question without answering it.";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * One answer in the shape its own question reads: a multi-select answer is a
 * list even when a single option was picked, which is what the dashboard's
 * cards and the Telegram bridge both send. A remote answerer only ever knows
 * the option label it chose, so the `multiSelect` flag it never saw is applied
 * here, from the question the harness actually parked.
 */
function shapedAnswers(
  questions: UserQuestion[],
  answers: UserAnswers
): UserAnswers {
  const shaped: UserAnswers = {};
  for (const [question, value] of Object.entries(answers)) {
    const asked = questions.find((q) => q.question === question);
    shaped[question] =
      asked?.multiSelect && !Array.isArray(value) ? [value] : value;
  }
  return shaped;
}

/**
 * A settled answer: a {@link PermissionResult} narrowed to what the harness
 * SDKs will take back — an `updatedInput` that is the tool's own input object,
 * and a denial that says something.
 */
export type SettledQuestion =
  | (Extract<PermissionResult, { behavior: "allow" }> & {
      updatedInput?: Record<string, unknown>;
    })
  | Extract<PermissionResult, { behavior: "deny" }>;

/**
 * A parked question's answer, settled the way the harness that asked it can
 * read — for the answers that arrive without the tool call they answer.
 *
 * Both halves are the same defect: an answerer holding only the question text
 * and its chosen label sends `{ answers }` and nothing else, and a denial it
 * has no words for sends no `message`. So the parked input is put back under
 * whatever came in (the answers win, the `questions` survive), and a silent
 * denial is given the dismissal the CLI writes for its own.
 */
export function settledQuestionResult(
  parked: { input: Record<string, unknown>; questions: UserQuestion[] },
  result: PermissionResult
): SettledQuestion {
  if (result.behavior === "deny") {
    return { ...result, message: result.message || QUESTION_DISMISSED };
  }

  const sent = asRecord(result.updatedInput);
  // Allowed with no input of its own runs the tool as the model wrote it —
  // already whole, and not ours to rewrite. Anything that is not an input
  // object is not one either, and goes no further.
  if (!sent) {
    return { ...result, updatedInput: undefined };
  }

  const answers = asRecord(sent.answers) as UserAnswers | null;
  const input = { ...parked.input, ...sent };
  return {
    ...result,
    updatedInput: answers
      ? answeredQuestionInput(input, shapedAnswers(parked.questions, answers))
      : input,
  };
}
