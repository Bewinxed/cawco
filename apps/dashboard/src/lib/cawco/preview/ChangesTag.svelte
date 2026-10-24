<script lang="ts">
  /**
   * Changed since you looked (DESIGN.md, Changed since you looked): the tag
   * in its own bar between the panel's head and the well, centred, so it
   * never stands over the page (the page starts under it). ‹ (Previous
   * change), its words (a press starts at the first stop), › (Next change);
   * J and K step it while it holds the focus.
   */
  import { commentWords } from "@cawco/core";
  import { IconChevronLeft, IconChevronRight } from "#lib/icons.js";

  let {
    words,
    label,
    onstep,
    onwords,
    onkey,
  }: {
    /** What its words say: "3 changed since you looked", "1 of 3". */
    words: string;
    /** What the tag is, read out. */
    label: string;
    /** ‹ or ›. */
    onstep: (by: 1 | -1) => void;
    /** Its words pressed. */
    onwords: () => void;
    /** A key while a part of it holds the focus. */
    onkey?: (event: KeyboardEvent) => void;
  } = $props();
</script>

<fieldset
  data-slot="changes-tag"
  aria-label={label}
  class="mark-line w-fit max-w-full p-0 m-0 min-w-0 flex items-center h-c-btn-h-sm coarse:h-c-btn-h-lg border border-border-hairline rounded-md bg-surface-raised text-size-label font-medium text-ink-strong"
>
  <button
    aria-label={commentWords.previousChange}
    class="touch-hit grid place-items-center h-full px-space-2 rounded-s-md text-ink-muted can-hover:hover:bg-surface-hover can-hover:hover:text-ink-strong"
    data-box
    data-slot="change-previous"
    onkeydown={onkey}
    onclick={() => onstep(-1)}
    title={commentWords.previousChange}
    type="button"
  >
    <IconChevronLeft class="size-icon-md" />
  </button>
  <button
    class="touch-hit min-w-0 h-full px-space-1 overflow-clip text-ellipsis whitespace-nowrap num can-hover:hover:bg-surface-hover"
    data-slot="change-count"
    onkeydown={onkey}
    onclick={onwords}
    type="button"
  >
    {words}
  </button>
  <button
    aria-label={commentWords.nextChange}
    class="touch-hit grid place-items-center h-full px-space-2 rounded-e-md text-ink-muted can-hover:hover:bg-surface-hover can-hover:hover:text-ink-strong"
    data-box
    data-slot="change-next"
    onkeydown={onkey}
    onclick={() => onstep(1)}
    title={commentWords.nextChange}
    type="button"
  >
    <IconChevronRight class="size-icon-md" />
  </button>
</fieldset>
