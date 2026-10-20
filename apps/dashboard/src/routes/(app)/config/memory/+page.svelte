<script lang="ts">
  import { memoryWords as words } from "@cawco/core";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { deleteMemory } from "#lib/cawco/config/deletes.js";
  import { drafts } from "#lib/cawco/config/drafts.svelte.js";
  import {
    byteLength,
    docLabel,
    fileHref,
    fileLabel,
    loadedInto,
    MAIN,
  } from "#lib/cawco/config/memory.js";
  import NewMemoryPopover from "#lib/cawco/config/NewMemoryPopover.svelte";
  import RolloutChip from "#lib/cawco/config/RolloutChip.svelte";
  import RowFaults from "#lib/cawco/config/RowFaults.svelte";
  import RowList from "#lib/cawco/config/RowList.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SectionRow from "#lib/cawco/config/SectionRow.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { configStore, upsert } from "#lib/cawco/config/store.svelte.js";
  import { type FleetMemoryDocRow, formatBytes } from "#lib/cawco/fleet.js";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { orderMachines } from "#lib/cawco/rail.svelte.js";
  import { toast } from "#lib/cawco/toasts.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconBook, IconSearch, IconTrash } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";

  /**
   * The fleet's memory: the user CLAUDE.md every session loads flat, the
   * documents it links under ~/.claude/memories/ — a models/<model>.md is put
   * in front of the session running that model only — and the scoped
   * documents each session of a role, a project or both loads.
   */
  const store = configStore();
  const section = sectionOf("memory");
  const HUE = section.hue;

  const fleet = $derived(store.fleet.value);
  const memory = $derived(fleet?.memory ?? null);
  const docs = $derived(fleet?.memoryDocs ?? []);
  const machines = $derived(orderMachines(cawco.machines));
  let filter = $state("");
  let busy = $state<Record<string, boolean>>({});

  const shown = $derived(
    docs.filter((doc) =>
      doc.path.toLowerCase().includes(filter.trim().toLowerCase())
    )
  );
  const mainShown = $derived(
    MAIN.toLowerCase().includes(filter.trim().toLowerCase())
  );

  const facts = (row: { content: string; updatedAt: string }) =>
    words.facts(
      formatBytes(byteLength(row.content)),
      formatDistanceToNow(new Date(row.updatedAt))
    );

  const drafted = (path: string) =>
    drafts.paths.has(fileHref(path)) ? words.unsavedDraft : "";

  /** Delete: at once, with Undo in the toast (deletes.ts). */
  async function remove(path: string) {
    busy[path] = true;
    try {
      await deleteMemory(store, path);
      drafts.forget(fileHref(path));
    } catch (error) {
      toast.error(message(error));
    } finally {
      delete busy[path];
    }
  }

  function created(row: FleetMemoryDocRow) {
    if (fleet) {
      upsert(fleet.memoryDocs, row, (doc) => doc.path === row.path);
      fleet.memoryDocs.sort((a, b) => a.path.localeCompare(b.path));
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
    <NewMemoryPopover
      {down}
      onsaved={created}
      taken={docs.map((doc) => doc.path)}
    />
  {/snippet}
  {#snippet toolbar()}
    <!-- The page's width on a phone, a short field's beside the rows wider. -->
    <span class="flex w-full phone:max-w-64">
      <Input
        aria-label={words.filterLabel}
        placeholder={words.filter}
        bind:value={filter}
      />
    </span>
  {/snippet}

  <RowList label={words.list}>
    {#if mainShown}
      <SectionRow
        actions={memory
          ? [
              {
                label: words.deleteEverywhere,
                icon: IconTrash,
                destructive: true,
                disabled: busy[MAIN] === true,
                onselect: () => remove(MAIN),
              },
            ]
          : []}
        flash={store.flash === MAIN}
        href={fileHref(MAIN)}
        hue={HUE}
        icon={IconBook}
        meta={memory
          ? `${words.everySession} · ${facts(memory)}${drafted(MAIN)}`
          : words.noMemory}
        mono
        name={fileLabel(MAIN)}
      >
        {#snippet rollout()}
          {#if memory}
            <RolloutChip kind="memory" {machines} name="" what="CLAUDE.md" />
          {/if}
        {/snippet}
        {#snippet below()}
          <RowFaults key="" kind="memory" {machines} />
        {/snippet}
      </SectionRow>
    {/if}
    {#each shown as doc (doc.path)}
      <SectionRow
        actions={[
          {
            label: words.deleteEverywhere,
            icon: IconTrash,
            destructive: true,
            disabled: busy[doc.path] === true,
            onselect: () => remove(doc.path),
          },
        ]}
        flash={store.flash === doc.path}
        href={fileHref(doc.path)}
        hue={HUE}
        icon={IconBook}
        meta="{loadedInto(doc.scope, cawco.projects)} · {facts(doc)}{drafted(
          doc.path
        )}"
        mono
        name={docLabel(doc.path, doc.scope)}
      >
        {#snippet rollout()}
          <!-- A role's document reaches its sessions as they start, from the
               hub: it is on no machine. -->
          {#if !doc.scope?.role}
            <RolloutChip
              kind="memoryDocs"
              {machines}
              name={doc.path}
              what={doc.path}
            />
          {/if}
        {/snippet}
        {#snippet below()}
          <RowFaults key={doc.path} kind="memoryDocs" {machines} />
        {/snippet}
      </SectionRow>
    {/each}
  </RowList>
  {#if !mainShown && shown.length === 0}
    <EmptyState
      icon={IconSearch}
      line="Try fewer letters, or clear the filter."
      title={words.noMatch(filter.trim())}
    />
  {/if}
</SectionFrame>
