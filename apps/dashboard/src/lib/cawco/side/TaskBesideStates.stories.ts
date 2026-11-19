/**
 * The states of a task standing beside a conversation (Component Story
 * Format 3, live components), each as the conversation's side surface
 * draws it: the meta's args are every story's; a story's own are what it
 * changes.
 */
import TaskBeside from "./TaskBeside.fixture.svelte";

export default {
  title: "Conversation/Task beside, states",
  component: TaskBeside,
  args: { standing: "task", preview: true, refused: false },
};

/** The task open beside the conversation, its preview behind the switch. */
export const TaskInFront = {};

/** Opened from a to-do's chip: the task on Details, at that to-do. */
export const AtTodo = { args: { standing: "todo" } };

/** The task alone beside the conversation, with no preview open. */
export const TaskAlone = { args: { preview: false } };

/** Nothing beside the conversation yet; its chips are there to press. */
export const NothingBeside = { args: { standing: "none", preview: false } };

/** The hub could not read the task's project, so its card says so. */
export const ProjectUnread = { args: { refused: true } };
