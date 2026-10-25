<!--
  A stage's head, one component on desk and phone (report part 2): its name,
  its count (none at 0, The Earned Count Rule) and, on the you-kind stage
  only, the hand in ink, never in the needs-you hue. The kind words under
  the name go.
-->
<script>
  import { IconNeedsYou } from "./kit.js";

  let { stage, count, tag = "h3" } = $props();
</script>

<span data-stage-head class="mark-line flex min-h-c-btn-h-xs items-center gap-space-2">
  {#if stage.kind === "you"}
    <IconNeedsYou aria-hidden="true" class="-me-space-1 size-icon-md flex-none text-ink-strong" />
  {/if}
  <svelte:element this={tag} class="m-0 min-w-0 type-label text-ink-strong">{stage.name}</svelte:element>
  {#if count > 0}
    <span data-slot="num" class="num ms-auto type-meta text-ink-subtle">{count}</span>
  {/if}
</span>
