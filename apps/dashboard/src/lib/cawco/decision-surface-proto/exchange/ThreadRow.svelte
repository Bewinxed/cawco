<script lang="ts">
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { cn } from "#lib/utils.js";
  import type { Thread } from "./model.js";
  import { since } from "./model.js";
  import { RETINT } from "./motion.js";

  /**
   * One asking session in the list: its name and age on the first line, its
   * state line under it (state word first, then what is held), and its
   * newest question, two lines at most. Narrow (beside a live preview) it
   * keeps the name, state and age.
   */
  let {
    thread,
    current = false,
    narrow = false,
    resumed = false,
    onopen,
  }: {
    thread: Thread;
    current?: boolean;
    narrow?: boolean;
    /** Its agent resumed after his send: the line changes in place. */
    resumed?: boolean;
    onopen?: () => void;
  } = $props();

  const WORD = {
    stopped: "Stopped",
    ahead: "Went ahead",
    quiet: "Quiet",
    ended: "Ended",
    aside: "Set aside",
  } as const;

  /** The state word: Working once resumed, otherwise where it stands. */
  function stateWord(): string {
    if (resumed) {
      return "Working";
    }
    return thread.silentSince ? "Not reporting" : WORD[thread.standing];
  }
  const word = $derived(stateWord());
</script>

<button
  class={cn(
    RETINT,
    "press-tint grid w-full min-w-0 grid-cols-1 gap-x-space-6 gap-y-space-2 rounded-md px-space-3 py-space-3 text-start hover:bg-surface-hover",
    !narrow && "@kinds:grid-cols-2",
    current && "bg-surface-fill hover:bg-surface-fill"
  )}
  aria-current={current ? "true" : undefined}
  onclick={onopen}
  type="button"
>
  <span class="flex min-w-0 flex-col gap-space-1">
    <span class="flex min-w-0 items-baseline gap-space-3">
      <span class="type-label min-w-0 flex-1 truncate text-ink-row"
        >{thread.session}</span
      >
      <span class="type-meta shrink-0 text-ink-muted tabular-nums">
        {#if thread.isNew && !resumed}<span class="text-ink-strong">New ·</span
          >{/if}
        {since(thread.since)}
      </span>
    </span>
    <span
      class="type-meta mark-line flex min-w-0 items-center gap-space-2 text-ink-muted"
    >
      {#if resumed}
        <LiveDot />
      {:else if thread.standing === "stopped" || thread.standing === "aside"}
        <span
          aria-hidden="true"
          class="size-(--status-dot-size) shrink-0 rounded-pill bg-status-attn-glyph"
          data-box
        ></span>
      {/if}
      <span
        class={cn(
          "shrink-0",
          thread.standing === "stopped" && !resumed
            ? "text-status-attn-ink"
            : "text-ink-strong"
        )}>{word}</span
      >
      <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
        >· {resumed ? "resumed with your picks" : thread.line}</span
      >
    </span>
  </span>
  {#if !narrow}
    <span class="flex min-w-0 flex-col gap-space-1">
      <span class="type-body line-clamp-2 text-pretty text-ink-strong"
        >{thread.newest}</span
      >
      <span class="type-meta truncate text-ink-muted"
        >{thread.harness} · {thread.project} · {thread.machine}</span
      >
    </span>
  {/if}
</button>
