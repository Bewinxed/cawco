<script lang="ts">
  import type { FleetMcpServer } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconKey } from "#lib/icons.js";
  import { signInToMcp } from "../fleet.js";

  let { server }: { server: FleetMcpServer } = $props();
  let busy = $state(false);
  let problem = $state<string | null>(null);
  const signedIn = $derived(server.auth?.state === "signed-in");

  async function signIn() {
    busy = true;
    problem = null;
    try {
      await signInToMcp(server.name);
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
      busy = false;
    }
  }
</script>

{#if server.auth?.mode === "oauth"}
  {#if signedIn}
    <span class="state" role="status">Signed in for the fleet</span>
  {:else}
    <Button
      disabled={!server.enabled}
      icon={IconKey}
      label="Sign in"
      onclick={signIn}
      pending={busy}
      pendingLabel="Opening sign-in…"
      size="sm"
      variant="outline"
    />
  {/if}
  {#if problem}
    <p class="problem" role="alert">{problem}</p>
  {/if}
{/if}

<style>
  .state {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .problem {
    font: var(--type-body);
    color: var(--status-fail-ink);
  }
</style>
