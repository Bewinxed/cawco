<script lang="ts">
  /**
   * The kit's NativeSelect in a frame of its own (its states file's): the
   * platform's own select in the field's look, with its options.
   */
  import * as NativeSelect from "./index.js";

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

<NativeSelect.Root aria-label={label} {disabled} measure="cap-md" {value}>
  {#each options as option (option)}
    <NativeSelect.Option value={option}>{option}</NativeSelect.Option>
  {/each}
</NativeSelect.Root>
