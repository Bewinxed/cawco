<script lang="ts">
  /**
   * The kit's InputGroup in a frame of its own (its states file's): a field
   * with a glyph before it and a control after it, as the search fields and
   * the password field compose it.
   */
  import { IconEye, IconSearch } from "#lib/icons.js";
  import * as InputGroup from "./index.js";

  let {
    label,
    value,
    placeholder,
    disabled = false,
  }: {
    /** The field's name, for the screen reader. */
    label: string;
    /** What is typed. */
    value?: string;
    /** What it waits for. */
    placeholder?: string;
    /** Can't be typed in. */
    disabled?: boolean;
  } = $props();
</script>

<div class="w-sm max-w-full">
  <InputGroup.Root>
    <InputGroup.Addon>
      <IconSearch aria-hidden="true" />
    </InputGroup.Addon>
    <InputGroup.Input aria-label={label} {disabled} {placeholder} {value} />
    <InputGroup.Addon align="inline-end">
      <InputGroup.Button
        aria-label="Show what is typed"
        {disabled}
        size="icon-xs"
      >
        <IconEye aria-hidden="true" />
      </InputGroup.Button>
    </InputGroup.Addon>
  </InputGroup.Root>
</div>
