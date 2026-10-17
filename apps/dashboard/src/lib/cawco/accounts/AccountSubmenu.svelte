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
    <ContextMenu.SubTrigger gap="item">
      <IconAccounts class="size-icon-md" />
      <span>Account</span>
    </ContextMenu.SubTrigger>
    <ContextMenu.SubContent min="standard">
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
            <!-- literal: 8px -->
            <i
              data-slot="dot"
              aria-hidden="true"
              class="mx-space-1 size-(--dot) flex-none rounded-(--dot-r) bg-(--c)"
              data-box
              style:--c={hueVar(account.hue)}
              style:--dot="8px"
              style:--dot-r="50%"
            ></i>
            <span
              data-slot="name"
              class="min-w-0 flex-auto overflow-clip text-ellipsis whitespace-nowrap"
              >{going ? `Moving to ${nameOf(account)}…` : nameOf(account)}</span
            >
          </ContextMenu.RadioItem>
        {/each}
      </ContextMenu.RadioGroup>
    </ContextMenu.SubContent>
  </ContextMenu.Sub>
{/if}
