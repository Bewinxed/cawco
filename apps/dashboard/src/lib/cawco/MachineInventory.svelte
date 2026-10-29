<script lang="ts">
  import type {
    ConfigInspection,
    DiscoveredMcp,
    DiscoveredSkill,
    FleetMcpServer,
    FleetSkillMeta,
  } from "@cawco/core/fleet";
  import { machineLabel } from "@cawco/core/machine-names";
  import { skillsWords as words } from "@cawco/core/words/skills";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconChevronDown, IconChevronRight, IconLaptop } from "#lib/icons.js";
  import type { Machine } from "./client.svelte";
  import NoMachines from "./config/NoMachines.svelte";
  import { adoptSkill, inspectMachine, saveMcpServer } from "./fleet";
  import MachineAway from "./MachineAway.svelte";
  import { MachineWait } from "./machine-wait.svelte";
  import OsMark from "./OsMark.svelte";
  import RowFault from "./RowFault.svelte";

  let {
    machines,
    kind,
    taken,
    onserver,
    onskill,
  }: {
    machines: Machine[];
    kind: "mcp" | "skills";
    taken: readonly string[];
    onserver?: (row: FleetMcpServer) => void;
    onskill?: (row: FleetSkillMeta) => void;
  } = $props();

  let open = $state<Record<string, boolean>>({});
  let found = $state<Record<string, ConfigInspection>>({});
  let reading = $state<Record<string, boolean>>({});
  let unread = $state<Record<string, string>>({});
  let busy = $state<Record<string, boolean>>({});
  /** Why an adopt was refused, by row: said under that row. */
  let adoptFailed = $state<Record<string, string>>({});
  /** Reads and adopts whose machine went away: said in place, asked again once it is back. */
  const waits = new MachineWait();
  const keyOf = (machineId: string, scope: string, name: string) =>
    `${machineId}:${scope}:${name}`;

  async function expand(machine: Machine) {
    open[machine.machineId] = !open[machine.machineId];
    if (
      !open[machine.machineId] ||
      found[machine.machineId] ||
      reading[machine.machineId]
    ) {
      return;
    }
    reading[machine.machineId] = true;
    delete unread[machine.machineId];
    try {
      found[machine.machineId] = await waits.run(machine.machineId, () =>
        inspectMachine(machine.machineId)
      );
    } catch (error) {
      unread[machine.machineId] = message(error);
    } finally {
      delete reading[machine.machineId];
    }
  }

  async function adoptServer(machine: Machine, row: DiscoveredMcp) {
    const key = keyOf(machine.machineId, row.scope, row.name);
    busy[key] = true;
    delete adoptFailed[key];
    try {
      // The row turns "In the fleet", and the fleet's list gains it with its
      // rollout chip: that is the result.
      onserver?.(await saveMcpServer(row.name, row.config, true, null));
    } catch (error) {
      adoptFailed[key] = message(error);
    } finally {
      delete busy[key];
    }
  }

  async function adopt(machine: Machine, row: DiscoveredSkill) {
    const key = keyOf(machine.machineId, row.scope, row.name);
    busy[key] = true;
    delete adoptFailed[key];
    try {
      onskill?.(
        await waits.run(key, () => adoptSkill(row.name, machine.machineId))
      );
    } catch (error) {
      adoptFailed[key] = message(error);
    } finally {
      delete busy[key];
    }
  }
</script>

<div
  class="flex flex-col gap-space-2 border-t border-t-border-hairline pt-space-5"
>
  <SectionHeader
    hue="var(--hue-amber-500)"
    icon={IconLaptop}
    label={words.onEachMachine}
  />
  <p data-slot="note" class="max-w-c-measure type-meta text-ink-muted">
    {words.inventoryNote}
  </p>

  <!-- Each machine keeps its row whether it is up or not: a machine that
       drops for a moment says "Offline" in the same place, so nothing under
       the list moves. It opens only while it is up; open, it can still close. -->
  {#if machines.length === 0}
    <NoMachines line="Each one reports what it has once it registers." />
  {:else}
    <ul data-slot="machines" class="-mx-space-2 flex flex-col gap-space-row">
      {#each machines as machine (machine.machineId)}
        {@const inspection = found[machine.machineId]}
        {@const rows =
          kind === "mcp" ? (inspection?.mcp ?? []) : (inspection?.skills ?? [])}
        <li data-slot="machine" class="flex flex-col gap-space-2">
          <button
            data-slot="head"
            aria-expanded={open[machine.machineId] === true}
            class="select-none mark-line focus-inset press-tint flex min-h-c-row-h items-center gap-space-2 rounded-sm px-space-2 py-space-2 text-start transition-control hover:enabled:bg-surface-hover"
            disabled={machine.status !== "online" && !open[machine.machineId]}
            onclick={() => expand(machine)}
            type="button"
          >
            {#if open[machine.machineId]}
              <IconChevronDown class="size-icon-md flex-none text-ink-muted" />
            {:else}
              <IconChevronRight class="size-icon-md flex-none text-ink-muted" />
            {/if}
            <OsMark
              class="size-icon-md flex-none text-ink-muted"
              os={machine.os}
            />
            <span data-slot="host" class="type-label text-ink-strong"
              >{machineLabel(machine.hostname)}</span
            >
            <span
              data-slot="note"
              class="max-w-c-measure type-meta text-ink-muted"
            >
              {#if open[machine.machineId]}
                {words.hide}
              {:else if machine.status === "online"}
                {words.showWhatItHas}
              {:else}
                {words.offline}
              {/if}
            </span>
          </button>
          {#if open[machine.machineId]}
            {#if waits.away(machine.machineId)}
              <MachineAway away={waits.away(machine.machineId)} />
            {:else if reading[machine.machineId]}
              <p
                data-slot="note"
                class="mark-line flex max-w-c-measure items-center gap-space-2 type-meta text-ink-muted"
                role="status"
              >
                <Spinner class="shrink-0" /><span>{words.asking}</span>
              </p>
            {:else if unread[machine.machineId]}
              <Alert variant="warning">
                <AlertDescription>{unread[machine.machineId]}</AlertDescription>
              </Alert>
            {:else if rows.length === 0}
              <p
                data-slot="note"
                class="max-w-c-measure type-meta text-ink-muted"
              >
                {kind === "mcp" ? words.noMcpAtAll : words.noSkillsAtAll}
              </p>
            {:else}
              <ul class="mx-space-2 mb-space-2 flex flex-col">
                {#each rows as row ("path" in row ? row.path : `${row.scope}:${row.name}`)}
                  {@const key = keyOf(machine.machineId, row.scope, row.name)}
                  <li
                    data-slot="entry"
                    class="flex flex-wrap items-center gap-space-2 py-space-2 not-first:border-t not-first:border-t-border-hairline"
                  >
                    <span
                      data-slot="text"
                      class="flex min-w-0 grow basis-c-inventory-text-basis flex-col gap-space-row"
                    >
                      <span class="flex flex-wrap items-center gap-space-2">
                        <span
                          data-slot="name"
                          class="font-(family-name:--font-mono) text-size-meta text-ink-strong"
                          >{row.name}</span
                        >
                        <Badge variant="outline"><span>{row.scope}</span></Badge
                        >
                        {#if row.managed}
                          <Badge variant="secondary"
                            ><span>{words.fleetBadge}</span></Badge
                          >
                        {/if}
                        {#if "shadowedBy" in row && row.shadowedBy}
                          <Badge variant="attn"
                            ><span>{words.shadowedBy(row.shadowedBy)}</span
                            ></Badge
                          >
                        {/if}
                      </span>
                      {#if "description" in row && row.description}
                        <span
                          data-slot="note"
                          class="line-clamp-2 max-w-c-measure type-meta text-ink-muted"
                          >{row.description}</span
                        >
                      {/if}
                    </span>
                    {#if !(row.managed || taken.includes(row.name))}
                      <Button
                        failed={key in adoptFailed}
                        label={words.adopt}
                        onclick={() =>
                          kind === "mcp"
                            ? adoptServer(machine, row as DiscoveredMcp)
                            : adopt(machine, row as DiscoveredSkill)}
                        pending={busy[key] === true}
                        pendingLabel={words.adopting}
                        size="sm"
                        variant="outline"
                      />
                    {:else if taken.includes(row.name) && !row.managed}
                      <span
                        data-slot="note"
                        class="max-w-c-measure type-meta text-ink-muted"
                        >{words.inTheFleet}</span
                      >
                    {/if}
                    <RowFault class="basis-full" reason={adoptFailed[key]} />
                    {#if waits.away(key)}
                      <div class="basis-full">
                        <MachineAway away={waits.away(key)} />
                      </div>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
