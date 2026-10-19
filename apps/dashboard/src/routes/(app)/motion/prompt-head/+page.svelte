<script lang="ts">
  /**
   * The approval card over the composer, for the breath-and-head probe's
   * prompt leg: the real Prompt asking for a shell call, second of three
   * asks waiting, from a session with a long title, so its head carries the
   * place keycap ("2 of 3") beside an asker that must give way.
   */
  import type { PendingPermission } from "#lib/cawco/client.svelte.js";
  import Prompt from "#lib/cawco/transcript/Prompt.svelte";

  const request: PendingPermission = {
    heard: 0,
    input: { command: "bun run lint:changed" },
    instanceId: "bench-prompt-head",
    presentation: {
      asker: "Build Mobbin search MCP from web API",
      changes: [],
      command: "bun run lint:changed",
      fields: [],
      project: "cockpit",
      summary: "Lint the files this change touched",
    },
    requestId: "bench-prompt-head-1",
    toolName: "Bash",
  };
</script>

<main class="bench">
  <Prompt onanswer={() => null} place={{ at: 2, of: 3 }} {request} shown />
</main>

<style>
  .bench {
    padding: var(--space-3);
  }
</style>
