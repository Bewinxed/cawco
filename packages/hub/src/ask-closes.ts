/**
 * How a session settles a question another session put to the person
 * (core asks.ts), the way `record_pick` and `question_close` settle a
 * decision card: his answer counts wherever he gave it, and a question
 * leaves once the work it held has moved on.
 *
 * - **His words elsewhere** (`record_pick` naming the ask): any session of
 *   the asker's project quotes his message; the hub finds that message, as
 *   `record_pick` does for a card (artifacts/cite.ts), and the quote must
 *   stand in it. The question is answered with his words and reaches its
 *   asker as his answer (asks.ts `answerInWords`).
 * - **Withdrawn by its asker** (`question_close`): it takes it back, saying
 *   why (asks.ts `withdrawOwn`).
 * - **Overtaken** (`question_close` from another session of the project):
 *   with evidence the hub checks: the task it held done or dropped or
 *   gone, a to-do of it ticked or gone, the step it was asked at ticked or
 *   gone from its asker's plan, or a newer open or answered question of the
 *   project on the same thing. Its asker reads why in a quiet note (asks.ts
 *   `overtaken`).
 */

import type { AskRecord } from "@cawco/core/asks";
import type { TaskTodo } from "@cawco/core/plan";
import type { InstanceRow } from "@cawco/core/protocol";
import { parseReference, referenceParts } from "@cawco/core/references";
import type { StageKind } from "@cawco/core/views";
import { quoteIn, recordOfRef } from "./artifacts/cite";
import { ASK_ID, type Asks } from "./asks";
import type { DbShape } from "./db";
import { recordsProjectOf } from "./records-project";

/** A link's destination in its markdown, or the text itself. */
const LINK_DESTINATION = /\]\((cawco:[^)\s]+)\)\s*$/u;

/** A task's handle. */
const TASK_HANDLE = /^tsk-\d+$/u;

/** Whether `text` names an ask by its request id (`ask_…`), the way open_items lists one. */
export const namesAsk = (text: string): boolean => ASK_ID.test(text.trim());

export interface AskClosesDeps {
  readonly asks: Pick<Asks, "answerInWords" | "overtaken" | "withdrawOwn">;
  readonly db: Pick<
    DbShape,
    "asks" | "getInstancesByIds" | "personSaidOf" | "sessionPlan" | "workItem"
  >;
  /** A session as its notes name it. */
  readonly name: (row: InstanceRow) => string;
  /** Task `id` of project `projectId`: its stage's kind and its to-dos; undefined when it is gone. */
  readonly task: (
    projectId: string,
    id: string
  ) => Promise<{ kind: StageKind | null; todos: TaskTodo[] } | undefined>;
}

/** What `record_pick` takes for a question to the person. */
export interface RecordAsked {
  answers?: Record<string, string>;
  message?: string;
  options?: string[];
  pin?: string;
  quote: string;
}

/** What `question_close` takes for a question to the person. */
export interface CloseAsked {
  as: "taken" | "withdrawn";
  evidence?: string;
  why: string;
}

export const createAskCloses = (deps: AskClosesDeps) => {
  /** The question `id` and the session that asked it, in the project `actor`'s records live in; throws in words otherwise. */
  const questionIn = (
    actor: InstanceRow,
    id: string
  ): { ask: AskRecord; asker: InstanceRow; projectId: string } => {
    const ask = deps.db.asks.get(id.trim());
    if (ask?.asked.kind !== "question") {
      throw new Error(
        `${id} is no question to the person. A question is named by its request id, like ask_0f3c…, as open_items lists it.`
      );
    }
    const [asker] = deps.db.getInstancesByIds([ask.instanceId]);
    const projectId = recordsProjectOf(deps.db, actor);
    if (!asker || recordsProjectOf(deps.db, asker) !== projectId) {
      throw new Error(
        `${id} was asked in another project; a session of that project settles it.`
      );
    }
    return { ask, asker, projectId };
  };

  /** Why the question `said` names is no newer open or answered one of the project's; undefined when it is. */
  const newerRefused = (
    ask: AskRecord,
    projectId: string,
    said: string
  ): string | undefined => {
    const newer = deps.db.asks.get(said);
    const [by] = newer ? deps.db.getInstancesByIds([newer.instanceId]) : [];
    const fits =
      (newer?.state === "open" || newer?.state === "answered") &&
      newer.raisedAt > ask.raisedAt &&
      by !== undefined &&
      recordsProjectOf(deps.db, by) === projectId;
    return fits
      ? undefined
      : `${said} is no open or answered question of this project asked after it.`;
  };

  /** Why the step `ask` was asked at still stands in its asker's plan; undefined once it was ticked or removed. */
  const stepRefused = (
    ask: AskRecord,
    asker: InstanceRow
  ): string | undefined => {
    const step = ask.asked.kind === "question" ? ask.asked.step : undefined;
    if (step === undefined) {
      return "It was asked at no step of its asker's plan.";
    }
    const open = deps.db
      .sessionPlan(asker.id)
      ?.steps.some((one) => one.id === step && one.status !== "completed");
    return open
      ? `The step it was asked at, ${step}, is still open in its asker's plan.`
      : undefined;
  };

  /** The task and to-do `said` names in project `projectId`: a handle, a task's link or a to-do's link; none for anything else. */
  const taskNamed = (
    said: string,
    projectId: string
  ): { task?: string; todo?: string } => {
    if (TASK_HANDLE.test(said)) {
      return { task: said };
    }
    const ref = parseReference(LINK_DESTINATION.exec(said)?.[1] ?? said);
    const parts =
      ref?.kind === "task" || ref?.kind === "todo"
        ? referenceParts(ref.id, ref.kind === "task" ? 2 : 3)
        : null;
    const [project, task, todo] = parts ?? [];
    return project === projectId ? { task, todo } : {};
  };

  /** Why the task or to-do `said` names still stands open; undefined once it is closed, ticked or gone. */
  const taskRefused = async (
    said: string,
    projectId: string
  ): Promise<string | undefined> => {
    const named = taskNamed(said, projectId);
    if (!named.task) {
      return `${said} names no task, to-do or question of this project.`;
    }
    const task = await deps.task(projectId, named.task);
    if (!task || task.kind === "done" || task.kind === "dropped") {
      return;
    }
    if (named.todo === undefined) {
      return `${named.task} is still open.`;
    }
    const todo = task.todos.find((one) => one.id === named.todo);
    return !todo || todo.done ? undefined : `${named.todo} is still open.`;
  };

  /** Whether `evidence` shows the work `ask` held moved on; the reason in words when it does not. */
  const overtakenBy = async (
    ask: AskRecord,
    asker: InstanceRow,
    projectId: string,
    evidence: string
  ): Promise<string | undefined> => {
    const said = evidence.trim();
    if (namesAsk(said)) {
      return newerRefused(ask, projectId, said);
    }
    if (said === "step") {
      return stepRefused(ask, asker);
    }
    return await taskRefused(said, projectId);
  };

  return {
    /**
     * `record_pick` naming a question to the person: his words in a message
     * of his, quoted by `actor`, answer it. Answers what the tool says;
     * throws a sentence with a correct call when it can't be recorded.
     */
    record(actor: InstanceRow, id: string, asked: RecordAsked): string {
      const { ask } = questionIn(actor, id);
      if (asked.pin !== undefined || asked.message === undefined) {
        throw new Error(
          `A question to the person takes his words from a message of his: record_pick { card: "${ask.id}", message: "<his message's find ref>", quote: "<his words>", answers: { "<question>": "<his answer>" } }. His reply on a pin it stands on answers it by itself.`
        );
      }
      const said = deps.db.personSaidOf(recordOfRef(asked.message));
      const [heard] = said ? deps.db.getInstancesByIds([said.instanceId]) : [];
      if (!(said && heard)) {
        throw new Error(
          `${asked.message} is no message of the person's. Find it with find (by: "person") and pass its ref as message.`
        );
      }
      if (
        recordsProjectOf(deps.db, heard) !== recordsProjectOf(deps.db, actor)
      ) {
        throw new Error(
          `${asked.message} was said in another project; quote a message of his in this one.`
        );
      }
      if (!quoteIn(asked.quote, said.text)) {
        throw new Error(
          "That quote is not in his message as he wrote it. Copy his words exactly, case and punctuation as written."
        );
      }
      const questions =
        ask.asked.kind === "question" ? ask.asked.questions : [];
      const [only] = questions;
      const answers =
        asked.answers ??
        (only && questions.length === 1 && asked.options
          ? { [only.question]: asked.options.join(", ") }
          : undefined);
      if (!answers) {
        throw new Error(
          `Give his answer to each question, keyed by its exact text: answers: { ${questions.map((one) => `"${one.question}": "<option label or his words>"`).join(", ")} }.`
        );
      }
      return deps.asks.answerInWords(ask.id, answers, {
        name: deps.name(actor),
        quote: asked.quote.trim(),
      });
    },

    /**
     * `question_close` naming a question to the person: withdrawn by its
     * asker, or closed as overtaken by another session of its project with
     * evidence the hub checks. Answers what the tool says; throws a
     * sentence with a correct call when it can't be closed.
     */
    async close(
      actor: InstanceRow,
      id: string,
      closing: CloseAsked
    ): Promise<string> {
      const { ask, asker, projectId } = questionIn(actor, id);
      if (closing.as === "taken") {
        throw new Error(
          `A question to the person closes as answered by his words: record_pick { card: "${ask.id}", message, quote, answers }. One that no longer applies closes with question_close { question: "${ask.id}", as: "withdrawn", why${ask.instanceId === actor.id ? "" : ", evidence"} }.`
        );
      }
      if (asker.id === actor.id) {
        return deps.asks.withdrawOwn(actor, ask.id, closing.why);
      }
      if (!closing.evidence) {
        throw new Error(
          `Another session's question closes with evidence that its work moved on: question_close { question: "${ask.id}", as: "withdrawn", why, evidence } with evidence "tsk-12" (its task done, dropped or gone), a to-do's link (ticked or gone), "step" (the step it was asked at ticked or gone), or a newer question's ask_… on the same thing.`
        );
      }
      const refused = await overtakenBy(
        ask,
        asker,
        projectId,
        closing.evidence
      );
      if (refused) {
        throw new Error(
          `${refused} It stays open. Evidence is a task done, dropped or gone ("tsk-12"), a to-do ticked or gone (its link), "step", or a newer question (ask_…).`
        );
      }
      return deps.asks.overtaken(
        actor,
        deps.name(actor),
        ask.id,
        `${closing.why} (${closing.evidence.trim()})`
      );
    },
  };
};
