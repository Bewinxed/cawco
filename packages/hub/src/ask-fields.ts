/**
 * What a question to the person is asked with, by any tool that asks one:
 * `ask` itself, and `comment_reply`'s `question` for a reply on a pin that
 * needs the person's choice. One shape, so every harness learns from every
 * tool that a question holds its options and whether work waits on it.
 */

import { type QuestionInput, UserQuestionShape } from "@cawco/core/asks";
import { z } from "zod";

/** The most questions one ask carries, answered one at a time in a row. */
// @limit asked: cawco:decision/4a2d30bd-1d73-4788-b9f1-1834866eeb2f/rows
const QUESTIONS_MAX = 4;

/** A task's handle, as a project numbers its tasks. */
const TASK_HANDLE = /^tsk-\d+$/u;

/** A question's fields as values, each read the same by every tool that takes one. */
const FIELDS = {
  questions: z.array(UserQuestionShape).min(1).max(QUESTIONS_MAX),
  blocks: z.boolean(),
  waiting: z.string().trim().min(1).optional(),
  meanwhile: z.string().trim().min(1).optional(),
  task: z.string().regex(TASK_HANDLE).optional(),
};

/** The fields of a question to the person as `ask` takes them, each described. */
export const QUESTION_FIELDS = {
  questions: FIELDS.questions.describe(
    "Related questions asked as one, answered one at a time in a row: each a question, a short header, and its options (label, description); multiSelect when several may be picked."
  ),
  blocks: FIELDS.blocks.describe(
    "true when going the wrong way would waste work, so it waits on the answer; false when you go ahead meanwhile, saying with what in `meanwhile`."
  ),
  waiting: FIELDS.waiting.describe(
    'With blocks: what is paused until they answer, e.g. "Deleting the /v1 routes and the API docs".'
  ),
  meanwhile: FIELDS.meanwhile.describe(
    'Without blocks: what you go ahead with meanwhile, your assumption, e.g. "Going ahead with 90 days, then 410".'
  ),
  task: FIELDS.task.describe("The task it is about; default your own."),
};

/** A question as one object, for a tool whose own description says it takes `ask`'s fields. */
export const QUESTION_SHAPE = z.object(FIELDS);

/**
 * Why a question can't be asked as given, in words the agent reads; nothing
 * is asked. Undefined when it may be.
 */
export const questionRefusal = (asked: QuestionInput): string | undefined => {
  if (asked.blocks && !asked.waiting) {
    return "A question that blocks work names what is paused in `waiting`; nothing was asked.";
  }
  if (!(asked.blocks || asked.meanwhile)) {
    return "A question work goes on past says what you go ahead with in `meanwhile`; nothing was asked.";
  }
};
