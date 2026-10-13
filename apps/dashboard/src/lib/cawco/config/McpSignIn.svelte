<script lang="ts">
  /**
   * A fleet MCP server's sign-in, on its row. Sign in opens the provider in
   * a tab of its own (fleet.ts `signInToMcp`) and the page stays here: the
   * button waits for the provider until the hub reports the server signed
   * in (`server.auth.state`, over the socket), and then the row says so. A
   * sign-in tab closed before it finished, or a start the hub refused, is
   * said under the button, which tries again.
   */
  import type { FleetMcpServer } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconKey } from "#lib/icons.js";
  import { signInToMcp } from "../fleet.js";
  import RowFault from "../RowFault.svelte";

  let { server }: { server: FleetMcpServer } = $props();
  let waiting = $state(false);
  let problem = $state<string | null>(null);
  const signedIn = $derived(server.auth?.state === "signed-in");
  let watch: ReturnType<typeof setInterval> | undefined;

  // Signed in on the hub's word: the wait is over.
  $effect(() => {
    if (signedIn) {
      waiting = false;
      problem = null;
      clearInterval(watch);
    }
  });
  $effect(() => () => clearInterval(watch));

  async function signIn() {
    waiting = true;
    problem = null;
    let tab: Window;
    try {
      tab = await signInToMcp(server.name);
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
      waiting = false;
      return;
    }
    clearInterval(watch);
    // A tab closed before the hub said signed in: it did not finish.
    watch = setInterval(() => {
      if (!tab.closed) {
        return;
      }
      clearInterval(watch);
      // The hand-back closes its tab as the hub answers: a beat for the
      // socket's word to arrive before calling it unfinished.
      setTimeout(() => {
        if (waiting && !signedIn) {
          waiting = false;
          problem = "The sign-in tab closed before it finished.";
        }
      }, 2000);
    }, 500);
  }
</script>

{#if server.auth?.mode === "oauth"}
  {#if signedIn}
    <span class="state" role="status">Signed in for the fleet</span>
  {:else}
    <Button
      disabled={!server.enabled}
      failed={problem !== null}
      icon={IconKey}
      label="Sign in"
      onclick={signIn}
      pending={waiting}
      pendingLabel="Waiting for {server.name}…"
      size="sm"
      variant="outline"
    />
  {/if}
  <RowFault again={signIn} class="sign-in-fault" reason={problem} />
{/if}

<style>
  .state {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
</style>
