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

<!-- A plain filled chip: a step stronger under the pointer and while its
     fold is open, the press every compact control takes (.pressable). It
     never yields or truncates: a row's title gives up its room first. -->
<!-- biome-ignore lint/a11y/useSemanticElements: the chip's markup and press are the kit's span control (.pressable), as they were inside a row's link. -->
<span
  data-num
  data-slot="count"
  aria-expanded={open}
  aria-label={open ? `Hide ${label}` : `Show ${label}`}
  class="num pressable focus-inset pointer-hit touch-hit inline-flex flex-none items-center justify-center h-space-5 min-w-space-5 px-space-1 overflow-visible rounded-xs bg-surface-fill text-ink-muted type-meta whitespace-nowrap cursor-pointer data-open:bg-surface-fill-strong data-open:text-ink-strong hover:bg-surface-fill-strong hover:text-ink-strong"
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
  /* residual: unmapped — two durations in one transition (needs a transition
     token); unlayered, so it still wins over .pressable's own transition. */
  [data-slot="count"] {
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out),
      transform var(--dur-toggle) var(--ease-out);
  }
</style>
