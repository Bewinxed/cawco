<script lang="ts">
  /**
   * A session's Account submenu, in its row's and its tab's menus: each
   * account of the session's provider signed in on its machine, as its dot
   * and name, one radio item each (the kit's, so bits-ui writes its
   * `menuitemradio` role and `aria-checked`), the current one checked.
   * Choosing one moves the session whole (switch.svelte.ts); the check stays
   * on the account it runs on until the move lands, and until then the item
   * chosen reads "Moving to {name}…". Nothing at all when there is no other
   * account to move to.
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import { IconAccounts } from "#lib/icons.js";
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
      <IconAccounts class="size-icon-md" />
      <span>Account</span>
    </ContextMenu.SubTrigger>
    <ContextMenu.SubContent class="min-w-52">
      <!-- Its value is the account the session runs on, always: a pick asks
           for the move (moveTo, which leaves the current one alone) and the
           check follows the session once it has moved. -->
      <ContextMenu.RadioGroup
        bind:value={
          () => instance.accountId ?? "",
          (id) => {
            moveTo(instance, id);
          }
        }
      >
        {#each accounts as account (account.id)}
          {@const going = account.id === target}
          <ContextMenu.RadioItem disabled={going} value={account.id}>
            <i
              aria-hidden="true"
              class="dot"
              data-box
              style:--c={hueVar(account.hue)}
            ></i>
            <span class="name"
              >{going ? `Moving to ${nameOf(account)}…` : nameOf(account)}</span
            >
          </ContextMenu.RadioItem>
        {/each}
      </ContextMenu.RadioGroup>
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
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
