<script lang="ts">
  /**
   * The real split beside a long conversation (SplitSlide.stories.ts): the page
   * a scroller holding a transcript's column of 120 paragraphs, each two to
   * four sentences wrapped at the column's width; the surface a plain
   * card. Open and Close above the split flip it, so a press opens or
   * closes the surface in front of the reader.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import Split from "./Split.svelte";

  let {
    open: startOpen = false,
    width,
    height,
  }: {
    open?: boolean;
    /** The window's size, as the story's frame. */
    width: number;
    height: number;
  } = $props();

  let open = $derived(startOpen);

  const SENTENCES = [
    "The nightly build failed on the migration check after the hub's schema moved the sessions table to its new key.",
    "I reran it against a copy of last night's database and the same two rows were refused, both from the October import.",
    "Their owner column was empty, which the new constraint no longer allows, so the copy stops at row 48,213.",
    "Filling the column from the project each session belongs to keeps every row, and the check passes on the copy.",
    "The preview server on the obelisk machine restarted twice while the tests ran, each time after the memory cap.",
    "Its heap grew by about forty megabytes a run, which matches the cache of rendered frames the stage keeps.",
    "Dropping frames older than the current reach brings it back to a flat line across fifty repeats.",
    "The owner asked for the dark pass to keep the hover grey warm, so the two directions differ only in that.",
    "Both were drawn on the real rows and buttons, at the widths a phone, a tablet and a desk show them.",
    "The warmer grey reads as part of the surface; the cooler one separates the row but looks like a selection.",
    "I left the decision page open with both, the warm one recommended, and parked the card in the composer.",
    "Meanwhile the routine that triages onboarding issues closed eleven duplicates and labelled the rest by area.",
  ];

  /** A long conversation's paragraphs: each two to four sentences, in a steady pattern. */
  const PARAGRAPHS = Array.from({ length: 120 }, (_, at) => {
    const count = 2 + (at % 3);
    return Array.from(
      { length: count },
      (_none, step) => SENTENCES[(at * 5 + step * 7) % SENTENCES.length]
    ).join(" ");
  });
</script>

{#snippet conversation()}
  <div class="h-full min-h-0 w-full overflow-y-auto bg-surface-page">
    <div
      class="mx-auto flex max-w-c-composer-w flex-col gap-space-4 px-space-5 py-space-6"
    >
      {#each PARAGRAPHS as words, at (at)}
        <p class="type-body text-ink-strong">{words}</p>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet card()}
  <div
    class="flex h-full flex-col gap-space-3 rounded-lg bg-surface-raised p-space-5 shadow-md"
  >
    <h2 class="type-title text-ink-strong">Plan</h2>
    <p class="type-body text-ink-muted">
      Fill the empty owner column from each session's project, then run the
      migration check against last night's copy again.
    </p>
  </div>
{/snippet}

<div
  data-slot="split-frame"
  class="flex h-(--frame-h) w-(--frame-w) min-w-0 flex-col overflow-hidden bg-surface-recess"
  style:--frame-h="{height}px"
  style:--frame-w="{width}px"
>
  <div class="flex flex-none gap-space-2 p-space-2">
    <Button
      onclick={() => {
        open = true;
      }}
      size="sm"
      variant="outline">Open</Button
    >
    <Button
      onclick={() => {
        open = false;
      }}
      size="sm"
      variant="outline">Close</Button
    >
  </div>
  <div class="flex min-h-0 flex-1">
    <Split
      active
      backLabel="Back to conversation"
      keys={{
        width: "cawco.split-frame.width",
        expanded: "cawco.split-frame.expanded",
      }}
      main={conversation}
      {open}
      side={card}
      visible
    />
  </div>
</div>
