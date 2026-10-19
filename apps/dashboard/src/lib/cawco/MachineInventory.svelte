<script lang="ts">
  import type {
    ConfigInspection,
    DiscoveredMcp,
    DiscoveredSkill,
    FleetMcpServer,
    FleetSkillMeta,
  } from "@cawco/core";
  import { machineLabel } from "@cawco/core";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconChevronDown, IconChevronRight, IconLaptop } from "#lib/icons.js";
  import type { Machine } from "./client.svelte";
  import { adoptSkill, inspectMachine, saveMcpServer } from "./fleet";
  import AddMachineLink from "./join/AddMachineLink.svelte";
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
      found[machine.machineId] = await inspectMachine(machine.machineId);
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
      onskill?.(await adoptSkill(row.name, machine.machineId));
    } catch (error) {
      adoptFailed[key] = message(error);
    } finally {
      delete busy[key];
    }
  }
</script>

<!-- literal: 8px, 6px, 10px, 44px, 72ch, 240px -->
<div
  class="flex flex-col gap-(--inv-gap) border-t border-t-border-hairline pt-space-5"
  style:--inv-gap="8px"
  style:--inv-head-h="44px"
  style:--inv-measure="72ch"
  style:--inv-pad="10px"
  style:--inv-text-basis="240px"
  style:--inv-tight="6px"
>
  <SectionHeader
    hue="var(--hue-amber-500)"
    icon={IconLaptop}
    label="On each machine"
  />
  <p data-slot="note" class="max-w-(--inv-measure) type-meta text-ink-muted">
    What each machine really has, whoever put it there — read live, never
    stored. Anything the fleet does not manage can be adopted into it.
  </p>

  <!-- Each machine keeps its row whether it is up or not: a machine that
       drops for a moment says "Offline" in the same place, so nothing under
       the list moves. It opens only while it is up; open, it can still close. -->
  {#if machines.length === 0}
    <p data-slot="note" class="max-w-(--inv-measure) type-meta text-ink-muted">
      <AddMachineLink>No machines yet</AddMachineLink>
      — each one reports what it has once it registers.
    </p>
  {:else}
    <ul
      data-slot="machines"
      class="m-0 -mx-(--inv-gap) flex list-none flex-col gap-space-row p-0"
    >
      {#each machines as machine (machine.machineId)}
        {@const inspection = found[machine.machineId]}
        {@const rows =
          kind === "mcp" ? (inspection?.mcp ?? []) : (inspection?.skills ?? [])}
        <li data-slot="machine" class="flex flex-col gap-(--inv-tight)">
          <button
            data-slot="head"
            aria-expanded={open[machine.machineId] === true}
            class="mark-line focus-inset press-tint flex min-h-(--inv-head-h) items-center gap-(--inv-gap) rounded-sm px-(--inv-gap) py-(--inv-tight) text-left transition-control hover:enabled:bg-surface-hover"
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
              class="max-w-(--inv-measure) type-meta text-ink-muted"
            >
              {#if open[machine.machineId]}
                Hide
              {:else if machine.status === "online"}
                Show what it has
              {:else}
                Offline
              {/if}
            </span>
          </button>
          {#if open[machine.machineId]}
            {#if reading[machine.machineId]}
              <p
                data-slot="note"
                class="mark-line flex items-center gap-(--inv-gap) max-w-(--inv-measure) type-meta text-ink-muted"
                role="status"
              >
                <Spinner class="size-icon-md shrink-0" /><span
                  >Asking this machine…</span
                >
              </p>
            {:else if unread[machine.machineId]}
              <Alert variant="warning">
                <AlertDescription>{unread[machine.machineId]}</AlertDescription>
              </Alert>
            {:else if rows.length === 0}
              <p
                data-slot="note"
                class="max-w-(--inv-measure) type-meta text-ink-muted"
              >
                {kind === "mcp"
                  ? "This machine has no MCP servers at all."
                  : "This machine has no skills at all."}
              </p>
            {:else}
              <ul
                class="mt-0 mb-(--inv-tight) mx-(--inv-gap) flex list-none flex-col gap-space-row p-0"
              >
                {#each rows as row ("path" in row ? row.path : `${row.scope}:${row.name}`)}
                  {@const key = keyOf(machine.machineId, row.scope, row.name)}
                  <li
                    data-slot="entry"
                    class="flex flex-wrap items-center gap-(--inv-gap) rounded-sm bg-surface-recess px-(--inv-pad) py-(--inv-gap)"
                  >
                    <span
                      data-slot="text"
                      class="flex min-w-0 grow basis-(--inv-text-basis) flex-col gap-space-row"
                    >
                      <span
                        class="flex flex-wrap items-center gap-(--inv-tight)"
                      >
                        <span
                          data-slot="name"
                          class="font-(family-name:--font-mono) text-size-meta text-ink-strong"
                          >{row.name}</span
                        >
                        <Badge variant="outline"><span>{row.scope}</span></Badge
                        >
                        {#if row.managed}
                          <Badge variant="secondary"><span>fleet</span></Badge>
                        {/if}
                        {#if "shadowedBy" in row && row.shadowedBy}
                          <Badge variant="attn"
                            ><span>shadowed by {row.shadowedBy}</span></Badge
                          >
                        {/if}
                      </span>
                      {#if "description" in row && row.description}
                        <span
                          data-slot="note"
                          class="line-clamp-2 max-w-(--inv-measure) type-meta text-ink-muted"
                          >{row.description}</span
                        >
                      {/if}
                    </span>
                    {#if !(row.managed || taken.includes(row.name))}
                      <Button
                        failed={key in adoptFailed}
                        label="Adopt"
                        onclick={() =>
                          kind === "mcp"
                            ? adoptServer(machine, row as DiscoveredMcp)
                            : adopt(machine, row as DiscoveredSkill)}
                        pending={busy[key] === true}
                        pendingLabel="Adopting…"
                        size="sm"
                        variant="outline"
                      />
                    {:else if taken.includes(row.name) && !row.managed}
                      <span
                        data-slot="note"
                        class="max-w-(--inv-measure) type-meta text-ink-muted"
                        >In the fleet</span
                      >
                    {/if}
                    <RowFault class="basis-full" reason={adoptFailed[key]} />
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
