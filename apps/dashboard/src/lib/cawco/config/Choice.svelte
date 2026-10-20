<script lang="ts">
  /**
   * A choice between a few named options: the kit's segmented control, on one
   * line (DESIGN.md, Segmented: one groove, never two rows). Where the row is
   * narrower than its segments it scrolls sideways under the house edge
   * fade; the scroller pads into an equal negative margin, so every
   * segment's touch area stays whole (DESIGN.md, The 44 Touch Rule).
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";

  let {
    label,
    value,
    options,
    onchange,
  }: {
    label: string;
    value: string;
    options: { value: string; label: string; disabled?: boolean }[];
    onchange: (next: string) => void;
  } = $props();
</script>

<div
  data-slot="choice"
  class="kit-edge-fade no-scrollbar -m-space-2 flex min-w-0 overflow-x-auto overscroll-x-contain p-space-2"
>
  <ToggleGroup.Root
    aria-label={label}
    class="w-max flex-none"
    onValueChange={(next) => {
      if (next) {
        onchange(next);
      }
    }}
    type="single"
    {value}
  >
    {#each options as option (option.value)}
      <ToggleGroup.Item disabled={option.disabled} value={option.value}>
        {option.label}
      </ToggleGroup.Item>
    {/each}
  </ToggleGroup.Root>
</div>
