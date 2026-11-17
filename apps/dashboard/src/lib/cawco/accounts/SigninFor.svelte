<script lang="ts">
  /**
   * What a sign-in on a machine is for, under the machine's name: each
   * harness's mark, then their names ("OpenCode and pi", "Codex"). A
   * ChatGPT account's rows say it, where a machine holds two of its
   * sign-ins (AccountMachines, AccountSetup).
   */
  import { type HarnessKind, harnessName } from "@cawco/core/harness/kinds";
  import { accountsWords as words } from "@cawco/core/words/accounts";
  import HarnessLogo from "../HarnessLogo.svelte";

  let { harnesses }: { harnesses: HarnessKind[] } = $props();
</script>

<span
  data-slot="for"
  class="inline-flex min-w-0 items-start gap-space-2 type-meta text-ink-muted"
>
  <span class="inline-flex flex-none items-center gap-space-1">
    {#each harnesses as harness (harness)}
      <HarnessLogo {harness} />
    {/each}
  </span>
  <span class="min-w-0"
    >{words.machines.signsInFor(harnesses.map(harnessName))}</span
  >
</span>
