/**
 * A made-up task, as the board's own TaskCard and TaskColumn take one: a
 * mockup's TaskCard props filled out to a TaskSummary, nothing read.
 */
import type { TaskSummary } from "#lib/cawco/project-tasks.js";
import { textOf } from "../context";

/** A mockup's TaskCard, as its props arrive. */
export interface MockTaskProps {
  done?: number;
  id?: unknown;
  labels?: unknown[];
  live?: boolean;
  needsYou?: boolean;
  title: unknown;
  total?: number;
}

const NOW = Date.UTC(2026, 9, 15, 9, 41);

/** `props` as a TaskSummary in `stage`, numbered `index + 1` when it names no id. */
export const mockTask = (
  props: MockTaskProps,
  stage: string,
  index: number
): TaskSummary => {
  const id = textOf(props.id) || `tsk-${index + 1}`;
  return {
    id,
    number: Number(id.replace(/\D+/g, "")) || index + 1,
    title: textOf(props.title),
    stage,
    kind: null,
    labels: (Array.isArray(props.labels) ? props.labels : []).map(textOf),
    needsYou: props.needsYou ?? false,
    liveAttempt: props.live ?? false,
    todos: { done: props.done ?? 0, total: props.total ?? 0 },
    after: [],
    blockedBy: [],
    duplicateOf: null,
    fields: {},
    foundIn: null,
    outputs: [],
    parent: null,
    path: `tasks/${id}.md`,
    problem: null,
    rank: null,
    related: [],
    type: null,
    attempts: [],
    lastAttemptFailed: false,
    lastAttemptStopped: false,
    queuedStart: false,
    startProblem: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
};
