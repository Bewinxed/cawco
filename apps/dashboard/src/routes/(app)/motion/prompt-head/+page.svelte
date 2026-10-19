<script lang="ts">
  /**
   * The approval card over the composer, for the breath-and-head probe's
   * prompt leg: the real Prompt asking for a shell call, second of three
   * asks waiting, from a session with a long title, so its head carries the
   * place keycap ("2 of 3") beside an asker that must give way.
   */
  import { presentPermission } from "@cawco/core/permission-presentation";
  import Prompt from "#lib/cawco/transcript/Prompt.svelte";
  import { requestOf } from "#lib/cawco/transcript/prompt-fixtures.js";

  /** The ask as a session makes it, read by core's own presenter as the hub reads it. */
  const request = requestOf(
    {
      asker: "Build Mobbin search MCP from web API",
      input: {
        command: "bun run lint:changed",
        description: "Lint the files this change touched",
      },
      instanceId: "bench-prompt-head",
      project: "cockpit",
      requestId: "bench-prompt-head-1",
      toolName: "Bash",
    },
    presentPermission
  );
</script>

<main class="bench">
  <Prompt onanswer={() => null} place={{ at: 2, of: 3 }} {request} shown />
</main>

<style>
  .bench {
    padding: var(--space-3);
  }
</style>
