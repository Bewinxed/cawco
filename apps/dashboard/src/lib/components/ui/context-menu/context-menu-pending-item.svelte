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
  import Item from "./context-menu-item.svelte";

  let {
    icon,
    label,
    pendingLabel,
    run,
    variant = "default",
    disabled = false,
    class: className,
    children,
  }: {
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
  class={cn("[--btn-gap:10px] [--btn-icon:16px]", className)}
  {disabled}
  onSelect={select.select}
  {variant}
  bind:ref
>
  <PendingContent
    failed={select.failed}
    {icon}
    {label}
    pending={select.pending}
    {pendingLabel}
  />
  {@render children?.()}
</Item>
