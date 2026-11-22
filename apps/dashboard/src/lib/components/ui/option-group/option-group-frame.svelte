<script lang="ts">
  /**
   * The kit's OptionGroup in a frame of its own (its states file's): a list
   * of options keyed by digit, one picked, as a tool's options and a
   * decision's answers compose it.
   */
  import { OptionGroup, OptionGroupItem } from "./index.js";

  let {
    label,
    options,
    value,
  }: {
    /** Its name, for the screen reader. */
    label: string;
    /** Each option's words. */
    options: string[];
    /** The option picked; none, nothing yet. */
    value?: string;
  } = $props();
</script>

<div class="w-sm max-w-full">
  <OptionGroup aria-label={label} layout="list" value={value ? [value] : []}>
    {#each options as option, index (option)}
      <OptionGroupItem digit={index + 1} value={option}
        >{option}</OptionGroupItem
      >
    {/each}
  </OptionGroup>
</div>
