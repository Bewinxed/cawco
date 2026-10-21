<script lang="ts">
  import {
    type FleetMarketplace,
    type FleetPlugin,
    type FleetRefresh,
    type FleetSkillMeta,
    type FleetVersioned,
    isLoopbackSource,
    type MarketplacePluginInfo,
    machineLabel,
    skillsWords as words,
  } from "@cawco/core";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import {
    deleteMarketplace,
    deletePlugin,
    deleteSkill,
  } from "#lib/cawco/config/deletes.js";
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
  import SectionRow, {
    type RowNote,
  } from "#lib/cawco/config/SectionRow.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore, upsert } from "#lib/cawco/config/store.svelte.js";
  import {
    checkForUpdates,
    formatBytes,
    installPlugin,
    marketplaceCatalog,
    refreshPlugin,
    refreshSkill,
    restoreSkillVersion,
    skillHistory,
    switchPlugin,
    switchSkill,
    versionLabel,
    versionPair,
  } from "#lib/cawco/fleet.js";
  import { hubFaults } from "#lib/cawco/fleet-faults.js";
  import { clock } from "#lib/cawco/home/home-state.svelte.js";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import MachineInventory from "#lib/cawco/MachineInventory.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { orderMachines } from "#lib/cawco/rail.svelte.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
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
  import { formatAgeShort } from "#lib/utils/time.js";

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
  /** Why a marketplace install was refused, by plugin id: said under its listing. */
  let installFailed = $state<Record<string, string>>({});
  const installed = (id: string): boolean =>
    plugins.some((row) => row.id === id);
  const resolved = () => {
    // biome-ignore lint/complexity/noVoid: the slot reports its own outcome
    void store.fleet.load();
  };

  /** A row's version (else its short hash) and size, for its meta line. */
  const sized = (row: { bytes?: number; hash?: string; version?: string }) =>
    [
      versionLabel(row.version, row.hash) || null,
      row.bytes === undefined ? null : formatBytes(row.bytes),
    ].filter((part): part is string => part !== null);

  /**
   * What a row's last fetch came to and how long ago, said under it until
   * the next update check reads its source again: "Updated 4.6.0 → 4.7.0 ·
   * 2h ago", "Already on latest (4.7.0) · just now", or why it failed where
   * no hub fault under the row says so already. Else why the last check
   * could not read its source.
   */
  function outcomeOf(
    row: FleetVersioned & { fetching?: boolean },
    faulted: boolean
  ): RowNote | undefined {
    if (row.fetching) {
      return;
    }
    const last = row.lastRefresh;
    if (last && (row.checkedAt === undefined || last.at >= row.checkedAt)) {
      const said = refreshSaid(last, faulted);
      return (
        said && {
          ...said,
          text: words.outcomeAge(said.text, formatAgeShort(last.at, clock.now)),
        }
      );
    }
    return row.checkError
      ? { tone: "fail", text: words.checkFailed(row.checkError) }
      : undefined;
  }

  /** A refresh's outcome in words; a failure a hub fault already says, none. */
  function refreshSaid(
    last: FleetRefresh,
    faulted: boolean
  ): RowNote | undefined {
    const from = { version: last.fromVersion, hash: last.fromHash };
    const to = { version: last.toVersion, hash: last.toHash };
    switch (last.outcome) {
      case "updated":
        return { tone: "done", text: words.updated(...versionPair(from, to)) };
      case "unchanged":
        return {
          tone: "done",
          text: words.alreadyLatest(versionLabel(to.version, to.hash)),
        };
      case "failed":
        return faulted
          ? undefined
          : {
              tone: "fail",
              text: words.updateFailed(last.error ?? words.saidNothing),
            };
      default:
        return;
    }
  }

  /**
   * A source on a loopback host (core `isLoopbackSource`): a server stood up
   * once to install from. Its row is neither fetched again nor read for
   * updates, so it offers no Fetch again and says nothing of updates; its
   * meta line still names its version.
   */
  const oneShot = (source: string | undefined): boolean =>
    source !== undefined && isLoopbackSource(source);
  /** Where a plugin's marketplace comes from. */
  const pluginSource = (id: string): string | undefined =>
    marketplaces.find((row) => row.name === id.split("@")[1])?.source;

  /** The row's copy against what its source holds now, for its update chip. */
  const updatePair = (row: FleetVersioned & { hash?: string }) =>
    versionPair(
      { version: row.version, hash: row.hash },
      { version: row.latestVersion, hash: row.latestHash }
    );

  function landedSkill(row: FleetSkillMeta) {
    if (fleet) {
      upsert(fleet.skills, row, (other) => other.name === row.name);
      store.mark(row.name);
    }
  }

  /**
   * A plugin row a request answered with. An install or a switch answers
   * while its fetch is still under way; the `fleet.fetch` frame that lands it
   * may come first, and then the answer is the older of the two.
   */
  function landedPlugin(row: FleetPlugin) {
    if (fleet && store.answered(`plugin:${row.id}`, row)) {
      upsert(fleet.config.plugins, row, (other) => other.id === row.id);
    }
  }

  /** What a skill or plugin row says while the hub fetches it, the words a fetch button says. */
  const FETCHING = words.fetching;

  /**
   * What a row's last action came to when the hub refused it, by the row's
   * key (a skill's name, a plugin's id): said under that row with Try
   * again. What landed is the row's own to say: its rollout chip, machine
   * by machine, and a fetch the hub could not make its hub fault.
   */
  let rowFaults = $state<
    Record<string, { again?: () => unknown; reason: string }>
  >({});
  const refusedOn = (key: string, error: unknown, again?: () => unknown) => {
    rowFaults[key] = { reason: message(error), again };
  };

  /** On or off: the stored skill's flag, nothing fetched. */
  async function toggleSkill(row: FleetSkillMeta, enabled: boolean) {
    busy[row.name] = true;
    delete rowFaults[row.name];
    try {
      landedSkill(await switchSkill(row.name, enabled));
    } catch (err) {
      refusedOn(row.name, err, () => toggleSkill(row, enabled));
    } finally {
      delete busy[row.name];
    }
  }

  async function refetchSkill(row: FleetSkillMeta) {
    busy[row.name] = true;
    delete rowFaults[row.name];
    try {
      // A fetch the hub could not make stands on the row as its hub fault.
      landedSkill(await refreshSkill(row.name));
    } catch (err) {
      refusedOn(row.name, err, () => refetchSkill(row));
    } finally {
      delete busy[row.name];
    }
  }

  async function refetchPlugin(row: FleetPlugin) {
    busy[row.id] = true;
    delete rowFaults[row.id];
    try {
      landedPlugin(await refreshPlugin(row.id));
    } catch (err) {
      refusedOn(row.id, err, () => refetchPlugin(row));
    } finally {
      delete busy[row.id];
    }
  }

  /** Why Check for updates did not run: said under it. */
  let checkProblem = $state<string | null>(null);
  let askedCheck = $state(false);

  /**
   * Has the hub read every source for what it holds now; each row it reads
   * lands on its own, its chip appearing or going.
   */
  async function checkUpdates() {
    askedCheck = true;
    checkProblem = null;
    try {
      await checkForUpdates();
    } catch (err) {
      checkProblem = message(err);
    } finally {
      askedCheck = false;
    }
  }

  /** Why Fetch again (every broken row) did not run: said under it. */
  let refetchProblem = $state<string | null>(null);

  /**
   * Re-resolves every row the hub could not fetch, in order. Each row says
   * what came of it (its fault clears, or stays with the hub's reason).
   */
  async function refetchAll() {
    refetching = true;
    refetchFailed = false;
    refetchProblem = null;
    try {
      let still = 0;
      for (const fault of hubBroken) {
        const next =
          fault.scope === "skills"
            ? // biome-ignore lint/performance/noAwaitInLoops: one at a time, so the count is right
              await refreshSkill(fault.key)
            : await refreshPlugin(fault.key);
        if (next.error) {
          still += 1;
        }
      }
      refetchFailed = still > 0;
      resolved();
    } catch (err) {
      refetchFailed = true;
      refetchProblem = message(err);
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
  let restoreFailed = $state<{ id: number; reason: string } | null>(null);

  /** Where a kept version came from: the fleet's own row, or a machine's edited copy. */
  function sourceLabel(source: string): string {
    if (!source.startsWith("machine:")) {
      return words.theFleet;
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
      // The row's rollout chip says where it lands.
      landedSkill(await restoreSkillVersion(version.id));
      await loadVersions(name);
    } catch (err) {
      restoreFailed = { id: version.id, reason: message(err) };
    } finally {
      restoring = null;
    }
  }

  /**
   * Removing a skill, a marketplace or a plugin goes through at once, with
   * Undo in the toast (deletes.ts). A refused removal is said under its row.
   */
  async function remove(key: string, removal: () => Promise<void>) {
    busy[key] = true;
    delete rowFaults[key];
    try {
      await removal();
    } catch (err) {
      refusedOn(key, err, () => remove(key, removal));
    } finally {
      delete busy[key];
    }
  }

  async function browse(row: FleetMarketplace) {
    const { name } = row;
    if (browsing === name) {
      browsing = null;
      return;
    }
    browsing = name;
    if (listings[name] || reading[name]) {
      return;
    }
    reading[name] = true;
    delete unread[name];
    try {
      listings[name] = await marketplaceCatalog(row);
    } catch (err) {
      unread[name] = message(err);
    } finally {
      delete reading[name];
    }
  }

  function unlink(name: string) {
    return remove(name, async () => {
      await deleteMarketplace(store, name);
      if (browsing === name) {
        browsing = null;
      }
    });
  }

  async function install(plugin: MarketplacePluginInfo, marketplace: string) {
    const id = `${plugin.name}@${marketplace}`;
    busy[id] = true;
    delete installFailed[id];
    store.asking(`plugin:${id}`);
    try {
      landedPlugin(await installPlugin(id));
    } catch (err) {
      installFailed[id] = message(err);
    } finally {
      delete busy[id];
    }
  }

  /** On or off: the stored plugin's flag, nothing fetched. */
  async function togglePlugin(id: string, enabled: boolean) {
    busy[id] = true;
    delete rowFaults[id];
    try {
      landedPlugin(await switchPlugin(id, enabled));
    } catch (err) {
      refusedOn(id, err, () => togglePlugin(id, enabled));
    } finally {
      delete busy[id];
    }
  }
</script>

<!-- A row whose source holds something newer: what it is, as a status, and
     the one action that takes it, the row's own Fetch again. The badge's words
     wrap inside the row (a cell's tall chip); the action never shrinks. -->
{#snippet update(
  row: FleetVersioned & { hash?: string },
  pending: boolean,
  fetch: () => unknown
)}
  {@const [from, to] = updatePair(row)}
  <div
    data-slot="update"
    class="flex min-w-0 flex-wrap items-center gap-space-2"
  >
    <Badge figures="tabular" size="cell-tall">
      <span class="wrap-anywhere">{words.updateAvailable(from, to)}</span>
    </Badge>
    <Button
      icon={IconRefresh}
      label={words.fetchUpdate}
      onclick={fetch}
      {pending}
      pendingLabel={FETCHING}
      size="xs"
      title={words.fetchVersion(to)}
      variant="secondary"
    />
  </div>
{/snippet}

<!-- Link marketplace: the toolbar's, and the empty groups' one action. -->
{#snippet linkMarketplace()}
  <LinkMarketplacePopover
    down={hubDown()}
    onsaved={(row) => {
      if (fleet) {
        upsert(
          fleet.config.marketplaces,
          row,
          (other) => other.name === row.name
        );
      }
    }}
    taken={marketplaces.map((row) => row.name)}
  />
{/snippet}

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
        data-num
        disabled={hubDown() !== null}
        failed={refetchFailed}
        figures="tabular"
        icon={IconRefresh}
        label={words.fetchAllAgain(hubBroken.length)}
        onclick={refetchAll}
        pending={refetching}
        pendingLabel={words.fetching}
        size="sm"
        title={hubDown() ?? undefined}
        variant="outline"
      />
    {/if}
    <RowFault again={refetchAll} reason={refetchProblem} />
    {#if skills.length + plugins.length > 0}
      <Button
        disabled={hubDown() !== null}
        failed={checkProblem !== null}
        icon={IconRefresh}
        label={words.checkForUpdates}
        onclick={checkUpdates}
        pending={askedCheck || store.checkingUpdates}
        pendingLabel={words.checking}
        size="sm"
        title={hubDown() ?? undefined}
        variant="outline"
      />
      <RowFault again={checkUpdates} reason={checkProblem} />
    {/if}
    {@render linkMarketplace()}
  {/snippet}

  <div data-slot="group" class="flex flex-col gap-space-2">
    <SectionHeader hue={HUE} icon={IconBolt} label={words.skills} />
    {#if skills.length === 0}
      <!-- Each empty group's one action starts what fills it, by hand
           (DESIGN.md, The Empty Starts Work Rule): the same Fetch skill and
           Link marketplace the page offers above, or browsing a linked
           marketplace. -->
      <EmptyState icon={IconBolt} line={words.noSkills} title="No skills yet">
        {#snippet action()}
          <FetchSkillPopover
            down={hubDown()}
            onsaved={landedSkill}
            taken={skills.map((row) => row.name)}
          />
        {/snippet}
      </EmptyState>
    {:else}
      <RowList label={words.skills}>
        {#each skills as row (row.name)}
          <SectionRow
            actions={[
              ...(oneShot(row.source)
                ? []
                : [
                    {
                      label: row.fetching ? FETCHING : words.fetchAgain,
                      icon: IconRefresh,
                      disabled:
                        busy[row.name] === true || row.fetching === true,
                      onselect: () => refetchSkill(row),
                    },
                  ]),
              {
                label:
                  historyOf === row.name
                    ? words.hidePreviousVersions
                    : words.previousVersions,
                icon: IconHistory,
                onselect: () => toggleHistory(row),
              },
              {
                label: words.removeEverywhere,
                icon: IconTrash,
                destructive: true,
                disabled: busy[row.name] === true,
                onselect: () =>
                  remove(row.name, () => deleteSkill(store, row.name)),
              },
            ]}
            enabled={row.enabled}
            flash={store.flash === row.name}
            hue={HUE}
            icon={IconBolt}
            meta={[
              row.source,
              ...(row.fetching ? [FETCHING] : sized(row)),
            ].join(" · ")}
            name={row.name}
            note={oneShot(row.source)
              ? undefined
              : outcomeOf(
                  row,
                  hubBroken.some(
                    (fault) =>
                      fault.scope === "skills" && fault.key === row.name
                  )
                )}
            ontoggle={(next) => toggleSkill(row, next)}
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
              {#if row.updateAvailable && !oneShot(row.source)}
                {@render update(
                  row,
                  busy[row.name] === true || row.fetching === true,
                  () => refetchSkill(row)
                )}
              {/if}
              <RowFault
                again={rowFaults[row.name]?.again}
                reason={rowFaults[row.name]?.reason}
              />
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
                {#if versionsOf[row.name] === undefined && !versionsFailed[row.name]}
                  <div
                    data-slot="listing"
                    aria-label={words.readingVersions(row.name)}
                    class="flex flex-col gap-space-row"
                    role="status"
                  >
                    {#each [0, 1] as line (line)}
                      <Skeleton class="w-full" height="item" />
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
    <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
      {words.degraded}
    </p>
  </div>

  <div
    data-slot="group"
    class="flex flex-col gap-space-2 border-t border-t-border-hairline pt-space-5"
  >
    <SectionHeader hue={HUE} icon={IconShop} label={words.marketplaces} />
    {#if marketplaces.length === 0}
      <EmptyState
        icon={IconShop}
        line={words.noMarketplaces}
        title="No marketplaces yet"
      >
        {#snippet action()}
          {@render linkMarketplace()}
        {/snippet}
      </EmptyState>
    {:else}
      <RowList label={words.marketplaces}>
        {#each marketplaces as row (row.name)}
          <SectionRow
            actions={[
              {
                label: words.unlink,
                icon: IconTrash,
                destructive: true,
                disabled: busy[row.name] === true,
                onselect: () => unlink(row.name),
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
                data-ghost
                onclick={() => browse(row)}
                size="sm"
                title={words.readFrom(row.source)}
                variant="ghost"
              >
                <IconSearch />
                <span>{browsing === row.name ? words.hide : words.browse}</span>
              </Button>
            {/snippet}
            {#snippet below()}
              <RowFault
                again={rowFaults[row.name]?.again}
                reason={rowFaults[row.name]?.reason}
              />
              <RowFaults
                key={row.name}
                kind="marketplaces"
                {machines}
                onresolved={resolved}
              />
              {#if browsing === row.name}
                {#if reading[row.name]}
                  <div
                    data-slot="listing"
                    aria-label={words.reading(row.name)}
                    class="flex flex-col gap-space-row"
                    role="status"
                  >
                    {#each [0, 1, 2] as line (line)}
                      <Skeleton class="w-full" height="item" />
                    {/each}
                  </div>
                {:else if unread[row.name]}
                  <p class="type-meta text-status-attn-ink" role="alert">
                    {unread[row.name]}
                  </p>
                {:else if (listings[row.name] ?? []).length === 0}
                  <p
                    data-slot="note"
                    class="type-meta max-w-c-measure text-ink-muted"
                  >
                    {words.listsNothing}
                  </p>
                {:else}
                  <ul data-slot="listing" class="flex flex-col">
                    {#each listings[row.name] as plugin (plugin.name)}
                      {@const id = `${plugin.name}@${row.name}`}
                      <li
                        class="flex flex-wrap items-center gap-space-2 py-space-2 not-first:border-t not-first:border-t-border-hairline"
                      >
                        <span
                          data-slot="text"
                          class="flex min-w-0 shrink grow basis-c-offer-text-basis flex-col gap-space-row"
                        >
                          <span
                            class="flex flex-wrap items-baseline gap-space-2"
                          >
                            <span class="type-label text-ink-strong"
                              >{plugin.name}</span
                            >
                            {#if plugin.version}
                              <span
                                data-slot="note"
                                class="type-meta max-w-c-measure text-ink-muted"
                                >{plugin.version}</span
                              >
                            {/if}
                            {#if plugin.category}
                              <span
                                data-slot="note"
                                class="type-meta max-w-c-measure text-ink-muted"
                                >{plugin.category}</span
                              >
                            {/if}
                          </span>
                          {#if plugin.description}
                            <span
                              data-slot="note"
                              class="type-meta max-w-c-measure text-ink-muted"
                              >{plugin.description}</span
                            >
                          {/if}
                        </span>
                        {#if installed(id)}
                          <span
                            data-slot="note"
                            class="type-meta max-w-c-measure text-ink-muted"
                            >{words.added}</span
                          >
                        {:else}
                          <Button
                            failed={id in installFailed}
                            label={words.install}
                            onclick={() => install(plugin, row.name)}
                            pending={busy[id] === true}
                            pendingLabel={words.adding}
                            size="sm"
                            variant="outline"
                          />
                        {/if}
                        <RowFault reason={installFailed[id]} />
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

  <div
    data-slot="group"
    class="flex flex-col gap-space-2 border-t border-t-border-hairline pt-space-5"
  >
    <SectionHeader hue={HUE} icon={IconLayers} label={words.plugins} />
    {#if plugins.length === 0}
      <EmptyState
        icon={IconLayers}
        line={words.noPlugins}
        title="No plugins yet"
      >
        {#snippet action()}
          {#if marketplaces[0]}
            {@const first = marketplaces[0]}
            <Button
              icon={IconShop}
              label="{words.browse} {first.name}"
              onclick={() => browse(first)}
              pending={reading[first.name] === true}
              pendingLabel={words.reading(first.name)}
              variant="outline"
            />
          {:else}
            {@render linkMarketplace()}
          {/if}
        {/snippet}
      </EmptyState>
    {:else}
      <RowList label={words.plugins}>
        {#each plugins as row (row.id)}
          <SectionRow
            actions={[
              ...(oneShot(pluginSource(row.id))
                ? []
                : [
                    {
                      label: row.fetching ? FETCHING : words.fetchAgain,
                      icon: IconRefresh,
                      disabled: busy[row.id] === true || row.fetching === true,
                      onselect: () => refetchPlugin(row),
                    },
                  ]),
              {
                label: words.removeEverywhere,
                icon: IconTrash,
                destructive: true,
                disabled: busy[row.id] === true,
                onselect: () =>
                  remove(row.id, () => deletePlugin(store, row.id)),
              },
            ]}
            enabled={row.enabled}
            hue={HUE}
            icon={IconLayers}
            meta={row.fetching
              ? FETCHING
              : sized(row).join(" · ") || words.noBytes}
            mono
            name={row.id}
            note={oneShot(pluginSource(row.id))
              ? undefined
              : outcomeOf(
                  row,
                  hubBroken.some(
                    (fault) => fault.scope === "plugins" && fault.key === row.id
                  )
                )}
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
              {#if row.updateAvailable && !oneShot(pluginSource(row.id))}
                {@render update(
                  row,
                  busy[row.id] === true || row.fetching === true,
                  () => refetchPlugin(row)
                )}
              {/if}
              <RowFault
                again={rowFaults[row.id]?.again}
                reason={rowFaults[row.id]?.reason}
              />
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
    <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
      {words.pluginOff}
    </p>
  </div>

  <MachineInventory
    kind="skills"
    {machines}
    onskill={landedSkill}
    taken={skills.map((row) => row.name)}
  />
</SectionFrame>
