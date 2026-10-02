<script lang="ts">
  /**
   * A parent's count of the rows under it (tree.ts), and the switch that
   * opens and folds them: the folded rows are a number here and the two
   * cards under the row (app.css .kit-stack-bars), never a list. Failures
   * among them are said beside the count in their own ink.
   *
   * It sits inside the row's own link (the row's meta line), so it is a
   * button by role: a <button> cannot nest in an <a>. Its click is its own
   * and never the link's.
   */
  import Layers from "~icons/solar/layers-minimalistic-bold-duotone";

  let {
    count,
    failed = 0,
    open,
    ontoggle,
    compact = false,
  }: {
    /**
     * On a one-line row (the projects list), where the title shares the
     * line: the count alone, a failure count beside it in its ink.
     */
    compact?: boolean;
    /** Rows under the parent, at every depth. */
    count: number;
    /** How many of them failed. */
    failed?: number;
    open: boolean;
    ontoggle: () => void;
  } = $props();

  const label = $derived(
    `${count} delegate${count === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}`
  );

  function toggle(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    ontoggle();
  }
</script>

<!-- biome-ignore lint/a11y/useSemanticElements: it sits inside the row's link, and a <button> cannot nest in an <a>. -->
<span
  aria-expanded={open}
  aria-label={open ? `Hide ${label}` : `Show ${label}`}
  class="chip num"
  onclick={toggle}
  onkeydown={(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      toggle(event);
    }
  }}
  role="button"
  tabindex="0"
>
  {#if !compact}
    <Layers aria-hidden="true" />
  {/if}
  <span>{count}</span>
  {#if failed}
    <span class="failed">· {failed}{compact ? '' : ' failed'}</span>
  {/if}
</span>

<style>
  .chip {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 3px;
    block-size: 18px;
    padding-inline: 5px;
    border-radius: var(--radius-xs);
    background: var(--surface-fill);
    color: var(--ink-muted);
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    cursor: pointer;
    transition: var(--transition-control);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
  }
  .chip[aria-expanded="true"] {
    color: var(--ink-strong);
  }
  @media (hover: hover) and (pointer: fine) {
    .chip:hover {
      color: var(--ink-strong);
    }
  }
  .failed {
    color: var(--status-fail-ink);
  }
</style>
