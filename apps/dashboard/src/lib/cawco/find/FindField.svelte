<script lang="ts">
  /**
   * The finder's field: 44px, the search glyph leading, the words in the
   * body role, Clear trailing while there are any. Finder's (Jump, on the
   * glass's card and the phone's sheet) and any list searched the same way
   * (the Files panel). On a phone's sheet (`phone`) it stands above the
   * keyboard: 52px, its hairline on top, the words at 16px so iOS does not
   * zoom, Clear a 44px target. Everything else the input takes (its label,
   * its combobox roles, its keys) is the caller's. The strip is the whole
   * surface, with no frame of its own: its caret is its focus, and
   * nothing is drawn round it (DESIGN.md, The Caret Rule).
   */
  import type { HTMLInputAttributes } from "svelte/elements";
  import { IconClose, IconSearch as SearchIcon } from "#lib/icons.js";

  let {
    value,
    phone = false,
    onclear,
    input = $bindable(null),
    ...rest
  }: Omit<HTMLInputAttributes, "value"> & {
    /** The words in the field. */
    value: string;
    phone?: boolean;
    /** Clear pressed. */
    onclear: () => void;
    /** The input, for the caller's focus. */
    input?: HTMLInputElement | null;
  } = $props();
</script>

<div
  data-slot="finder-field"
  class="group/field flex items-center flex-none gap-space-2 h-control-lg ps-space-3 pe-space-1 border-b border-b-ui data-phone:h-13 data-phone:border-b-none data-phone:border-t data-phone:border-t-ui"
  data-phone={phone || undefined}
>
  <SearchIcon
    data-finder-lead
    class="flex-none size-icon-md text-tx-2"
    aria-hidden="true"
  />
  <input
    bind:this={input}
    {value}
    class="flex-1 min-w-0 h-full border-none border-current p-0 bg-transparent type-body text-tx caret-accent placeholder:text-tx-2 placeholder:text-ellipsis"
    {...rest}
  />
  {#if value}
    <button
      data-slot="clear"
      class="select-none grid place-items-center flex-none size-control-md border-none border-current rounded-sm bg-transparent text-tx-2 hover:not-active:bg-ui active:bg-ui group-data-phone/field:size-control-lg"
      aria-label="Clear the words"
      onclick={onclear}
      type="button"
    >
      <IconClose class="size-icon-md" />
    </button>
  {/if}
</div>
