<script lang="ts">
  /**
   * The fleet's defaults for each kind of trigger, Configure › Caw's
   * triggers beside Accounts, Models and Spend (SectionFrame, the one
   * section template): the same rows as Caw's settings (TriggerRow) at the
   * fleet's level. What the fleet leaves unset falls to each project's own
   * Caw, and the row says so in words; a project sets its own over this in
   * Caw's settings.
   *
   * Props in, events out: the fleet's layer per kind arrives as props
   * (`GET /api/fleet/trigger-settings`), and each change leaves as an event
   * (`PATCH /api/fleet/trigger-settings/:kind`, null clearing a field).
   */
  import type { HarnessKind } from "@cawco/core/harness/kinds";
  import {
    TRIGGER_KINDS,
    type TriggerKind,
    type TriggerSetting,
  } from "@cawco/core/triggers";
  import SectionFrame from "../config/SectionFrame.svelte";
  import { sectionOf } from "../config/sections";
  import { fleetKind } from "./caw-settings";
  import TriggerRow from "./TriggerRow.svelte";

  let {
    kinds,
    machine,
    installed,
    problem = null,
    refusedKind = null,
    onkind,
  }: {
    /** The fleet's layer per kind, once read. */
    kinds: Record<TriggerKind, TriggerSetting> | null;
    /** The machine whose harnesses and accounts the pickers list. */
    machine: { id: string; name: string };
    /** The harnesses installed there. */
    installed: HarnessKind[];
    /** Why the kinds could not be read, in words. */
    problem?: string | null;
    /** The kind whose last change the hub refused, and its words. */
    refusedKind?: { kind: TriggerKind; words: string } | null;
    /** A change to a kind's fleet default. */
    onkind: (kind: TriggerKind, patch: Partial<TriggerSetting>) => void;
  } = $props();

  const section = sectionOf("triggers");
</script>

<SectionFrame {problem} ready={kinds !== null} {section}>
  {#if kinds}
    <ul
      data-slot="fleet-triggers"
      class="m-0 grid max-w-160 list-none grid-cols-pickers gap-x-space-2 gap-y-space-3 p-0"
    >
      {#each TRIGGER_KINDS as kind (kind)}
        <TriggerRow
          {installed}
          {kind}
          level="fleet"
          machineId={machine.id}
          machineName={machine.name}
          onchange={(patch) => onkind(kind, patch)}
          refused={refusedKind?.kind === kind ? refusedKind.words : null}
          view={fleetKind(kinds[kind])}
        />
      {/each}
    </ul>
  {/if}
</SectionFrame>
