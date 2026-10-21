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

  let {
    anchor,
    boundary = "[data-side-well]",
    bare = false,
    children,
  }: {
    anchor: string;
    /** It draws no card: what it holds is the surface (the composer's own pill). */
    bare?: boolean;
    /** The box it keeps inside, flipping and sliding as the kit's popover does: the well it stands over. */
    boundary?: string;
    children: Snippet;
  } = $props();
  // The page is in the document only once the scene has mounted: the boundary is found then, and the surface opens inside it.
  let room = $state<Element | null>(null);
  $effect(() => {
    room = document.querySelector(boundary);
  });
  let open = $state(true);
</script>

{#if room}
<Popover.Root bind:open>
  <Popover.Content
    align="start"
    {bare}
    collisionBoundary={room}
    collisionPadding={8}
    customAnchor={anchor}
    data-float
    gap="snug"
    onInteractOutside={(event: Event) => event.preventDefault()}
    onOpenAutoFocus={(event: Event) => event.preventDefault()}
    pad={bare ? "none" : "form"}
    side="right"
    sideOffset={8}
    style="--pop-w: var(--c-pin-card-w)"
    trapFocus={false}
    width="room"
  >
    {@render children()}
  </Popover.Content>
</Popover.Root>
{/if}
