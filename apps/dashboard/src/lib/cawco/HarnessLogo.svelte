<script lang="ts">
  import type { HarnessKind } from "@cawco/core";
  import ClaudeIcon from "~icons/logos/claude-icon";
  import OpenCodeLogo from "./OpenCodeLogo.svelte";
  import PiLogo from "./PiLogo.svelte";

  let { harness }: { harness: HarnessKind } = $props();
  const marks = { claude: ClaudeIcon, opencode: OpenCodeLogo, pi: PiLogo };
  const Mark = $derived(marks[harness]);
</script>

<span class="harness-logo" data-harness-logo={harness}><Mark /></span>

<style>
  .harness-logo {
    display: inline-flex;
    flex: none;
    width: 16px;
    height: 16px;
    color: inherit;
  }
  .harness-logo :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
