<script lang="ts">
  /**
   * The kit's ToggleGroup in a frame of its own (its states file's): one
   * pick among its items, as a setting's choice composes it.
   */
  import * as ToggleGroup from "./index.js";

  let {
    label,
    options,
    value,
    disabled = false,
  }: {
    /** Its name, for the screen reader. */
    label: string;
    /** Its items, each its words. */
    options: string[];
    /** The item picked. */
    value: string;
    /** Can't be changed. */
    disabled?: boolean;
  } = $props();
</script>

<ToggleGroup.Root aria-label={label} {disabled} type="single" {value}>
  {#each options as option (option)}
    <ToggleGroup.Item fit value={option}>{option}</ToggleGroup.Item>
  {/each}
</ToggleGroup.Root>
