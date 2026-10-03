<script lang="ts">
  /**
   * The faults that belong to one row, as compact alert lines under it: what
   * broke and where, with the reading and the remedy a click away. Each is a
   * mark of the row list's `reflow()`: a fault that clears closes away and
   * the rows below slide up; one that arrives opens.
   */
  import type { Machine } from "../client.svelte";
  import FleetFault from "../FleetFault.svelte";
  import {
    type Fault,
    type FaultScope,
    groupFaults,
    machineFaults,
  } from "../fleet-faults";

  let {
    kind,
    key,
    machines,
    hub = [],
    onresolved,
  }: {
    /** Which record of a machine's report the row lives in. */
    kind: FaultScope;
    key: string;
    machines: Machine[];
    /** Faults the hub itself holds for this row. */
    hub?: Fault[];
    onresolved?: () => void;
  } = $props();

  const groups = $derived(
    groupFaults([
      ...hub,
      ...machines.flatMap((machine) =>
        machineFaults(machine.machineId, machine.fleet).filter(
          (fault) => fault.scope === kind && fault.key === key
        )
      ),
    ])
  );
</script>

{#each groups as group (group.origin + group.cause + (group.machineId ?? ""))}
  <div data-flip><FleetFault compact {group} {machines} {onresolved} /></div>
{/each}
