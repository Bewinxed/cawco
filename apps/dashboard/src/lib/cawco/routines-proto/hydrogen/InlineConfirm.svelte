<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import type { SVGAttributes } from "svelte/elements";
  import {
    Button,
    type ButtonVariant,
  } from "#lib/components/ui/button/index.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";

  const FRAME_CLASSES: Record<"attn" | "fail" | "control", string> = {
    attn: "border-status-attn-glyph bg-needs-ground text-ink-strong",
    control: "border-border-control bg-surface-raised text-ink-strong",
    fail: "border-error-9 bg-status-fail-bg text-status-fail-ink",
  };

  let {
    title,
    confirmLabel,
    cancelLabel = "Cancel",
    confirmVariant = "outline",
    confirmIcon,
    tone = "attn",
    oncancel,
    onconfirm,
    children,
  }: {
    cancelLabel?: string;
    children: Snippet;
    confirmIcon?: Component<SVGAttributes<SVGSVGElement>>;
    confirmLabel: string;
    confirmVariant?: ButtonVariant;
    oncancel: () => void;
    onconfirm: () => void;
    title: string;
    tone?: "attn" | "fail" | "control";
  } = $props();
</script>

<div
  class={[
    "flex flex-col gap-space-2 rounded-sm border p-space-3",
    FRAME_CLASSES[tone],
  ]}
  transition:unfold
>
  <p class="m-0 type-label">{title}</p>
  <div class="type-meta">
    {@render children()}
  </div>
  <div class="flex items-center justify-end gap-space-2 pt-space-1">
    <Button label={cancelLabel} onclick={oncancel} size="xs" variant="ghost" />
    <Button
      icon={confirmIcon}
      label={confirmLabel}
      onclick={onconfirm}
      size="xs"
      variant={confirmVariant}
    />
  </div>
</div>
