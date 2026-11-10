<script lang="ts">
  /**
   * BarMenu in a frame of its own (bar-glass.stories.ts): a drawing's
   * surface as wide as the canvas draws it, its tools in one glass
   * (BarGlass `form="group"`) floating over its foot (`foot`, the artifact
   * panel's) or over its top (`top`, a head's group), and the menu of one
   * of its items open: risen out of the glass's top from the foot, hung
   * from its foot from the top. Stand-in rows, no store read; the menu is
   * portaled as every BarMenu is, placed on the glass by floating-ui.
   */
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    IconFolderLinear,
    IconMoreLinear,
    IconRefreshLinear,
  } from "#lib/icons.js";
  import { BarGlass, BarItem, BarMenu } from "./index.js";

  let {
    stands,
    label,
    rows,
    width = "regular",
    height = 560,
  }: {
    /** Where the glass floats on the drawing: over its foot, so its menu rises, or over its top, so it hangs. */
    stands: "foot" | "top";
    /** The open menu's name, and its item's. */
    label: string;
    /** The menu's rows, each its words and its shortcut, if it has one. */
    rows: readonly { words: string; keys?: string }[];
    /** The menu's width, the kit menu's. */
    width?: "compact" | "regular" | "wide";
    /** The frame's least height, px: room for the menu over or under the glass. */
    height?: number;
  } = $props();

  const rises = $derived(stands === "foot");
</script>

{#snippet tools()}
  <BarGlass form="group">
    <DropdownMenu.Root open>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <BarItem icon={IconFolderLinear} {label} {props} tip={false} />
        {/snippet}
      </DropdownMenu.Trigger>
      <BarMenu
        {label}
        onOpenAutoFocus={(event) => event.preventDefault()}
        {rises}
        trapFocus={false}
        {width}
      >
        {#each rows as row (row.words)}
          <DropdownMenu.Item>
            {row.words}
            {#if row.keys}
              <DropdownMenu.Shortcut>{row.keys}</DropdownMenu.Shortcut>
            {/if}
          </DropdownMenu.Item>
        {/each}
      </BarMenu>
    </DropdownMenu.Root>
    <BarItem icon={IconRefreshLinear} label="Reload" tip={false} />
    <BarItem icon={IconMoreLinear} label="More" tip={false} />
  </BarGlass>
{/snippet}

<div
  class="@container/shell relative min-h-(--frame-h) w-full contain-layout bg-surface-recess p-space-3"
  style:--frame-h={`${height}px`}
>
  <div
    aria-hidden="true"
    class="absolute inset-space-3 rounded-lg border border-border-hairline bg-surface-raised"
  ></div>
  <div
    class={[
      "absolute inset-x-0 flex justify-center",
      rises ? "bottom-space-5" : "top-space-5",
    ]}
  >
    {@render tools()}
  </div>
</div>
