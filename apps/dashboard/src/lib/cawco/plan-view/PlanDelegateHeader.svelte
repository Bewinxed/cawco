<script lang="ts">
  import type { HarnessKind } from "@cawco/core/harness/kinds";
  import HarnessLogo from "#lib/cawco/HarnessLogo.svelte";
  import { IDENTITY_DOT_BG } from "./style-maps.js";
  import type { IdentitySlot } from "./types.js";

  let {
    identity,
    harness,
    title,
  }: {
    harness: HarnessKind;
    identity: IdentitySlot;
    title: string;
  } = $props();
</script>

<div class="mark-line flex min-w-0 items-center gap-space-2">
  <span
    aria-hidden="true"
    class={["size-2 shrink-0 rounded-pill", IDENTITY_DOT_BG[identity]]}
    data-box
  ></span>
  <HarnessLogo data-box {harness} />
  <span
    class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
  >
    {title}
  </span>
</div>
