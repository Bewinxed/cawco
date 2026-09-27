<script lang="ts">
  /**
   * Where one row has landed: "2/2 machines" on the row, and machine by
   * machine in the popover. A machine that refused it opens the full fault —
   * the same reading, remedy and retry the row's own alert gives — rather than
   * the raw string the machine printed.
   */
  import { toast } from "svelte-sonner";
  import { TextMorph } from "torph/svelte";
  import {
    MachineRow,
    machineHue,
    machineIcon,
  } from "$lib/components/ui/machine-row";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "$lib/components/ui/popover";
  import {
    IconCheck,
    IconInfo,
    IconRefresh,
    IconWarningTriangle,
  } from "$lib/icons";
  import type { Machine } from "../client.svelte";
  import FleetFault from "../FleetFault.svelte";
  import { syncFleet } from "../fleet";
  import { causeOf, type FaultScope } from "../fleet-faults";
  import { machineLabel, machineOs } from "../machine";

  let {
    machines,
    kind,
    name,
    what,
  }: {
    machines: Machine[];
    /** Which record of the machine's report this row lives in. */
    kind: Extract<
      FaultScope,
      | "mcp"
      | "marketplaces"
      | "plugins"
      | "skills"
      | "memoryDocs"
      | "hooks"
      | "memory"
    >;
    /** The row's key in that record; ignored for the singular memory row. */
    name: string;
    what: string;
  } = $props();

  const stateOf = (machine: Machine) =>
    kind === "memory" ? machine.fleet?.memory : machine.fleet?.[kind]?.[name];

  const applied = $derived(
    machines.filter((machine) => stateOf(machine)?.state === "applied").length
  );
  const failed = $derived(
    machines.filter((machine) => stateOf(machine)?.state === "failed").length
  );

  const SAID: Record<string, string> = {
    applied: "Has it",
    failed: "Refused it",
    removed: "Taken off",
  };

  let asked = $state<Record<string, boolean>>({});

  async function resync(machine: Machine) {
    asked[machine.machineId] = true;
    try {
      await syncFleet(machine.machineId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      delete asked[machine.machineId];
    }
  }
</script>

<Popover.Root>
  <Popover.Trigger
    aria-label="{what}: on {applied} of {machines.length} machines{failed > 0 ? `, ${failed} refused` : ''}"
    class="rollout focus-ring"
    data-fail={failed > 0 ? '' : undefined}
  >
    {#if failed > 0}
      <IconWarningTriangle />
    {:else if machines.length > 0 && applied === machines.length}
      <IconCheck />
    {/if}
    <!-- A machine catching up ticks the count over rather than swapping it. -->
    <TextMorph
      as="span"
      class="count"
      duration={150}
      text="{applied}/{machines.length}"
    />
    <span class="unit">machines</span>
  </Popover.Trigger>
  <Popover.Content align="end" class="w-[360px] max-w-[calc(100vw-2rem)] gap-1">
    {#if machines.length === 0}
      <p class="none">
        No machines yet — this lands on the first one that registers.
      </p>
    {/if}
    {#each machines as machine, index (machine.machineId)}
      {@const item = stateOf(machine)}
      {@const online = machine.status === 'online'}
      <div class="machine">
        <div class="line">
          <MachineRow
            hue={machineHue(index, online)}
            icon={machineIcon(machine.os)}
            meta="{SAID[item?.state ?? ''] ?? 'Not reported'} · {machineOs(machine.os).label}{online ? '' : ' · offline'}"
            name={machineLabel(machine.hostname)}
            presence={online ? 'online' : 'off'}
          >
            {#snippet trailing()}
              {#if item?.state === 'failed'}
                <span class="mark fail"><IconWarningTriangle /></span>
              {:else if item?.state === 'applied'}
                <span class="mark"><IconCheck /></span>
              {:else}
                <button
                  aria-label="Sync {machineLabel(machine.hostname)}"
                  class="sync focus-ring"
                  disabled={!online || asked[machine.machineId] === true}
                  onclick={() => resync(machine)}
                  type="button"
                >
                  <IconRefresh />
                  {asked[machine.machineId] ? 'Syncing…' : 'Sync'}
                </button>
              {/if}
            {/snippet}
          </MachineRow>
        </div>
        {#if item?.state === 'failed'}
          <FleetFault
            group={{
              origin: 'machine',
              cause: causeOf(item.detail),
              scope: kind,
              machineId: machine.machineId,
              faults: [{ origin: 'machine', scope: kind, key: kind === 'memory' ? '' : name, machineId: machine.machineId, detail: item.detail, cause: causeOf(item.detail) }],
            }}
            {machines}
          />
        {:else if item?.detail}
          <!-- A detail on a row that did not fail is a note, not an error. -->
          <p class="note">
            <IconInfo />
            <span>{item.detail}</span>
          </p>
        {/if}
      </div>
    {/each}
  </Popover.Content>
</Popover.Root>

<style>
  :global(.rollout) {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 8px;
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
    font: var(--type-meta);
    color: var(--ink-muted);
    white-space: nowrap;
    transition:
      var(--transition-control),
      transform 160ms var(--ease-out);
  }
  :global(.rollout:active) {
    transform: scale(var(--press-scale));
  }
  :global(.rollout:hover) {
    background: var(--surface-hover);
  }
  :global(.rollout[data-fail]) {
    background: var(--status-fail-bg);
    color: var(--status-fail-ink);
  }
  :global(.rollout svg) {
    width: 13px;
    height: 13px;
    flex: none;
  }
  :global(.rollout .count) {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: inherit;
  }
  .machine {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
  }
  .mark {
    display: inline-flex;
    color: var(--ink-muted);
  }
  .mark.fail {
    color: var(--status-fail-ink);
  }
  .mark :global(svg),
  .sync :global(svg),
  .note :global(svg) {
    width: 14px;
    height: 14px;
    flex: none;
  }
  .sync {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 8px;
    border-radius: var(--radius-sm);
    font: var(--type-meta);
    font-weight: 500;
    color: var(--ink-strong);
    transition:
      var(--transition-control),
      transform 160ms var(--ease-out);
  }
  .sync:active:not(:disabled) {
    transform: scale(var(--press-scale));
  }
  .sync:hover:not(:disabled) {
    background: var(--surface-hover);
  }
  .sync:disabled {
    opacity: 0.5;
  }
  .note {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 0 8px 6px;
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .none {
    padding: 10px 8px;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
</style>
