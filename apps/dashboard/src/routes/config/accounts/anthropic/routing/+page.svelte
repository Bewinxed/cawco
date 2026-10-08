<script lang="ts">
  /**
   * Claude's routing. It is a choice among accounts, so it exists only with
   * two or more; with fewer the address goes back to the list.
   */
  import { accountsOf, routingOf } from "#lib/cawco/accounts/model.svelte.js";
  import RoutingEditor from "#lib/cawco/accounts/RoutingEditor.svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import EditorRoute from "#lib/cawco/config/EditorRoute.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { goto } from "$app/navigation";

  const section = sectionOf("accounts");
  const accounts = $derived(accountsOf());
  const routing = $derived(routingOf());
  const loaded = $derived(cawco.accounts !== null);

  $effect(() => {
    if (loaded && accounts.length < 2) {
      // biome-ignore lint/complexity/noVoid: navigation reports nothing to wait for
      void goto("/config/accounts", { replaceState: true });
    }
  });
</script>

<EditorRoute
  found={accounts.length > 1 && routing !== null}
  loaded={loaded && accounts.length > 1}
  problem={null}
  saveLabel="Save routing"
  {section}
  what="routing"
>
  {#if routing}
    <RoutingEditor {accounts} {routing} />
  {/if}
</EditorRoute>
