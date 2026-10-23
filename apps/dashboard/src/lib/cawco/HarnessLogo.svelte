<script lang="ts">
  import type { HarnessKind } from "@cawco/core";
  import { LogoClaude as ClaudeIcon } from "@cawco/icons/marks";
  import OpenCodeLogo from "./OpenCodeLogo.svelte";
  import PiLogo from "./PiLogo.svelte";

  let { harness }: { harness: HarnessKind } = $props();
  const marks = { claude: ClaudeIcon, opencode: OpenCodeLogo, pi: PiLogo };
  const Mark = $derived(marks[harness]);
</script>

<span
  data-slot="harness-logo"
  class="inline-flex size-icon-md flex-none text-inherit"
  data-harness-logo={harness}><Mark class="size-full" /></span
>
