<script lang="ts">
  /**
   * What a page says while the hub is not live: since when its rows are
   * kept and that nothing can change until the hub is back (PRODUCT.md, How
   * state is shown). A compact row in the muted ink, never an alarm.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { IconCloudCross } from "#lib/icons.js";

  let { since }: { since: string } = $props();
</script>

<p
  class="mark-line flex items-center gap-space-3 rounded-md bg-surface-recess px-space-3 py-space-2 type-meta text-ink-muted"
  role="status"
>
  <span class="grid w-c-row-lead flex-none place-items-center" data-box>
    <IconCloudCross class="size-icon-md" aria-hidden="true" />
  </span>
  <span>{w.staleRows(since)}</span>
</p>
