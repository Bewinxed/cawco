<script lang="ts">
  /**
   * PROPOSED: the Details disclosure, the kit's link button open or shut
   * (it never turns into a filled control), with the transcript's chevron
   * turning a half turn as it opens (--dur-control).
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronDown } from "#lib/icons.js";

  let {
    open = $bindable(false),
    shut = "Show details",
    shown = "Hide details",
    flush = false,
  }: {
    open?: boolean;
    shut?: string;
    shown?: string;
    /** Starts a line: its words on the edge, its 1px edge and 11px inset taken back. */
    flush?: boolean;
  } = $props();
</script>

<Button
  aria-expanded={open}
  class={["details-toggle", flush && "-ms-[12px]"]}
  onclick={() => {
    open = !open;
  }}
  press="tint"
  size="sm"
  variant="link"
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
