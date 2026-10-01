<script lang="ts" module>
  import type { Component } from "svelte";

  export interface RowAction {
    destructive?: boolean;
    disabled?: boolean;
    icon?: Component;
    label: string;
    onselect: () => void;
  }
</script>

<script lang="ts">
  /** A row's ⋯ menu: every action a row has beyond opening it and its switch. */
  import { buttonVariants } from "$lib/components/ui/button";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { IconMore } from "$lib/icons";

  let { label, actions }: { label: string; actions: RowAction[] } = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    aria-label="More for {label}"
    class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
  >
    <IconMore />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="w-auto min-w-44">
    {#each actions as action (action.label)}
      <DropdownMenu.Item
        disabled={action.disabled}
        onSelect={action.onselect}
        variant={action.destructive ? 'destructive' : 'default'}
      >
        {#if action.icon}
          <action.icon />
        {/if}
        {action.label}
      </DropdownMenu.Item>
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>
