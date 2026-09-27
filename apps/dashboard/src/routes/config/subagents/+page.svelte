<script lang="ts">
  import { type FleetAgent, parseAgentFrontMatter } from "@whiffle/core";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button";
  import { SectionHeader } from "$lib/components/ui/section-header";
  import {
    IconDownload,
    IconLaptopDuo,
    IconPlus,
    IconSpinner,
    IconSubagentDuo,
    IconTrash,
  } from "$lib/icons";
  import { whiffle } from "$lib/whiffle/client.svelte";
  import EmptyHead from "$lib/whiffle/config/EmptyHead.svelte";
  import RowList from "$lib/whiffle/config/RowList.svelte";
  import SectionFrame from "$lib/whiffle/config/SectionFrame.svelte";
  import SectionRow from "$lib/whiffle/config/SectionRow.svelte";
  import { sectionOf } from "$lib/whiffle/config/sections";
  import { configStore, upsert } from "$lib/whiffle/config/store.svelte";
  import { confirm } from "$lib/whiffle/confirm.svelte";
  import {
    type DiscoveredAgent,
    discoverAgents,
    pushAgents,
    removeAgent,
    saveAgent,
  } from "$lib/whiffle/fleet";
  import { machineLabel } from "$lib/whiffle/machine";
  import OsMark from "$lib/whiffle/OsMark.svelte";
  import { orderMachines } from "$lib/whiffle/rail.svelte";

  /**
   * Subagents, fleet-wide: define one and it lands in every machine's
   * `~/.claude/agents`. Two lists, because there are two truths — what the
   * fleet keeps, and what the machines really have, read live off disk.
   */
  const store = configStore();
  const section = sectionOf("subagents");
  const HUE = section.hue;

  const agents = $derived(store.fleet.value?.agents ?? []);
  const machines = $derived(orderMachines(whiffle.machines));
  const online = $derived(
    machines.filter((machine) => machine.status === "online")
  );

  let pushing = $state(false);
  let busy = $state<Record<string, boolean>>({});
  let unpushable = $state<Record<string, string>>({});
  let found = $state<Record<string, DiscoveredAgent[]>>({});
  let reading = $state<Record<string, boolean>>({});

  const message = (caught: unknown) =>
    caught instanceof Error ? caught.message : String(caught);

  /** Every online machine is asked once, when it appears. Nothing is stored. */
  $effect(() => {
    for (const machine of online) {
      if (found[machine.machineId] || reading[machine.machineId]) {
        continue;
      }
      reading[machine.machineId] = true;
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — the effect re-runs per machine, not per promise
      void discoverAgents(machine.machineId)
        .then((rows) => {
          found[machine.machineId] = rows;
        })
        .finally(() => delete reading[machine.machineId]);
    }
  });

  const discovered = $derived(
    online.flatMap((machine) =>
      (found[machine.machineId] ?? []).map((row) => ({ machine, row }))
    )
  );

  function describe(row: FleetAgent): string {
    const front = parseAgentFrontMatter(row.content);
    const parts: string[] = [];
    if (front.description) {
      parts.push(front.description);
    }
    if (front.model && front.model !== "inherit") {
      parts.push(front.model);
    }
    if (front.tools) {
      parts.push(`${front.tools.length} tools`);
    }
    if (front.effort) {
      parts.push(`${front.effort} effort`);
    }
    return parts.join(" · ");
  }

  async function askForget(row: FleetAgent) {
    const ok = await confirm({
      title: `Remove ${row.name}?`,
      body: "The fleet forgets it. Every machine keeps the file it was already given, and lists it below as unmanaged, until the daemon can take one away itself.",
      confirmLabel: "Remove",
    });
    if (!ok) {
      return;
    }
    busy[row.name] = true;
    try {
      await removeAgent(row.name);
      const fleet = store.fleet.value;
      if (fleet) {
        fleet.agents = fleet.agents.filter((other) => other.name !== row.name);
      }
    } catch (caught) {
      toast.error(message(caught));
    } finally {
      delete busy[row.name];
    }
  }

  async function adopt(machineId: string, row: DiscoveredAgent) {
    const key = `${machineId}:${row.name}`;
    busy[key] = true;
    try {
      const saved = await saveAgent(row.name, row.content);
      const fleet = store.fleet.value;
      if (fleet) {
        upsert(fleet.agents, saved, (other) => other.name === saved.name);
      }
      store.mark(saved.name);
      toast.success(`${row.name} is the fleet's now — every machine gets it.`);
    } catch (caught) {
      toast.error(message(caught));
    } finally {
      delete busy[key];
    }
  }

  async function push() {
    pushing = true;
    try {
      ({ unpushable } = await pushAgents());
      const skipped = Object.keys(unpushable).length;
      if (skipped === 0) {
        toast.success("Written to every machine that is online.");
      } else {
        toast.info(
          `${skipped} machine${skipped === 1 ? "" : "s"} could not be written to.`
        );
      }
    } catch (caught) {
      toast.error(message(caught));
    } finally {
      pushing = false;
    }
  }
</script>

<SectionFrame
  problem={store.fleet.error}
  purpose={section.purpose}
  ready={store.fleet.value !== null}
  settling={Object.keys(reading).length > 0}
  title={section.label}
>
  {#snippet actions(down)}
    <Button
      disabled={down !== null || pushing || agents.length === 0}
      onclick={push}
      title={down ?? undefined}
      variant="outline"
    >
      {pushing ? 'Pushing…' : 'Push to machines'}
    </Button>
    <Button
      disabled={down !== null}
      href="/config/subagents/new"
      title={down ?? undefined}
    >
      <IconPlus />
      Add subagent
    </Button>
  {/snippet}

  {#if agents.length === 0}
    <EmptyHead
      line="Write one, or adopt one a machine already has from the list below."
      title="No subagents yet"
    />
  {:else}
    <RowList label="Fleet subagents">
      {#each agents as row (row.name)}
        <SectionRow
          actions={[
            {
              label: 'Remove from the fleet',
              icon: IconTrash,
              destructive: true,
              disabled: busy[row.name] === true,
              onselect: () => askForget(row),
            },
          ]}
          flash={store.flash === row.name}
          href="/config/subagents/{row.name}"
          hue={HUE}
          icon={IconSubagentDuo}
          meta={describe(row)}
          mono
          name={row.name}
        />
      {/each}
    </RowList>
  {/if}
  {#each Object.entries(unpushable) as [machineId, why] (machineId)}
    {@const machine = machines.find((row) => row.machineId === machineId)}
    <p class="note">
      {machine ? machineLabel(machine.hostname) : machineId}
      — {why}.
    </p>
  {/each}

  <div class="group">
    <SectionHeader hue={HUE} icon={IconLaptopDuo} label="On machines" />
    <p class="note">
      The definition files each machine really has, read live off its disk. One
      the fleet does not keep can be adopted into it, and every other machine
      gets it.
    </p>
    {#if online.length === 0}
      <p class="note">No machine is online to ask.</p>
    {:else if discovered.length === 0}
      {#if Object.keys(reading).length > 0}
        <p class="note busy" role="status">
          <IconSpinner class="size-4 shrink-0 animate-spin" />
          Asking the machines…
        </p>
      {:else}
        <p class="note">No machine has any subagent files yet.</p>
      {/if}
    {:else}
      <RowList label="Subagents on machines">
        {#each discovered as { machine, row } (`${machine.machineId}:${row.path}`)}
          {@const stored = agents.find((other) => other.name === row.name)}
          {@const key = `${machine.machineId}:${row.name}`}
          {@const same = stored !== undefined && stored.content === row.content}
          <SectionRow
            meta="{machineLabel(machine.hostname)}{row.description ? ` · ${row.description}` : ''}"
            mono
            name={row.name}
          >
            {#snippet tile()}
              <OsMark class="size-3.5" os={machine.os} />
            {/snippet}
            {#snippet trailing()}
              {#if same}
                <span class="state">Managed · in sync</span>
              {:else}
                {#if stored}
                  <span class="state differs">Managed · differs</span>
                {/if}
                <Button
                  disabled={busy[key] === true}
                  onclick={() => adopt(machine.machineId, row)}
                  size="sm"
                  variant="outline"
                >
                  <IconDownload />
                  {#if busy[key]}
                    Adopting…
                  {:else}
                    {stored ? 'Adopt this copy' : 'Adopt'}
                  {/if}
                </Button>
              {/if}
            {/snippet}
          </SectionRow>
        {/each}
      </RowList>
    {/if}
  </div>
</SectionFrame>

<style>
  .group {
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
  .state {
    font: var(--type-meta);
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .differs {
    color: var(--status-attn-ink);
  }
</style>
