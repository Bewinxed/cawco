<script lang="ts">
  /**
   * A component canvas's view in the panel's head (canvas-view.svelte.ts):
   * the kit's dropdown menu under the head's own button (the `sm` ghost, as
   * Inspect), so the head keeps its room; or, once the head has no room for
   * it, the same entries as a submenu of the head's More.
   */
  // biome-ignore lint/performance/noNamespaceImport: the kit's compound menu (DropdownMenu.Root, .Item, …), as every menu of the app imports it
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconLayers } from "#lib/icons.js";
  import {
    CANVAS_SCHEMES,
    CANVAS_WIDTHS,
    type CanvasScheme,
    type CanvasViewState,
    type CanvasWidth,
  } from "./canvas-view.svelte";

  interface Props {
    /** `sub`: More's submenu; the head's own button otherwise. */
    as?: "button" | "sub";
    view: CanvasViewState;
  }

  let { as = "button", view }: Props = $props();
</script>

{#snippet entries()}
  <DropdownMenu.Group>
    <DropdownMenu.GroupHeading>Scheme</DropdownMenu.GroupHeading>
    <DropdownMenu.RadioGroup
      onValueChange={(value) =>
        view.send({ ...view.chosen, scheme: value as CanvasScheme })}
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
    >Reduced motion</DropdownMenu.CheckboxItem
  >
  <DropdownMenu.Separator />
  <DropdownMenu.Item onSelect={() => view.send(view.chosen, "fit")}
    >Zoom to fit</DropdownMenu.Item
  >
  <DropdownMenu.Item onSelect={() => view.send(view.chosen, 1)}
    >Zoom to 100%</DropdownMenu.Item
  >
{/snippet}

{#if as === "sub"}
  <DropdownMenu.Sub>
    <DropdownMenu.SubTrigger
      ><IconLayers /><span>Canvas view</span></DropdownMenu.SubTrigger
    >
    <DropdownMenu.SubContent class="w-52"
      >{@render entries()}</DropdownMenu.SubContent
    >
  </DropdownMenu.Sub>
{:else}
  <DropdownMenu.Root>
    <!-- The head's own button, as Inspect beside it: SideSurface's head recipe draws it; the trigger brings touch-hit. -->
    <DropdownMenu.Trigger
      aria-label="Canvas view"
      title="Canvas view: scheme, widths, motion, zoom"
    >
      <IconLayers />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" class="w-52">
      {@render entries()}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/if}
