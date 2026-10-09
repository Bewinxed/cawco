<script lang="ts">
  /**
   * A provider's routing. It is a choice among its accounts, so it exists
   * only with two or more; with fewer the address goes back to the list.
   */
  import { accountsOf, routingOf } from "#lib/cawco/accounts/model.svelte.js";
  import RoutingEditor from "#lib/cawco/accounts/RoutingEditor.svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import EditorRoute from "#lib/cawco/config/EditorRoute.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  const section = sectionOf("accounts");
  const provider = $derived(page.params.provider ?? "");
  const accounts = $derived(accountsOf(provider));
  const routing = $derived(routingOf(provider));
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
    {#key provider}
      <RoutingEditor {accounts} {provider} {routing} />
    {/key}
  {/if}
</EditorRoute>
