<!--
  A card's one state mark (glyph · word · when), at its lead row's end. What
  waits on him (asks, review) is the Status dot, the hand and its word in the
  needs-you ink, with no fill, band or well (DESIGN.md, Needs you); the rest
  stand in muted ink.
-->
<script>
  import { IconCheck, IconNeedsYou, IconStopped } from "./kit.js";

  let { mark, class: className = "" } = $props();
  const waits = $derived(mark.kind === "asks" || mark.kind === "review");
</script>

<span
  data-mark={mark.kind}
  class={[
    "mark-line inline-flex flex-none items-center gap-space-1 type-meta whitespace-nowrap",
    waits ? "text-status-attn-ink" : "text-ink-muted",
    className,
  ]}
>
  {#if waits}
    <span
      aria-hidden="true"
      class="size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
    ></span>
    <IconNeedsYou aria-hidden="true" class="size-icon-sm flex-none" />
  {:else if mark.kind === "done"}
    <IconCheck aria-hidden="true" class="size-icon-sm flex-none" />
  {:else if mark.kind === "stopped"}
    <IconStopped aria-hidden="true" class="size-icon-sm flex-none" />
  {/if}
  {#if mark.word}<span>{mark.word}</span>{/if}
  {#if mark.kind === "done"}<span class="sr-only">Done</span>{/if}
  {#if mark.when}<span data-slot="num" class="num">{mark.when}</span>{/if}
</span>
