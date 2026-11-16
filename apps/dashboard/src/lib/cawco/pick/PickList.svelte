<script lang="ts">
  /**
   * A picker's list of PickRows: the listbox, and its one tooltip (glide.ts,
   * as a bar's glass has one), which every row's tip is tethered to, so
   * moving from row to row the open tooltip slides over and says the next
   * row's words (glide-tip). The hover ghost gliding between the rows is
   * the popover's own (NsPopover `rows`, components/ui/highlight).
   */
  import type { Snippet } from "svelte";
  import { provideGlide } from "#lib/components/ui/tooltip/glide.js";
  import GlideTip from "#lib/components/ui/tooltip/glide-tip.svelte";

  let { label, children }: { label: string; children: Snippet } = $props();

  const glide = provideGlide();
</script>

<div
  data-slot="list"
  aria-label={label}
  class="grid gap-space-row"
  role="listbox"
>
  {@render children()}
</div>
<GlideTip tether={glide} />
