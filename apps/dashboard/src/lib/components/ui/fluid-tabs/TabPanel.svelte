<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  const tabPanelVariants = tv({
    base: "focus-inset flex-1 rounded-lg type-body",
    variants: {
      layout: {
        /** A pane whose own scroller takes its height: a column that can shrink. */
        column: "flex min-h-0 flex-col",
      },
    },
  });

  type TabPanelLayout = VariantProps<typeof tabPanelVariants>["layout"];

  /** What a Tab can land on inside a panel. */
  const FOCUSABLE =
    ':is(a[href], button, input, select, textarea, [tabindex], [contenteditable]):not([disabled], [tabindex="-1"], [contenteditable="false"])';
</script>

<script lang="ts">
  /**
   * A tab's panel is a Tab stop of its own only while it holds nothing a
   * Tab can land on (W3C APG, Tabs Pattern: "When the tabpanel does not
   * contain any focusable elements or the first element with content is not
   * focusable, the tabpanel should set tabindex="0" to include it in the
   * tab sequence of the page"). Holding a control, it takes no stop, so Tab
   * goes from the tabs straight to what the panel holds. Read as the panel
   * changes; a `tabindex` the caller gives wins.
   */
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "#lib/utils.js";
  import { useTabs } from "./context.svelte";

  let {
    ref = $bindable(null),
    value,
    class: className,
    layout,
    tabindex,
    children,
    ...restProps
  }: HTMLAttributes<HTMLDivElement> & {
    ref?: HTMLDivElement | null;
    value: string;
    layout?: TabPanelLayout;
    children?: Snippet;
  } = $props();

  const tabs = useTabs();
  const active = $derived(tabs.value === value);

  /** The panel holds something a Tab lands on. */
  let holds = $state(false);
  $effect(() => {
    const panel = ref;
    if (!(panel && active)) {
      return;
    }
    const read = () => {
      holds = panel.querySelector(FOCUSABLE) !== null;
    };
    read();
    const seen = new MutationObserver(read);
    seen.observe(panel, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["tabindex", "disabled", "href", "contenteditable"],
    });
    return () => seen.disconnect();
  });
</script>

<div
  class={cn(tabPanelVariants({ layout }), !active && "hidden", className)}
  data-slot="tabs-content"
  data-state={active ? "active" : "inactive"}
  hidden={!active || undefined}
  role="tabpanel"
  tabindex={tabindex ?? (holds ? -1 : 0)}
  bind:this={ref}
  {...restProps}
>
  {#if active}
    {@render children?.()}
  {/if}
</div>
