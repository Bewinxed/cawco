<script lang="ts">
  /**
   * A parent's count of the rows under it (tree.ts), and the switch that
   * opens and folds them. Folded, the rows under it are this number and
   * nothing else; open, they hang under the row on its nesting rail
   * (app.css .kit-nest). Failures among them are said beside the count in
   * their own ink.
   *
   * It sits inside the row's own link, so it is a button by role: a
   * <button> cannot nest in an <a>. Its click is its own and never the
   * link's: the row opens the session, the count opens the rows under it.
   */
  let {
    count,
    failed = 0,
    open,
    ontoggle,
    compact = false,
  }: {
    /**
     * On a one-line row (the projects list), where the title shares the
     * line: a failure count beside the count without its word.
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
  class="count num pressable focus-inset pointer-hit touch-hit"
  onclick={toggle}
  onkeydown={(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      toggle(event);
    }
  }}
  role="button"
  tabindex="0"
>
  <span>{count}</span>
  {#if failed}
    <span class="failed">· {failed}{compact ? '' : ' failed'}</span>
  {/if}
</span>

<style>
  /* A plain filled chip: a step stronger under the pointer and while its
     rows are open, the press every compact control takes (.pressable). */
  .count {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 3px;
    block-size: var(--space-5);
    min-inline-size: 20px;
    justify-content: center;
    padding-inline: 5px;
    border-radius: var(--radius-xs);
    background: var(--surface-fill);
    color: var(--ink-muted);
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out),
      transform var(--dur-toggle) var(--ease-out);
  }
  .count[aria-expanded="true"] {
    background: var(--surface-fill-strong);
    color: var(--ink-strong);
  }
  @media (hover: hover) and (pointer: fine) {
    .count:hover {
      background: var(--surface-fill-strong);
      color: var(--ink-strong);
    }
  }
  .failed {
    color: var(--status-fail-ink);
  }
</style>
