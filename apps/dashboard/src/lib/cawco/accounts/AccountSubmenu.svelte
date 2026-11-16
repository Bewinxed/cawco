<script lang="ts">
  /**
   * A session's Account submenu, in its row's and its tab's menus: each
   * account of the session's provider signed in on its machine, one
   * PickRow each as the session card's account chip draws them
   * (AccountPickRows): its dot, its name and its room, or the limit it is
   * at. The rows are the menu's radio items, so its keys walk them. Picking
   * one moves the session whole (switch.svelte.ts), and the check stands on
   * the account it is moving to from then on, as the chip's does; picking
   * the one it runs on calls the move off. A row at its limit is asked again
   * before its pick goes, the menu held open on it meanwhile, then Move
   * anyway. Nothing at all when there is no other account to move to.
   */
  import { detach } from "@cawco/core/detach";
  import type { InstanceRow } from "@cawco/core/protocol";
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import { IconAccounts } from "#lib/icons.js";
  import AccountPickRows from "./AccountPickRows.svelte";
  import { moveTo, shownAccount, switchable } from "./switch.svelte";

  let { instance }: { instance: InstanceRow } = $props();

  const accounts = $derived(switchable(instance));
</script>

{#if accounts.length > 0}
  <ContextMenu.Sub>
    <!-- The kit's sub-trigger is the one menu row without the item's gap. -->
    <ContextMenu.SubTrigger gap="item">
      <IconAccounts class="size-icon-md" />
      <span>Account</span>
    </ContextMenu.SubTrigger>
    <ContextMenu.SubContent width="wide">
      <AccountPickRows
        {accounts}
        menu
        pick={(id) => detach(moveTo(instance, id), "moveTo")}
        picked={shownAccount(instance)}
      />
    </ContextMenu.SubContent>
  </ContextMenu.Sub>
{/if}
