<script lang="ts">
  /**
   * PROPOSED: the Details disclosure, the kit's `sm` ghost as the update
   * notice's Show changes ⌄: its words and its chevron say it is open (the
   * chevron turning a half turn over --dur-control), never the ghost's
   * expanded fill.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronDown } from "#lib/icons.js";

  let {
    open = $bindable(false),
    shut = "Show details",
    shown = "Hide details",
  }: {
    open?: boolean;
    shut?: string;
    shown?: string;
  } = $props();
</script>

<Button
  aria-expanded={open}
  class="details-toggle aria-expanded:bg-transparent"
  onclick={() => {
    open = !open;
  }}
  press="tint"
  size="sm"
  variant="ghost"
>
  <span>{open ? shown : shut}</span>
  <span class={["chev", { open }]} data-box><IconChevronDown /></span>
</Button>

<style>
  .chev {
    display: inline-flex;

    @media (prefers-reduced-motion: no-preference) {
      transition: rotate var(--dur-control) var(--ease-out);
    }
    &.open {
      rotate: 180deg;
    }
  }
</style>
