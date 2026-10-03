<script lang="ts">
  import type {
    ConfigInspection,
    DiscoveredMcp,
    DiscoveredSkill,
    FleetMcpServer,
    FleetSkillMeta,
  } from "@cawco/core";
  import { machineLabel } from "@cawco/core";
  import { toast } from "svelte-sonner";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconChevronDown, IconChevronRight, IconLaptop } from "#lib/icons.js";
  import type { Machine } from "./client.svelte";
  import { adoptSkill, inspectMachine, saveMcpServer } from "./fleet";
  import OsMark from "./OsMark.svelte";

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
  let adoptFailed = $state<Record<string, boolean>>({});

  const message = (error: unknown) =>
    error instanceof Error ? error.message : String(error);
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
    adoptFailed[key] = false;
    try {
      onserver?.(await saveMcpServer(row.name, row.config, true));
      toast.success(`${row.name} is the fleet's now — every machine gets it.`);
    } catch (error) {
      adoptFailed[key] = true;
      toast.error(message(error));
    } finally {
      delete busy[key];
    }
  }

  async function adopt(machine: Machine, row: DiscoveredSkill) {
    const key = keyOf(machine.machineId, row.scope, row.name);
    busy[key] = true;
    adoptFailed[key] = false;
    try {
      onskill?.(await adoptSkill(row.name, machine.machineId));
      toast.success(
        `${row.name} is the fleet's now — its files went to the hub.`
      );
    } catch (error) {
      adoptFailed[key] = true;
      toast.error(message(error));
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
  <p class="note">
    What each machine really has, whoever put it there — read live, never
    stored. Anything the fleet does not manage can be adopted into it.
  </p>

  <!-- Each machine keeps its row whether it is up or not: a machine that
       drops for a moment says "Offline" in the same place, so nothing under
       the list moves. It opens only while it is up; open, it can still close. -->
  {#if machines.length === 0}
    <p class="note">No machine is registered to ask.</p>
  {:else}
    <ul class="machines">
      {#each machines as machine (machine.machineId)}
        {@const inspection = found[machine.machineId]}
        {@const rows = kind === 'mcp' ? (inspection?.mcp ?? []) : (inspection?.skills ?? [])}
        <li class="machine">
          <button
            aria-expanded={open[machine.machineId] === true}
            class="head focus-inset press-tint"
            disabled={machine.status !== 'online' && !open[machine.machineId]}
            onclick={() => expand(machine)}
            type="button"
          >
            {#if open[machine.machineId]}
              <IconChevronDown />
            {:else}
              <IconChevronRight />
            {/if}
            <OsMark class="size-4 shrink-0" os={machine.os} />
            <span class="host">{machineLabel(machine.hostname)}</span>
            <span class="note">
              {#if open[machine.machineId]}
                Hide
              {:else if machine.status === 'online'}
                Show what it has
              {:else}
                Offline
              {/if}
            </span>
          </button>
          {#if open[machine.machineId]}
            {#if reading[machine.machineId]}
              <p class="note busy" role="status">
                <Spinner class="size-4 shrink-0" />Asking this machine…
              </p>
            {:else if unread[machine.machineId]}
              <Alert variant="warning">
                <AlertDescription>{unread[machine.machineId]}</AlertDescription>
              </Alert>
            {:else if rows.length === 0}
              <p class="note">
                {kind === 'mcp' ? 'This machine has no MCP servers at all.' : 'This machine has no skills at all.'}
              </p>
            {:else}
              <ul class="found">
                {#each rows as row ('path' in row ? row.path : `${row.scope}:${row.name}`)}
                  {@const key = keyOf(machine.machineId, row.scope, row.name)}
                  <li class="entry">
                    <span class="text">
                      <span class="line">
                        <span class="name">{row.name}</span>
                        <Badge variant="outline">{row.scope}</Badge>
                        {#if row.managed}
                          <Badge variant="secondary">fleet</Badge>
                        {/if}
                        {#if 'shadowedBy' in row && row.shadowedBy}
                          <Badge variant="attn"
                            >shadowed by {row.shadowedBy}</Badge
                          >
                        {/if}
                      </span>
                      {#if 'description' in row && row.description}
                        <span class="note clamp">{row.description}</span>
                      {/if}
                    </span>
                    {#if !(row.managed || taken.includes(row.name))}
                      <Button
                        failed={adoptFailed[key] === true}
                        label="Adopt"
                        onclick={() => kind === 'mcp' ? adoptServer(machine, row as DiscoveredMcp) : adopt(machine, row as DiscoveredSkill)}
                        pending={busy[key] === true}
                        pendingLabel="Adopting…"
                        size="sm"
                        variant="outline"
                      />
                    {:else if taken.includes(row.name) && !row.managed}
                      <span class="note">In the fleet</span>
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
