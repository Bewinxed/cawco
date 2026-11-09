<script lang="ts">
  /**
   * A fleet MCP server's sign-in, on its row. Sign in opens the provider in
   * a tab of its own (fleet.ts `signInToMcp`) and the page stays here: the
   * row waits until the hub reports the server signed in
   * (`server.auth.state`, over the socket), and then says so. While it
   * waits, `waiting` is bound out for the row's line, and the button stays
   * pressable as Sign in again: a fresh sign-in in a new tab, whose start
   * replaces the one under way at the hub (fleet-mcp.ts `#start`). The
   * tab's handle is never read: a provider's page that sends
   * Cross-Origin-Opener-Policy cuts it off from this page, which then reads
   * it closed while the sign-in goes on. A sign-in the hub has not heard
   * back by its start's `expiresAt` can no longer finish, and is said under
   * the button, which tries again; so is a start the hub refused.
   */
  import type { FleetMcpServerView } from "@cawco/core/fleet-secrets";
  import { mcpWords as words } from "@cawco/core/words/mcp";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconKey } from "#lib/icons.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import { signInToMcp } from "../fleet.js";
  import RowFault from "../RowFault.svelte";

  let {
    server,
    // No fallback: the page binds a record's entry, unset until a press.
    waiting = $bindable(),
  }: { server: FleetMcpServerView; waiting?: boolean } = $props();
  /** The hub is asked to start one: the press's own work. */
  let starting = $state(false);
  let problem = $state<string | null>(null);
  const signedIn = $derived(server.auth?.state === "signed-in");
  /** The wait for the hub's word, ended by the start's expiry. */
  let lapse: ReturnType<typeof setTimeout> | undefined;

  // Signed in on the hub's word: the wait is over.
  $effect(() => {
    if (signedIn) {
      waiting = false;
      problem = null;
      clearTimeout(lapse);
    }
  });
  $effect(() => () => clearTimeout(lapse));

  async function signIn() {
    starting = true;
    problem = null;
    clearTimeout(lapse);
    let expiresAt: number;
    try {
      ({ expiresAt } = await signInToMcp(server.name));
    } catch (error) {
      problem = failureWords(error);
      waiting = false;
      return;
    } finally {
      starting = false;
    }
    waiting = true;
    // Past its start's expiry the provider's answer is refused: the sign-in
    // that has not landed by then never will.
    lapse = setTimeout(
      () => {
        if (waiting && !signedIn) {
          waiting = false;
          problem = words.signInLapsed;
        }
      },
      Math.max(0, expiresAt - Date.now())
    );
  }
</script>

{#if server.auth?.mode === "oauth"}
  <!-- Signed in is the row's status, beside its name (the mcp page's
       badge); the trailing edge keeps controls only. -->
  {#if !signedIn}
    <Button
      disabled={!server.enabled}
      failed={problem !== null}
      icon={IconKey}
      label={waiting ? words.restartSignIn : words.signIn}
      onclick={signIn}
      pending={starting}
      pendingLabel={words.startingSignIn}
      size="sm"
      variant="outline"
    />
  {/if}
  <RowFault data-sign-in-fault again={signIn} reason={problem} />
{/if}
