<script lang="ts">
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { drafts } from "#lib/cawco/config/drafts.svelte.js";
  import {
    byteLength,
    fileHref,
    fileLabel,
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
  import { confirm } from "#lib/cawco/confirm.svelte.js";
  import FleetFault from "#lib/cawco/FleetFault.svelte";
  import {
    type FleetMemoryDocRow,
    formatBytes,
    removeMemory,
    removeMemoryDoc,
  } from "#lib/cawco/fleet.js";
  import { causeOf } from "#lib/cawco/fleet-faults.js";
  import { orderMachines } from "#lib/cawco/rail.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { IconBook, IconTrash, IconWarningTriangle } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";

  /**
   * The fleet's memory: the user CLAUDE.md every session loads flat, and the
   * documents it links under ~/.claude/memories/ — a models/<model>.md is put
   * in front of the session running that model only.
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

  /**
   * Machines whose model-memory hook did not register: the documents are on
   * the machine and nothing puts them in front of a session.
   */
  const hookFailed = $derived(
    machines.flatMap((row) => {
      const hook = row.fleet?.memoryHook;
      return hook?.state === "failed" ? [{ machine: row, hook }] : [];
    })
  );

  const facts = (row: { content: string; updatedAt: string }) =>
    `${formatBytes(byteLength(row.content))} · saved ${formatDistanceToNow(new Date(row.updatedAt))}`;

  const drafted = (path: string) =>
    drafts.paths.has(fileHref(path)) ? " · unsaved draft" : "";

  async function askRemove(path: string) {
    if (!fleet) {
      return;
    }
    await confirm({
      title: `Delete ${fileLabel(path)}?`,
      body: "It is taken off every machine that still has CawCo's copy. A machine's own edited copy is left where it is.",
      confirmLabel: "Delete everywhere",
      destructive: true,
      pendingLabel: "Deleting…",
      run: async () => {
        busy[path] = true;
        try {
          if (path === MAIN) {
            await removeMemory();
            fleet.memory = null;
          } else {
            await removeMemoryDoc(path);
            fleet.memoryDocs = fleet.memoryDocs.filter(
              (doc) => doc.path !== path
            );
          }
          drafts.forget(fileHref(path));
        } finally {
          delete busy[path];
        }
      },
    });
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
  {#snippet actions(
    down
  )}
    <NewMemoryPopover
      {down}
      onsaved={created}
      taken={docs.map((doc) => doc.path)}
    />
  {/snippet}
  {#snippet toolbar()}
    <Input
      aria-label="Filter memory files"
      class="max-w-64"
      placeholder="Filter files…"
      bind:value={filter}
    />
  {/snippet}

  <RowList label="Memory files">
    {#if mainShown}
      <SectionRow
        actions={memory
          ? [
              {
                label: "Delete everywhere",
                icon: IconTrash,
                destructive: true,
                disabled: busy[MAIN] === true,
                onselect: () => askRemove(MAIN),
              },
            ]
          : []}
        flash={store.flash === MAIN}
        href={fileHref(MAIN)}
        hue={HUE}
        icon={IconBook}
        meta={memory
          ? `Loaded into every session · ${facts(memory)}${drafted(MAIN)}`
          : "The fleet keeps no memory yet — write one, or adopt a machine's copy"}
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
            label: "Delete everywhere",
            icon: IconTrash,
            destructive: true,
            disabled: busy[doc.path] === true,
            onselect: () => askRemove(doc.path),
          },
        ]}
        flash={store.flash === doc.path}
        href={fileHref(doc.path)}
        hue={HUE}
        icon={IconBook}
        meta="{facts(doc)}{drafted(doc.path)}"
        mono
        name={fileLabel(doc.path)}
      >
        {#snippet rollout()}
          <RolloutChip
            kind="memoryDocs"
            {machines}
            name={doc.path}
            what={doc.path}
          />
        {/snippet}
        {#snippet below()}
          <RowFaults key={doc.path} kind="memoryDocs" {machines} />
        {/snippet}
      </SectionRow>
    {/each}
  </RowList>
  {#if !mainShown && shown.length === 0}
    <p class="note">No file matches “{filter.trim()}”.</p>
  {/if}

  {#if hookFailed.length > 0}
    <div class="group">
      <SectionHeader
        hue="var(--status-attn-ink)"
        icon={IconWarningTriangle}
        label="Model documents are not being loaded everywhere"
      />
      <p class="note">
        The documents are put in front of a session by a SessionStart hook CawCo
        registers. Where it did not register, the files are on the machine and
        nothing reads them.
      </p>
      {#each hookFailed as { machine, hook } (machine.machineId)}
        <FleetFault
          group={{
            origin: "machine",
            cause: causeOf(hook.detail),
            scope: "memoryHook",
            machineId: machine.machineId,
            faults: [
              {
                origin: "machine",
                scope: "memoryHook",
                key: "",
                machineId: machine.machineId,
                detail: hook.detail,
                cause: causeOf(hook.detail),
              },
            ],
          }}
          {machines}
        />
      {/each}
    </div>
  {/if}
</SectionFrame>

<style>
  .note {
    max-width: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 18px;
    border-top: 1px solid var(--border-hairline);
  }
</style>
