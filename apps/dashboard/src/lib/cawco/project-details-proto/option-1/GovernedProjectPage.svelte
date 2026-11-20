<script lang="ts">
  /**
   * Option 1 (Governed canvas): the live project page region with zero settings
   * surface. Top to bottom: optional hub-out-of-reach strip, ProjectBar,
   * WaitingStrip, ViewsStrip (all pinned), then the scrolling view body with
   * DecisionsRules directly above the body when `view === "decisions"`.
   */
  import type { Snippet } from "svelte";
  import { RESTING_LEAD } from "#lib/cawco/project/caw-lead.fixture.js";
  import type { SeatedLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import NsPopoverGroup from "#lib/cawco/spawn/NsPopoverGroup.svelte";
  import { IconCloudCross } from "#lib/icons.js";
  import DecisionsRules from "./DecisionsRules.svelte";
  import { hubReading } from "./format";
  import ProjectBar from "./ProjectBar.svelte";
  import type {
    Change,
    Changes,
    GovernedRecord,
    PlaceAct,
    ProjectView,
  } from "./records";
  import ViewsStrip from "./ViewsStrip.svelte";
  import WaitingStrip from "./WaitingStrip.svelte";
  import { words } from "./words";

  let {
    record,
    view,
    changes,
    now,
    needsOn,
    lead = RESTING_LEAD,
    body,
    onchange,
    onplace,
    onview,
    onsyncnow,
    onreread,
    ontoggleneeds,
    onask,
    onnewtask,
    onfilter,
    onspinoff,
    onmore,
  }: {
    record: GovernedRecord;
    view: ProjectView;
    changes: Changes;
    now: number;
    needsOn: boolean;
    lead?: SeatedLead;
    body: Snippet;
    onchange: (change: Change) => void;
    onplace: (act: PlaceAct, placeId: string) => void;
    onview: (view: ProjectView) => void;
    onsyncnow: () => void;
    onreread: (what: "decides" | "tracker" | "connections") => void;
    ontoggleneeds: () => void;
    onask: () => void;
    onnewtask: () => void;
    onfilter: () => void;
    onspinoff: () => void;
    onmore: (item: "spend" | "forget" | "delete") => void;
  } = $props();

  const { asOfTime } = $derived(hubReading(record));
</script>

<div
  class="@container/project flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface-page"
  data-slot="project-page"
>
  <NsPopoverGroup>
    <div class="shrink-0" data-slot="project-chrome">
      {#if asOfTime}
        <div
          class="mark-line flex items-center gap-space-2 border-b border-border-hairline bg-surface-recess px-space-5 py-space-2 type-meta text-ink-muted"
          role="status"
        >
          <IconCloudCross aria-hidden="true" class="size-icon-md shrink-0" />
          <span>{words.hub.outOfReachNotice(asOfTime)}</span>
        </div>
      {/if}

      <ProjectBar
        {changes}
        {lead}
        {onask}
        {onchange}
        {onmore}
        {onplace}
        {onreread}
        {onspinoff}
        {record}
      />

      <WaitingStrip {needsOn} {now} {ontoggleneeds} {onview} {record} {view} />

      <ViewsStrip
        {changes}
        {now}
        {onchange}
        {onfilter}
        {onnewtask}
        {onreread}
        {onsyncnow}
        {onview}
        {record}
        {view}
      />
    </div>
  </NsPopoverGroup>

  <main
    class="flex min-h-0 flex-1 flex-col overflow-auto"
    data-slot="project-body"
  >
    {#if view === "decisions"}
      <div class="shrink-0 px-space-5 pb-space-2 pt-space-4">
        <DecisionsRules {changes} {now} {onchange} {onreread} {record} />
      </div>
    {/if}
    <div class="flex min-h-0 flex-1 flex-col">
      {@render body()}
    </div>
  </main>
</div>
