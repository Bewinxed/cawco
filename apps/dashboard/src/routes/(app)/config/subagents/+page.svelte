<script lang="ts">
  import {
    type FleetAgent,
    machineLabel,
    parseAgentFrontMatter,
  } from "@cawco/core";
  import AskHere from "#lib/cawco/AskHere.svelte";
  import type { AskHereRequest } from "#lib/cawco/ask-here.svelte.js";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore, upsert } from "#lib/cawco/config/store.svelte.js";
  import { Asker } from "#lib/cawco/confirm.svelte.js";
  import {
    type DiscoveredAgent,
    discoverAgents,
    pushAgents,
    removeAgent,
    saveAgent,
  } from "#lib/cawco/fleet.js";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { orderMachines } from "#lib/cawco/rail.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconDownload,
    IconLaptop,
    IconPlus,
    IconSubagent,
    IconTrash,
  } from "#lib/icons.js";

  /**
   * Subagents, fleet-wide: define one and it lands in every machine's
   * `~/.claude/agents`. Two lists, because there are two truths — what the
   * fleet keeps, and what the machines really have, read live off disk.
   */
  const store = configStore();
  const section = sectionOf("subagents");
  const HUE = section.hue;

  const agents = $derived(store.fleet.value?.agents ?? []);
  const machines = $derived(orderMachines(cawco.machines));
  const online = $derived(
    machines.filter((machine) => machine.status === "online")
  );

  let pushing = $state(false);
  let pushFailed = $state(false);
  let busy = $state<Record<string, boolean>>({});
  /** Why an adopt was refused, by machine and name: said under its row. */
  let adoptFailed = $state<Record<string, string>>({});
  /** Why the last push was refused: said under Push to machines. */
  let pushProblem = $state<string | null>(null);
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

  /** Remove asks under the subagent's row, in the page. */
  const asks = new Asker<AskHereRequest>();
  async function askForget(row: FleetAgent) {
    await asks.ask({
      at: row.name,
      title: `Remove ${row.name}?`,
      body: "The fleet forgets it. Every machine keeps the file it was already given, and lists it below as unmanaged, until the daemon can take one away itself.",
      confirmLabel: "Remove",
      pendingLabel: "Removing…",
      run: async () => {
        busy[row.name] = true;
        try {
          await removeAgent(row.name);
          const fleet = store.fleet.value;
          if (fleet) {
            fleet.agents = fleet.agents.filter(
              (other) => other.name !== row.name
            );
          }
        } finally {
          delete busy[row.name];
        }
      },
    });
  }

  async function adopt(machineId: string, row: DiscoveredAgent) {
    const key = `${machineId}:${row.name}`;
    busy[key] = true;
    delete adoptFailed[key];
    try {
      // The fleet's row, marked, and this one turning "in sync" are the result.
      const saved = await saveAgent(row.name, row.content);
      const fleet = store.fleet.value;
      if (fleet) {
        upsert(fleet.agents, saved, (other) => other.name === saved.name);
      }
      store.mark(saved.name);
    } catch (caught) {
      adoptFailed[key] = message(caught);
    } finally {
      delete busy[key];
    }
  }

  /**
   * Writes every subagent to the machines that are online. What it came to
   * is said where it happened: a machine that could not be written to is
   * listed with why (`unpushable`), and a refused push under its button.
   */
  async function push() {
    pushing = true;
    pushFailed = false;
    pushProblem = null;
    try {
      ({ unpushable } = await pushAgents());
      pushFailed = Object.keys(unpushable).length > 0;
    } catch (caught) {
      pushFailed = true;
      pushProblem = message(caught);
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
  {#snippet actions(
    down
  )}
    <Button
      disabled={down !== null || agents.length === 0}
      failed={pushFailed}
      label="Push to machines"
      onclick={push}
      pending={pushing}
      pendingLabel="Pushing…"
      title={down ?? undefined}
      variant="outline"
    />
    <RowFault again={push} reason={pushProblem} />
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
    <EmptyState
      icon={section.icon}
      line="Write one, or adopt one a machine already has from the list below."
      title="No subagents yet"
    />
  {:else}
    <RowList label="Fleet subagents">
      {#each agents as row (row.name)}
        <SectionRow
          actions={[
            {
              label: "Remove from the fleet",
              icon: IconTrash,
              destructive: true,
              disabled: busy[row.name] === true,
              onselect: () => askForget(row),
            },
          ]}
          flash={store.flash === row.name}
          href="/config/subagents/{row.name}"
          hue={HUE}
          icon={IconSubagent}
          meta={describe(row)}
          mono
          name={row.name}
        >
          {#snippet below()}
            <AskHere asker={asks} at={row.name} />
          {/snippet}
        </SectionRow>
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
    <SectionHeader hue={HUE} icon={IconLaptop} label="On machines" />
    <p class="note">
      The definition files each machine really has, read live off its disk. One
      the fleet does not keep can be adopted into it, and every other machine
      gets it.
    </p>
    <!-- The list stands once every machine has answered: machines answer
         in any order, and one listed above another would push the rows
         already drawn down the page. -->
    {#if online.length === 0}
      <p class="note">No machine is online to ask.</p>
    {:else if Object.keys(reading).length > 0}
      <p class="note busy" role="status">
        <Spinner class="size-4 shrink-0" />
        Asking the machines…
      </p>
    {:else if discovered.length === 0}
      <p class="note">No machine has any subagent files yet.</p>
    {:else}
      <RowList label="Subagents on machines">
        {#each discovered as { machine, row } (`${machine.machineId}:${row.path}`)}
          {@const stored = agents.find((other) => other.name === row.name)}
          {@const key = `${machine.machineId}:${row.name}`}
          {@const same = stored !== undefined && stored.content === row.content}
          <SectionRow
            meta="{machineLabel(machine.hostname)}{row.description
              ? ` · ${row.description}`
              : ""}"
            mono
            name={row.name}
          >
            {#snippet tile()}
              <OsMark class="size-4" os={machine.os} />
            {/snippet}
            {#snippet trailing()}
              {#if same}
                <span class="state">Managed · in sync</span>
              {:else}
                {#if stored}
                  <span class="state differs">Managed · differs</span>
                {/if}
                <Button
                  failed={key in adoptFailed}
                  icon={IconDownload}
                  label={stored ? "Adopt this copy" : "Adopt"}
                  onclick={() => adopt(machine.machineId, row)}
                  pending={busy[key] === true}
                  pendingLabel="Adopting…"
                  size="sm"
                  variant="outline"
                />
              {/if}
            {/snippet}
            {#snippet below()}
              <RowFault reason={adoptFailed[key]} />
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
