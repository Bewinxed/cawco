<script lang="ts">
  import { onMount } from "svelte";
  import { completeMcpSignIn } from "#lib/cawco/fleet.js";
  /**
   * Where a provider's sign-in comes back to. cawco.dev/oauth/callback (or the
   * provider itself, when it can reach this address) brings the person here with
   * a one-time code; the hub exchanges it, and the person lands on the MCP
   * servers with the answer toasted. Nothing here holds a credential: the code
   * is spent once, by the hub, with the verifier only the hub has.
   */
  import { toast } from "#lib/cawco/toasts.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconWarningTriangle } from "#lib/icons.js";
  import { goto, replaceState } from "$app/navigation";
  import { page } from "$app/state";

  let failure = $state<string | null>(null);

  onMount(async () => {
    const answer = page.url.searchParams;
    const code = answer.get("code");
    const state = answer.get("state");
    const refused = answer.get("error");
    // The code leaves the address bar and the history before anything else runs.
    replaceState(page.url.pathname, {});
    if (refused) {
      failure = `The provider didn't finish the sign-in (${refused}).`;
      return;
    }
    if (!(code && state)) {
      failure = "There is no sign-in waiting to be finished at this address.";
      return;
    }
    try {
      const { name } = await completeMcpSignIn(code, state, answer.get("iss"));
      toast.success(`${name} is signed in for the whole fleet.`);
      await goto("/config/mcp", { replaceState: true });
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
  });
</script>

<svelte:head><title>Finishing sign-in · CawCo</title></svelte:head>

<div class="page">
  {#if failure}
    <EmptyState
      icon={IconWarningTriangle}
      line={failure}
      title="Sign-in didn't finish"
    >
      {#snippet action()}
        <Button href="/config/mcp" label="Back to MCP servers" />
      {/snippet}
    </EmptyState>
  {:else}
    <p class="working" role="status">Finishing sign-in…</p>
  {/if}
</div>

<style>
  .page {
    flex: 1 1 auto;
    min-width: 0;
    overflow-y: auto;
    padding: var(--space-6);
  }
  .working {
    font: var(--type-body);
    color: var(--ink-muted);
  }
</style>
