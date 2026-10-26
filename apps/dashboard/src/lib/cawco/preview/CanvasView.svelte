<script lang="ts">
  /**
   * A component canvas's view in the panel's head (canvas-view.svelte.ts):
   * the kit's dropdown menu under the head's own button (the `sm` ghost, as
   * Inspect), so the head keeps its room; or, once the head has no room for
   * it, the same entries as a submenu of the head's More. Map stands first
   * (the map over the page, its own zoom at its foot, so the page's zoom
   * waits while it is on); Verify last, a design system round whose verdict
   * goes to the session.
   */
  import { previewWords } from "@cawco/core";
  import type { PreviewScheme } from "@cawco/core/comments";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconLayers } from "#lib/icons.js";
  import {
    CANVAS_SCHEMES,
    CANVAS_WIDTHS,
    type CanvasViewState,
    type CanvasWidth,
  } from "./canvas-view.svelte";

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
  <DropdownMenu.Group>
    <DropdownMenu.GroupHeading>Scheme</DropdownMenu.GroupHeading>
    <DropdownMenu.RadioGroup
      onValueChange={(value) =>
        view.send({ ...view.chosen, scheme: value as PreviewScheme })}
      value={view.chosen.scheme}
    >
      {#each CANVAS_SCHEMES as [value, words] (value)}
        <DropdownMenu.RadioItem {value}>{words}</DropdownMenu.RadioItem>
      {/each}
    </DropdownMenu.RadioGroup>
  </DropdownMenu.Group>
  <DropdownMenu.Separator />
  <DropdownMenu.Group>
    <DropdownMenu.GroupHeading>Width</DropdownMenu.GroupHeading>
    <DropdownMenu.RadioGroup
      onValueChange={(value) =>
        view.send({ ...view.chosen, width: value as CanvasWidth })}
      value={view.chosen.width}
    >
      {#each CANVAS_WIDTHS as [value, words] (value)}
        <DropdownMenu.RadioItem {value}>{words}</DropdownMenu.RadioItem>
      {/each}
    </DropdownMenu.RadioGroup>
  </DropdownMenu.Group>
  <DropdownMenu.Separator />
  <DropdownMenu.CheckboxItem
    checked={view.chosen.motion === "reduce"}
    onCheckedChange={(on) =>
      view.send({ ...view.chosen, motion: on ? "reduce" : "on" })}
    >{previewWords.reducedMotion}</DropdownMenu.CheckboxItem
  >
  <DropdownMenu.Separator />
  <DropdownMenu.Item
    disabled={view.map}
    onSelect={() => view.send(view.chosen, "fit")}
    >Zoom to fit</DropdownMenu.Item
  >
  <DropdownMenu.Item
    disabled={view.map}
    onSelect={() => view.send(view.chosen, 1)}>Zoom to 100%</DropdownMenu.Item
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
    <!-- The head's own control, as Inspect beside it: the kit's sm ghost. -->
    <DropdownMenu.Trigger
      aria-label={previewWords.canvasView}
      size="icon-sm"
      title="Canvas view: map, scheme, widths, motion, zoom, verify"
      variant="ghost"
    >
      <IconLayers />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" width="regular">
      {@render entries()}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/if}
