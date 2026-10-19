<script lang="ts">
  /**
   * Live work's breath on every surface it stands on, for the breath-floor
   * probe: Find's working row (the real FindRow, its glyph breathing in the
   * status-live ink) on the page, raised, recess, recess-deep and well
   * surfaces, so the probe reads the glyph's opacity at the breath's floor
   * against each surface's colour.
   */
  import FindRow from "#lib/cawco/find/FindRow.svelte";
  import type { Row } from "#lib/cawco/find/find-rows.js";
  import Working from "~icons/solar/refresh-circle-bold-duotone";

  const SURFACES = [
    "surface-page",
    "surface-raised",
    "surface-recess",
    "surface-recess-deep",
    "surface-well",
  ] as const;

  const now = Date.now();
  const row: Row = {
    at: now,
    breathes: true,
    glyph: Working,
    key: "bench-working",
    meta: ["Working", "cockpit"],
    reason: null,
    spoken: "Plan view build, Working",
    state: { tone: "live", word: "Working" },
    title: "Plan view build",
  };
</script>

<main class="bench">
  {#each SURFACES as surface (surface)}
    <section
      style:background="var(--{surface})"
      class="surface"
      data-surface={surface}
    >
      <FindRow id="bench-{surface}" {now} onpick={() => undefined} {row} />
    </section>
  {/each}
</main>

<style>
  .bench {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-4);
  }
  .surface {
    padding: var(--space-2);
    border-radius: var(--radius-md);
  }
</style>
