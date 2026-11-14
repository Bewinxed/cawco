<script lang="ts">
  import { machineLabel } from "@cawco/core/machine-names";
  /**
   * Configure › Command-line tools' first group: the fleet's one choice for
   * a machine's copy of a tool at a version CawCo doesn't run (core
   * `ToolUpdates`, the owner's "Once, for the whole fleet", 2026-11-14), and
   * every machine and tool pair not at that version (core tool-updates.ts
   * `toolsBehind`), across tools, each with where it stands and its press,
   * with Update all. A release's work stands here in one list; each tool's
   * ledger below says the same of its own rows. Nothing behind, the switch
   * stands with a line saying every machine is current.
   */
  import type { ToolSpec, ToolUpdates } from "@cawco/core/tools";
  import { toolUpdateWords as words } from "@cawco/core/words/tool-updates";
  import { Button } from "#lib/components/ui/button/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import * as Table from "#lib/components/ui/table/index.js";
  import { IconCheck, IconRefresh } from "#lib/icons.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import { blockingBehind, updateAllTakes } from "./blocking";
  import SwitchField from "./config/SwitchField.svelte";
  import HarnessLogo, { hasMark } from "./HarnessLogo.svelte";
  import MachineLedger from "./MachineLedger.svelte";
  import RowFault from "./RowFault.svelte";
  import type { Machine } from "./stores/board.svelte";
  import ToolUpdateCell from "./ToolUpdateCell.svelte";
  import { pressRefused } from "./tool-presses.svelte";

  let {
    catalog,
    machines,
    releases,
    updates,
    write,
    updateAll,
  }: {
    catalog: ToolSpec[];
    machines: Machine[];
    /** The newest release of each CLI CawCo keeps current, by tool id. */
    releases: Readonly<Record<string, string>>;
    updates: ToolUpdates;
    /** Writes the fleet's choice; throws the hub's refusal. */
    write: (next: ToolUpdates) => Promise<void>;
    /** Update all of each tool named; throws the hub's refusal. */
    updateAll: (toolIds: string[]) => Promise<void>;
  } = $props();

  /** One machine and tool pair behind, as a ledger row keyed by both. */
  const rows = $derived(
    blockingBehind(machines, updates, releases).flatMap((entry) => {
      const spec = catalog.find((one) => one.id === entry.toolId);
      return spec
        ? entry.machines.flatMap((behind) => {
            const machine = machines.find(
              (one) => one.machineId === behind.machineId
            );
            return machine
              ? [
                  {
                    machineId: `${machine.machineId}:${spec.id}`,
                    hostname: machine.hostname,
                    os: machine.os,
                    machine,
                    spec,
                    behind,
                    wants: entry.wants,
                  },
                ]
              : [];
          })
        : [];
    })
  );
  type Row = (typeof rows)[number];

  /** The pairs Update all sends, by the hub's own rule (`updateAllTakes`). */
  const sendable = $derived(
    rows.filter((row) => updateAllTakes(row.behind.state, row.machine))
  );

  let saving = $state(false);
  let settingRefused = $state<string | null>(null);
  async function choose(on: boolean) {
    saving = true;
    settingRefused = null;
    try {
      await write(on ? "update" : "ask");
    } catch (error) {
      settingRefused = failureWords(error);
    } finally {
      saving = false;
    }
  }

  let sending = $state(false);
  let allRefused = $state<string | null>(null);
  async function sendAll() {
    sending = true;
    allRefused = null;
    try {
      await updateAll([...new Set(sendable.map((row) => row.spec.id))]);
    } catch (error) {
      allRefused = failureWords(error);
    } finally {
      sending = false;
    }
  }
</script>

<section
  id="out-of-date"
  class="flex min-w-0 flex-col gap-space-3"
  data-slot="group"
>
  <SectionHeader
    hue="var(--color-mark-4)"
    icon={rows.length > 0 ? IconRefresh : IconCheck}
    label={rows.length > 0 ? words.behindHead(rows.length) : words.quietHead}
    level={2}
  >
    {#snippet right()}
      {#if sendable.length > 1}
        <Button
          label={words.updateAll(sendable.length)}
          onclick={sendAll}
          pending={sending}
          pendingLabel={words.pressing}
          size="sm"
          variant="secondary"
        />
      {/if}
    {/snippet}
  </SectionHeader>
  <!-- Refused: Update all, still there, is the way on. -->
  <RowFault reason={allRefused} />
  <SwitchField
    checked={updates === "update"}
    disabled={saving}
    hint={updates === "update" ? words.settingOn : words.settingOff}
    id="tool-updates"
    label={words.setting}
    onchange={choose}
  />
  <!-- Refused: the switch stands as the hub holds it, and is the way on. -->
  <RowFault reason={settingRefused} />
  {#if rows.length > 0}
    <MachineLedger
      machines={rows}
      online={(row: Row) => row.behind.online}
      settle="top"
    >
      {#snippet heads()}
        <Table.Head variant="band">{words.toolHead}</Table.Head>
        <Table.Head class="w-c-version-col-w" variant="band"
          >{words.versionHead}</Table.Head
        >
        <Table.Head class="w-c-tool-state-col-w" variant="band"
          >{words.stateHead}</Table.Head
        >
      {/snippet}
      {#snippet cells(row: Row, online: boolean)}
        {@const state = row.behind.state}
        {@const found = state.kind === "updating" ? state.from : state.found}
        {@const wants = state.kind === "updating" ? row.wants : state.wants}
        <!-- On a phone's card: the tool on its own line under the machine. -->
        <Table.Cell
          class="@max-phone/table:col-span-full @max-phone/table:row-start-2"
          settle="top"
          variant="ledger-stacks"
        >
          <span
            class="mark-line flex min-w-0 flex-wrap items-center gap-x-space-2 @phone/table:min-h-c-ledger-row-h @max-phone/table:ps-c-ledger-text-inset"
          >
            {#if hasMark(row.spec.id)}
              <HarnessLogo data-box harness={row.spec.id} />
            {/if}
            <span class="type-label text-ink-strong">{row.spec.name}</span>
            {#if wants}
              <span class="num type-meta text-ink-muted"
                >{words.runs(wants)}</span
              >
            {/if}
          </span>
        </Table.Cell>
        <Table.Cell settle="top" variant="ledger-stacks">
          <span class="flex items-center @phone/table:min-h-c-ledger-row-h">
            <code
              data-slot="num"
              class={[
                "num type-code",
                found ? "text-ink-strong" : "text-ink-muted",
              ]}>{found ?? "—"}</code
            >
          </span>
        </Table.Cell>
        <Table.Cell
          class="@max-phone/table:col-span-full"
          settle="top"
          variant="ledger-stacks"
        >
          <div
            class="flex flex-col items-start gap-space-1 whitespace-normal @phone/table:min-h-c-ledger-row-h @phone/table:justify-center @max-phone/table:ps-c-ledger-text-inset"
          >
            <ToolUpdateCell
              blocks
              machine={machineLabel(row.hostname)}
              machineId={row.machine.machineId}
              method={row.machine.tools?.[row.spec.id]?.method}
              {online}
              paused={row.machine.pausedUntil !== null}
              spec={row.spec}
              update={state}
            />
            <!-- A refused press: the row's own press is the way on. -->
            <RowFault
              reason={pressRefused(row.machine.machineId, row.spec.id)}
            />
          </div>
        </Table.Cell>
      {/snippet}
    </MachineLedger>
  {/if}
</section>
