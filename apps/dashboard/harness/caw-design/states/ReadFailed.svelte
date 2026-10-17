<script lang="ts">
  /**
   * PROPOSED (pins 4–5): the thread could not be read. The room holds the
   * hero's shape (EmptyState) with the error-empty formula: what should be
   * here, why, the way on, and the hub's own words behind Details. The
   * composer stays writable under it. Read again is pending while it runs;
   * a refusal lands under it in RowFault's voice.
   *
   * Every part stands on the panel's content edge, from the room's top
   * (pins 14 and 15): nothing centred line by line.
   *
   * - `caw` (A): Caw at 80 in needs-you (pin 13: the way on is yours), and the
   *   agent offered as the way through, as AI and developer tools on
   *   Mobbin do it (Zapier's "Help me fix it", AWS's "Diagnose with Amazon
   *   Q", Railway's "Continue in Chat"): Ask Caw to look puts the question
   *   in the composer; nothing is sent.
   * - `solar` (B): the history glyph, Solar duotone: the fault is the hub's.
   *
   * Show details opens the hub's response in the well, as Tines' "Error
   * signature" and AWS's "API response" folds do.
   */
  import Caw from "#lib/cawco/home/Caw.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconHistory } from "#lib/icons.js";
  import DetailsToggle from "./DetailsToggle.svelte";
  import Fold from "./Fold.svelte";

  let {
    mark,
    raw,
    open = false,
    onask = null,
  }: {
    mark: "solar" | "caw";
    raw: string;
    open?: boolean;
    /** Puts a question to Caw in the composer. */
    onask?: ((text: string) => void) | null;
  } = $props();

  let shown = $state(false);
  $effect.pre(() => {
    shown = open;
  });
  let reading = $state(false);
  let refused = $state<string | null>(null);
  function readAgain() {
    reading = true;
    refused = null;
    setTimeout(() => {
      reading = false;
      refused = "Still can't read it: the hub could not open its history.";
    }, 1200);
  }
</script>

<div class="room" data-design-read-failed={mark}>
  {#snippet caw()}
    <div class="caw-80" data-caw-status="needs-you">
      <Caw size={80} status="needs-you" />
    </div>
  {/snippet}
  {#snippet action()}
    <div class="acts">
      <Button
        label="Read again"
        onclick={readAgain}
        pending={reading}
        pendingLabel="Reading…"
      />
      {#if onask}
        <Button
          label="Ask Caw to look"
          onclick={() =>
            onask?.(
              "This thread's history won't open. Can you find out why from the hub's log?"
            )}
          variant="outline"
        />
      {/if}
    </div>
    <DetailsToggle flush bind:open={shown} />
    <div class="w-full min-w-0 self-stretch">
      <RowFault reason={refused} />
      <Fold open={shown}>
        <pre class="well">{raw}</pre>
      </Fold>
    </div>
  {/snippet}
  <EmptyState
    {action}
    icon={mark === "solar" ? IconHistory : undefined}
    line="The hub could not open its history. Your messages are kept; nothing was lost."
    mark={mark === "caw" ? caw : undefined}
    title="This thread couldn't be read"
  />
</div>

<style>
  /* The room the transcript would have: its column, from the top. */
  .room {
    min-inline-size: 0;
  }
  .room :global(.kit-empty) {
    min-inline-size: 0;
    padding-block-start: var(--space-2);
  }
  .room :global(.kit-empty-title) {
    overflow-wrap: anywhere;
  }
  .room :global(.kit-empty-action) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    align-self: stretch;
    min-inline-size: 0;
  }
  .caw-80 {
    margin-block-end: var(--space-2);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  /* The well, a step under the pane's own recessed ground. */
  .well {
    margin: 0;
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-recess-deep);
    text-align: start;
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    line-height: var(--leading-body);
    color: var(--ink-strong);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
