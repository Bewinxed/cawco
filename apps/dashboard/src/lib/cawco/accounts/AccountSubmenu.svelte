<script lang="ts">
  /**
   * A session's Account submenu, in its row's and its tab's menus: each
   * account of the session's provider signed in on its machine, as its dot
   * and name, the current one checked. Choosing one moves the session whole
   * (switch.svelte.ts); until it lands, that item reads "Moving to {name}…".
   * Nothing at all when there is no other account to move to.
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import { IconAccounts, IconCheck } from "#lib/icons.js";
  import type { InstanceRow } from "../client.svelte";
  import { hueVar, nameOf } from "./model.svelte";
  import { moveTo, movingTo, switchable } from "./switch.svelte";

  let { instance }: { instance: InstanceRow } = $props();

  const accounts = $derived(switchable(instance));
  const target = $derived(movingTo(instance));
</script>

{#if accounts.length > 0}
  <ContextMenu.Sub>
    <!-- The kit's sub-trigger is the one menu row without the item's gap. -->
    <ContextMenu.SubTrigger class="gap-2.5">
      <IconAccounts class="size-4" />
      Account
    </ContextMenu.SubTrigger>
    <ContextMenu.SubContent class="min-w-52">
      {#each accounts as account (account.id)}
        {@const current = account.id === instance.accountId}
        {@const going = account.id === target}
        <ContextMenu.Item
          aria-checked={current}
          disabled={going}
          onSelect={() => moveTo(instance, account.id)}
          role="menuitemradio"
        >
          <i aria-hidden="true" class="dot" style:--c={hueVar(account.hue)}></i>
          <span class="name"
            >{going ? `Moving to ${nameOf(account)}…` : nameOf(account)}</span
          >
          {#if current}
            <IconCheck class="check" />
          {/if}
        </ContextMenu.Item>
      {/each}
    </ContextMenu.SubContent>
  </ContextMenu.Sub>
{/if}

<style>
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    margin-inline: 4px;
    border-radius: 50%;
    background: var(--c);
  }
  .name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name ~ :global(.check) {
    color: var(--selected-icon);
  }
</style>
