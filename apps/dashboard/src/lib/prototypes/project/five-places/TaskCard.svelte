<script lang="ts">
  /**
   * A task on the board: its id and title, then what is true of it now:
   * its attempt as glyph and word (a live dot breathing beside Working),
   * the cause when it is stuck, its delegate type, its to-dos. A card that
   * waits on the person carries the attn dot beside its id, never a fill.
   * The whole card opens the task as a pane.
   */
  import { fivePlacesWords as words } from "@cawco/core/words/proto-five-places";
  import LiveDot from "#lib/components/ui/live-dot/live-dot.svelte";
  import type { Task } from "./records";
  import StatusGlyph from "./StatusGlyph.svelte";

  let {
    task,
    needs,
    open = false,
    disabled = false,
    onopen,
  }: {
    task: Task;
    /** It waits on the person. */
    needs: boolean;
    /** Its pane is open. */
    open?: boolean;
    /** Moves wait (the hub is not live); the card still opens. */
    disabled?: boolean;
    onopen: (id: string) => void;
  } = $props();

  const attempt = $derived(task.attempt);
  const said = $derived(attempt && attempt.state !== "landed");
</script>

<button
  aria-current={open ? "true" : undefined}
  class="press-tint group/card flex w-full flex-col items-stretch gap-space-2 rounded-lg bg-surface-raised p-space-3 text-start shadow-tile transition-control can-hover:not-aria-current:hover:bg-surface-hover aria-current:bg-selected-bg"
  data-disabled={disabled || undefined}
  onclick={() => onopen(task.id)}
  type="button"
>
  <span
    class="mark-line flex items-center gap-space-2 type-meta text-ink-muted"
  >
    {#if needs}
      <span
        class="size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
        data-box
      ></span>
      <span class="sr-only">{words.needsYou}</span>
    {/if}
    <span class="font-mono num">{task.id}</span>
    {#if task.type}
      <span aria-hidden="true">·</span>
      <span>{task.type}</span>
    {/if}
  </span>
  <span class="line-clamp-3 type-label text-ink-row text-pretty"
    >{task.title}</span
  >
  {#if said && attempt}
    <span class="flex min-w-0 flex-col gap-space-1">
      <span class="mark-line flex items-center gap-space-2">
        {#if attempt.state === "working"}
          <LiveDot size="row" />
          <span class="type-meta text-status-live-ink"
            >{words.attempt.working}</span
          >
        {:else}
          <StatusGlyph small status={attempt.state} />
        {/if}
        {#if attempt.machine}
          <span
            class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
            >{attempt.machine}</span
          >
        {/if}
      </span>
      {#if attempt.cause && attempt.state !== "needs"}
        <span class="type-meta text-ink-muted text-pretty">{attempt.cause}</span
        >
      {/if}
    </span>
  {/if}
  {#if task.todos}
    <span class="type-meta text-ink-muted num"
      >{words.todos(task.todos[0], task.todos[1])}</span
    >
  {/if}
</button>
