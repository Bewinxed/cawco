<script lang="ts">
  import { commonWords, type FaultScope, machineLabel } from "@cawco/core";
  /**
   * Where one row has landed: "2/2 machines" on the row, and machine by
   * machine in the popover. A machine that refused it opens the full fault —
   * the same reading, remedy and retry the row's own alert gives — rather than
   * the raw string the machine printed.
   *
   * The chip's glyph cross-fades between refused, landed everywhere and a
   * sync on its way (--dur-control) while its tint turns over --dur-panel.
   */
  import { failureWords } from "#lib/cawco/hub-read.js";
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";
  import {
    MachineRow,
    machineHue,
    machineIcon,
  } from "#lib/components/ui/machine-row/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconCheck,
    IconInfo,
    IconRefresh,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import type { Machine } from "../client.svelte";
  import AddMachineLink from "../connect/AddMachineLink.svelte";
  import FleetFault from "../FleetFault.svelte";
  import { syncFleet } from "../fleet";
  import { causeOf } from "../fleet-faults";
  import { machineOs } from "../machine";
  import { appear } from "../motion/curves.svelte";

  let {
    machines,
    kind,
    name,
    what,
    syncing = false,
  }: {
    machines: Machine[];
    /** Which record of the machine's report this row lives in. */
    kind: FaultScope;
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
    machines.filter((machine) =>
      ["failed", "needs-auth"].includes(stateOf(machine)?.state ?? "")
    ).length
  );

  const SAID: Record<string, string> = {
    applied: "Has it",
    failed: "Refused it",
    removed: "Taken off",
    "needs-auth": "Needs sign-in",
    unsupported: "Not supported",
    disabled: "Disabled",
    pending: "Connecting",
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
      refused[machine.machineId] = failureWords(error);
    } finally {
      delete asked[machine.machineId];
    }
  }
</script>

<Popover.Root>
  <Popover.Trigger
    aria-label="{what}: on {applied} of {machines.length} machines{failed > 0
      ? `, ${failed} refused`
      : ''}"
    class="flex-none"
    data-fail={failed > 0 ? "" : undefined}
    look="state"
  >
    <span
      data-slot="glyph"
      aria-hidden="true"
      class="group inline-grid w-icon-sm flex-none glyph-none:w-0 glyph-none:-me-space-1 motion-safe:transition-[width,margin] motion-safe:duration-(--dur-control) motion-safe:ease-out"
      data-box
      data-glyph={glyph}
    >
      <IconWarningTriangle
        class="col-start-1 row-start-1 size-icon-sm flex-none opacity-0 group-glyph-fail:opacity-100 motion-safe:transition-opacity motion-safe:duration-(--dur-control) motion-safe:ease-out"
        data-for="fail"
      />
      <IconCheck
        class="col-start-1 row-start-1 size-icon-sm flex-none opacity-0 group-glyph-done:opacity-100 motion-safe:transition-opacity motion-safe:duration-(--dur-control) motion-safe:ease-out"
        data-for="done"
      />
      <Spinner
        aria-hidden="true"
        box="small"
        class="col-start-1 row-start-1 flex-none"
        data-for="busy"
        reveal="glyph-busy"
        role="presentation"
      />
    </span>
    <!-- A machine catching up ticks the count over rather than swapping it. -->
    <span data-slot="count" class="num text-inherit"
      ><MorphText text="{applied}/{machines.length}" /></span
    >
    <span>machines</span>
  </Popover.Trigger>
  <Popover.Content
    align="end"
    class="max-w-(--bits-popover-content-available-width)"
    gap="tight"
    width="widest"
  >
    {#if machines.length === 0}
      <p class="type-meta py-space-3 px-space-2 text-ink-muted">
        <AddMachineLink>{commonWords.noMachines}</AddMachineLink>
        — this lands on the first one that registers.
      </p>
    {/if}
    {#each machines as machine, index (machine.machineId)}
      {@const item = stateOf(machine)}
      {@const online = machine.status === "online"}
      <div data-slot="machine" class="flex flex-col gap-space-2">
        <div
          class="flex min-h-c-row-h items-center gap-space-3 rounded-sm px-space-2 py-space-2"
        >
          <MachineRow
            hue={machineHue(index, online)}
            icon={machineIcon(machine.os)}
            meta="{SAID[item?.state ?? ''] ?? 'Not reported'} · {machineOs(
              machine.os
            ).label}{online ? '' : ' · offline'}"
            name={machineLabel(machine.hostname)}
            presence={online ? "online" : "off"}
          >
            {#snippet trailing()}
              {#if item?.state === "failed"}
                <span data-slot="mark" class="inline-flex text-status-fail-ink"
                  ><IconWarningTriangle class="size-icon-sm flex-none" /></span
                >
              {:else if item?.state === "applied"}
                <span data-slot="mark" class="inline-flex text-ink-muted"
                  ><IconCheck class="size-icon-sm flex-none" /></span
                >
              {:else}
                {@const syncing = asked[machine.machineId] === true}
                <button
                  aria-busy={syncing || undefined}
                  aria-disabled={syncing || undefined}
                  aria-label="Sync {machineLabel(machine.hostname)}"
                  data-slot="sync"
                  class="select-none inline-flex h-c-btn-h-xs items-center gap-space-1 rounded-sm px-space-2 type-label text-ink-strong transition-control hover:enabled:bg-surface-hover disabled:opacity-50 motion-safe:transition-control-press motion-safe:active:enabled:not-aria-busy:scale-(--press-scale)"
                  disabled={!online}
                  onclick={whileIdle(
                    () => syncing,
                    () => resync(machine)
                  )}
                  style:--btn-icon="var(--icon-sm)"
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
        {#if kind === "mcp"}
          {#each Object.entries(machine.fleet?.mcpByHarness ?? {}) as [harness, rows] (harness)}
            {@const runtime = rows?.[name]}
            {#if runtime}
              <p
                data-slot="note"
                class="flex items-start gap-space-2 px-space-2 pt-0 pb-space-2 type-meta wrap-anywhere text-ink-muted"
              >
                <span
                  >{harness}: {SAID[runtime.state]}
                  {runtime.detail ? ` · ${runtime.detail}` : ""}</span
                >
              </p>
            {/if}
          {/each}
        {/if}
        {#if refused[machine.machineId]}
          <p
            data-rollout-chip-refused
            data-slot="note"
            class="mark-line flex items-start gap-space-2 px-space-2 pt-0 pb-space-2 type-meta wrap-anywhere text-status-fail-ink"
            role="alert"
            in:appear
          >
            <span class="mark-cell"
              ><IconWarningTriangle class="size-icon-sm flex-none" /></span
            >
            <span>{refused[machine.machineId]}</span>
          </p>
        {/if}
        {#if item?.state === "failed"}
          <FleetFault
            group={{
              origin: "machine",
              cause: causeOf(item.detail),
              scope: kind,
              machineId: machine.machineId,
              faults: [
                {
                  origin: "machine",
                  scope: kind,
                  key: kind === "memory" ? "" : name,
                  machineId: machine.machineId,
                  detail: item.detail,
                  cause: causeOf(item.detail),
                },
              ],
            }}
            {machines}
          />
        {:else if item?.detail}
          <!-- A detail on a row that did not fail is a note, not an error. -->
          <p
            data-slot="note"
            class="mark-line flex items-start gap-space-2 px-space-2 pt-0 pb-space-2 type-meta wrap-anywhere text-ink-muted"
          >
            <span class="mark-cell"
              ><IconInfo class="size-icon-sm flex-none" /></span
            >
            <span>{item.detail}</span>
          </p>
        {/if}
      </div>
    {/each}
  </Popover.Content>
</Popover.Root>
