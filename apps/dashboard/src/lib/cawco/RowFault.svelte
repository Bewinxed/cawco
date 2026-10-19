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
    class={cn("min-w-0", className)}
    {...rest}
    transition:unfold
  >
    {#if children}
      {@render children()}
    {:else}
      <div
        class="flex min-w-0 flex-wrap items-baseline gap-x-space-2 gap-y-space-1 ps-(--fault-indent) pe-(--fault-end) py-space-1"
      >
        <p
          data-slot="reason"
          class="m-0 min-w-0 flex-initial type-meta text-(--reason-ink) wrap-anywhere"
          role="alert"
          style:--reason-ink="var(--fault-ink, var(--status-fail-ink))"
        >
          {said}
        </p>
        {#if details}
          <Button
            data-details
            aria-controls={detailsId}
            aria-expanded={shown}
            class="flex-none"
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
            class="flex-none"
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
        <p
          id={detailsId}
          data-slot="details"
          class="m-0 ps-(--fault-indent) pe-(--fault-end) pb-space-1 type-meta font-mono whitespace-pre-wrap wrap-anywhere text-ink-muted"
          transition:unfold
        >
          {details}
        </p>
      {/if}
    {/if}
  </div>
{/if}
