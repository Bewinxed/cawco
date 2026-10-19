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

<!-- A transcript rail line's height. A finger's 44px target is the house
     touch area reaching past it (The 44 Touch Rule), never a taller header:
     the live header turns enabled as its first words land, and a header that
     grew then would drop its re-centred label under the reader. A disabled
     header has no target. -->
<Collapsible.Trigger
  {...rest}
  class="group/header mark-line press-tint touch-hit m-0 flex min-h-(--tx-line) max-w-full cursor-pointer items-center gap-space-2 rounded-xs border-none border-current bg-transparent p-0 font-inherit text-start text-inherit enabled:hover:text-ink-strong disabled:cursor-default disabled:after:content-none {className}"
  data-slot="thinking-steps-header"
>
  {#if children}
    {@render children()}
  {:else}
    <span>Thinking</span>
  {/if}
  <span
    aria-hidden="true"
    class="grid flex-none motion-safe:transition-[rotate] motion-safe:dur-control motion-safe:ease-out group-state-open/header:rotate-90 group-disabled/header:invisible"
    data-box
    ><IconChevronRight class="size-icon-sm" /></span
  >
  {@render after?.()}
</Collapsible.Trigger>
