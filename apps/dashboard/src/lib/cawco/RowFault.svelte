<script lang="ts">
  /**
   * What became of an action on one row, when it did not go: the reason,
   * in the words of whatever refused it, unfolding under the row that asked
   * (DESIGN.md, The Stay In Context Rule: same place, same state, told why,
   * able to go on). `again` offers the way on beside it ("Try again" unless
   * `againLabel` says otherwise); while it runs the button is pending, and a
   * throw from it becomes the reason shown, so nothing it does reaches the
   * page's unhandled-rejection reporter.
   *
   * A fault that carries its own reading and remedy (a fleet fault) is drawn
   * as `children` in the same place instead of a reason line.
   *
   * `details`: what refused it, word for word, where the reason line is the
   * plain sentence for it (a machine's own error, its paths and ids): Show
   * details beside the reason unfolds it under the line, in the figure
   * face, and Hide details folds it away.
   *
   * It unfolds and folds on its own `{#if}` (motion/fold, `unfold`): mounted
   * already holding a fault (a list row arriving), it stands still and the
   * list's own motion carries it.
   */
  import { configureWords } from "@cawco/core";
  import type { Snippet } from "svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconRefresh } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import { unfold } from "./motion/fold.svelte";

  let {
    reason,
    again,
    againLabel = configureWords.tryAgain,
    againPending = "Trying again…",
    class: className,
    children,
    details,
    ...rest
  }: {
    /** Why it did not go; nothing is drawn while it is empty. */
    reason?: string | null;
    /** What refused it, word for word, folded under Show details. */
    details?: string | null;
    /** The way on: run the action again. */
    again?: () => unknown;
    againLabel?: string;
    againPending?: string;
    class?: string;
    /** A fault that says itself, in place of the reason line. */
    children?: Snippet;
    [attribute: `data-${string}`]: unknown;
  } = $props();

  let trying = $state(false);
  /** The details stand unfolded. */
  let shown = $state(false);
  const detailsId = $props.id();
  /**
   * What the last `again` threw, and the caller's reason it was thrown over:
   * shown until the next try, or until the caller says something new.
   */
  let thrown = $state<{ over: string | null; text: string } | null>(null);
  const said = $derived(
    thrown && thrown.over === (reason ?? null) ? thrown.text : (reason ?? null)
  );

  async function tryAgain(): Promise<void> {
    if (!again || trying) {
      return;
    }
    trying = true;
    thrown = null;
    try {
      await again();
    } catch (error) {
      thrown = {
        over: reason ?? null,
        text: failureWords(error),
      };
    } finally {
      trying = false;
    }
  }
</script>

{#if said || children}
  <div
    data-slot="row-fault"
    data-row-fault
    class={cn("row-fault", className)}
    {...rest}
    transition:unfold
  >
    {#if children}
      {@render children()}
    {:else}
      <div class="line">
        <p data-slot="reason" class="reason" role="alert">{said}</p>
        {#if details}
          <Button
            data-details
            aria-controls={detailsId}
            aria-expanded={shown}
            class="again"
            label={shown ? "Hide details" : "Show details"}
            onclick={() => {
              shown = !shown;
            }}
            size="xs"
            variant="ghost"
          />
        {/if}
        {#if again}
          <Button
            data-again
            class="again"
            icon={IconRefresh}
            label={againLabel}
            onclick={tryAgain}
            pending={trying}
            pendingLabel={againPending}
            size="xs"
            variant="ghost"
          />
        {/if}
      </div>
      {#if details && shown}
        <p id={detailsId} data-slot="details" class="details" transition:unfold>
          {details}
        </p>
      {/if}
    {/if}
  </div>
{/if}

<style>
  /* One line under the row, from where the row's words start (the caller
     sets --fault-indent to its mark's column): the reason in the fail
     status's ink (or the caller's --fault-ink, where nothing failed), the
     way on beside it, wrapping under it when narrow. */
  .row-fault {
    min-width: 0;
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--space-2);
    row-gap: var(--space-1);
    padding-block: var(--space-1);
    padding-inline: var(--fault-indent, 0) var(--fault-end, 0);
    min-width: 0;
  }
  .reason {
    flex: 0 1 auto;
    min-width: 0;
    margin: 0;
    font: var(--type-meta);
    color: var(--fault-ink, var(--status-fail-ink));
    overflow-wrap: anywhere;
  }
  .line > :global(.again) {
    flex: none;
  }
  /* What refused it, word for word: under the line, from where its words
     start, in the figure face and the muted ink, a long machine path
     wrapping anywhere rather than running past the row. */
  .details {
    margin: 0;
    padding-inline: var(--fault-indent, 0) var(--fault-end, 0);
    padding-block-end: var(--space-1);
    font: var(--type-meta);
    font-family: var(--font-mono);
    color: var(--ink-muted);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
