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
  import { configureWords } from "@cawco/core";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconMore } from "#lib/icons.js";

  let { label, actions }: { label: string; actions: RowAction[] } = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    aria-label={configureWords.moreFor(label)}
    data-ghost
    size="icon-sm"
    variant="ghost"
  >
    <IconMore />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="w-auto" min="regular">
    {#each actions as action (action.label)}
      <DropdownMenu.Item
        disabled={action.disabled}
        onSelect={action.onselect}
        variant={action.destructive ? "destructive" : "default"}
      >
        {#if action.icon}
          <action.icon />
        {/if}
        <span>{action.label}</span>
      </DropdownMenu.Item>
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>
