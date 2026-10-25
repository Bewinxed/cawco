<!--
  The failure pattern's three slots in their fixed order (report part 4):
  who (him or the hub), when (does it come back by itself: a live count),
  now (what he can do), then when the content last read. The words are the
  advisor's for a hub that answered 502; the clock and the time are drawn
  for the state. `stacked` lays them in a column (F2's popover, a phone's
  band); otherwise one row (F1 on a desk).
-->
<script>
  import { Button, IconChevronRight, IconRefresh } from "./kit.js";

  let { stacked = false } = $props();
</script>

<div
  data-slots
  class={[
    "flex gap-x-space-3 gap-y-space-2",
    stacked ? "flex-col items-start" : "flex-wrap items-center",
  ]}
>
  <span class="flex flex-wrap items-center gap-x-space-2 gap-y-space-1">
    <IconRefresh aria-hidden="true" class="size-icon-md flex-none text-ink-muted" />
    <span data-slot="who" class="type-label text-ink-strong">The hub didn't answer (502)</span>
    <span data-slot="when" class="type-meta text-ink-muted"
      >Trying again in <span data-slot="num" class="num">12</span> s</span
    >
    <span data-slot="as-of" class="type-meta text-ink-subtle"
      >as of <span data-slot="num" class="num">14:02</span></span
    >
  </span>
  <span data-slot="now" class={["flex items-center gap-space-2", !stacked && "ms-auto"]}>
    <Button size="sm" variant="outline">Retry now</Button>
    <Button size="sm" variant="ghost"><span>Details</span><IconChevronRight aria-hidden="true" /></Button>
  </span>
</div>
