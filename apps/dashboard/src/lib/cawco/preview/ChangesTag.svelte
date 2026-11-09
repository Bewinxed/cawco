<script lang="ts">
  /**
   * Changed since you looked (PRD §5.7, "Pointing and what changed"; the
   * artifact panel's surface brief, Changed since you looked): one capsule
   * of the panel's glass floating over the page at the well's foot,
   * centred, as iOS's bottom toolbar floats its Liquid Glass over content
   * and Safari's Find on Page steps its matches there. The head stays one
   * row and the page keeps its whole height; the pane tells the page the
   * box this covers (`cawco:covered`, its `ref`), so a stop stepped to is
   * brought out from under it.
   *
   * ‹ and › step through the stops, J and K while it holds the focus; the
   * count starts the tour and, on it, says where it stands ("2 of 5").
   * It is drawn inside the well, whose box is its containing block.
   */
  import { commentWords } from "@cawco/core/words/comments";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { IconChevronLeft, IconChevronRight } from "#lib/icons.js";
  import { rise } from "#lib/platform/motion/curves.svelte.js";

  let {
    total,
    at,
    above = 0,
    onstep,
    ref = $bindable(),
  }: {
    /** How many stops the tour holds. */
    total: number;
    /** The stop the tour stands on, from 0; null before it starts. */
    at: number | null;
    /** The page's own foot bar over the well's foot, px (a decision page's Send): it stands above that, never over what the page acts on. */
    above?: number;
    /** A step: back, on, or the count (which starts the tour, or brings the stop out again). `via` says whether a key or a press did it. */
    onstep: (by: 1 | -1 | 0, via: "key" | "pointer") => void;
    /** Its box, told to the page as what covers it. */
    ref?: HTMLFieldSetElement;
  } = $props();

  const via = (event: MouseEvent) => (event.detail === 0 ? "key" : "pointer");
  function key(event: KeyboardEvent) {
    const pressed = event.key.toLowerCase();
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (pressed === "j" || pressed === "k") {
      event.preventDefault();
      onstep(pressed === "j" ? 1 : -1, "key");
    }
  }
</script>

<div
  data-slot="changes-bar"
  class="absolute inset-x-0 bottom-space-3 mb-(--tag-lift) z-1 flex justify-center px-space-3 pointer-events-none"
  style:--tag-lift="calc(var(--keyboard-lift, 0px) + {above}px)"
  in:rise={"--dur-panel"}
  out:rise={"--dur-exit"}
>
  <fieldset
    data-slot="changes-tag"
    aria-label={commentWords.changedSince(total)}
    class="pointer-events-auto m-0 min-w-0 max-w-full border-none p-0"
    bind:this={ref}
  >
    <BarGlass form="group">
      <BarItem
        data-slot="change-previous"
        icon={IconChevronLeft}
        label={commentWords.previousChange}
        onclick={(event: MouseEvent) => onstep(-1, via(event))}
        onkeydown={key}
      />
      <BarItem
        data-slot="change-count"
        form="words"
        label={at === null
          ? commentWords.changedSince(total)
          : commentWords.changeOf(at + 1, total)}
        onclick={(event: MouseEvent) => onstep(at === null ? 1 : 0, via(event))}
        onkeydown={key}
        tip={false}
      >
        {at === null
          ? commentWords.changedSince(total)
          : commentWords.changeOf(at + 1, total)}
      </BarItem>
      <BarItem
        data-slot="change-next"
        icon={IconChevronRight}
        label={commentWords.nextChange}
        onclick={(event: MouseEvent) => onstep(1, via(event))}
        onkeydown={key}
      />
    </BarGlass>
  </fieldset>
</div>
