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
   * It unfolds and folds on its own `{#if}` (motion/fold, `unfold`): mounted
   * already holding a fault (a list row arriving), it stands still and the
   * list's own motion carries it.
   */
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconRefresh } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import { unfold } from "./motion/fold.svelte";

  let {
    reason,
    again,
    againLabel = "Try again",
    againPending = "Trying again…",
    class: className,
    children,
    ...rest
  }: {
    /** Why it did not go; nothing is drawn while it is empty. */
    reason?: string | null;
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
        text: error instanceof Error ? error.message : String(error),
      };
    } finally {
      trying = false;
    }
  }
</script>

{#if said || children}
  <div class={cn("row-fault", className)} {...rest} transition:unfold>
    {#if children}
      {@render children()}
    {:else}
      <div class="line">
        <p class="reason" role="alert">{said}</p>
        {#if again}
          <Button
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
    {/if}
  </div>
{/if}

<style>
  /* One line under the row, from where the row's words start (the caller
     sets --fault-indent to its mark's column): the reason in the fail
     status's ink, the way on beside it, wrapping under it when narrow. */
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
    color: var(--status-fail-ink);
    overflow-wrap: anywhere;
  }
  .line > :global(.again) {
    flex: none;
  }
</style>
