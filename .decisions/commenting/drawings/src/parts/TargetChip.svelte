<!--
  The comment composer's target (commenting addendum §2, `lead`): the
  element's glyph and name as the kit's setting chip, opening its chain out
  to the whole page as the kit's menu, under the chip.
-->
<script lang="ts">
  import { chipVariants } from "$kit/components/ui/chip/index.js";
  // biome-ignore lint/performance/noNamespaceImport: the kit's compound menu, as every menu of the app imports it
  import * as DropdownMenu from "$kit/components/ui/dropdown-menu/index.js";
  import { IconChevronDown, IconLayers } from "$kit/icons.js";

  let { target, chain }: { target: string; chain: string[] } = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <button {...props} class={[chipVariants({ variant: "setting" }), "max-w-full"]} type="button"
        ><IconLayers /><span data-slot="chip-label">{target}</span><IconChevronDown
          data-slot="chevron"
        /></button
      >
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="start" side="bottom">
    {#each [target, ...chain] as one (one)}
      <DropdownMenu.Item>{one}</DropdownMenu.Item>
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>
