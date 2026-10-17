<script lang="ts">
  /** One figure with its label: the app's StatTile. */
  import StatTile from "#lib/cawco/StatTile.svelte";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let {
    props,
  }: OpenUIRenderProps<{
    label: unknown;
    value: unknown;
    tone?: string;
    unit?: unknown;
  }> = $props();
  const TONES = ["neutral", "live", "attn", "done", "fail"] as const;
  const tone = $derived(TONES.find((each) => each === props.tone) ?? "neutral");
</script>

<!-- literal: 10rem -->
<div
  class="min-w-(--stat-min) shrink grow basis-(--stat-min)"
  style:--stat-min="10rem"
>
  <StatTile
    label={String(props.label ?? "")}
    {tone}
    unit={props.unit === undefined || props.unit === null
      ? undefined
      : String(props.unit)}
    value={typeof props.value === "number"
      ? props.value
      : String(props.value ?? "")}
  />
</div>
