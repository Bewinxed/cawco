<script lang="ts">
  import {
    type FleetPlugin,
    type FleetSkillMeta,
    type MarketplacePluginInfo,
    machineLabel,
  } from "@cawco/core";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import FetchSkillPopover from "#lib/cawco/config/FetchSkillPopover.svelte";
  import { hubDown } from "#lib/cawco/config/hub.svelte.js";
  import LinkMarketplacePopover from "#lib/cawco/config/LinkMarketplacePopover.svelte";
  import PreviousVersions, {
    type ListedVersion,
  } from "#lib/cawco/config/PreviousVersions.svelte";
  import RolloutChip from "#lib/cawco/config/RolloutChip.svelte";
  import RowFaults from "#lib/cawco/config/RowFaults.svelte";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore, upsert } from "#lib/cawco/config/store.svelte.js";
  import { confirm } from "#lib/cawco/confirm.svelte.js";
  import {
    catalogHost,
    formatBytes,
    marketplaceCatalog,
    refreshPlugin,
    refreshSkill,
    removeMarketplace,
    removePlugin,
    removeSkill,
    restoreSkillVersion,
    savePlugin,
    saveSkill,
    skillHistory,
  } from "#lib/cawco/fleet.js";
  import { hubFaults } from "#lib/cawco/fleet-faults.js";
  import MachineInventory from "#lib/cawco/MachineInventory.svelte";
  import { orderMachines } from "#lib/cawco/rail.svelte.js";
  import { toast } from "#lib/cawco/toasts.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconBolt,
    IconHistory,
    IconLayers,
    IconRefresh,
    IconSearch,
    IconShop,
    IconTrash,
  } from "#lib/icons.js";

  /**
   * Two ways to the same thing: fetch a skill and the hub downloads its files
   * once for the whole fleet; link a marketplace and every machine clones it,
   * then install its plugins. Either way a skill is in every session's `/`
   * menu on a machine once that machine has it.
   */
  const store = configStore();
  const section = sectionOf("skills");
  const HUE = section.hue;

  const fleet = $derived(store.fleet.value);
  const skills = $derived(fleet?.skills ?? []);
  const marketplaces = $derived(fleet?.config.marketplaces ?? []);
  const plugins = $derived(fleet?.config.plugins ?? []);
  const machines = $derived(orderMachines(cawco.machines));
  const hubBroken = $derived(
    hubFaults(
      skills,
      plugins,
      cawco.machines.map((machine) => machine.fleet)
    )
  );

  let busy = $state<Record<string, boolean>>({});
  let browsing = $state<string | null>(null);
  let listings = $state<Record<string, MarketplacePluginInfo[]>>({});
  let reading = $state<Record<string, boolean>>({});
  let unread = $state<Record<string, string>>({});
  let refetching = $state(false);
  let refetchFailed = $state(false);
  let installFailed = $state<Record<string, boolean>>({});

  const message = (err: unknown) =>
    err instanceof Error ? err.message : String(err);
  const installed = (id: string): boolean =>
    plugins.some((row) => row.id === id);
  const resolved = () => {
    // biome-ignore lint/complexity/noVoid: the slot reports its own outcome
    void store.fleet.load();
  };

  const sized = (row: { bytes?: number; hash?: string }) =>
    [
      row.bytes === undefined ? null : formatBytes(row.bytes),
      row.hash ? row.hash.slice(0, 7) : null,
    ].filter((part): part is string => part !== null);

  function landedSkill(row: FleetSkillMeta) {
    if (fleet) {
      upsert(fleet.skills, row, (other) => other.name === row.name);
      store.mark(row.name);
    }
  }

  function landedPlugin(row: FleetPlugin) {
    if (fleet) {
      upsert(fleet.config.plugins, row, (other) => other.id === row.id);
    }
  }

  async function switchSkill(row: FleetSkillMeta, enabled: boolean) {
    busy[row.name] = true;
    try {
      landedSkill(await saveSkill(row.name, { source: row.source, enabled }));
    } catch (err) {
      toast.error(message(err));
    } finally {
      delete busy[row.name];
    }
  }

  async function refetchSkill(row: FleetSkillMeta) {
    busy[row.name] = true;
    try {
      const next = await refreshSkill(row.name);
      landedSkill(next);
      if (next.error) {
        toast.error(next.error);
      } else if (next.hash === row.hash) {
        toast.info(`${row.name} is already current.`);
      } else {
        toast.success(`${row.name} changed — the machines get the new files.`);
      }
    } catch (err) {
      toast.error(message(err));
    } finally {
      delete busy[row.name];
    }
  }

  async function refetchPlugin(row: FleetPlugin) {
    busy[row.id] = true;
    try {
      const next = await refreshPlugin(row.id);
      landedPlugin(next);
      if (next.error) {
        toast.error(next.error);
      } else {
        toast.success(`${row.id} fetched — the machines get the files.`);
      }
    } catch (err) {
      toast.error(message(err));
    } finally {
      delete busy[row.id];
    }
  }

  /** Re-resolves every row the hub could not fetch, in order. */
  async function refetchAll() {
    refetching = true;
    refetchFailed = false;
    try {
      let still = 0;
      for (const fault of hubBroken) {
        const next =
          fault.scope === "skills"
            ? // biome-ignore lint/performance/noAwaitInLoops: one at a time, so the count in the toast is right
              await refreshSkill(fault.key)
            : await refreshPlugin(fault.key);
        if (next.error) {
          still += 1;
        }
      }
      if (still > 0) {
        refetchFailed = true;
        toast.error(`${still} still would not fetch — the row says why.`);
      } else {
        toast.success("Fetched. The machines are being sent the files.");
      }
      resolved();
    } catch (err) {
      refetchFailed = true;
      toast.error(message(err));
    } finally {
      refetching = false;
    }
  }

  // ── a skill's previous versions ─────────────────────────────────────
  // A skill has no editor, so its history opens under its row from the row's
  // menu: the hook editor's list, read the same way and restored the same way.
  let historyOf = $state<string | null>(null);
  let versionsOf = $state<Record<string, ListedVersion[]>>({});
  let versionsFailed = $state<Record<string, string>>({});
  let restoring = $state<number | null>(null);
  let restoreFailed = $state<number | null>(null);

  /** Where a kept version came from: the fleet's own row, or a machine's edited copy. */
  function sourceLabel(source: string): string {
    if (!source.startsWith("machine:")) {
      return "the fleet";
    }
    const machineId = source.slice("machine:".length);
    const machine = machines.find((row) => row.machineId === machineId);
    return machine ? machineLabel(machine.hostname) : machineId;
  }

  async function loadVersions(name: string) {
    delete versionsFailed[name];
    try {
      versionsOf[name] = await skillHistory(name);
    } catch (err) {
      versionsFailed[name] = message(err);
    }
  }

  function toggleHistory(row: FleetSkillMeta) {
    if (historyOf === row.name) {
      historyOf = null;
      return;
    }
    historyOf = row.name;
    // biome-ignore lint/complexity/noVoid: the list reports its own failure in place
    void loadVersions(row.name);
  }

  async function restoreSkill(name: string, version: ListedVersion) {
    restoring = version.id;
    restoreFailed = null;
    try {
      landedSkill(await restoreSkillVersion(version.id));
      toast.success("Restored — every machine gets it.");
      await loadVersions(name);
    } catch (err) {
      restoreFailed = version.id;
      toast.error(message(err));
    } finally {
      restoring = null;
    }
  }

  async function askForget(row: FleetSkillMeta) {
    if (!fleet) {
      return;
    }
    await confirm({
      title: `Remove ${row.name}?`,
      body: `This removes the ${row.name} skill from every machine in the fleet. It can't be undone.`,
      confirmLabel: "Remove everywhere",
      destructive: true,
      pendingLabel: "Removing…",
      run: async () => {
        busy[row.name] = true;
        try {
          await removeSkill(row.name);
          fleet.skills = fleet.skills.filter(
            (other) => other.name !== row.name
          );
        } finally {
          delete busy[row.name];
        }
      },
    });
  }

  async function browse(name: string) {
    if (browsing === name) {
      browsing = null;
      return;
    }
    browsing = name;
    if (listings[name] || reading[name]) {
      return;
    }
    const host = catalogHost(machines, name);
    if (!host) {
      return;
    }
    reading[name] = true;
    delete unread[name];
    try {
      listings[name] = await marketplaceCatalog(host.machineId, name);
    } catch (err) {
      unread[name] = message(err);
    } finally {
      delete reading[name];
    }
  }

  async function askUnlink(name: string) {
    if (!fleet) {
      return;
    }
    await confirm({
      title: `Unlink ${name}?`,
      body: "The fleet stops tracking this marketplace. Plugins already installed from it stay installed.",
      confirmLabel: "Unlink",
      pendingLabel: "Unlinking…",
      run: async () => {
        busy[name] = true;
        try {
          await removeMarketplace(name);
          fleet.config.marketplaces = fleet.config.marketplaces.filter(
            (row) => row.name !== name
          );
          if (browsing === name) {
            browsing = null;
          }
        } finally {
          delete busy[name];
        }
      },
    });
  }

  async function install(plugin: MarketplacePluginInfo, marketplace: string) {
    const id = `${plugin.name}@${marketplace}`;
    busy[id] = true;
    installFailed[id] = false;
    try {
      landedPlugin(await savePlugin(id, { enabled: true }));
    } catch (err) {
      installFailed[id] = true;
      toast.error(message(err));
    } finally {
      delete busy[id];
    }
  }

  async function togglePlugin(id: string, enabled: boolean) {
    busy[id] = true;
    try {
      landedPlugin(await savePlugin(id, { enabled }));
    } catch (err) {
      toast.error(message(err));
    } finally {
      delete busy[id];
    }
  }

  async function askUninstall(id: string) {
    if (!fleet) {
      return;
    }
    await confirm({
      title: `Remove ${id}?`,
      body: "This removes the plugin from every machine in the fleet. It can't be undone.",
      confirmLabel: "Remove everywhere",
      destructive: true,
      pendingLabel: "Removing…",
      run: async () => {
        busy[id] = true;
        try {
          await removePlugin(id);
          fleet.config.plugins = fleet.config.plugins.filter(
            (row) => row.id !== id
          );
        } finally {
          delete busy[id];
        }
      },
    });
  }
</script>

<SectionFrame
  problem={store.fleet.error}
  purpose={section.purpose}
  ready={fleet !== null}
  title={section.label}
>
  {#snippet actions(
    down
  )}
    <FetchSkillPopover
      {down}
      onsaved={landedSkill}
      taken={skills.map((row) => row.name)}
    />
  {/snippet}
  {#snippet toolbar()}
    <!-- Acts on the rows below, so it arrives with them, not in the header. -->
    {#if hubBroken.length > 0}
      <Button
        class="num"
        disabled={hubDown() !== null}
        failed={refetchFailed}
        icon={IconRefresh}
        label="Fetch all {hubBroken.length} again"
        onclick={refetchAll}
        pending={refetching}
        pendingLabel="Fetching…"
        size="sm"
        title={hubDown() ?? undefined}
        variant="outline"
      />
    {/if}
    <LinkMarketplacePopover
      down={hubDown()}
      onsaved={(row) => fleet?.config.marketplaces.push(row)}
      taken={marketplaces.map((row) => row.name)}
    />
  {/snippet}

  <div class="group">
    <SectionHeader hue={HUE} icon={IconBolt} label="Skills" />
    {#if skills.length === 0}
      <p class="note">
        No skills fetched yet. Paste what you would otherwise have run and the
        hub downloads the files itself.
      </p>
    {:else}
      <RowList label="Skills">
        {#each skills as row (row.name)}
          <SectionRow
            actions={[
              {
                label: "Fetch again",
                icon: IconRefresh,
                disabled: busy[row.name] === true,
                onselect: () => refetchSkill(row),
              },
              {
                label:
                  historyOf === row.name
                    ? "Hide previous versions"
                    : "Previous versions",
                icon: IconHistory,
                onselect: () => toggleHistory(row),
              },
              {
                label: "Remove everywhere",
                icon: IconTrash,
                destructive: true,
                disabled: busy[row.name] === true,
                onselect: () => askForget(row),
              },
            ]}
            enabled={row.enabled}
            flash={store.flash === row.name}
            hue={HUE}
            icon={IconBolt}
            meta={[row.source, ...sized(row)].join(" · ")}
            name={row.name}
            ontoggle={(next) => switchSkill(row, next)}
            toggling={busy[row.name] === true}
          >
            {#snippet rollout()}
              <RolloutChip
                kind="skills"
                {machines}
                name={row.name}
                what={row.name}
              />
            {/snippet}
            {#snippet below()}
              <RowFaults
                hub={hubBroken.filter(
                  (fault) => fault.scope === "skills" && fault.key === row.name
                )}
                key={row.name}
                kind="skills"
                {machines}
                onresolved={resolved}
              />
              {#if historyOf === row.name}
                {#if versionsOf[row.name] === undefined &&
                  !versionsFailed[row.name]}
                  <div
                    aria-label="Reading {row.name}'s previous versions"
                    class="listing"
                    role="status"
                  >
                    {#each [0, 1] as line (line)}
                      <Skeleton class="h-10 w-full" />
                    {/each}
                  </div>
                {:else}
                  <PreviousVersions
                    failed={versionsFailed[row.name]}
                    onrestore={(version) => restoreSkill(row.name, version)}
                    {restoreFailed}
                    {restoring}
                    {sourceLabel}
                    versions={versionsOf[row.name] ?? []}
                  />
                {/if}
              {/if}
            {/snippet}
          </SectionRow>
        {/each}
      </RowList>
    {/if}
    <p class="note">
      CawCo installs a skill's files. A skill that also ships hooks or subagents
      runs in its degraded mode until those are set up by hand.
    </p>
  </div>

  <div class="group">
    <SectionHeader hue={HUE} icon={IconShop} label="Marketplaces" />
    {#if marketplaces.length === 0}
      <p class="note">
        No marketplaces linked yet. Link one and its plugins become browsable
        here.
      </p>
    {:else}
      <RowList label="Marketplaces">
        {#each marketplaces as row (row.name)}
          {@const host = catalogHost(machines, row.name)}
          <SectionRow
            actions={[
              {
                label: "Unlink",
                icon: IconTrash,
                destructive: true,
                disabled: busy[row.name] === true,
                onselect: () => askUnlink(row.name),
              },
            ]}
            hue={HUE}
            icon={IconShop}
            meta={row.source}
            name={row.name}
          >
            {#snippet rollout()}
              <RolloutChip
                kind="marketplaces"
                {machines}
                name={row.name}
                what={row.name}
              />
            {/snippet}
            {#snippet trailing()}
              <Button
                disabled={!host}
                onclick={() => browse(row.name)}
                size="sm"
                title={host
                  ? `Read from ${host.hostname}`
                  : "No machine that is online has this marketplace yet"}
                variant="ghost"
              >
                <IconSearch />
                {browsing === row.name ? "Hide" : "Browse"}
              </Button>
            {/snippet}
            {#snippet below()}
              <RowFaults
                key={row.name}
                kind="marketplaces"
                {machines}
                onresolved={resolved}
              />
              {#if browsing === row.name}
                {#if reading[row.name]}
                  <div
                    aria-label="Reading {row.name}"
                    class="listing"
                    role="status"
                  >
                    {#each [0, 1, 2] as line (line)}
                      <Skeleton class="h-10 w-full" />
                    {/each}
                  </div>
                {:else if unread[row.name]}
                  <p class="caution" role="alert">{unread[row.name]}</p>
                {:else if (listings[row.name] ?? []).length === 0}
                  <p class="note">This marketplace lists no plugins.</p>
                {:else}
                  <ul class="listing">
                    {#each listings[row.name] as plugin (plugin.name)}
                      {@const id = `${plugin.name}@${row.name}`}
                      <li class="offer">
                        <span class="text">
                          <span class="line">
                            <span class="pname">{plugin.name}</span>
                            {#if plugin.version}
                              <span class="note font-mono"
                                >{plugin.version}</span
                              >
                            {/if}
                            {#if plugin.category}
                              <span class="note">{plugin.category}</span>
                            {/if}
                          </span>
                          {#if plugin.description}
                            <span class="note">{plugin.description}</span>
                          {/if}
                        </span>
                        {#if installed(id)}
                          <span class="note">Added</span>
                        {:else}
                          <Button
                            failed={installFailed[id] === true}
                            label="Install"
                            onclick={() => install(plugin, row.name)}
                            pending={busy[id] === true}
                            pendingLabel="Adding…"
                            size="sm"
                            variant="outline"
                          />
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
              {/if}
            {/snippet}
          </SectionRow>
        {/each}
      </RowList>
    {/if}
  </div>

  <div class="group">
    <SectionHeader hue={HUE} icon={IconLayers} label="Plugins" />
    {#if plugins.length === 0}
      <p class="note">
        Nothing installed yet. Browse a marketplace above and add a plugin.
      </p>
    {:else}
      <RowList label="Plugins">
        {#each plugins as row (row.id)}
          <SectionRow
            actions={[
              {
                label: "Fetch again",
                icon: IconRefresh,
                disabled: busy[row.id] === true,
                onselect: () => refetchPlugin(row),
              },
              {
                label: "Remove everywhere",
                icon: IconTrash,
                destructive: true,
                disabled: busy[row.id] === true,
                onselect: () => askUninstall(row.id),
              },
            ]}
            enabled={row.enabled}
            hue={HUE}
            icon={IconLayers}
            meta={sized(row).join(" · ") || "No bytes resolved yet"}
            mono
            name={row.id}
            ontoggle={(next) => togglePlugin(row.id, next)}
            toggling={busy[row.id] === true}
          >
            {#snippet rollout()}
              <RolloutChip
                kind="plugins"
                {machines}
                name={row.id}
                what={row.id}
              />
            {/snippet}
            {#snippet below()}
              <RowFaults
                hub={hubBroken.filter(
                  (fault) => fault.scope === "plugins" && fault.key === row.id
                )}
                key={row.id}
                kind="plugins"
                {machines}
                onresolved={resolved}
              />
            {/snippet}
          </SectionRow>
        {/each}
      </RowList>
    {/if}
    <p class="note">
      Disabling a plugin uninstalls it from the machines and keeps its row here.
    </p>
  </div>

  <MachineInventory
    kind="skills"
    {machines}
    onskill={landedSkill}
    taken={skills.map((row) => row.name)}
  />
</SectionFrame>

<style>
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .group + .group {
    padding-top: 18px;
    border-top: 1px solid var(--border-hairline);
  }
  .note {
    max-width: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .caution {
    font: var(--type-meta);
    color: var(--status-attn-ink);
  }
  .listing {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .offer {
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
    align-items: baseline;
    gap: 8px;
  }
  .pname {
    font: var(--type-label);
    color: var(--ink-strong);
  }
</style>
