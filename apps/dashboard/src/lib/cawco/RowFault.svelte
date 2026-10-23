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
   * `command`: the way out as a command to run, drawn apart from the reason
   * in its own well with Copy (`copyLabel` names it), whole and wrapped,
   * so it is read and copied as it is, never followed by a sentence's stop.
   *
   * It unfolds and folds on its own `{#if}` (motion/fold, `unfold`): mounted
   * already holding a fault (a list row arriving), it stands still and the
   * list's own motion carries it.
   *
   * `indent` and `end`: where its words start and stop, to line up with the
   * row above (`--fault-indent`, `--fault-end`); a host that sets those for
   * every row inside it passes neither.
   */
  import { configureWords, shellWords } from "@cawco/core";
  import type { Snippet } from "svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import CopyButton from "#lib/components/ui/copy-button/copy-button.svelte";
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
    command,
    copyLabel = "Copy",
    indent,
    end,
    ...rest
  }: {
    /** Why it did not go; nothing is drawn while it is empty. */
    reason?: string | null;
    /** What refused it, word for word, folded under Show details. */
    details?: string | null;
    /** The command that fixes it, in its own well with Copy. */
    command?: string | null;
    /** Copy's name for a screen reader. */
    copyLabel?: string;
    /** The way on: run the action again. */
    again?: () => unknown;
    againLabel?: string;
    againPending?: string;
    class?: string;
    /** A fault that says itself, in place of the reason line. */
    children?: Snippet;
    /** Its words' inline-start inset: a space token or a calc() of tokens. */
    indent?: string;
    /** Its words' inline-end inset: a space token or a calc() of tokens. */
    end?: string;
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
    style:--fault-indent={indent}
    style:--fault-end={end}
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
        {#if details || again}
          <!-- One cluster at the trailing edge, beside the reason or on the line under it, so Show details and Retry never part and every row's stand in the same place. -->
          <span data-slot="actions" class="ms-auto flex flex-none gap-space-1">
            {#if details}
              <Button
                data-details
                aria-controls={detailsId}
                aria-expanded={shown}
                label={shown ? shellWords.hideDetails : shellWords.showDetails}
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
                icon={IconRefresh}
                label={againLabel}
                onclick={tryAgain}
                pending={trying}
                pendingLabel={againPending}
                size="xs"
                variant="ghost"
              />
            {/if}
          </span>
        {/if}
      </div>
      {#if command}
        <div
          data-slot="command"
          class="ms-(--fault-indent) me-(--fault-end) mb-space-1 flex min-w-0 items-start gap-space-2 rounded-well border border-border-well bg-surface-well py-space-1 ps-space-3 pe-space-1"
        >
          <code
            class="min-w-0 flex-1 py-space-1 font-mono type-code text-ink-strong whitespace-pre-wrap wrap-anywhere"
            >{command}</code
          >
          <CopyButton
            aria-label={copyLabel}
            class="flex-none"
            size="xs"
            text={command}
            variant="ghost">Copy</CopyButton
          >
        </div>
      {/if}
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
