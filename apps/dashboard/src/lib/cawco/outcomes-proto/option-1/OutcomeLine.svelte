<script lang="ts">
  /**
   * One line under "Done when:" (shared part S1): its sentence, which wraps
   * to two lines at most, and its answer in the tile's answer column, so
   * the words line up down a tile. The answer word is the line's one way
   * in, a quiet button that hangs the line's card from this row; the
   * sentence never opens it. A true line under an outcome that is not met
   * reads in quieter ink, so the lines that are not true stand forward.
   * While its card hangs from it, the row carries the selected tint, so the
   * card's anchor reads.
   */
  import LineAnswer from "./LineAnswer.svelte";
  import { type Line, unsettled } from "./outcomes";

  let {
    line,
    open,
    quiet = false,
    onopen,
  }: {
    line: Line;
    /** Its card hangs from it now. */
    open: boolean;
    /** A true line beside lines that are not: quieter ink. */
    quiet?: boolean;
    /** Its answer was pressed; the row is what the card hangs from. */
    onopen: (row: HTMLElement) => void;
  } = $props();

  let row = $state<HTMLElement | null>(null);
  const dim = $derived(quiet && !unsettled(line.answer));
</script>

<li
  bind:this={row}
  data-line={line.id}
  data-open={open || undefined}
  class="relative col-span-2 grid grid-cols-subgrid items-start rounded-sm py-space-1 @max-phone/view:py-0.5 before:pointer-events-none before:absolute before:-inset-x-space-2 before:inset-y-0 before:rounded-sm before:bg-transparent before:transition-[background-color] before:duration-(--duration-control) before:ease-out data-open:before:bg-selected-bg"
>
  <span
    class={[
      "relative line-clamp-2 type-body text-pretty @max-phone/view:type-label",
      dim ? "text-ink-muted" : "text-ink-strong",
    ]}>{line.sentence}</span
  >
  <span class="relative min-w-0">
    <LineAnswer
      answer={line.answer}
      onopen={() => {
        if (row) {
          onopen(row);
        }
      }}
      {open}
      sentence={line.sentence}
    />
  </span>
</li>
