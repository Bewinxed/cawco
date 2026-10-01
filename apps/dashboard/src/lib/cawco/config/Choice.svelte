<script lang="ts">
  /**
   * A choice between a few named options: the kit's segmented control, wrapping
   * onto a second line rather than running off a narrow screen.
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ToggleGroup from "$lib/components/ui/toggle-group";

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

<ToggleGroup.Root
  aria-label={label}
  class="choice"
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

<style>
  :global(.choice) {
    flex-wrap: wrap;
    align-self: flex-start;
    max-width: 100%;
  }
</style>
