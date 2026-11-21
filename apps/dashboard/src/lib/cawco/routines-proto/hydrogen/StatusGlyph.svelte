<script lang="ts">
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    IconClock,
    IconError,
    IconHourglass,
    IconNeutral,
    IconNotYet,
    IconPause,
    IconSuccess,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import type { StatusGlyphKind, StatusTone } from "./routine-format";

  let {
    glyph,
    tone = "idle",
    size = "md",
  }: {
    glyph: StatusGlyphKind;
    tone?: StatusTone;
    size?: "sm" | "md";
  } = $props();

  const toneClass = $derived.by(() => {
    switch (tone) {
      case "live":
        return "text-status-live-glyph";
      case "attn":
        return "text-status-attn-glyph";
      case "done":
        return "text-status-done-glyph";
      case "fail":
        return "text-status-fail-glyph";
      case "idle":
        return "text-status-idle-glyph";
    }
  });

  const sizeClass = $derived(size === "sm" ? "size-icon-sm" : "size-icon-md");
</script>

<span
  aria-hidden="true"
  class={["inline-flex flex-none items-center justify-center", toneClass]}
  data-box
>
  {#if glyph === "running"}
    <LiveDot size={size === "sm" ? "dot" : "row"} tone="live" />
  {:else if glyph === "error"}
    <IconError class={sizeClass} />
  {:else if glyph === "warning"}
    <IconWarningTriangle class={sizeClass} />
  {:else if glyph === "hourglass"}
    <IconHourglass class={sizeClass} />
  {:else if glyph === "success"}
    <IconSuccess class={sizeClass} />
  {:else if glyph === "pause"}
    <IconPause class={sizeClass} />
  {:else if glyph === "not-yet"}
    <IconNotYet class={sizeClass} />
  {:else if glyph === "neutral"}
    <IconNeutral class={sizeClass} />
  {:else}
    <IconClock class={sizeClass} />
  {/if}
</span>
