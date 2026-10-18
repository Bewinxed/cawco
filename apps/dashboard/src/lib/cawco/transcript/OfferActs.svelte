<script lang="ts">
  /**
   * An offer's answers under its note (DesignOfferActions, LfsOfferActions):
   * what was answered, in the note's quiet meta words, then its buttons (the
   * offer's while it stands, or where its answer leads), and the hub's
   * refusal under them on a line of its own.
   */
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    children,
    class: className,
    problem,
    said,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    children?: Snippet;
    problem: string | null;
    /** What was answered; null while the offer stands. */
    said: string | null;
  } = $props();
</script>

<div class={["offer", className]} {...rest}>
  {#if said}
    <span class="said">{said}</span>
  {/if}
  {@render children?.()}
  {#if problem}
    <p class="problem">{problem}</p>
  {/if}
</div>

<style>
  .offer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-block-start: var(--space-2);
  }
  .said {
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  .problem {
    flex-basis: 100%;
    margin: 0;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--status-fail-ink);
  }
</style>
