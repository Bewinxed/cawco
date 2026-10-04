<script lang="ts">
  /**
   * A run step's count of what it folds (the lines of its result, its
   * transcript, its actions), and the switch that opens and folds it: flush
   * with the row's trailing edge, so every count in a run stands in one
   * column at the edge (RunSteps). It counts text, not rows: a row with rows
   * under it says so on its mark instead (TreeMark).
   *
   * Its click is its own and never the row's: the row's line opens the same
   * fold, and the count stands beside it as a second, smaller target.
   */
  let {
    count,
    open,
    ontoggle,
    noun,
  }: {
    /** How much the step folds. */
    count: number;
    /** What one of them is, for its name ("3 lines"). */
    noun: string;
    open: boolean;
    ontoggle: () => void;
  } = $props();

  const label = $derived(`${count} ${noun}${count === 1 ? "" : "s"}`);

  function toggle(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    ontoggle();
  }
</script>

<!-- biome-ignore lint/a11y/useSemanticElements: the chip's markup and press are the kit's span control (.pressable), as they were inside a row's link. -->
<span
  aria-expanded={open}
  aria-label={open ? `Hide ${label}` : `Show ${label}`}
  class="count num pressable focus-inset pointer-hit touch-hit"
  data-open={open || undefined}
  onclick={toggle}
  onkeydown={(event) => {
    if (event.key === "Enter" || event.key === " ") {
      toggle(event);
    }
  }}
  role="button"
  tabindex="0"
>
  {count}
</span>

<style>
  /* A plain filled chip: a step stronger under the pointer and while its
     fold is open, the press every compact control takes (.pressable). It
     never yields or truncates: a row's title gives up its room first. */
  .count {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    block-size: var(--space-5);
    min-inline-size: var(--space-5);
    padding-inline: var(--space-1);
    overflow: visible;
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
  .count[data-open] {
    background: var(--surface-fill-strong);
    color: var(--ink-strong);
  }
  @media (hover: hover) and (pointer: fine) {
    .count:hover {
      background: var(--surface-fill-strong);
      color: var(--ink-strong);
    }
  }
</style>
