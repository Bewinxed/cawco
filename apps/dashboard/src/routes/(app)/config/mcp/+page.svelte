<script lang="ts">
  import type { FleetMcpServer } from "@cawco/core";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { deleteMcpServer } from "#lib/cawco/config/deletes.js";
  import McpSignIn from "#lib/cawco/config/McpSignIn.svelte";
  import RolloutChip from "#lib/cawco/config/RolloutChip.svelte";
  import RowFaults from "#lib/cawco/config/RowFaults.svelte";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore, upsert } from "#lib/cawco/config/store.svelte.js";
  import {
    describeMcp,
    isRemoteMcp,
    saveMcpServer,
    syncFleet,
  } from "#lib/cawco/fleet.js";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import MachineInventory from "#lib/cawco/MachineInventory.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { orderMachines } from "#lib/cawco/rail.svelte.js";
  import { toast } from "#lib/cawco/toasts.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    IconGlobe,
    IconPlus,
    IconRefresh,
    IconToolMcp,
    IconTrash,
  } from "#lib/icons.js";

  /**
   * The MCP servers every supported harness can reach. New sessions pick
   * them up; a running session keeps the servers it started with.
   */
  const store = configStore();
  const section = sectionOf("mcp");
  const HUE = section.hue;

  const servers = $derived(store.fleet.value?.config.mcp ?? []);
  const machines = $derived(orderMachines(cawco.machines));
  let busy = $state<Record<string, boolean>>({});
  let syncing = $state(false);
  let syncFailed = $state(false);

  function landed(row: FleetMcpServer) {
    const fleet = store.fleet.value;
    if (fleet) {
      upsert(fleet.config.mcp, row, (other) => other.name === row.name);
    }
  }

  /** Why a server's switch did not take, by server: said under its row. */
  let toggleFailed = $state<Record<string, string>>({});
  /** Why Sync all was refused: said under it. */
  let syncProblem = $state<string | null>(null);

  async function toggle(row: FleetMcpServer, enabled: boolean) {
    busy[row.name] = true;
    delete toggleFailed[row.name];
    try {
      landed(
        await saveMcpServer(
          row.name,
          row.config,
          enabled,
          row.projectId ?? null
        )
      );
    } catch (caught) {
      toggleFailed[row.name] = message(caught);
    } finally {
      delete busy[row.name];
    }
  }

  /**
   * Remove: at once, from every machine, with Undo in the toast for as long
   * as the hub holds it, sign-in and all (deletes.ts).
   */
  async function remove(row: FleetMcpServer) {
    busy[row.name] = true;
    try {
      await deleteMcpServer(store, row.name);
    } catch (error) {
      toast.error(message(error));
    } finally {
      delete busy[row.name];
    }
  }

  async function syncAll() {
    syncing = true;
    syncFailed = false;
    syncProblem = null;
    try {
      // Each row's rollout chip says its sync, machine by machine.
      await syncFleet();
    } catch (caught) {
      syncFailed = true;
      syncProblem = message(caught);
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
      <span>Add server</span>
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
    <RowFault again={syncAll} reason={syncProblem} />
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
              label: "Remove everywhere",
              icon: IconTrash,
              destructive: true,
              disabled: busy[row.name] === true,
              onselect: () => remove(row),
            },
          ]}
          enabled={row.enabled}
          flash={store.flash === row.name}
          href="/config/mcp/{encodeURIComponent(row.name)}"
          hue={HUE}
          icon={isRemoteMcp(row.config) ? IconGlobe : IconToolMcp}
          meta="{isRemoteMcp(row.config)
            ? `${row.config.type.toUpperCase()} · `
            : ''}{describeMcp(row.config)}"
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
          {#snippet trailing()}
            <McpSignIn server={row} />
          {/snippet}
          {#snippet below()}
            <RowFault
              again={() => toggle(row, !row.enabled)}
              reason={toggleFailed[row.name]}
            />
            <RowFaults
              hub={row.auth?.state === "failed"
                ? [
                    {
                      origin: "hub",
                      scope: "mcp",
                      key: row.name,
                      cause: "auth-discovery",
                      detail: row.auth.detail,
                    },
                  ]
                : []}
              key={row.name}
              kind="mcp"
              {machines}
            />
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
