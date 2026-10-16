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

<div class="inventory">
  <SectionHeader
    hue="var(--hue-amber-500)"
    icon={IconLaptop}
    label="On each machine"
  />
  <p data-slot="note" class="note">
    What each machine really has, whoever put it there — read live, never
    stored. Anything the fleet does not manage can be adopted into it.
  </p>

  <!-- Each machine keeps its row whether it is up or not: a machine that
       drops for a moment says "Offline" in the same place, so nothing under
       the list moves. It opens only while it is up; open, it can still close. -->
  {#if machines.length === 0}
    <p data-slot="note" class="note">
      <AddMachineLink>No machines yet</AddMachineLink>
      — each one reports what it has once it registers.
    </p>
  {:else}
    <ul data-slot="machines" class="machines">
      {#each machines as machine (machine.machineId)}
        {@const inspection = found[machine.machineId]}
        {@const rows =
          kind === "mcp" ? (inspection?.mcp ?? []) : (inspection?.skills ?? [])}
        <li data-slot="machine" class="machine">
          <button
            data-slot="head"
            aria-expanded={open[machine.machineId] === true}
            class="head mark-line focus-inset press-tint"
            disabled={machine.status !== "online" && !open[machine.machineId]}
            onclick={() => expand(machine)}
            type="button"
          >
            {#if open[machine.machineId]}
              <IconChevronDown />
            {:else}
              <IconChevronRight />
            {/if}
            <OsMark class="size-icon-md shrink-0" os={machine.os} />
            <span data-slot="host" class="host"
              >{machineLabel(machine.hostname)}</span
            >
            <span data-slot="note" class="note">
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
              <p data-slot="note" class="note busy mark-line" role="status">
                <Spinner class="size-icon-md shrink-0" /><span
                  >Asking this machine…</span
                >
              </p>
            {:else if unread[machine.machineId]}
              <Alert variant="warning">
                <AlertDescription>{unread[machine.machineId]}</AlertDescription>
              </Alert>
            {:else if rows.length === 0}
              <p data-slot="note" class="note">
                {kind === "mcp"
                  ? "This machine has no MCP servers at all."
                  : "This machine has no skills at all."}
              </p>
            {:else}
              <ul class="found">
                {#each rows as row ("path" in row ? row.path : `${row.scope}:${row.name}`)}
                  {@const key = keyOf(machine.machineId, row.scope, row.name)}
                  <li data-slot="entry" class="entry">
                    <span data-slot="text" class="text">
                      <span class="line">
                        <span data-slot="name" class="name">{row.name}</span>
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
                        <span data-slot="note" class="note clamp"
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
                      <span data-slot="note" class="note">In the fleet</span>
                    {/if}
                    <RowFault class="adopt-fault" reason={adoptFailed[key]} />
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

<style>
  .inventory {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 18px;
    border-top: 1px solid var(--border-hairline);
  }
  .note {
    max-width: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .busy {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .machines,
  .found {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .machines {
    margin: 0 -8px;
  }
  .machine {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    text-align: left;
    transition: var(--transition-control);
  }
  .head:hover:not(:disabled) {
    background: var(--surface-hover);
  }
  .head :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--ink-muted);
  }
  .host {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .found {
    margin: 0 8px 6px;
  }
  .entry {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  /* A refused adopt, on a line of its own under the entry's words. */
  .entry > :global(.adopt-fault) {
    flex-basis: 100%;
  }
  .text {
    display: flex;
    flex: 1 1 240px;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .name {
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    color: var(--ink-strong);
  }
  .clamp {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
</style>
