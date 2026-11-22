<script lang="ts">
  /**
   * A piece of the agents' work in a list: a task by its number and name, or
   * a routine by its name, each with its glyph; where it stands, a live
   * mark while a session works it; and its open control, as tasks open
   * everywhere in the project.
   */
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconRepeat, IconTaskList } from "#lib/icons.js";
  import OpenControl from "../OpenControl.svelte";

  let {
    kind,
    name,
    ref,
    state,
    live = false,
    onopen,
  }: {
    kind: "task" | "routine";
    name: string;
    /** A task's number; null for a routine. */
    ref: string | null;
    state: string;
    live?: boolean;
    onopen: () => void;
  } = $props();
</script>

<!-- mark-line: the kind's glyph has its own column, a line box tall, so it
     centres on the name's first line. -->
<li class="flex min-w-0 items-start gap-space-2">
  <span
    class="grid h-lh w-5 flex-none place-items-center type-label text-ink-subtle"
  >
    {#if kind === "routine"}
      <IconRepeat aria-label="Routine" class="size-icon-sm" />
    {:else}
      <IconTaskList aria-label="Task" class="size-icon-sm" />
    {/if}
  </span>
  <span class="flex min-w-0 flex-1 flex-col">
    <span class="flex min-w-0 gap-space-2 type-label">
      {#if ref}
        <span class="flex-none font-mono text-ink-subtle tabular-nums liga-none"
          >{ref}</span
        >
      {/if}
      <span class="min-w-0 text-ink-strong">{name}</span>
    </span>
    <span
      class="mark-line flex items-center gap-space-2 type-meta text-ink-muted"
    >
      {#if live}<LiveDot size="row" />{/if}
      <span>{state}</span>
    </span>
  </span>
  <span class="-my-space-1" data-box>
    <OpenControl label="Open {name}" {onopen} />
  </span>
</li>
