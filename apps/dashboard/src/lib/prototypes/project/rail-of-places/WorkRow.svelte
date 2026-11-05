<script lang="ts">
  /**
   * One piece of work in Home's Working now (TOM task 4): its state as a
   * glyph in the lead column (Working breathes; Stuck is the warning
   * glyph in the failed hue; the word in its name), what it is, what it is
   * doing or why it is stuck, and its session one press away.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconAgent,
    IconTranscript,
    IconWarningTriangle,
    IconWorking,
  } from "#lib/icons.js";
  import type { Work } from "./model";

  let {
    work,
    stale = false,
    onopen,
  }: {
    work: Work;
    /** Kept from the last good read. */
    stale?: boolean;
    /** Open its task in the pane, or its session. */
    onopen: (work: Work) => void;
  } = $props();

  const stateWord = $derived(w.workStates[work.state]);
  const facts = $derived(
    [
      work.doing,
      work.type,
      work.todos ? w.todos(work.todos[0], work.todos[1]) : undefined,
    ].filter((one): one is string => Boolean(one))
  );
</script>

<li
  class="flex gap-space-3 px-space-3 py-space-3 data-stale:opacity-55"
  data-flip
  data-stale={stale || undefined}
>
  <span
    class="mark-cell grid h-c-row-mark w-c-row-lead flex-none place-items-center"
    role="img"
    aria-label={stateWord}
  >
    {#if work.state === "stuck"}
      <IconWarningTriangle
        class="size-icon-md text-status-fail-glyph"
        aria-hidden="true"
      />
    {:else if work.kind === "caw"}
      <IconAgent
        class="size-icon-md text-status-live-glyph"
        aria-hidden="true"
      />
    {:else}
      <IconWorking
        class="breathe loops size-icon-md text-status-live-glyph"
        aria-hidden="true"
      />
    {/if}
  </span>
  <div class="flex min-w-0 flex-1 flex-col gap-space-1">
    <div class="mark-line flex min-w-0 items-center gap-space-3">
      <span class="min-w-0 flex-1 truncate type-label text-ink-row"
        >{work.title}</span
      >
      <Button
        class="flex-none"
        variant="ghost"
        size="icon-xs"
        tone="quiet"
        icon={IconTranscript}
        aria-label="{w.openSession}: {work.title}"
        onclick={() => onopen(work)}
      />
    </div>
    {#if work.state === "stuck" && work.cause}
      <span class="type-meta text-status-fail-ink"
        >{w.stuckBecause(work.cause)}</span
      >
    {:else}
      <span class="type-meta text-ink-muted">{facts.join(" · ")}</span>
    {/if}
  </div>
</li>
