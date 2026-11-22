<script lang="ts">
  /**
   * One line under an outcome (shared part S1), nested under the outcome's
   * sentence: its answer's glyph in the line's lead column, its sentence,
   * and under the sentence what the newest check found, in a few words.
   * The finding is the line's one way in, a quiet button that hangs the
   * line's card from this row; the sentence never opens it.
   *
   * A line that is not done stands forward in full ink, its finding in the
   * failure's ink where the check found it wanting; a done line beside it
   * recedes, sentence and finding both quiet. While its card hangs from it,
   * the row carries the selected tint, so the card's anchor reads.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { GLYPH, inkOf, TONE } from "./LineAnswer.svelte";
  import { type Line, unsettled } from "./outcomes";
  import { outcomesWords } from "./words";

  let {
    line,
    open,
    quiet = false,
    onopen,
  }: {
    line: Line;
    /** Its card hangs from it now. */
    open: boolean;
    /** A done line beside lines that are not: it recedes. */
    quiet?: boolean;
    /** Its finding was pressed; the row is what the card hangs from. */
    onopen: (row: HTMLElement) => void;
  } = $props();

  let row = $state<HTMLElement | null>(null);
  const dim = $derived(quiet && !unsettled(line.answer));
  const Glyph = $derived(GLYPH[line.answer.kind]);
</script>

<li
  bind:this={row}
  data-line={line.id}
  data-open={open || undefined}
  style:--line-cols={"auto minmax(0, 1fr)"}
  class="relative grid grid-cols-(--line-cols) items-start gap-x-space-2 rounded-sm py-space-1 before:pointer-events-none before:absolute before:-inset-x-space-2 before:inset-y-0 before:rounded-sm before:bg-transparent before:transition-[background-color] before:duration-(--duration-control) before:ease-out data-open:before:bg-selected-bg @max-phone/view:py-0.5"
>
  <span
    class="relative mark-cell type-body @max-phone/view:type-label"
    aria-hidden="true"
  >
    <Glyph class="size-icon-md {TONE[line.answer.kind]}" />
  </span>
  <span class="relative flex min-w-0 flex-col items-start">
    <span
      class={[
        "line-clamp-2 type-body text-pretty @max-phone/view:type-label",
        dim ? "text-ink-muted" : "text-ink-strong",
      ]}>{line.sentence}</span
    >
    <!-- The button's inset reaches past the sentence's edge, so its words
         start on that edge. -->
    <span class="-mx-space-2 flex max-w-full min-w-0">
      <Button
        aria-expanded={open}
        aria-label={outcomesWords.why(line.sentence, line.found)}
        class="max-w-full"
        data-answer={line.answer.kind}
        data-line-open
        fit="word"
        onclick={() => {
          if (row) {
            onopen(row);
          }
        }}
        press="pressable"
        size="xs"
        tone="muted"
        variant="ghost"
      >
        <span class={dim ? "text-ink-subtle" : inkOf(line.answer)}
          >{line.found}</span
        >
      </Button>
    </span>
  </span>
</li>
