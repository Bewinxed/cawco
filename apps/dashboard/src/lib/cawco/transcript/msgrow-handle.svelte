<script lang="ts">
  /**
   * A touch screen's way to a message's actions, where nothing hovers: one
   * 24px handle (menu-dots) standing at rest, its finger's 44px area the
   * kit's, opening the kit's menu at it with Copy, Edit and Fork from here.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: the kit's compound menu, as every menu of the app imports it
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconCopy, IconFork, IconMore, IconPenLine } from "#lib/icons.js";

  let { open = false, class: extra }: { open?: boolean; class?: string } =
    $props();

  const ACTS = [
    { label: "Copy", icon: IconCopy },
    { label: "Edit", icon: IconPenLine },
    { label: "Fork from here", icon: IconFork },
  ];

  let shown = $state(false);
  $effect.pre(() => {
    shown = open;
  });
</script>

<DropdownMenu.Root bind:open={shown}>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        aria-label="Message actions"
        class={extra}
        data-slot="handle"
        size="icon-xs"
        variant="ghost"
      >
        <IconMore aria-hidden="true" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" side="bottom" width="compact">
    {#each ACTS as act (act.label)}
      <DropdownMenu.Item
        ><act.icon aria-hidden="true" data-box /><span>{act.label}</span
        ></DropdownMenu.Item
      >
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>
