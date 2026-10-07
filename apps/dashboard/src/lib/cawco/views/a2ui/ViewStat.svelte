<script lang="ts">
  /** One figure with its label: the app's StatTile. */
  import type { A2uiComponentProps } from "svelte-a2ui";
  import StatTile from "#lib/cawco/StatTile.svelte";

  let { label, value, unit, tone }: A2uiComponentProps = $props();
  const TONES = ["neutral", "live", "attn", "done", "fail"] as const;
  const shownTone = $derived(TONES.find((each) => each === tone) ?? "neutral");
</script>

<div class="stat">
  <StatTile
    label={String(label ?? "")}
    tone={shownTone}
    unit={unit === undefined ? undefined : String(unit)}
    value={typeof value === "number" ? value : String(value ?? "")}
  />
</div>

<style>
  .stat {
    min-inline-size: 10rem;
    flex: 1 1 10rem;
  }
</style>
