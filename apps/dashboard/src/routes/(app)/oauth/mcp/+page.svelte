<script lang="ts">
  import { onMount } from "svelte";
  import { completeMcpSignIn } from "#lib/cawco/fleet.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  /**
   * Where a provider's sign-in comes back to, in the tab the sign-in opened
   * (fleet.ts `signInToMcp`). cawco.dev/oauth/callback brings the person
   * here with a one-time code; the hub exchanges it, and the tab closes: the
   * dashboard that asked turns its row on the hub's word. Nothing here holds
   * a credential: the code is spent once, by the hub, with the verifier only
   * the hub has.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconWarningTriangle } from "#lib/icons.js";
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";

  let failure = $state<string | null>(null);
  /** The server the hub signed in, once it has. */
  let signedIn = $state<string | null>(null);

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
      // The dashboard that asked is still where it was, in its own tab, and
      // its row turns on the hub's word: this tab's work is done. A tab the
      // browser will not let a page close says so instead.
      signedIn = name;
      window.close();
    } catch (error) {
      failure = failureWords(error);
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
  {:else if signedIn}
    <p class="working" role="status">
      {signedIn}
      is signed in for the whole fleet. You can close this tab.
    </p>
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
