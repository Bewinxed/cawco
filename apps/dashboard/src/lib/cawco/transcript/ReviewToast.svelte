<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  /**
   * Option C's toast: an agent updated a page while its panel was closed
   * or he was on another tab. The kit's toast face (DESIGN.md, Toast: the
   * floating-surface recipe, as wide as its words on a desk, full width less
   * `--space-3` a side on a phone), its words in body and one action,
   * Review, which opens the panel at the first stop.
   */
  import { floatingSurface } from "#lib/components/ui/popover/popover-content.svelte";

  let {
    page,
    updates = 1,
  }: {
    page: string;
    /** How many revisions landed since he looked. */
    updates?: number;
  } = $props();
</script>

<div
  class={[
    floatingSurface({ motion: "hang" }),
    "pointer-events-auto flex max-w-full items-center gap-space-3 py-space-2 ps-space-4 pe-space-2",
  ]}
  data-slot="review-toast"
  role="status"
>
  <p class="m-0 min-w-0 flex-1 type-body text-pretty text-ink-strong">
    {updates}
    {updates === 1 ? "update" : "updates"} on {page}
  </p>
  <Button label="Review" size="sm" variant="default" />
</div>
