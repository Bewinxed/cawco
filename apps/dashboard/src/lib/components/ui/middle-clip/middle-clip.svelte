<script lang="ts">
  /**
   * Text that gives way in its middle, so both ends show at any width
   * (`deploy@bui…ample.net`, `~/…/leaf`): the first half clips at its end
   * with an ellipsis, the second at its start, and the whole string stays in
   * the DOM, its title and for a copy. No count of characters or segments
   * decides what is kept: the room does.
   */
  import { cn } from "#lib/utils.js";

  let { text, class: className }: { text: string; class?: string } = $props();

  /** Where the text is split: the first half takes the odd character. */
  const half = $derived(Math.ceil(text.length / 2));
</script>

<span
  data-slot="middle-clip"
  class={cn("flex min-w-0 max-w-full whitespace-nowrap", className)}
  title={text}
>
  <span class="min-w-0 truncate">{text.slice(0, half)}</span>
  <!-- Right to left, so the second half clips and ends in its ellipsis at its
       start; the bdo keeps its characters in their own order. -->
  <span dir="rtl" class="min-w-0 truncate"
    ><bdo dir="ltr">{text.slice(half)}</bdo></span
  >
</span>
