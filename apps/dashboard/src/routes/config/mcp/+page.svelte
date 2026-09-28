<script lang="ts">
  import type { FleetMcpServer } from "@whiffle/core";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button";
  import { EmptyState } from "$lib/components/ui/empty";
  import {
    IconGlobe,
    IconPlus,
    IconRefresh,
    IconToolMcp,
    IconTrash,
  } from "$lib/icons";
  import { whiffle } from "$lib/whiffle/client.svelte";
  import RolloutChip from "$lib/whiffle/config/RolloutChip.svelte";
  import RowFaults from "$lib/whiffle/config/RowFaults.svelte";
  import RowList from "$lib/whiffle/config/RowList.svelte";
  import SectionFrame from "$lib/whiffle/config/SectionFrame.svelte";
  import SectionRow from "$lib/whiffle/config/SectionRow.svelte";
  import { sectionOf } from "$lib/whiffle/config/sections";
  import { configStore, upsert } from "$lib/whiffle/config/store.svelte";
  import { confirm } from "$lib/whiffle/confirm.svelte";
  import {
    describeMcp,
    isRemoteMcp,
    removeMcpServer,
    saveMcpServer,
    syncFleet,
  } from "$lib/whiffle/fleet";
  import MachineInventory from "$lib/whiffle/MachineInventory.svelte";
  import { orderMachines } from "$lib/whiffle/rail.svelte";

  /**
   * The MCP servers every machine's Claude Code can reach. New sessions pick
   * them up; a running session keeps the servers it started with.
   */
  const store = configStore();
  const section = sectionOf("mcp");
  const HUE = section.hue;

  const servers = $derived(store.fleet.value?.config.mcp ?? []);
  const machines = $derived(orderMachines(whiffle.machines));
  let busy = $state<Record<string, boolean>>({});
  let syncing = $state(false);
  let syncFailed = $state(false);

  const message = (caught: unknown) =>
    caught instanceof Error ? caught.message : String(caught);

  function landed(row: FleetMcpServer) {
    const fleet = store.fleet.value;
    if (fleet) {
      upsert(fleet.config.mcp, row, (other) => other.name === row.name);
    }
  }

  async function toggle(row: FleetMcpServer, enabled: boolean) {
    busy[row.name] = true;
    try {
      landed(await saveMcpServer(row.name, row.config, enabled));
    } catch (caught) {
      toast.error(message(caught));
    } finally {
      delete busy[row.name];
    }
  }

  /** Removing a server pulls it from every machine, so the confirm names that. */
  async function askRemove(row: FleetMcpServer) {
    await confirm({
      title: `Remove ${row.name}?`,
      body: `This removes ${row.name} from every machine in the fleet — not just this one. It can't be undone.`,
      confirmLabel: "Remove everywhere",
      destructive: true,
      pendingLabel: "Removing…",
      run: async () => {
        busy[row.name] = true;
        try {
          await removeMcpServer(row.name);
          const fleet = store.fleet.value;
          if (fleet) {
            fleet.config.mcp = fleet.config.mcp.filter(
              (other) => other.name !== row.name
            );
          }
        } finally {
          delete busy[row.name];
        }
      },
    });
  }

  async function syncAll() {
    syncing = true;
    syncFailed = false;
    try {
      await syncFleet();
      toast.success("Every machine that is online is syncing.");
    } catch (caught) {
      syncFailed = true;
      toast.error(message(caught));
    } finally {
      syncing = false;
    }
  }
</script>

<SectionFrame
  problem={store.fleet.error}
  purpose={section.purpose}
  ready={store.fleet.value !== null}
  title={section.label}
>
  {#snippet actions(down)}
    <Button
      disabled={down !== null}
      href="/config/mcp/new"
      title={down ?? undefined}
    >
      <IconPlus />
      Add server
    </Button>
  {/snippet}
  {#snippet toolbar()}
    <Button
      failed={syncFailed}
      icon={IconRefresh}
      label="Sync all"
      onclick={syncAll}
      pending={syncing}
      pendingLabel="Syncing…"
      size="sm"
      variant="outline"
    />
  {/snippet}

  {#if servers.length === 0}
    <EmptyState
      icon={section.icon}
      line="Add a server and every machine gets it — the quick way is a package name."
      title="No MCP servers yet"
    />
  {:else}
    <RowList label="MCP servers">
      {#each servers as row (row.name)}
        <SectionRow
          actions={[
            {
              label: 'Remove everywhere',
              icon: IconTrash,
              destructive: true,
              onselect: () => askRemove(row),
            },
          ]}
          enabled={row.enabled}
          flash={store.flash === row.name}
          href="/config/mcp/{encodeURIComponent(row.name)}"
          hue={HUE}
          icon={isRemoteMcp(row.config) ? IconGlobe : IconToolMcp}
          meta="{isRemoteMcp(row.config) ? `${row.config.type.toUpperCase()} · ` : ''}{describeMcp(row.config)}"
          name={row.name}
          ontoggle={(next) => toggle(row, next)}
          toggling={busy[row.name] === true}
        >
          {#snippet rollout()}
            <RolloutChip
              kind="mcp"
              {machines}
              name={row.name}
              what={row.name}
            />
          {/snippet}
          {#snippet below()}
            <RowFaults key={row.name} kind="mcp" {machines} />
          {/snippet}
        </SectionRow>
      {/each}
    </RowList>
  {/if}

  <MachineInventory
    kind="mcp"
    {machines}
    onserver={landed}
    taken={servers.map((row) => row.name)}
  />
</SectionFrame>
