<script lang="ts">
  /**
   * A component artifact's view in the panel's head (canvas-view.svelte.ts):
   * an item of the head's glass whose menu hangs from it (BarMenu, as
   * Inspect's item beside it), so the head keeps its room; or, once the head has no room for
   * it, the same entries as a submenu of the head's More. Map first (the
   * map over the design graph), Verify last, a design system round whose
   * verdict goes to the session. The stage's width, scheme and motion are
   * the design graph's view card.
   */
  import { previewWords } from "@cawco/core/words/preview";
  import { BarItem, BarMenu } from "#lib/components/ui/bar-glass/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconLayers, IconLayersLinear } from "#lib/icons.js";
  import type { CanvasViewState } from "./canvas-view.svelte";

  interface Props {
    /** `sub`: More's submenu; the head's own button otherwise. */
    as?: "button" | "sub";
    /** Verify: asks the hub for a design system round on the canvas. */
    onverify: () => void;
    /** A Verify on its way to the hub. */
    verifying?: boolean;
    view: CanvasViewState;
  }

  let { as = "button", onverify, verifying = false, view }: Props = $props();
</script>

{#snippet entries()}
  <DropdownMenu.CheckboxItem
    checked={view.map}
    onCheckedChange={(on) => view.showMap(on)}>Map</DropdownMenu.CheckboxItem
  >
  <DropdownMenu.Separator />
  <DropdownMenu.Item disabled={verifying} onSelect={onverify}
    >{previewWords.verifyDesign}</DropdownMenu.Item
  >
{/snippet}

{#if as === "sub"}
  <DropdownMenu.Sub>
    <DropdownMenu.SubTrigger
      ><IconLayers /><span>{previewWords.canvasView}</span
      ></DropdownMenu.SubTrigger
    >
    <DropdownMenu.SubContent width="regular"
      >{@render entries()}</DropdownMenu.SubContent
    >
  </DropdownMenu.Sub>
{:else}
  <DropdownMenu.Root>
    <!-- An item of the head's glass, as Inspect beside it; its menu hangs from the glass (BarMenu). -->
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <BarItem
          icon={IconLayersLinear}
          label={previewWords.canvasView}
          {props}
          tip="Canvas view: map, verify"
        />
      {/snippet}
    </DropdownMenu.Trigger>
    <BarMenu label={previewWords.canvasView}>
      {@render entries()}
    </BarMenu>
  </DropdownMenu.Root>
{/if}
