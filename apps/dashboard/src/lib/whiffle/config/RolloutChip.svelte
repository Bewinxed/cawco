<script lang="ts">
  /**
   * Where one row has landed: "2/2 machines" on the row, and machine by
   * machine in the popover. A machine that refused it opens the full fault —
   * the same reading, remedy and retry the row's own alert gives — rather than
   * the raw string the machine printed.
   *
   * The chip's glyph cross-fades between refused, landed everywhere and a
   * sync on its way (--dur-control) while its tint turns over --dur-panel.
   */
  import { TextMorph } from "torph/svelte";
  import PendingContent, {
    whileIdle,
  } from "$lib/components/ui/button/pending-content.svelte";
  import {
    MachineRow,
    machineHue,
    machineIcon,
  } from "$lib/components/ui/machine-row";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "$lib/components/ui/popover";
  import { Spinner } from "$lib/components/ui/spinner";
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
  import { appear, morphMs } from "../motion/curves.svelte";

  let {
    machines,
    kind,
    name,
    what,
    syncing = false,
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
    /** A sync of the whole fleet was asked for and has not answered yet. */
    syncing?: boolean;
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

  const glyph = $derived.by((): "fail" | "done" | "busy" | "none" => {
    if (syncing) {
      return "busy";
    }
    if (failed > 0) {
      return "fail";
    }
    return machines.length > 0 && applied === machines.length ? "done" : "none";
  });

  let asked = $state<Record<string, boolean>>({});

  /** Why a machine's last sync request failed, said under its row; its button shows no check. */
  let refused = $state<Record<string, string>>({});

  async function resync(machine: Machine) {
    asked[machine.machineId] = true;
    delete refused[machine.machineId];
    try {
      await syncFleet(machine.machineId);
    } catch (error) {
      refused[machine.machineId] =
        error instanceof Error ? error.message : String(error);
    } finally {
      delete asked[machine.machineId];
    }
  }
</script>

<Popover.Root>
  <Popover.Trigger
    aria-label="{what}: on {applied} of {machines.length} machines{failed > 0 ? `, ${failed} refused` : ''}"
    class="rollout"
    data-fail={failed > 0 ? '' : undefined}
  >
    <span aria-hidden="true" class="glyph" data-glyph={glyph}>
      <IconWarningTriangle data-for="fail" />
      <IconCheck data-for="done" />
      <Spinner aria-hidden="true" data-for="busy" role="presentation" />
    </span>
    <!-- A machine catching up ticks the count over rather than swapping it. -->
    <TextMorph
      as="span"
      class="count"
      duration={morphMs()}
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
                {@const syncing = asked[machine.machineId] === true}
                <button
                  aria-busy={syncing || undefined}
                  aria-disabled={syncing || undefined}
                  aria-label="Sync {machineLabel(machine.hostname)}"
                  class="sync"
                  disabled={!online}
                  onclick={whileIdle(() => syncing, () => resync(machine))}
                  type="button"
                >
                  <PendingContent
                    failed={refused[machine.machineId] !== undefined}
                    icon={IconRefresh}
                    label="Sync"
                    pending={syncing}
                    pendingLabel="Syncing…"
                  />
                </button>
              {/if}
            {/snippet}
          </MachineRow>
        </div>
        {#if refused[machine.machineId]}
          <p class="note refused" role="alert" in:appear>
            <IconWarningTriangle />
            <span>{refused[machine.machineId]}</span>
          </p>
        {/if}
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
      background-color var(--dur-panel) var(--ease-out),
      color var(--dur-panel) var(--ease-out);
    @media (prefers-reduced-motion: no-preference) {
      transition:
        background-color var(--dur-panel) var(--ease-out),
        color var(--dur-panel) var(--ease-out),
        transform var(--dur-toggle) var(--ease-out);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    :global(.rollout:active) {
      transform: scale(var(--press-scale));
    }
  }
  :global(.rollout:hover) {
    background: var(--surface-hover);
  }
  :global(.rollout[data-fail]) {
    background: var(--status-fail-bg);
    color: var(--status-fail-ink);
  }
  :global(.rollout svg) {
    width: 12px;
    height: 12px;
    flex: none;
  }
  /* One cell for the three glyphs, which cross-fade; with none showing the
     cell closes, taking its gap with it, so a chip with no glyph is as
     narrow as it was. */
  .glyph {
    display: inline-grid;
    flex: none;
    width: 12px;
    @media (prefers-reduced-motion: no-preference) {
      transition:
        width var(--dur-control) var(--ease-out),
        margin var(--dur-control) var(--ease-out);
    }

    &[data-glyph="none"] {
      width: 0;
      margin-inline-end: -5px;
    }
    & > :global(*) {
      grid-area: 1 / 1;
      opacity: 0;
      @media (prefers-reduced-motion: no-preference) {
        transition: opacity var(--dur-control) var(--ease-out);
      }
    }
    &[data-glyph="fail"] > :global([data-for="fail"]),
    &[data-glyph="done"] > :global([data-for="done"]),
    &[data-glyph="busy"] > :global([data-for="busy"]) {
      opacity: 1;
    }
    &:not([data-glyph="busy"]) > :global([data-for="busy"]) {
      animation-play-state: paused;
    }
  }
  :global(.rollout .count) {
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
    width: 12px;
    height: 12px;
    flex: none;
  }
  .sync {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    --btn-gap: 4px;
    --btn-icon: 12px;
    height: 26px;
    padding: 0 8px;
    border-radius: var(--radius-sm);
    font: var(--type-label);
    color: var(--ink-strong);
    transition: var(--transition-control);
    @media (prefers-reduced-motion: no-preference) {
      transition:
        var(--transition-control),
        transform var(--dur-toggle) var(--ease-out);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .sync:active:not(:disabled, [aria-busy="true"]) {
      transform: scale(var(--press-scale));
    }
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
  .refused {
    color: var(--status-fail-ink);
  }
  .none {
    padding: 10px 8px;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
</style>
