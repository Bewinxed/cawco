<script lang="ts">
  /**
   * A menu item's key hint (the dropdown menu's, the context menu's), drawn
   * only where there is a keyboard to press it: a touch screen (a coarse
   * pointer) has none, as the kit Kbd's `reach`. In strong ink while its
   * item has the focus.
   */
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  type Menu = "context-menu" | "dropdown-menu";

  /** Its item's focus, by the menu's own item group (written whole, for Tailwind). */
  const FOCUSED: Record<Menu, string> = {
    "context-menu": "group-focus/context-menu-item:text-ink-strong",
    "dropdown-menu": "group-focus/dropdown-menu-item:text-ink-strong",
  };

  let {
    ref = $bindable(null),
    menu,
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
    menu: Menu;
  } = $props();
</script>

<span
  class={cn(
    "ml-auto coarse:hidden text-ink-muted text-meta tracking-widest",
    FOCUSED[menu],
    className
  )}
  data-slot="{menu}-shortcut"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</span>
