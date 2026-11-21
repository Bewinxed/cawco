<script lang="ts">
  import type { Component } from "svelte";
  import type { SVGAttributes } from "svelte/elements";
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

  const TONE_INK: Record<StatusTone, string> = {
    live: "text-status-live-glyph",
    attn: "text-status-attn-glyph",
    done: "text-status-done-glyph",
    fail: "text-status-fail-glyph",
    idle: "text-status-idle-glyph",
  };

  const GLYPH_MAP: Record<
    Exclude<StatusGlyphKind, "running">,
    Component<SVGAttributes<SVGSVGElement>>
  > = {
    error: IconError,
    warning: IconWarningTriangle,
    hourglass: IconHourglass,
    success: IconSuccess,
    pause: IconPause,
    "not-yet": IconNotYet,
    neutral: IconNeutral,
    clock: IconClock,
  };

  let {
    glyph,
    tone = "idle",
    size = "md",
  }: {
    glyph: StatusGlyphKind;
    tone?: StatusTone;
    size?: "sm" | "md";
  } = $props();

  const StaticGlyph = $derived(glyph === "running" ? null : GLYPH_MAP[glyph]);
  const iconClass = $derived(size === "sm" ? "size-icon-sm" : "size-icon-md");
</script>

<span
  aria-hidden="true"
  class={["inline-flex flex-none items-center justify-center", TONE_INK[tone]]}
  data-box
>
  {#if StaticGlyph}
    <StaticGlyph class={iconClass} />
  {:else}
    <LiveDot size={size === "sm" ? "dot" : "row"} tone="live" />
  {/if}
</span>
