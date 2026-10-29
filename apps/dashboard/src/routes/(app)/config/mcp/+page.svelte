<script lang="ts">
  import type { FleetMcpServer } from "@cawco/core/fleet";
  import { mcpWords as words } from "@cawco/core/words/mcp";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { deleteMcpServer } from "#lib/cawco/config/deletes.js";
  import FleetEmpty from "#lib/cawco/config/FleetEmpty.svelte";
  import McpSignIn from "#lib/cawco/config/McpSignIn.svelte";
  import RolloutChip from "#lib/cawco/config/RolloutChip.svelte";
  import RowActFaults from "#lib/cawco/config/RowActFaults.svelte";
  import RowFaults from "#lib/cawco/config/RowFaults.svelte";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import { RowActs } from "#lib/cawco/config/row-acts.svelte.js";
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
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconCheck,
    IconGlobe,
    IconPlus,
    IconRefresh,
    IconToolMcp,
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
  let syncing = $state(false);
  let syncFailed = $state(false);

  function landed(row: FleetMcpServer) {
    const fleet = store.fleet.value;
    if (fleet) {
      upsert(fleet.config.mcp, row, (other) => other.name === row.name);
    }
  }

  /** Why Sync all was refused: said under it. */
  let syncProblem = $state<string | null>(null);

  /**
   * Remove: at once, from every machine, with Undo in the toast for as long
   * as the hub holds it, sign-in and all (deletes.ts).
   */
  const acts = new RowActs<FleetMcpServer>("/config/mcp", {
    key: (row) => row.name,
    remove: (row) => deleteMcpServer(store, row.name),
    toggle: async (row, enabled) => {
      landed(
        await saveMcpServer(
          row.name,
          row.config,
          enabled,
          row.projectId ?? null
        )
      );
    },
  });

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
  ready={store.fleet.value !== null}
  {section}
>
  {#snippet actions(down)}
    <Button
      disabled={down !== null}
      href="/config/mcp/new"
      title={down ?? undefined}
    >
      <IconPlus />
      <span>{words.add}</span>
    </Button>
  {/snippet}
  {#snippet toolbar()}
    <Button
      failed={syncFailed}
      icon={IconRefresh}
      label={words.syncAll}
      onclick={syncAll}
      pending={syncing}
      pendingLabel={words.syncing}
      size="sm"
      variant="outline"
    />
    <RowFault again={syncAll} reason={syncProblem} />
  {/snippet}

  {#if servers.length === 0}
    <FleetEmpty
      add={{ href: "/config/mcp/new", label: words.add }}
      ask="mcp"
      icon={section.icon}
      line={words.emptyLine}
      title={words.emptyTitle}
    />
  {:else}
    <RowList label={words.list}>
      {#each servers as row (row.name)}
        <SectionRow
          actions={[acts.deleteAction(row, words.remove)]}
          enabled={row.enabled}
          flash={store.flash === row.name}
          href="/config/mcp/{encodeURIComponent(row.name)}"
          hue={HUE}
          icon={isRemoteMcp(row.config) ? IconGlobe : IconToolMcp}
          meta={isRemoteMcp(row.config)
            ? words.transportOf(
                row.config.type.toUpperCase(),
                describeMcp(row.config)
              )
            : describeMcp(row.config)}
          name={row.name}
          ontoggle={(next) => acts.toggle(row, next)}
          toggling={acts.busy[row.name] === true}
        >
          {#snippet badge()}
            {#if row.auth?.mode === "oauth" && row.auth.state === "signed-in"}
              <!-- It gives way with the name, by an ellipsis in its own
                   words (DESIGN.md, The Truncate Inside Rule), so it never
                   runs under the row's controls. -->
              <Badge
                class="shrink"
                role="status"
                title={words.signedIn}
                variant="done"
              >
                <IconCheck />
                <span
                  class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                  >{words.signedIn}</span
                >
              </Badge>
            {/if}
          {/snippet}
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
            <RowActFaults {acts} {row} />
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
