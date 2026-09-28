<script lang="ts">
  import type {
    FleetPlugin,
    FleetSkillMeta,
    MarketplacePluginInfo,
  } from "@whiffle/core";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button";
  import { SectionHeader } from "$lib/components/ui/section-header";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    IconBolt,
    IconLayers,
    IconRefresh,
    IconSearch,
    IconShop,
    IconTrash,
  } from "$lib/icons";
  import { whiffle } from "$lib/whiffle/client.svelte";
  import FetchSkillPopover from "$lib/whiffle/config/FetchSkillPopover.svelte";
  import { hubDown } from "$lib/whiffle/config/hub.svelte";
  import LinkMarketplacePopover from "$lib/whiffle/config/LinkMarketplacePopover.svelte";
  import RolloutChip from "$lib/whiffle/config/RolloutChip.svelte";
  import RowFaults from "$lib/whiffle/config/RowFaults.svelte";
  import RowList from "$lib/whiffle/config/RowList.svelte";
  import SectionFrame from "$lib/whiffle/config/SectionFrame.svelte";
  import SectionRow from "$lib/whiffle/config/SectionRow.svelte";
  import { sectionOf } from "$lib/whiffle/config/sections";
  import { configStore, upsert } from "$lib/whiffle/config/store.svelte";
  import { confirm } from "$lib/whiffle/confirm.svelte";
  import {
    catalogHost,
    formatBytes,
    marketplaceCatalog,
    refreshPlugin,
    refreshSkill,
    removeMarketplace,
    removePlugin,
    removeSkill,
    savePlugin,
    saveSkill,
  } from "$lib/whiffle/fleet";
  import { hubFaults } from "$lib/whiffle/fleet-faults";
  import MachineInventory from "$lib/whiffle/MachineInventory.svelte";
  import { orderMachines } from "$lib/whiffle/rail.svelte";

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
  const machines = $derived(orderMachines(whiffle.machines));
  const hubBroken = $derived(hubFaults(skills, plugins));

  let busy = $state<Record<string, boolean>>({});
  let browsing = $state<string | null>(null);
  let listings = $state<Record<string, MarketplacePluginInfo[]>>({});
  let reading = $state<Record<string, boolean>>({});
  let unread = $state<Record<string, string>>({});
  let refetching = $state(false);

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
        toast.error(`${still} still would not fetch — the row says why.`);
      } else {
        toast.success("Fetched. The machines are being sent the files.");
      }
      resolved();
    } catch (err) {
      toast.error(message(err));
    } finally {
      refetching = false;
    }
  }

  async function askForget(row: FleetSkillMeta) {
    const ok = await confirm({
      title: `Remove ${row.name}?`,
      body: `This removes the ${row.name} skill from every machine in the fleet. It can't be undone.`,
      confirmLabel: "Remove everywhere",
      destructive: true,
    });
    if (!(ok && fleet)) {
      return;
    }
    busy[row.name] = true;
    try {
      await removeSkill(row.name);
      fleet.skills = fleet.skills.filter((other) => other.name !== row.name);
    } catch (err) {
      toast.error(message(err));
    } finally {
      delete busy[row.name];
    }
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
    const ok = await confirm({
      title: `Unlink ${name}?`,
      body: "The fleet stops tracking this marketplace. Plugins already installed from it stay installed.",
      confirmLabel: "Unlink",
    });
    if (!(ok && fleet)) {
      return;
    }
    busy[name] = true;
    try {
      await removeMarketplace(name);
      fleet.config.marketplaces = fleet.config.marketplaces.filter(
        (row) => row.name !== name
      );
      if (browsing === name) {
        browsing = null;
      }
    } catch (err) {
      toast.error(message(err));
    } finally {
      delete busy[name];
    }
  }

  async function install(plugin: MarketplacePluginInfo, marketplace: string) {
    const id = `${plugin.name}@${marketplace}`;
    busy[id] = true;
    try {
      landedPlugin(await savePlugin(id, { enabled: true }));
    } catch (err) {
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
    const ok = await confirm({
      title: `Remove ${id}?`,
      body: "This removes the plugin from every machine in the fleet. It can't be undone.",
      confirmLabel: "Remove everywhere",
      destructive: true,
    });
    if (!(ok && fleet)) {
      return;
    }
    busy[id] = true;
    try {
      await removePlugin(id);
      fleet.config.plugins = fleet.config.plugins.filter(
        (row) => row.id !== id
      );
    } catch (err) {
      toast.error(message(err));
    } finally {
      delete busy[id];
    }
  }
</script>

<SectionFrame
  problem={store.fleet.error}
  purpose={section.purpose}
  ready={fleet !== null}
  title={section.label}
>
  {#snippet actions(down)}
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
        disabled={hubDown() !== null || refetching}
        onclick={refetchAll}
        size="sm"
        title={hubDown() ?? undefined}
        variant="outline"
      >
        <IconRefresh />
        {refetching ? 'Fetching…' : `Fetch all ${hubBroken.length} again`}
      </Button>
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
              { label: 'Fetch again', icon: IconRefresh, disabled: busy[row.name] === true, onselect: () => refetchSkill(row) },
              { label: 'Remove everywhere', icon: IconTrash, destructive: true, disabled: busy[row.name] === true, onselect: () => askForget(row) },
            ]}
            enabled={row.enabled}
            flash={store.flash === row.name}
            hue={HUE}
            icon={IconBolt}
            meta={[row.source, ...sized(row)].join(' · ')}
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
                hub={hubBroken.filter((fault) => fault.scope === 'skills' && fault.key === row.name)}
                key={row.name}
                kind="skills"
                {machines}
                onresolved={resolved}
              />
            {/snippet}
          </SectionRow>
        {/each}
      </RowList>
    {/if}
    <p class="note">
      Whiffle installs a skill's files. A skill that also ships hooks or
      subagents runs in its degraded mode until those are set up by hand.
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
              { label: 'Unlink', icon: IconTrash, destructive: true, disabled: busy[row.name] === true, onselect: () => askUnlink(row.name) },
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
                title={host ? `Read from ${host.hostname}` : 'No machine that is online has this marketplace yet'}
                variant="ghost"
              >
                <IconSearch />
                {browsing === row.name ? 'Hide' : 'Browse'}
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
                            disabled={busy[id] === true}
                            onclick={() => install(plugin, row.name)}
                            size="sm"
                            variant="outline"
                          >
                            {busy[id] ? 'Adding…' : 'Install'}
                          </Button>
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
              { label: 'Fetch again', icon: IconRefresh, disabled: busy[row.id] === true, onselect: () => refetchPlugin(row) },
              { label: 'Remove everywhere', icon: IconTrash, destructive: true, disabled: busy[row.id] === true, onselect: () => askUninstall(row.id) },
            ]}
            enabled={row.enabled}
            hue={HUE}
            icon={IconLayers}
            meta={sized(row).join(' · ') || 'No bytes resolved yet'}
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
                hub={hubBroken.filter((fault) => fault.scope === 'plugins' && fault.key === row.id)}
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
