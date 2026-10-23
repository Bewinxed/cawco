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
  import { IconToolGeneric, IconRenew as Working } from "#lib/icons.js";

  const SURFACES = [
    "surface-page",
    "surface-raised",
    "surface-recess",
    "surface-recess-deep",
    "surface-well",
  ] as const;
  /** Each surface's background, written out whole. */
  const BACKGROUND = {
    "surface-page": "bg-surface-page",
    "surface-raised": "bg-surface-raised",
    "surface-recess": "bg-surface-recess",
    "surface-recess-deep": "bg-surface-recess-deep",
    "surface-well": "bg-surface-well",
  } as const satisfies Record<(typeof SURFACES)[number], string>;
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
    secrets: [],
    spoken: "Plan view build, Working",
    state: { tone: "live", word: "Working" },
    title: "Plan view build",
    titleParts: [{ matched: false, text: "Plan view build" }],
  };
</script>

<main class="grid gap-space-2 p-space-4">
  {#each SURFACES as surface (surface)}
    <section
      class="grid gap-space-2 rounded-md p-space-2 {BACKGROUND[surface]}"
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
      <div class="relative" data-breather="catch-up"><CatchUp /></div>
      <div class="flex flex-wrap gap-space-2">
        {#each INKS as ink (ink)}
          <span class="breathe loops inline-flex {ink}" data-breather={ink}
            ><IconToolGeneric class="size-icon-md" /></span
          >
        {/each}
      </div>
    </section>
  {/each}
</main>
