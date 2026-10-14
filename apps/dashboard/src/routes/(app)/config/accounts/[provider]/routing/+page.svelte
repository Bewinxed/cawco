<script lang="ts">
  /**
   * A provider's routing. It is a choice among its accounts, so it exists
   * only from core's `hasRouting` count; with fewer the address goes back to
   * the list.
   */
  import { accountsWords, hasRouting } from "@cawco/core";
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
  const routes = $derived(hasRouting(accounts.length));

  $effect(() => {
    if (loaded && !routes) {
      // biome-ignore lint/complexity/noVoid: navigation reports nothing to wait for
      void goto("/config/accounts", { replaceState: true });
    }
  });
</script>

<EditorRoute
  found={routes && routing !== null}
  loaded={loaded && routes}
  problem={null}
  saveLabel={accountsWords.routingEditor.save}
  {section}
  what={accountsWords.routingEditor.what}
>
  {#if routing}
    {#key provider}
      <RoutingEditor {accounts} {provider} {routing} />
    {/key}
  {/if}
</EditorRoute>
