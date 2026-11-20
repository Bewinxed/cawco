<script lang="ts">
  /**
   * The row under the project bar: the waiting-on-you filter chip beside the
   * Who decides standing anchor, aligned to the bar's leading edge.
   */
  import NeedsYouChip from "#lib/cawco/project/NeedsYouChip.svelte";
  import type { GovernedRecord, ProjectView } from "./records";
  import WhoDecidesAnchor from "./WhoDecidesAnchor.svelte";

  let {
    record,
    now,
    needsOn,
    view,
    ontoggleneeds,
    onview,
  }: {
    record: GovernedRecord;
    now: number;
    needsOn: boolean;
    view?: ProjectView;
    ontoggleneeds: () => void;
    onview: (view: ProjectView) => void;
  } = $props();
</script>

<div
  class="flex flex-wrap items-center gap-space-2 px-space-5 py-space-1"
  data-slot="waiting-strip"
>
  <NeedsYouChip count={record.waiting} on={needsOn} ontoggle={ontoggleneeds} />
  <WhoDecidesAnchor active={view === "decisions"} {now} {onview} {record} />
</div>
