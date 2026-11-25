<script lang="ts">
  /**
   * The kit's NativeSelect in a frame of its own (its states file's): the
   * platform's own select in the field's look, with its options.
   */
  import { NativeSelect, NativeSelectOption } from "./index.js";

  let {
    label,
    options,
    value,
    disabled = false,
  }: {
    /** Its name, for the screen reader. */
    label: string;
    /** Its options, each its words. */
    options: string[];
    /** The option picked. */
    value: string;
    /** Can't be changed. */
    disabled?: boolean;
  } = $props();
</script>

<NativeSelect aria-label={label} {disabled} measure="cap-md" {value}>
  {#each options as option (option)}
    <NativeSelectOption value={option}>{option}</NativeSelectOption>
  {/each}
</NativeSelect>
