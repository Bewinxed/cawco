<script lang="ts">
  /** A page's search field: the kit's input group, the search glyph leading. */
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import { IconSearch } from "#lib/icons.js";

  let { label }: { label: string } = $props();
</script>

<InputGroup.Root>
  <InputGroup.Addon>
    <IconSearch class="size-icon-md text-ink-muted" aria-hidden="true" />
  </InputGroup.Addon>
  <InputGroup.Input type="search" placeholder={label} aria-label={label} />
</InputGroup.Root>
