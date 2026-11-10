<script lang="ts">
  /**
   * Changed since you looked (PRD §5.7, "Pointing and what changed"), on
   * the page only (the owner's pick: the comments list keeps no copy of
   * it): a glass among the tools over the drawing's foot (PreviewTools),
   * one toggle lit with its count while something changed. Turned on, each
   * changed spot is ringed on the page and the tour stands on the first,
   * ‹ and › beside the count stepping through them (J and K while it holds
   * the focus), the count saying where it stands ("Change 2 of 5"). Turned
   * off, the rings go and the glass is the count alone.
   */
  import { commentWords } from "@cawco/core/words/comments";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { IconChevronLeft, IconChevronRight } from "#lib/icons.js";

  let {
    total,
    at,
    onstep,
    onoff,
    ref = $bindable(),
  }: {
    /** How many stops the tour holds. */
    total: number;
    /** The stop the tour stands on, from 0; null while it is off. */
    at: number | null;
    /** A step: back, on, or the first as it turns on. `via` says whether a key or a press did it. */
    onstep: (by: 1 | -1 | 0, via: "key" | "pointer") => void;
    /** Turned off: the rings go, the tour with them. */
    onoff: () => void;
    /** Its box, told to the page as what covers it. */
    ref?: HTMLFieldSetElement;
  } = $props();

  const via = (event: MouseEvent) => (event.detail === 0 ? "key" : "pointer");
  function key(event: KeyboardEvent) {
    const pressed = event.key.toLowerCase();
    if (event.metaKey || event.ctrlKey || event.altKey || at === null) {
      return;
    }
    if (pressed === "j" || pressed === "k") {
      event.preventDefault();
      onstep(pressed === "j" ? 1 : -1, "key");
    }
  }
  const on = $derived(at !== null);
</script>

<fieldset
  data-slot="changes-tag"
  aria-label={commentWords.changedSince(total)}
  class="m-0 min-w-0 max-w-full border-none p-0"
  bind:this={ref}
>
  <BarGlass form="group">
    {#if on}
      <BarItem
        data-slot="change-previous"
        icon={IconChevronLeft}
        label={commentWords.previousChange}
        onclick={(event: MouseEvent) => onstep(-1, via(event))}
        onkeydown={key}
      />
    {/if}
    <BarItem
      data-slot="change-count"
      form="words"
      label={at === null
        ? commentWords.changedSince(total)
        : commentWords.changeOf(at + 1, total)}
      onclick={(event: MouseEvent) => (on ? onoff() : onstep(1, via(event)))}
      onkeydown={key}
      pressed={on}
      tip={false}
    >
      {at === null
        ? commentWords.changedSince(total)
        : commentWords.changeOf(at + 1, total)}
    </BarItem>
    {#if on}
      <BarItem
        data-slot="change-next"
        icon={IconChevronRight}
        label={commentWords.nextChange}
        onclick={(event: MouseEvent) => onstep(1, via(event))}
        onkeydown={key}
      />
    {/if}
  </BarGlass>
</fieldset>
