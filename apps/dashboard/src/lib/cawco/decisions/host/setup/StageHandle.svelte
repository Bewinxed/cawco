<!--
  A stage's reorder handle: the house order list's drag dots (accounts/
  OrderList.svelte) on a bare 30px symbol button, dragged by a pointer or
  moved a place by the up and down arrows (HeldRow). Its name says the
  stage and its place, as the order list's rows do.
-->
<script lang="ts">
  import { setupPageWords as words } from "@cawco/core/words/onboarding";
  import type { HeldRow } from "./held-row.svelte.js";

  let {
    held,
    label,
    index,
    first,
    last,
  }: {
    held: HeldRow;
    label: string;
    /** Its row's index, and the first and last rows it may move among. */
    index: number;
    first: number;
    last: number;
  } = $props();
</script>

<button
  aria-label={words.place(label, index - first + 1, last - first + 1)}
  aria-roledescription={words.draggable}
  class="inline-flex size-c-btn-h-sm cursor-grab touch-none items-center justify-center rounded-sm border-none bg-transparent p-0 select-none hover:bg-surface-hover in-data-held:cursor-grabbing focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset)"
  data-box
  data-slot="handle"
  onkeydown={(event) => held.nudge(event, index, first, last)}
  onpointerdown={(event) => held.grab(event, index, first, last)}
  type="button"
>
  <span aria-hidden="true" class="h-space-4 w-c-drag-dots-w drag-dots"></span>
</button>
