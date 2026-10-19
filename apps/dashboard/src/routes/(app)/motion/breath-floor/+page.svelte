<script lang="ts">
  /**
   * Live work's breath on every surface it stands on, for the breath-floor
   * probe. On the page, raised, recess, recess-deep and well surfaces, every
   * kind of breather (`data-breather`): Find's working row (the real
   * FindRow), the session status's Working glyph (the real SessionStatus),
   * a plan step under way (the real PlanTree), the catch-up tag (the real
   * CatchUp, its dot on the tag's own surface), and the in-flight tool glyph
   * as the transcript draws it (`ic breathe` in each tool family's ink, and
   * the muted ink an unknown tool takes), so the probe reads each one's
   * opacity at the breath's floor against the surface under it.
   */
  import FindRow from "#lib/cawco/find/FindRow.svelte";
  import type { Row } from "#lib/cawco/find/find-rows.js";
  import PlanTree, { type PlanNode } from "#lib/cawco/plan/PlanTree.svelte";
  import CatchUp from "#lib/cawco/transcript/CatchUp.svelte";
  import SessionStatus from "#lib/cawco/workspace/SessionStatus.svelte";
  import { IconToolGeneric } from "#lib/icons.js";
  import Working from "~icons/solar/refresh-circle-bold-duotone";

  const SURFACES = [
    "surface-page",
    "surface-raised",
    "surface-recess",
    "surface-recess-deep",
    "surface-well",
  ] as const;
  /** The transcript's tool inks (tool-cards/descriptors.ts INKS), written out whole. */
  const INKS = [
    "text-tool-run",
    "text-tool-read",
    "text-tool-edit",
    "text-tool-write",
    "text-tool-search",
    "text-tool-web",
    "text-tool-skill",
    "text-tool-agent",
    "text-tool-mcp",
    "text-tool-plan",
    "text-tool-ask",
    "text-muted-foreground",
  ] as const;

  const steps: PlanNode[] = [
    { children: [], id: "s1", status: "in_progress", text: "Build the head" },
  ];
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
      <div data-breather="find-row">
        <FindRow id="bench-{surface}" {now} onpick={() => undefined} {row} />
      </div>
      <div data-breather="session-status">
        <SessionStatus step="running" />
      </div>
      <div data-breather="plan-step">
        <PlanTree nodes={steps} />
      </div>
      <div class="catch" data-breather="catch-up"><CatchUp /></div>
      <div class="tools">
        {#each INKS as ink (ink)}
          <span class="ic breathe {ink}" data-breather={ink}
            ><IconToolGeneric /></span
          >
        {/each}
      </div>
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
    display: grid;
    gap: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-md);
  }
  .catch {
    position: relative;
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .ic {
    display: inline-flex;

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
  }
</style>
