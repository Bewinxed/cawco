<script lang="ts">
  /**
   * One routine on the Routines page: its name, and one plain sentence of
   * what it last did or is waiting for, with how long ago. Nothing else at
   * rest (designing-first-views, the item budget): its rhythm, runs and
   * controls are one press away, through the open button on its head.
   *
   * One mark only, and only when it needs the person: the needs-you glyph
   * on its head, its sentence at full ink saying why, and the one act that
   * answers it. A run going shows the live spinner in the same place. A
   * routine that is paused, finished or stopped recedes: its words in the
   * quieter ink.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconMaximize, IconNeedsYou } from "#lib/icons.js";
  import type { ShapeRoutine } from "./shape-data";

  let {
    routine,
    selected = false,
    next = null,
    onopen,
    onact,
  }: {
    routine: ShapeRoutine;
    /** It stands open beside the page. */
    selected?: boolean;
    /** Its next run on my clock, where the page lays routines out by when. */
    next?: string | null;
    onopen: (id: string) => void;
    /** Its ask's one act was pressed. */
    onact: (id: string) => void;
  } = $props();
</script>

<article
  data-slot="routine-card"
  data-asks={routine.ask ? "" : undefined}
  data-off={routine.off ? "" : undefined}
  data-selected={selected ? "" : undefined}
  class="group/card flex h-full min-w-0 flex-col gap-space-1 rounded-sm bg-surface-raised px-space-3 pt-space-2 pb-space-3 shadow-tile transition-[background-color] duration-(--duration-control) ease-out data-selected:bg-selected-bg"
>
  <header class="mark-line flex min-h-c-btn-h-xs items-center gap-space-2">
    {#if routine.ask}
      <IconNeedsYou
        aria-hidden="true"
        class="size-icon-md flex-none text-status-attn-glyph"
      />
      <span class="sr-only">Needs you:</span>
    {:else if routine.running}
      <Spinner
        aria-hidden="true"
        box="small"
        class="flex-none"
        role="presentation"
        tone="live-running"
      />
      <span class="sr-only">Running:</span>
    {/if}
    <h3
      class="m-0 min-w-0 flex-auto overflow-clip type-label text-ellipsis whitespace-nowrap text-ink-strong group-data-off/card:text-ink-muted"
      title={routine.name}
    >
      {routine.name}
    </h3>
    {#if next}
      <span class="num flex-none type-meta text-ink-subtle" data-num
        >{next}</span
      >
    {/if}
    <Button
      aria-label="Open {routine.name}"
      class="-me-space-1 flex-none"
      icon={IconMaximize}
      onclick={() => onopen(routine.id)}
      size="icon-xs"
      tone="muted"
      variant="ghost"
    />
  </header>
  <p
    class="m-0 line-clamp-2 type-meta wrap-anywhere text-ink-muted group-data-asks/card:text-ink-strong group-data-off/card:not-group-data-asks/card:text-ink-subtle"
  >
    {routine.sentence}{#if routine.ago}<span class="text-ink-subtle"
        >{` · ${routine.ago}`}</span
      >{/if}
  </p>
  {#if routine.ask}
    <div class="mt-space-1 flex">
      <Button
        label={routine.ask.act}
        onclick={() => onact(routine.id)}
        size="xs"
        variant="outline"
      />
    </div>
  {/if}
</article>
