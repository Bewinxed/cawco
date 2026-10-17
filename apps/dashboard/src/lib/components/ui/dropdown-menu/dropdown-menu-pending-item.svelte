<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: an item titled in the strong ink at the label
      size, whose description wraps under it a step below. */
  export const dropdownMenuPendingItemVariants = tv({
    variants: {
      look: {
        titled: "gap-y-space-1 font-medium text-ink-strong text-size-label",
      },
    },
  });

  export type DropdownMenuPendingItemLooks = VariantProps<
    typeof dropdownMenuPendingItemVariants
  >;
</script>

<script lang="ts">
  /**
   * A menu item that runs something (PendingSelect): its icon slot spins and
   * its label says `pendingLabel` while the work runs, and the menu stays
   * open until the work ends. Anything in `children` follows the label.
   */
  import type { Component, Snippet } from "svelte";
  import type { SVGAttributes } from "svelte/elements";
  import PendingContent from "#lib/components/ui/button/pending-content.svelte";
  import { PendingSelect } from "#lib/components/ui/button/pending-select.svelte.js";
  import { cn } from "#lib/utils.js";
  import Item from "./dropdown-menu-item.svelte";

  let {
    icon,
    label,
    pendingLabel,
    run,
    variant = "default",
    disabled = false,
    class: className,
    look,
    children,
  }: DropdownMenuPendingItemLooks & {
    icon?: Component<SVGAttributes<SVGSVGElement>>;
    label: string;
    pendingLabel: string;
    run: () => Promise<unknown>;
    variant?: "default" | "destructive";
    disabled?: boolean;
    class?: string;
    children?: Snippet;
  } = $props();

  let ref = $state<HTMLElement | null>(null);
  const select = new PendingSelect(
    () => run(),
    () => ref
  );
</script>

<Item
  aria-busy={select.pending || undefined}
  class={cn(
    "[--btn-gap:10px] [--btn-icon:16px]",
    dropdownMenuPendingItemVariants({ look }),
    className
  )}
  {disabled}
  onSelect={select.select}
  {variant}
  bind:ref
>
  <PendingContent
    {icon}
    {label}
    pending={select.pending}
    {pendingLabel}
    reason={select.reason}
  />
  {@render children?.()}
</Item>
