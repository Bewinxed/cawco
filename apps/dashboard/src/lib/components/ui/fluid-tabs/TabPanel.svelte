<script lang="ts">
  /**
   * Rendered when the matching item is chosen. A switch cross-fades over
   * --dur-control: the panels of one Tabs share one grid cell (the rule
   * below makes a Tabs holding panels a grid: the list above, the panels
   * stacked in the row under it), so for the length of the fade the leaving
   * and the arriving panel sit on top of each other and nothing below moves
   * twice. Opacity only, so it runs with or without motion.
   */
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";
  import { crossIn, dur, easeOut } from "$lib/whiffle/motion/curves.svelte";
  import { useTabs } from "./context.svelte";

  let {
    value,
    class: className,
    children,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    value: string;
    children: Snippet;
  } = $props();

  const tabs = useTabs();

  /** The leaving panel fades where it stands, in the shared cell. */
  const fadeOut = (_node: Element) => ({
    duration: dur("--dur-control"),
    easing: easeOut,
    css: (t: number) => `opacity: ${t}`,
  });
</script>

{#if tabs.value === value}
  <div
    class={cn("tab-panel outline-none", className)}
    data-slot="tab-panel"
    role="tabpanel"
    in:crossIn
    out:fadeOut
    {...rest}
  >
    {@render children()}
  </div>
{/if}

<style>
  :global([data-slot="tabs"]:has(> [data-slot="tab-panel"])) {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }
  :global(
    [data-slot="tabs"]:has(> [data-slot="tab-panel"])
      > :not([data-slot="tab-panel"])
  ) {
    justify-self: start;
  }
  .tab-panel {
    grid-area: 2 / 1;
  }
</style>
