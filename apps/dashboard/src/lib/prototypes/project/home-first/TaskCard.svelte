<script lang="ts">
  /**
   * A task on the board (TOM tasks 3 and 4): its title, then its delegate
   * type and the live dot when an attempt works, or why it is stuck, failed
   * or asking; the Needs you dot beside the title when it waits on the
   * person; its to-dos and its date. The whole card opens the task's pane.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import LiveDot from "#lib/components/ui/live-dot/live-dot.svelte";
  import type { Task } from "./model";

  let {
    task,
    stale = false,
    onopen,
  }: {
    task: Task;
    stale?: boolean;
    onopen?: (task: Task) => void;
  } = $props();

  const inkOf = {
    working: "text-status-live-ink",
    stuck: "text-status-attn-ink",
    asks: "text-status-attn-ink",
    failed: "text-status-fail-ink",
    queued: "text-ink-muted",
  } as const;
</script>

<li data-flip data-task={task.id}>
  <button
    class={[
      "press-tint flex w-full flex-col gap-space-1 rounded-md bg-surface-raised p-space-3 text-start shadow-tile transition-control hover:bg-surface-hover",
      stale && "opacity-75",
    ]}
    onclick={() => onopen?.(task)}
    type="button"
  >
    <span class="mark-line flex items-start gap-space-2">
      <span class="min-w-0 flex-1 type-label text-ink-row text-pretty"
        >{task.title}</span
      >
      {#if task.needsYou}
        <span
          aria-label={words.groups.needs}
          class="mt-space-1 size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
          data-box
          role="img"
        ></span>
      {/if}
    </span>
    <span
      class="mark-line flex flex-wrap items-center gap-x-space-2 type-meta text-ink-muted"
    >
      {#if task.state === "working"}
        <LiveDot size="row" />
      {/if}
      {#if task.state}
        <span class={["font-medium", inkOf[task.state]]}
          >{words.work.state[task.state]}</span
        >
      {/if}
      {#if task.type}
        <span>{task.type}</span>
      {/if}
      {#if task.todos}
        <span class="tabular-nums"
          >{words.work.todos(task.todos[0], task.todos[1])}</span
        >
      {/if}
      {#if task.due}
        <span class="tabular-nums">{task.due}</span>
      {/if}
      <span class="ms-auto tabular-nums">{task.changed}</span>
    </span>
    {#if task.cause}
      <span class="type-meta text-ink-strong text-pretty">{task.cause}</span>
    {/if}
  </button>
</li>
