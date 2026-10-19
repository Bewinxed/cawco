<script lang="ts">
  /**
   * The finder's field: 44px, the search glyph leading, the words in the
   * body role, Clear trailing while there are any. Finder's (Jump, on the
   * glass's card and the phone's sheet) and any list searched the same way
   * (the Files panel). On a phone's sheet (`phone`) it stands above the
   * keyboard: 52px, its hairline on top, the words at 16px so iOS does not
   * zoom, Clear a 44px target. Everything else the input takes (its label,
   * its combobox roles, its keys) is the caller's.
   */
  import type { HTMLInputAttributes } from "svelte/elements";
  import { IconClose } from "#lib/icons.js";
  import SearchIcon from "~icons/solar/magnifer-bold-duotone";

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

<div data-slot="finder-field" class={["field", { phone }]}>
  <SearchIcon data-finder-lead class="lead" aria-hidden="true" />
  <input bind:this={input} {value} {...rest} />
  {#if value}
    <button
      data-slot="clear"
      class="clear"
      aria-label="Clear the words"
      onclick={onclear}
      type="button"
    >
      <IconClose />
    </button>
  {/if}
</div>

<style>
  /* The field: 44px, the search glyph leading, the clear trailing. Its
     input draws no ring of its own: the field draws the house ring when
     the input has keyboard focus (The One Ring Rule), for every caller. */
  .field {
    &:has(input:focus-visible) {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: var(--focus-ring-inset);
    }
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: none;
    block-size: 44px;
    padding-inline: var(--space-3) var(--space-1);
    border-block-end: 1px solid var(--border-hairline);

    & :global(.lead) {
      flex: none;
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
      color: var(--ink-muted);
    }
    & input {
      flex: 1;
      min-inline-size: 0;
      block-size: 100%;
      border: 0;
      padding: 0;
      background: none;
      font: var(--type-body);
      color: var(--ink-strong);
      caret-color: var(--brand-solid);
      outline: none;

      &::placeholder {
        color: var(--ink-subtle);
        text-overflow: ellipsis;
      }
    }
  }
  .field.phone {
    block-size: 52px;
    border-block-end: 0;
    border-block-start: 1px solid var(--border-hairline);

    & input {
      font-size: 16px;
    }
  }
  .clear {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 36px;
    block-size: 36px;
    border: 0;
    border-radius: var(--radius-md);
    background: none;
    color: var(--ink-muted);

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
    @media (hover: hover) {
      &:hover {
        background: var(--surface-hover);
      }
    }
    &:active {
      background: var(--surface-fill);
    }
  }
  .field.phone .clear {
    inline-size: 44px;
    block-size: 44px;
  }
</style>
