<script lang="ts">
  import { Collapsible } from "bits-ui";
  import type { Snippet } from "svelte";
  import { IconChevronRight } from "#lib/icons.js";

  let {
    children,
    after,
    class: className = "",
    ...rest
  }: Collapsible.TriggerProps & {
    /** What reads on past the chevron, on the same line. */
    after?: Snippet;
  } = $props();
</script>

<Collapsible.Trigger
  {...rest}
  class="thinking-header mark-line press-tint {className}"
  data-slot="thinking-steps-header"
>
  {#if children}
    {@render children()}
  {:else}
    <span>Thinking</span>
  {/if}
  <span aria-hidden="true" class="chevron" data-box><IconChevronRight /></span>
  {@render after?.()}
</Collapsible.Trigger>

<style>
  /* css-scope .thinking-header: the kit header's own root, on bits-ui's element; Thinking tunes it under its own root */
  :global(.thinking-header) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: 26px;
    max-inline-size: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    font: inherit;
    color: inherit;
    text-align: start;
    cursor: pointer;

    &:disabled {
      cursor: default;
    }
    &:hover:not(:disabled) {
      color: var(--ink-strong);
    }

    /* A 44px target for a finger, without the header growing to it: the
       live header turns enabled as its first words land, and a header that
       grew then dropped its re-centred label 9px under the reader. The
       target reaches past the header instead of the header being taller. */
    @media (pointer: coarse) {
      &:not(:disabled) {
        position: relative;

        &::before {
          content: "";
          position: absolute;
          inset-block: -9px;
          inset-inline: 0;
        }
      }
    }
  }
  .chevron {
    display: grid;
    flex: 0 0 auto;

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }

    @media (prefers-reduced-motion: no-preference) {
      transition: transform var(--dur-control) var(--ease-out);
    }
  }
  :global(.thinking-header[data-state="open"]) .chevron {
    transform: rotate(90deg);
  }
  :global(.thinking-header:disabled) .chevron {
    visibility: hidden;
  }
</style>
