<script lang="ts">
  /**
   * The phone sidebar's machines (Sidebar.svelte, the sheet's Machines
   * group) with its fleet as a prop, for the bar group's states files: the
   * group's label with how many are online, then each machine as
   * MachinesList draws it (MachineRow in its `.row`, the fault in its meta,
   * its presence dot off when down and away on a fault), then Add machine.
   * The sidebar carries no machines symbol, so neither way of showing a
   * problem on the bar changes it: its rows already say which machine and
   * what is wrong.
   */
  import { machineLabel } from "@cawco/core";
  import {
    MachineRow,
    machineHue,
    machineIcon,
  } from "#lib/components/ui/machine-row/index.js";
  import {
    SidebarGroup,
    SidebarGroupLabel,
  } from "#lib/components/ui/sidebar/index.js";
  import { IconPlus } from "#lib/icons.js";
  import type { FleetMachine } from "./fixtures";

  let { machines }: { machines: readonly FleetMachine[] } = $props();

  /** MachinesList `presenceOf`: off when down, away on a fault. */
  function presenceOf(machine: FleetMachine): "online" | "away" | "off" {
    if (!machine.up) {
      return "off";
    }
    return machine.fault ? "away" : "online";
  }

  const online = $derived(machines.filter((machine) => machine.up).length);
</script>

<div data-slot="sheet" class="sheet">
  <SidebarGroup class="px-2 py-1">
    <SidebarGroupLabel class="px-2.5">
      Machines
      <span class="machines-count">{online} online</span>
    </SidebarGroupLabel>
    <ul data-slot="list" class="list">
      {#each machines as machine, index (machine.hostname)}
        <li>
          <div data-slot="row" class="row press-tint focus-inset" tabindex="-1">
            <MachineRow
              hue={machineHue(index, machine.up)}
              icon={machineIcon(machine.os)}
              meta={[`${machine.live} live`, machine.fault]
                .filter(Boolean)
                .join(" · ")}
              name={machineLabel(machine.hostname)}
              presence={presenceOf(machine)}
            />
          </div>
        </li>
      {/each}
    </ul>
    <button
      data-slot="row"
      class="row add mark-line press-tint focus-inset"
      type="button"
    >
      <IconPlus aria-hidden="true" />
      <span>Add machine</span>
    </button>
  </SidebarGroup>
</div>

<style>
  .sheet {
    padding-block: var(--space-1);
    background: var(--sidebar);
  }
  /* Sidebar `.machines-count`. */
  .machines-count {
    margin-inline-start: auto;
    font-variant-numeric: tabular-nums;
  }
  /* MachinesList's list, rows and Add machine. */
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: 44px;
    padding: var(--space-1) var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink-strong);
    text-align: start;
    transition: var(--transition-control);
  }
  .add {
    margin-top: var(--space-1);
    border-top: 1px solid var(--seam);
    border-radius: 0 0 var(--radius-sm) var(--radius-sm);
    font: var(--type-label);
    color: var(--ink-muted);
    cursor: pointer;
  }
  .add :global(svg) {
    width: 16px;
    height: 16px;
  }
</style>
