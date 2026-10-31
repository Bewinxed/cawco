<script lang="ts">
  /**
   * The size every demonstration of a question is drawn at, all at once:
   * the kit's segmented control, each device by its word. `all` adds the
   * stop that stands the demonstration at every size together.
   */
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { SIZE_ORDER, SIZES, type Size } from "./request";

  let {
    value = $bindable(),
    all = false,
    label = "Size",
  }: {
    value: Size | "all";
    all?: boolean;
    label?: string;
  } = $props();
</script>

<div class="max-w-full overflow-x-auto">
  <ToggleGroup.Root
    type="single"
    {value}
    onValueChange={(next) => {
      if (next) {
        value = next as Size | "all";
      }
    }}
    aria-label={label}
  >
    {#each SIZE_ORDER as size (size)}
      <ToggleGroup.Item value={size}>{SIZES[size].word}</ToggleGroup.Item>
    {/each}
    {#if all}
      <ToggleGroup.Item value="all">All</ToggleGroup.Item>
    {/if}
  </ToggleGroup.Root>
</div>
