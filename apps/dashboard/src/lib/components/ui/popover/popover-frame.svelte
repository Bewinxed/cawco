<script lang="ts">
  /**
   * The kit's Popover in a frame of its own (its states file's): open under
   * its trigger, drawn in place (the portal off) in a box that holds it
   * (`contain: layout`, so floating-ui places it in the frame), holding the
   * rows a popover's site gives it: buttons on the menu item recipe, the
   * floating surface's own rows (DESIGN.md, Menu item).
   */
  import { buttonVariants } from "#lib/components/ui/button/index.js";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { cn } from "#lib/utils.js";

  let {
    rows,
    height,
  }: {
    /** The popover's rows, each its words. */
    rows: string[];
    /** The frame's least height, px: room for the popover under its trigger. */
    height: number;
  } = $props();
</script>

<div
  class="relative min-h-(--frame-h) p-space-5 contain-layout"
  style:--frame-h={`${height}px`}
>
  <Popover.Root open>
    <Popover.Trigger class={buttonVariants({ variant: "outline" })}
      >Open</Popover.Trigger
    >
    <Popover.Content
      align="start"
      forceMount
      onOpenAutoFocus={(event) => event.preventDefault()}
      portalProps={{ disabled: true }}
      side="bottom"
      trapFocus={false}
      gap="none"
    >
      {#each rows as row (row)}
        <button
          class={cn(
            menuItemVariants(),
            "flex w-full items-center border-none bg-transparent px-space-3 text-start text-ink-strong text-label can-hover:hover:bg-surface-hover"
          )}
          data-menu-item
          type="button">{row}</button
        >
      {/each}
    </Popover.Content>
  </Popover.Root>
</div>
