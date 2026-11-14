<script lang="ts">
  /**
   * A states file's head row for one control of the desk's bar: what it
   * wraps stands in a floating group (BarGlass `form="group"`) at the
   * trailing end of a head's row, with the row's height and pads, as the
   * bar's controls stand in the app (bar-group-frame draws the kit's own
   * stand-in controls the same way). A story's decorator mounts it
   * (`decorators: [() => ({ Component: BarHeadFrame, props: {} })]`); the
   * app never does.
   */
  import type { Snippet } from "svelte";
  import { BarGlass } from "./index.js";

  let { children }: { children: Snippet } = $props();
</script>

<div class="@container/shell contain-layout bg-surface-recess pbe-space-8">
  <header
    class="flex h-c-btn-h-lg items-center justify-end gap-space-1 bg-surface-raised pe-space-3 ps-space-3"
  >
    <BarGlass form="group">{@render children()}</BarGlass>
  </header>
</div>
