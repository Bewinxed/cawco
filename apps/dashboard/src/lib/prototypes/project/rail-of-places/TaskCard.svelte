<script lang="ts">
  /**
   * A task on the board: its id and its state's mark on the first line (the
   * needs-you dot while it stands in the person's stage, the live dot while
   * an attempt works, the warning glyph while it is stuck), its title, then
   * its delegate type and to-dos, or why it is stuck. The whole card opens
   * the task in its pane.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconWarningTriangle } from "#lib/icons.js";
  import type { Task } from "./model";

  let {
    task,
    held = false,
    onopen,
  }: {
    task: Task;
    held?: boolean;
    onopen: (id: string) => void;
  } = $props();

  const facts = $derived(
    [
      task.type,
      task.todos ? w.todos(task.todos[0], task.todos[1]) : undefined,
      task.waitsOn ? w.waitsOnTask(task.waitsOn) : undefined,
    ].filter((one): one is string => Boolean(one))
  );
</script>

<button
  type="button"
  class="press-tint focus-inset flex w-full flex-col gap-space-2 rounded-md bg-surface-raised p-space-3 text-start shadow-tile hover:bg-surface-hover data-held:opacity-55"
  data-flip
  data-held={held || undefined}
  aria-label={w.openTask(task.title)}
  onclick={() => onopen(task.id)}
>
  <span class="mark-line flex items-center gap-space-2">
    <span class="type-meta num text-ink-muted">{task.id}</span>
    {#if task.needsYou}
      <span
        class="size-(--status-dot-size) rounded-pill bg-status-attn-glyph"
        data-box
        aria-hidden="true"
      ></span>
      <span class="sr-only">{w.needsYouGroup}</span>
    {:else if task.attempt === "working"}
      <LiveDot data-box />
      <span class="sr-only">{w.workStates.working}</span>
    {:else if task.attempt === "stuck"}
      <IconWarningTriangle
        class="size-icon-sm text-status-fail-glyph"
        aria-label={w.workStates.stuck}
      />
    {/if}
  </span>
  <span class="line-clamp-3 type-label text-ink-row">{task.title}</span>
  {#if task.attempt === "stuck" && task.cause}
    <span class="type-meta text-status-fail-ink"
      >{w.stuckBecause(task.cause)}</span
    >
  {:else if facts.length > 0}
    <span class="line-clamp-2 type-meta text-ink-muted"
      >{facts.join(" · ")}</span
    >
  {/if}
</button>
