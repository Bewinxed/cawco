<script lang="ts">
  import type { HarnessKind } from "@cawco/core";
  import ClaudeIcon from "~icons/logos/claude-icon";
  import OpenCodeLogo from "./OpenCodeLogo.svelte";
  import PiLogo from "./PiLogo.svelte";

  let { harness }: { harness: HarnessKind } = $props();
  const marks = { claude: ClaudeIcon, opencode: OpenCodeLogo, pi: PiLogo };
  const Mark = $derived(marks[harness]);
</script>

<span
  data-slot="harness-logo"
  class="inline-flex size-icon-md flex-none text-inherit"
  data-harness-logo={harness}
><Mark /></span>


<style>
  /* residual: foreign-dom — the logos' own svg roots take no class */
  [data-harness-logo] :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
