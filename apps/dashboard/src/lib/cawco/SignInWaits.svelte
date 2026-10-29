<script lang="ts">
  /**
   * The fleet's MCP servers waiting on a sign-in, at the head of the
   * machines card: one line per server, however many machines report it
   * (fleet-faults.ts `signInsWaiting`), since the sign-in is the fleet's,
   * not a machine's. Each line says what waits and has its way out, Sign
   * in, to the server's page in Configure, where its sign-in runs
   * (McpSignIn) (DESIGN.md: a failure is told and recoverable).
   */
  import { mcpWords } from "@cawco/core/words/mcp";
  import { IconKey } from "#lib/icons.js";
  import RowFault from "./RowFault.svelte";

  let { names }: { names: readonly string[] } = $props();
</script>

{#each names as name (name)}
  <RowFault
    data-sign-in-wait={name}
    end="var(--space-2)"
    goTo={{
      href: `/config/mcp/${encodeURIComponent(name)}`,
      label: mcpWords.signIn,
      icon: IconKey,
    }}
    indent="var(--space-2)"
    reason={mcpWords.needsSignIn(name)}
  />
{/each}
