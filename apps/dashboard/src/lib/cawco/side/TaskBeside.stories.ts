/**
 * A task standing beside a conversation, live (Component Story Format 3):
 * an agent's reply names a task and one of its to-dos, and a press on
 * either chip opens the task in the conversation's side card, or on a
 * phone in the sheet the preview rises in, the conversation staying on
 * screen. Its dials set what no press reaches: a preview open too, the hub refusing the task's project, and what stands beside as it opens.
 */
import TaskBeside from "./TaskBeside.fixture.svelte";

export default {
  title: "Conversation/Task beside",
  component: TaskBeside,
  args: { standing: "task", preview: true, refused: false },
};

/** The task open beside the conversation, its preview behind the switch. */
export const Live = { args: {} };
