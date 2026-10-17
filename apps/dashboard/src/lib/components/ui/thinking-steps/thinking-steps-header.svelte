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

<!-- literal: 26px, -9px (the header's least height; how far the touch target reaches past it) -->
<Collapsible.Trigger
  {...rest}
  class="group/header mark-line press-tint m-0 flex min-h-(--header-min) max-w-full cursor-pointer items-center gap-space-2 rounded-xs border-0 bg-transparent p-0 text-start text-inherit hover:enabled:text-ink-strong disabled:cursor-default coarse:enabled:relative {className}"
  data-slot="thinking-steps-header"
  style="--header-min: 26px; --hit-reach: -9px"
>
  {#if children}
    {@render children()}
  {:else}
    <span>Thinking</span>
  {/if}
  <span
    aria-hidden="true"
    class="grid flex-none motion-safe:transition-[rotate] motion-safe:dur-control motion-safe:ease-out group-state-open/header:rotate-90 group-disabled/header:invisible"
    data-box><IconChevronRight class="size-icon-sm" /></span
  >
  {@render after?.()}
</Collapsible.Trigger>

<style>
  /* residual: unmapped */
  :global([data-slot="thinking-steps-header"]) {
    font: inherit;
  }
  /* A 44px target for a finger, without the header growing to it: the
     live header turns enabled as its first words land, and a header that
     grew then dropped its re-centred label 9px under the reader. The
     target reaches past the header instead of the header being taller. */
  /* residual: pseudo */
  @media (pointer: coarse) {
    :global([data-slot="thinking-steps-header"]:not(:disabled))::before {
      content: "";
      position: absolute;
      inset-block: var(--hit-reach);
      inset-inline: 0;
    }
  }
</style>
