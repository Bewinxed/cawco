<script lang="ts">
  /** One figure with its label: the app's StatTile. */
  import { VIEW_TONES } from "@cawco/core/views";
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
  const tone = $derived(
    VIEW_TONES.find((each) => each === props.tone) ?? "neutral"
  );
</script>

<div class="min-w-c-stat-min shrink grow basis-c-stat-min">
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
