<script lang="ts">
  /**
   * The kit's ContextMenu in a frame of its own (its states file's): open
   * on its trigger, standing at the row's foot where a secondary click there
   * puts it, drawn in place (the portal off) in a box with room for it, its
   * items, a separator and a destructive item, as
   * a session's menu composes it.
   */
  import * as ContextMenu from "./index.js";

  let {
    items,
    danger,
    height,
  }: {
    /** Its items, each its words. */
    items: string[];
    /** The destructive item's words, under a separator. */
    danger: string;
    /** The frame's least height, px: room for the menu. */
    height: number;
  } = $props();

  let row = $state<HTMLElement | null>(null);
</script>

<div
  class="relative min-h-(--frame-h) w-sm max-w-full"
  style:--frame-h={`${height}px`}
>
  <ContextMenu.Root open>
    <ContextMenu.Trigger>
      <div
        class="rounded-sm border border-ui-2 px-space-3 py-space-2 type-label"
        bind:this={row}
      >
        Fix tray chip overflow
      </div>
    </ContextMenu.Trigger>
    <ContextMenu.Content
      align="start"
      customAnchor={row}
      forceMount
      onOpenAutoFocus={(event) => event.preventDefault()}
      portalProps={{ disabled: true }}
      side="bottom"
      trapFocus={false}
    >
      {#each items as item (item)}
        <ContextMenu.Item>{item}</ContextMenu.Item>
      {/each}
      <ContextMenu.Separator />
      <ContextMenu.Item variant="destructive">{danger}</ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Root>
</div>
