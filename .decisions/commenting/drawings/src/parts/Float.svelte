<!--
  A surface beside a pin on the kit's Popover, anchored to the pin's marker
  (`anchor`, a selector): the composer at the element (pick 4) or the
  thread's card (pick 1), `--c-pin-card-w` wide, `--space-2` from the pin,
  at its end side.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "$kit/components/ui/popover/index.js";

  let { anchor, children }: { anchor: string; children: Snippet } = $props();
  let open = $state(true);
</script>

<Popover.Root bind:open>
  <Popover.Content
    align="start"
    collisionPadding={32}
    customAnchor={anchor}
    data-float
    gap="snug"
    onInteractOutside={(event: Event) => event.preventDefault()}
    onOpenAutoFocus={(event: Event) => event.preventDefault()}
    pad="form"
    side="right"
    sideOffset={8}
    style="--pop-w: var(--c-pin-card-w)"
    trapFocus={false}
    width="room"
  >
    {@render children()}
  </Popover.Content>
</Popover.Root>
