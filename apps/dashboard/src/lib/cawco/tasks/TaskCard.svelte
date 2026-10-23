<script lang="ts">
  import { land, waiting } from "#lib/cawco/motion/share.svelte.js";
  import {
    flagsOf,
    type StageKind,
    type TaskSummary,
  } from "#lib/cawco/project-tasks.js";
  import { isRetry } from "#lib/cawco/tasks/retry.js";
  /**
   * One task on the board, its face (TaskCardFace) told what the fleet
   * knows of it: an attempt running or failed, its session asking you, an
   * action filed for it waiting on you, what it waits on.
   *
   * The card is a link to the task (`?task=tsk-12`), so it opens in a new
   * tab and is shared like one; a plain click opens it beside what it was
   * pressed in (`onopen`), or follows the link where nothing stands beside
   * it (a thread on a phone: the task's own page). It
   * is also what a drag carries, and the one object a move flies (`land`):
   * a card that changes column travels there from where it was drawn.
   */
  import { dragTask } from "./board-dnd.svelte.js";
  import { actionsOf, asksOf, taskProject } from "./needs.svelte";
  import TaskCardFace from "./TaskCardFace.svelte";

  let {
    task,
    href,
    kindOf,
    onopen,
    date = null,
    movable = true,
    titleFirst = false,
  }: {
    /**
     * Its title over its id: where the card stands outside its column (a
     * thread), the title says what it is and the id is its handle.
     */
    titleFirst?: boolean;
    task: TaskSummary;
    href: string;
    /** The date the task's file sets it for, said short ("Thu 09:30"). */
    date?: string | null;
    /** The kind of another task's stage, to say whether what it waits on has landed. */
    kindOf: (id: string) => StageKind | null | undefined;
    /** Opens it in place; left out, the card is a plain link. */
    onopen?: (id: string) => void;
    /**
     * A drag carries it to another column (the board). Off where a drag is
     * the surface's own (the canvas pans).
     */
    movable?: boolean;
  } = $props();

  const flags = $derived(flagsOf(task));
  /** The project the card stands in: an action names its task within it. */
  const project = taskProject();
  /** Its session asks you, or an action filed for it waits on you. */
  const asks = $derived(asksOf(task).length > 0);
  const approves = $derived(
    project ? actionsOf(project(), task.id).length > 0 : false
  );
  const retry = $derived(isRetry(task));
  /**
   * What it waits on that has not landed: the hub's word when it gives one,
   * else its `after` edges whose task is not in a done stage.
   */
  const waitsOn = $derived(
    task.blockedBy ??
      task.after.filter((id) => {
        const kind = kindOf(id);
        return kind !== "done" && kind !== "dropped";
      })
  );
  const key = $derived(`task:${task.id}`);
  /** A card arriving by a move flies in; it is not uncovered as a new row. */
  const flying = $derived(waiting(key));

  function open(event: MouseEvent) {
    if (
      !onopen ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onopen(task.id);
  }
</script>

<TaskCardFace
  {approves}
  {asks}
  data-flip-enter={flying ? "own" : undefined}
  data-share={key}
  {date}
  failed={flags.failed}
  {href}
  live={flags.live}
  onclick={open}
  {retry}
  startProblem={flags.startProblem}
  {task}
  {titleFirst}
  {waitsOn}
  {@attach movable
    ? dragTask(() => ({ taskId: task.id, from: task.stage }))
    : undefined}
  {@attach land(() => key, { uniform: true })}
/>
