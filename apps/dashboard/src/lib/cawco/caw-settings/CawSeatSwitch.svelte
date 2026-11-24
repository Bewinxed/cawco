<script lang="ts">
  /**
   * Caw's seat on the project head, with his switch beside him: the crow
   * is the switch. His seat (CawSeat) draws him awake or asleep from his
   * status, so flipping the switch wakes him or lets him fall asleep in
   * place (Caw's own leave and enter between his files), and a press on him
   * still opens his conversation. The switch is his own (CawLeadSwitch) in
   * a capsule of the bar's glass, its word the state he is in; turning him
   * off with what he started still running asks in a card that comes down
   * out of that capsule (`hang`), and the stops once pressed, or a
   * refusal, are said under the seat's row.
   */
  import { cawSettingsWords as words } from "@cawco/core/words/caw-settings";
  import CawLeadSwitch, {
    type SwitchedLead,
  } from "#lib/cawco/project/CawLeadSwitch.svelte";
  import CawSeat from "#lib/cawco/project/CawSeat.svelte";
  import type { SeatedLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import { cawSeatAt } from "#lib/cawco/stop-work.svelte.js";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";

  let {
    lead,
    projectId,
    projectName,
    size = 48,
  }: {
    lead: SeatedLead & SwitchedLead;
    projectId: string;
    projectName: string;
    /** His seat's side, px: the head's 48. */
    size?: number;
  } = $props();

  const label = $derived(lead.on === false ? words.asleep : words.awake);
  /** His seat's own place: a confirm asked here stands here, never in his settings. */
  const place = $derived(cawSeatAt(projectId));
</script>

<!-- The seat and the switch's label share the first row; whatever the
     switch says after it (its parked stops, a refusal) spans the row under
     them. -->
<div
  data-slot="caw-seat-switch"
  class="grid grid-cols-auto-fluid items-center justify-items-start gap-x-space-2 gap-y-space-3 type-label text-ink-strong [&>*:not([data-slot=caw-seat]):not([data-glass])]:col-span-2"
>
  <CawSeat {lead} {projectId} {projectName} {size} />
  <BarGlass flare="end" form="group">
    <!-- The switch and its word on one line in the capsule, over the
         glass's join while the confirm hangs. -->
    <span class="relative flex h-c-btn-h-sm items-center px-space-2">
      <CawLeadSwitch
        hang
        {label}
        {lead}
        part="switch"
        {place}
        {projectId}
        {projectName}
      />
    </span>
  </BarGlass>
  <CawLeadSwitch
    {label}
    {lead}
    part="after"
    {place}
    {projectId}
    {projectName}
  />
</div>
