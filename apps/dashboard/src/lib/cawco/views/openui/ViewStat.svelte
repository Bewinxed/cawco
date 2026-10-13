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

<div class="stat">
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

<style>
  .stat {
    min-inline-size: 10rem;
    flex: 1 1 10rem;
  }
</style>
